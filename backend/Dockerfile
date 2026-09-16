FROM node:22-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# @prisma/client runs a postinstall generation hook. Skip that raw CLI path in
# the dependency install; the checked-in wrapper below performs the only
# generation and supplies the offline-safe engine resolution environment.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

EXPOSE 3001
CMD ["npm", "run", "start:prod"]
