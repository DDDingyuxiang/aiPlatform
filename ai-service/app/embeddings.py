"""BGE-M3 ONNX 向量化适配器。

- 模型目录默认来自 EMBEDDING_MODEL_PATH，加载失败时只影响 /v1/embeddings，
  不影响对话与任务抽取；
- BGE-M3 官方 dense 向量使用 CLS pooling，再做 L2 归一化；
- ONNX 推理是同步 CPU 计算，由调用方放入线程池，避免阻塞事件循环。
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Sequence

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

logger = logging.getLogger("ai-service.embeddings")

def _default_model_path() -> str:
    """Docker 内默认 /models/bge-m3，本地开发回退到 ~/models/bge-m3。"""
    docker_path = Path("/models/bge-m3")
    if docker_path.is_dir():
        return str(docker_path)
    return str(Path.home() / "models" / "bge-m3")


EMBEDDING_MODEL_PATH = os.getenv("EMBEDDING_MODEL_PATH") or _default_model_path()
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")
EMBEDDING_MAX_LENGTH = int(os.getenv("EMBEDDING_MAX_LENGTH", "512"))


class EmbeddingUnavailableError(RuntimeError):
    """模型文件缺失、依赖不可用或推理失败。"""


class BgeM3Embedder:
    def __init__(self, model_dir: str = EMBEDDING_MODEL_PATH) -> None:
        self.model_dir = Path(model_dir)
        self._session: ort.InferenceSession | None = None
        self._tokenizer: Tokenizer | None = None
        self._load_lock = threading.Lock()
        self._infer_lock = threading.Lock()

    @property
    def model_path(self) -> Path:
        return self.model_dir / "onnx"

    @property
    def status(self) -> str:
        if self._session is not None:
            return "ready"
        return "available" if self._model_files_exist() else "unavailable"

    def _model_files_exist(self) -> bool:
        onnx_dir = self.model_path
        return (onnx_dir / "model.onnx").is_file() and (
            onnx_dir / "tokenizer.json"
        ).is_file()

    def _ensure_loaded(self) -> None:
        if self._session is not None:
            return
        with self._load_lock:
            if self._session is not None:
                return
            if not self._model_files_exist():
                raise EmbeddingUnavailableError(
                    f"未找到 BGE-M3 ONNX 模型：{self.model_path}"
                )

            try:
                tokenizer = Tokenizer.from_file(str(self.model_path / "tokenizer.json"))
                tokenizer.enable_truncation(max_length=EMBEDDING_MAX_LENGTH)
                # 不指定 length 时 padding 到当前 batch 内最长序列，避免固定 512 的浪费
                tokenizer.enable_padding(pad_id=1, pad_token="<pad>")

                options = ort.SessionOptions()
                options.graph_optimization_level = (
                    ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                )
                options.intra_op_num_threads = max(1, min(4, os.cpu_count() or 1))
                session = ort.InferenceSession(
                    str(self.model_path / "model.onnx"),
                    sess_options=options,
                    providers=["CPUExecutionProvider"],
                )
            except Exception as exc:  # noqa: BLE001 - 统一转换为业务可处理的错误
                raise EmbeddingUnavailableError(f"加载 BGE-M3 失败：{exc}") from exc

            self._tokenizer = tokenizer
            self._session = session
            logger.info(
                "embeddings.loaded model=%s path=%s dimension=%s",
                EMBEDDING_MODEL_NAME,
                self.model_path,
                self.dimension,
            )

    @property
    def dimension(self) -> int:
        self._ensure_loaded()
        assert self._session is not None
        shape = self._session.get_outputs()[0].shape
        # ONNX 导出通常带有动态 batch/sequence 维度；BGE-M3 的 hidden size 是 1024
        if len(shape) == 3 and isinstance(shape[2], int):
            return shape[2]
        return 1024

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """返回与输入顺序一致的归一化 dense 向量。"""
        if not texts:
            return []

        self._ensure_loaded()
        assert self._session is not None and self._tokenizer is not None

        encodings = self._tokenizer.encode_batch(list(texts))
        input_ids = np.asarray([item.ids for item in encodings], dtype=np.int64)
        attention_mask = np.asarray(
            [item.attention_mask for item in encodings], dtype=np.int64
        )
        token_type_ids = np.zeros_like(input_ids, dtype=np.int64)

        input_names = {item.name for item in self._session.get_inputs()}
        feed: dict[str, np.ndarray] = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }
        if "token_type_ids" in input_names:
            feed["token_type_ids"] = token_type_ids

        try:
            with self._infer_lock:
                outputs = self._session.run(None, feed)
        except Exception as exc:  # noqa: BLE001
            raise EmbeddingUnavailableError(f"BGE-M3 推理失败：{exc}") from exc

        # sentence-transformers 导出的 ONNX 通常包含已池化的 sentence_embedding；
        # 否则回退到 BGE-M3 的 CLS token 表征。
        sentence_output_index = next(
            (
                index
                for index, output in enumerate(self._session.get_outputs())
                if output.name == "sentence_embedding"
            ),
            None,
        )
        if sentence_output_index is not None:
            vectors = outputs[sentence_output_index]
        else:
            hidden = outputs[0]
            if hidden.ndim != 3:
                raise EmbeddingUnavailableError("BGE-M3 输出维度异常")
            vectors = hidden[:, 0, :]

        vectors = np.asarray(vectors, dtype=np.float32)
        if vectors.ndim != 2:
            raise EmbeddingUnavailableError("BGE-M3 输出维度异常")
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vectors = vectors / norms
        return vectors.tolist()


_embedder = BgeM3Embedder()


def get_embedder() -> BgeM3Embedder:
    return _embedder
