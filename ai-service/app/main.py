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
from typing import AsyncIterator, Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
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


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


# qwen3 等思考模型默认会先生成 thinking；企业问答默认关闭以降低首字延迟。
OLLAMA_THINK = _env_bool("OLLAMA_THINK", False)
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "8192"))
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "1024"))
OLLAMA_TASK_NUM_PREDICT = int(os.getenv("OLLAMA_TASK_NUM_PREDICT", "256"))
OLLAMA_SUMMARY_NUM_PREDICT = int(os.getenv("OLLAMA_SUMMARY_NUM_PREDICT", "512"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
OLLAMA_NO_THINK_FALLBACK = _env_bool("OLLAMA_NO_THINK_FALLBACK", True)


def _ollama_options(temperature: float, num_predict: int) -> dict[str, object]:
    return {
        "temperature": temperature,
        "num_ctx": OLLAMA_NUM_CTX,
        "num_predict": num_predict,
    }


def _build_chat_body(
    messages: list[dict[str, str]],
    temperature: float,
    num_predict: int,
    *,
    fmt: str | None = None,
    stream: bool = False,
) -> dict[str, object]:
    body: dict[str, object] = {
        "model": OLLAMA_MODEL,
        "stream": stream,
        "messages": messages,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": _ollama_options(temperature, num_predict),
    }
    if not OLLAMA_THINK:
        body["think"] = False
    if fmt:
        body["format"] = fmt
    return body


def _append_no_think(messages: list[dict[str, str]]) -> None:
    """旧版 Ollama 不支持 think 参数时的提示词兜底。"""
    for message in messages:
        if message.get("role") == "system":
            message["content"] = f"{message['content'].rstrip()}\n/no_think"
            return
    messages.insert(0, {"role": "system", "content": "/no_think"})


async def _post_ollama_chat(
    client: httpx.AsyncClient,
    request_body: dict[str, object],
) -> dict[str, object]:
    """调用 Ollama；think 参数不被支持时自动降级为 /no_think 再试一次。"""
    response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=request_body)
    if (
        response.status_code == 400
        and OLLAMA_NO_THINK_FALLBACK
        and "think" in request_body
        and "think" in response.text.lower()
    ):
        logger.warning("ai_service.think_unsupported fallback=/no_think")
        fallback = dict(request_body)
        fallback.pop("think", None)
        messages = [dict(message) for message in request_body["messages"]]  # type: ignore[arg-type]
        _append_no_think(messages)
        fallback["messages"] = messages
        response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=fallback)
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, dict) else {}


async def _open_ollama_stream(
    request_body: dict[str, object],
) -> tuple[httpx.AsyncClient, httpx.Response]:
    """建立 Ollama 流式连接；think 参数不支持时降级为 /no_think。"""
    client = httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS)
    request = client.build_request(
        "POST", f"{OLLAMA_BASE_URL}/api/chat", json=request_body
    )
    response = await client.send(request, stream=True)
    if (
        response.status_code == 400
        and OLLAMA_NO_THINK_FALLBACK
        and "think" in request_body
    ):
        error_text = (await response.aread()).decode("utf-8", errors="replace")
        if "think" in error_text.lower():
            logger.warning("ai_service.think_unsupported stream_fallback=/no_think")
            await response.aclose()
            fallback = dict(request_body)
            fallback.pop("think", None)
            messages = [dict(message) for message in request_body["messages"]]  # type: ignore[arg-type]
            _append_no_think(messages)
            fallback["messages"] = messages
            request = client.build_request(
                "POST", f"{OLLAMA_BASE_URL}/api/chat", json=fallback
            )
            response = await client.send(request, stream=True)
    return client, response


async def _stream_chat_events(
    request_body: dict[str, object],
) -> AsyncIterator[dict[str, object]]:
    """把 Ollama 的 NDJSON 流转成前端流式事件；thinking 内容一律丢弃。"""
    client, response = await _open_ollama_stream(request_body)
    thinking_chars = 0
    try:
        if response.status_code >= 300:
            text = (await response.aread()).decode("utf-8", errors="replace")
            yield {
                "type": "error",
                "code": "AI_UPSTREAM_UNAVAILABLE",
                "message": f"Ollama HTTP {response.status_code}: {text[:200]}",
                "retryable": True,
            }
            return

        yield {"type": "meta", "model": OLLAMA_MODEL}
        async for line in response.aiter_lines():
            if not line.strip():
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            message = data.get("message") or {}
            if isinstance(message, dict):
                thinking = message.get("thinking")
                if thinking:
                    thinking_chars += len(str(thinking))
                content = message.get("content")
                if content:
                    yield {"type": "delta", "content": str(content)}
            if data.get("done"):
                logger.info(
                    "ai_service.chat_stream_completed model=%s thinking_chars=%d",
                    data.get("model") or OLLAMA_MODEL,
                    thinking_chars,
                )
                yield {
                    "type": "done",
                    "finishReason": data.get("done_reason") or "stop",
                    "model": data.get("model") or OLLAMA_MODEL,
                }
                return
        yield {
            "type": "done",
            "finishReason": "stop",
            "model": OLLAMA_MODEL,
        }
    except httpx.TimeoutException:
        yield {
            "type": "error",
            "code": "AI_UPSTREAM_TIMEOUT",
            "message": "模型响应超时",
            "retryable": True,
        }
    except httpx.HTTPError as exc:
        logger.error("ai_service.chat_stream_error error=%s", exc)
        yield {
            "type": "error",
            "code": "AI_UPSTREAM_UNAVAILABLE",
            "message": "模型服务不可用",
            "retryable": True,
        }
    finally:
        await response.aclose()
        await client.aclose()


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=8_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
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


class SummaryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8_000)


class SummarizeRequest(BaseModel):
    previousSummary: str | None = Field(default=None, max_length=8_000)
    messages: list[SummaryMessage] = Field(min_length=1, max_length=40)
    maxChars: int = Field(default=1_200, ge=200, le=4_000)


class SummarizeResponse(BaseModel):
    summary: str
    model: str


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
        "ai_service.started ollama=%s model=%s timeout=%.0fs think=%s "
        "num_ctx=%d num_predict=%d keep_alive=%s embedding=%s embedding_model=%s",
        OLLAMA_BASE_URL,
        OLLAMA_MODEL,
        OLLAMA_TIMEOUT_SECONDS,
        OLLAMA_THINK,
        OLLAMA_NUM_CTX,
        OLLAMA_NUM_PREDICT,
        OLLAMA_KEEP_ALIVE,
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
    request_body = _build_chat_body(
        [message.model_dump() for message in payload.messages],
        payload.temperature,
        OLLAMA_NUM_PREDICT,
    )

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            data = await _post_ollama_chat(client, request_body)
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
    if not isinstance(message, dict):
        message = {}
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


@app.post("/v1/chat/stream")
async def chat_stream(payload: ChatRequest) -> StreamingResponse:
    """流式对话：返回 application/x-ndjson，每行一个事件。"""
    request_body = _build_chat_body(
        [message.model_dump() for message in payload.messages],
        payload.temperature,
        OLLAMA_NUM_PREDICT,
        stream=True,
    )

    async def generate() -> AsyncIterator[bytes]:
        async for event in _stream_chat_events(request_body):
            yield (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(generate(), media_type="application/x-ndjson")


SUMMARY_SYSTEM_PROMPT = """你是企业对话摘要助手。请把给出的多轮对话压缩成一段中文摘要，供后续对话继续使用。

规则：
1. 保留事实、结论、已确认的决定、待办事项、时间、数字、人名和文档名；
2. 不要编造对话中没有的信息，不要输出 Markdown 标题或解释；
3. 合并重复内容，忽略寒暄和无关闲聊；
4. 输出纯文本，长度不超过用户要求的字符数。"""


@app.post("/v1/summarize", response_model=SummarizeResponse)
async def summarize(payload: SummarizeRequest) -> SummarizeResponse:
    started = time.monotonic()
    lines: list[str] = []
    if payload.previousSummary:
        lines.append(f"已有摘要：\n{payload.previousSummary}")
    lines.append("待摘要的对话：")
    for message in payload.messages:
        speaker = "用户" if message.role == "user" else "助手"
        lines.append(f"{speaker}：{message.content}")
    context = "\n".join(lines)
    request_body = _build_chat_body(
        [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"请生成不超过 {payload.maxChars} 个字符的摘要。\n\n{context}",
            },
        ],
        0.2,
        OLLAMA_SUMMARY_NUM_PREDICT,
    )

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            data = await _post_ollama_chat(client, request_body)
    except httpx.TimeoutException as exc:
        logger.warning("ai_service.summary_timeout")
        raise HTTPException(status_code=504, detail="摘要生成超时") from exc
    except httpx.HTTPError as exc:
        logger.error("ai_service.summary_error error=%s", exc)
        raise HTTPException(status_code=503, detail="模型服务不可用") from exc

    message = data.get("message") or {}
    if not isinstance(message, dict):
        message = {}
    summary = str(message.get("content") or "").strip()
    if not summary:
        raise HTTPException(status_code=502, detail="模型未返回摘要")

    logger.info(
        "ai_service.summary_completed messages=%d input_chars=%d elapsed=%.1fs",
        len(payload.messages),
        len(context),
        time.monotonic() - started,
    )
    return SummarizeResponse(
        summary=summary[: payload.maxChars],
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

    request_body = _build_chat_body(
        [
            {"role": "system", "content": TASK_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        0.1,
        OLLAMA_TASK_NUM_PREDICT,
        fmt="json",
    )

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            data = await _post_ollama_chat(client, request_body)
    except httpx.TimeoutException as exc:
        logger.warning("ai_service.task_extract_timeout")
        raise HTTPException(status_code=504, detail="任务抽取超时") from exc
    except httpx.HTTPError as exc:
        logger.error("ai_service.task_extract_ollama_error error=%s", exc)
        raise HTTPException(status_code=503, detail="模型服务不可用") from exc

    message = data.get("message") or {}
    if not isinstance(message, dict):
        message = {}
    content = str(message.get("content") or "").strip()
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
