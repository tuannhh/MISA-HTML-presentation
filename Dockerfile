# syntax=docker/dockerfile:1.7
# ---------- build giao diện ----------
FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY vite.config.js ./
COPY frontend ./frontend
COPY shared ./shared
RUN npm run build

# ---------- runtime ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=true \
    STORAGE_DIR=/data/storage
# Chromium để chụp thumbnail/xuất PDF; font Noto/DejaVu dự phòng cho ký tự ngoài Inter.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-noto-core ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# sharp cần tải binary nền tảng qua optionalDependencies (không phải install script) → --ignore-scripts vẫn chạy được.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY shared ./shared
COPY scripts/create-admin.js ./scripts/create-admin.js
COPY startup ./startup
COPY --from=web /app/dist ./dist
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
