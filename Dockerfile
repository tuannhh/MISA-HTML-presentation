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
# ORT_DISABLE_TELEMETRY: onnxruntime (tách nền logo bằng AI) bản Linux có gửi telemetry về Microsoft → tắt.
ENV NODE_ENV=production \
    ORT_DISABLE_TELEMETRY=1 \
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
# onnxruntime-node đóng gói sẵn binary CPU mọi nền tảng (~290 MB) → chỉ giữ linux/<kiến trúc hiện tại> (~25–45 MB).
RUN npm ci --omit=dev --ignore-scripts \
 && find node_modules/onnxruntime-node/bin/napi-v6 -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} + \
 && find node_modules/onnxruntime-node/bin/napi-v6/linux -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} + \
 && npm cache clean --force
COPY src ./src
COPY shared ./shared
# Mô hình U²-Net-p (Apache-2.0) tách nền logo nền phức tạp — thiếu thì tự lùi về tách theo màu nền.
COPY models ./models
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
