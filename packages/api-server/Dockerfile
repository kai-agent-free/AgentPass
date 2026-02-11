FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/api-server/package.json packages/api-server/
COPY packages/core/package.json packages/core/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/api-server/ packages/api-server/

RUN pnpm --filter @agentpass/core build && pnpm --filter @agentpass/api-server build

ENV NODE_ENV=production
ENV AGENTPASS_PORT=3846
ENV AGENTPASS_DB_PATH=/data/agentpass.db

EXPOSE 3846
VOLUME ["/data"]

CMD ["node", "packages/api-server/dist/index.js"]
