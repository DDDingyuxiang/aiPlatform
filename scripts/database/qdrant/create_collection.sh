#!/usr/bin/env bash
# ============================================================================
# aiPlatform Qdrant collection 初始化脚本
#
# Qdrant 不使用 SQL，本脚本通过 REST API 创建文档分块向量 collection，
# 并为检索过滤字段建立 payload 索引。脚本可重复执行：
#   - collection 已存在时跳过创建；
#   - payload 索引的 PUT 操作是幂等的。
#
# 环境变量：
#   QDRANT_URL        Qdrant 地址，默认 http://127.0.0.1:6333
#   QDRANT_API_KEY    可选，Qdrant API Key
#   COLLECTION_NAME   collection 名称，默认 document_chunks
#   VECTOR_SIZE       必填，向量维度，必须与 embedding_profiles.dimension 一致
#   DISTANCE          距离度量，Cosine/Dot/Euclid，默认 Cosine
#
# 示例：
#   VECTOR_SIZE=1024 ./create_collection.sh
#   VECTOR_SIZE=768 COLLECTION_NAME=document_chunks_bge_m3 ./create_collection.sh
# ============================================================================

set -euo pipefail

QDRANT_URL="${QDRANT_URL:-http://127.0.0.1:6333}"
QDRANT_API_KEY="${QDRANT_API_KEY:-}"
COLLECTION_NAME="${COLLECTION_NAME:-document_chunks}"
VECTOR_SIZE="${VECTOR_SIZE:-}"
DISTANCE="${DISTANCE:-Cosine}"

if [[ -z "$VECTOR_SIZE" ]]; then
  echo "错误：必须设置 VECTOR_SIZE（与 embedding_profiles.dimension 一致，不能使用示例值）。" >&2
  exit 1
fi

if ! [[ "$VECTOR_SIZE" =~ ^[1-9][0-9]*$ ]]; then
  echo "错误：VECTOR_SIZE 必须是正整数，当前值：$VECTOR_SIZE" >&2
  exit 1
fi

if ! [[ "$COLLECTION_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "错误：COLLECTION_NAME 只能包含字母、数字、下划线和连字符。" >&2
  exit 1
fi

case "$DISTANCE" in
  Cosine|Dot|Euclid) ;;
  *)
    echo "错误：DISTANCE 只支持 Cosine、Dot、Euclid，当前值：$DISTANCE" >&2
    exit 1
    ;;
esac

command -v curl >/dev/null 2>&1 || {
  echo "错误：未找到 curl。" >&2
  exit 1
}

curl_args=(-sS --connect-timeout 5 --max-time 30)
if [[ -n "$QDRANT_API_KEY" ]]; then
  curl_args+=(-H "api-key: $QDRANT_API_KEY")
fi

base_url="${QDRANT_URL%/}/collections/${COLLECTION_NAME}"

echo "检查 collection：$COLLECTION_NAME"
if ! http_status=$(curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' "$base_url"); then
  echo "错误：无法连接 Qdrant（$QDRANT_URL）。" >&2
  exit 1
fi

case "$http_status" in
  200)
    echo "collection 已存在，跳过创建。"
    ;;
  404)
    echo "创建 collection（dimension=$VECTOR_SIZE, distance=$DISTANCE）..."
    curl "${curl_args[@]}" -f -X PUT "$base_url" \
      -H 'Content-Type: application/json' \
      -d "{\"vectors\":{\"size\":${VECTOR_SIZE},\"distance\":\"${DISTANCE}\"}}"
    echo
    ;;
  401|403)
    echo "错误：Qdrant 鉴权失败（HTTP $http_status），请检查 QDRANT_API_KEY。" >&2
    exit 1
    ;;
  *)
    echo "错误：检查 collection 失败（HTTP $http_status）。" >&2
    exit 1
    ;;
esac

# payload 索引：只保留检索和权限过滤所需字段。
# 文档权限始终由后端在 MySQL 侧重新校验，Qdrant payload 不承担授权职责。
echo "创建 payload 索引..."
for field in tenant_id knowledge_base_id document_id document_version_id chunk_id; do
  curl "${curl_args[@]}" -f -X PUT "$base_url/index" \
    -H 'Content-Type: application/json' \
    -d "{\"field_name\":\"${field}\",\"field_schema\":\"integer\"}" >/dev/null
  echo "  - $field"
done

echo "完成：$base_url"
