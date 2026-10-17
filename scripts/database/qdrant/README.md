# Qdrant 初始化说明

Qdrant 是向量数据库，不使用 SQL。本目录通过 Qdrant REST API 完成 collection
与 payload 索引初始化，不使用 MySQL DDL。

## 目录内容

| 文件 | 用途 |
| --- | --- |
| `create_collection.sh` | 创建文档分块向量 collection，并建立 payload 索引 |

## 使用方式

先确保 Qdrant 已启动（`infra/qdrant/compose.yaml`），然后：

```bash
cd scripts/database/qdrant

# VECTOR_SIZE 必填，必须与 embedding_profiles.dimension 完全一致
VECTOR_SIZE=1024 ./create_collection.sh

# 模型/维度变化时使用新 collection，不混用不同维度的向量
VECTOR_SIZE=768 COLLECTION_NAME=document_chunks_bge_m3 ./create_collection.sh
```

可选环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant REST 地址 |
| `QDRANT_API_KEY` | 空 | 启用鉴权时填写 |
| `COLLECTION_NAME` | `document_chunks` | collection 名称 |
| `VECTOR_SIZE` | 无（必填） | 向量维度 |
| `DISTANCE` | `Cosine` | `Cosine` / `Dot` / `Euclid` |

脚本可重复执行：collection 已存在时跳过创建，payload 索引接口幂等。

## Payload 约定

每个 point 的 payload 只保留检索与过滤所需字段：

```json
{
  "tenant_id": 1,
  "knowledge_base_id": 10,
  "document_id": 100,
  "document_version_id": 200,
  "chunk_id": 300
}
```

`chunk_id` 对应 MySQL `document_chunks.id`；MySQL 与 Qdrant 的对应关系记录在
`embedding_records` 表中，Qdrant 不保存权威业务数据。

向量本身写入 point 的 vector 字段，不放入 payload。

## 索引

`create_collection.sh` 会为以下字段创建 `integer` payload 索引：

- `tenant_id`
- `knowledge_base_id`
- `document_id`
- `document_version_id`
- `chunk_id`

注意：

- 文档访问权限必须在检索前由后端在 MySQL 侧重新校验，不能只依赖 Qdrant
  payload 过滤。
- 修改模型或向量维度时，应新建 collection 并重建索引；不要向同一 collection
  写入不同维度的向量。
- collection 的删除与重建属于破坏性操作，应由部署/运维流程显式执行，本脚本
  不提供自动删除。
