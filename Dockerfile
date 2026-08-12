FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm build:landing && pnpm --filter @workspace/api-server build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "start"]
