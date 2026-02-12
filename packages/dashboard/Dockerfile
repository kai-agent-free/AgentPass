# Dashboard Dockerfile for Dokploy deployment
# Multi-stage: build with Node, serve with nginx

FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./

# Copy dashboard package
COPY packages/dashboard ./packages/dashboard

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @agentpass/dashboard...

# Build with production API URL
ARG VITE_API_URL=https://api.agentpass.space
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter @agentpass/dashboard build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html

# SPA routing: all paths → index.html
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
