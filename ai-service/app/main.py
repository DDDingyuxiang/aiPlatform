"""AI 能力服务：统一封装本地 Ollama 的对话能力。

业务后端通过 HTTP 调用本服务，不直接依赖具体模型供应商。
当前只提供非流式文本对话，后续可在此扩展提示词、RAG 与工具调用。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator

from .embeddings import (
    EMBEDDING_MODEL_NAME,
    EmbeddingUnavailableError,
    get_embedder,
)

logging.basicConfig(
    level=os.getenv("AI_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ai-service")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3-local:latest")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=8_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    temperature: float = Field(default=0.7, ge=0, le=2)


class ChatResponse(BaseModel):
    message: ChatMessage
    model: str


class EmbeddingRequest(BaseModel):
    input: list[str] = Field(min_length=1, max_length=64)

    @field_validator("input")
    @classmethod
    def validate_texts(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned):
            raise ValueError("输入文本不能为空")
        if any(len(value) > 8_000 for value in cleaned):
            raise ValueError("单条文本不能超过 8000 字符")
        return cleaned


class EmbeddingResponse(BaseModel):
    model: str
    dimension: int
    embeddings: list[list[float]]


class TaskParticipant(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)


class TaskContextMessage(BaseModel):
    senderId: str
    senderName: str
    content: str = Field(min_length=1, max_length=8_000)
    sentAt: str


class TaskExtractRequest(BaseModel):
    now: str
    timezone: str
    participants: list[TaskParticipant] = Field(min_length=1, max_length=50)
    messages: list[TaskContextMessage] = Field(min_length=1, max_length=20)


class ExtractedTask(BaseModel):
    create: bool
    title: str | None = None
    description: str | None = None
    dueAt: str | None = None
    priority: Literal["high", "medium", "low"] | None = None
    assigneeId: str | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info(
        "ai_service.started ollama=%s model=%s timeout=%.0fs embedding=%s embedding_model=%s",
        OLLAMA_BASE_URL,
        OLLAMA_MODEL,
        OLLAMA_TIMEOUT_SECONDS,
        get_embedder().status,
        EMBEDDING_MODEL_NAME,
    )
    yield


app = FastAPI(title="aiPlatform AI Service", version="0.1.0", lifespan=lifespan)


@app.get("/live")
async def live() -> dict[str, str]:
    """容器存活检查：不依赖 Ollama，避免模型未就绪时反复重启。"""
    return {"status": "ok"}


@app.get("/health")
async def health() -> dict[str, str]:
    """就绪检查：确认 Ollama 可访问；Embedding 模型状态单独上报，不阻塞对话。"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("ai_service.ollama_unavailable error=%s", exc)
        raise HTTPException(status_code=503, detail="Ollama 不可用") from exc

    return {
        "status": "ok",
        "model": OLLAMA_MODEL,
        "embedding": get_embedder().status,
        "embeddingModel": EMBEDDING_MODEL_NAME,
    }


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
async def embeddings(payload: EmbeddingRequest) -> EmbeddingResponse:
    """使用本地 BGE-M3 生成 dense 向量，供知识库检索与 RAG 使用。"""
    started = time.monotonic()
    embedder = get_embedder()
    try:
        vectors = await asyncio.to_thread(embedder.embed, payload.input)
    except EmbeddingUnavailableError as exc:
        logger.warning("ai_service.embedding_unavailable error=%s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    logger.info(
        "ai_service.embedding_completed model=%s texts=%d elapsed=%.1fs",
        EMBEDDING_MODEL_NAME,
        len(payload.input),
        time.monotonic() - started,
    )
    return EmbeddingResponse(
        model=EMBEDDING_MODEL_NAME,
        dimension=len(vectors[0]) if vectors else 0,
        embeddings=vectors,
    )


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    started = time.monotonic()
    request_body = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [message.model_dump() for message in payload.messages],
        "options": {"temperature": payload.temperature},
    }

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=request_body,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        logger.warning("ai_service.timeout elapsed=%.1fs", time.monotonic() - started)
        raise HTTPException(status_code=504, detail="模型响应超时") from exc
    except httpx.HTTPError as exc:
        logger.error("ai_service.ollama_error error=%s", exc)
        raise HTTPException(status_code=503, detail="模型服务不可用") from exc
    except ValueError as exc:
        logger.error("ai_service.invalid_response error=%s", exc)
        raise HTTPException(status_code=502, detail="模型返回格式异常") from exc

    message = data.get("message") or {}
    content = str(message.get("content") or "").strip()
    if not content:
        logger.warning("ai_service.empty_response")
        raise HTTPException(status_code=502, detail="模型未返回内容")

    elapsed = time.monotonic() - started
    logger.info(
        "ai_service.chat_completed model=%s messages=%d elapsed=%.1fs",
        data.get("model", OLLAMA_MODEL),
        len(payload.messages),
        elapsed,
    )

    return ChatResponse(
        message=ChatMessage(role="assistant", content=content),
        model=str(data.get("model") or OLLAMA_MODEL),
    )


TASK_SYSTEM_PROMPT = """你是企业任务抽取助手。根据最近对话判断是否存在需要执行的未来任务。

规则：
1. 只有当对话中出现未来时间表达（今天、明天、下周、几号、几点等），并且已经形成明确的安排或执行要求时，才创建任务。
2. 以下情况 create=false：过去时间；假设、玩笑、闲聊；询问、邀请、征求意见或尚未确认的安排（如“明天你可以参加会议吗？”“明天有空吗？”）；只有时间但没有具体执行事项。
3. dueAt 必须是未来时间，使用带时区偏移的 ISO 8601 格式，例如 2026-10-19T15:00:00+08:00。
4. 负责人 assigneeId 必须从参与者 id 中选择。先判断谁需要执行：
   - 消息在要求/委托某位参与者做事（如“王真，把方案发给我”“你明天把报告发我”）时，选被要求的人；
   - 只有“我明天把方案发给你”这类由发送者自己完成的任务，才选消息发送者；
   - 确实无法判断时，选择最近一条消息的发送者。
5. title 简短明确（不超过 100 字）；description 说明背景与要求；priority 为 high/medium/low。
6. 只输出一个 JSON 对象，不要输出 Markdown 或解释：
{"create": true, "title": "...", "description": "...", "dueAt": "...", "priority": "medium", "assigneeId": "..."}
没有任务时输出：{"create": false}

示例：
- “明天你可以参加会议吗？” → 只是询问，尚未形成确定安排，create=false。
- “明天你有空吗？” → 只是在确认时间，create=false。
- “明天下午3点开会，请准时参加” → 已明确通知参会，创建任务。
- 发送者 A 对参与者 B 说“B，明天下午3点前把方案发给我” → assigneeId=B。
- 发送者 A 说“我明天下午3点前把方案发给你” → assigneeId=A。
"""


def _normalize_due_at(value: str | None, timezone_name: str) -> str | None:
    """模型可能省略时区偏移，这里补齐业务时区，便于后端严格校验。"""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    if parsed.tzinfo is None:
        try:
            parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
        except Exception:
            return value
    return parsed.isoformat()


@app.post("/v1/tasks/extract", response_model=ExtractedTask)
async def extract_task(payload: TaskExtractRequest) -> ExtractedTask:
    started = time.monotonic()
    participant_lines = "\n".join(
        f"- id={participant.id}, name={participant.name}"
        for participant in payload.participants
    )
    conversation_lines = "\n".join(
        f"[{message.senderName} ({message.senderId})] {message.content}"
        for message in payload.messages
    )
    context = (
        f"当前时间：{payload.now}\n"
        f"时区：{payload.timezone}\n"
        f"参与者：\n{participant_lines}\n"
        f"最近对话：\n{conversation_lines}"
    )

    request_body = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": TASK_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        "options": {"temperature": 0.1},
    }

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=request_body,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        logger.warning("ai_service.task_extract_timeout")
        raise HTTPException(status_code=504, detail="任务抽取超时") from exc
    except httpx.HTTPError as exc:
        logger.error("ai_service.task_extract_ollama_error error=%s", exc)
        raise HTTPException(status_code=503, detail="模型服务不可用") from exc

    content = str((data.get("message") or {}).get("content") or "").strip()
    if not content:
        logger.warning("ai_service.task_extract_empty")
        return ExtractedTask(create=False)

    try:
        parsed = ExtractedTask.model_validate(json.loads(content))
    except (ValueError, ValidationError) as exc:
        logger.warning("ai_service.task_extract_invalid_response error=%s", exc)
        raise HTTPException(status_code=502, detail="任务抽取结果格式异常") from exc

    if parsed.create:
        parsed.dueAt = _normalize_due_at(parsed.dueAt, payload.timezone)
        if parsed.assigneeId and not any(
            participant.id == parsed.assigneeId for participant in payload.participants
        ):
            parsed.assigneeId = None

    logger.info(
        "ai_service.task_extract_completed create=%s messages=%d elapsed=%.1fs",
        parsed.create,
        len(payload.messages),
        time.monotonic() - started,
    )
    return parsed
