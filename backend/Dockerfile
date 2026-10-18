# 业务后端（含 contracts 构建与种子脚本）；镜像同时供 seed 服务复用
FROM node:24-slim

RUN corepack enable

WORKDIR /app

# 先复制清单以复用依赖安装层
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile \
      --filter @aiplatform/backend... \
      --filter @aiplatform/contracts...

COPY packages/contracts packages/contracts
COPY backend backend

RUN pnpm --filter @aiplatform/contracts build \
 && pnpm --filter @aiplatform/backend build

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
