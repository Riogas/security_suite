# syntax=docker/dockerfile:1.6

############################
# Deps (instala node_modules con pnpm)
############################
FROM node:20-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# si tenés monorepo: COPY pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

############################
# Builder (build de Next)
############################
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat
RUN corepack enable

# ⬇️ Si usás BACKEND_BASE_URL en next.config.* (rewrites), llega en build
ARG BACKEND_BASE_URL
ENV BACKEND_BASE_URL=${BACKEND_BASE_URL}

# Trae node_modules ya resueltos
COPY --from=deps /app/node_modules ./node_modules

# Copiá SOLO lo necesario para construir (evita context gigante)
COPY package.json pnpm-lock.yaml ./
COPY next.config.* ./
COPY tsconfig*.json ./
COPY postcss.config.* ./
COPY tailwind.config.* ./
COPY public ./public
COPY src ./src
# Si tenés otras carpetas necesarias para el build, agregalas acá:
# COPY app ./app

RUN pnpm run build

############################
# Runner (mínimo, producción)
############################
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# wget para healthcheck
RUN apk add --no-cache wget

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copiá artefactos standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs
EXPOSE 3000

# Healthcheck interno (se puede sobreescribir en compose)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Next standalone arranca con server.js
CMD ["node", "server.js"]
