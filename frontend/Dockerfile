# 前端静态构建 + Nginx（同时代理 API 与 SSE）
FROM node:24-slim AS build

RUN corepack enable

# 国内环境可通过构建参数切换 npm 镜像源
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV npm_config_registry=${NPM_REGISTRY} \
    COREPACK_NPM_REGISTRY=${NPM_REGISTRY}

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN pnpm --config.registry="${NPM_REGISTRY}" install --frozen-lockfile \
      --filter frontend... \
      --filter @aiplatform/contracts...

COPY packages/contracts packages/contracts
COPY frontend frontend

RUN pnpm --filter @aiplatform/contracts build \
 && pnpm --filter frontend build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
