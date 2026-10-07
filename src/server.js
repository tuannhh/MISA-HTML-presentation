// Điểm khởi động: đọc cấu hình (fail-fast) → kết nối DB, kiểm tra bảng → dựng service → lắng nghe → tắt êm.
import { loadConfig, redactConfig } from './config/index.js';
import { logger } from './lib/logger.js';
import { createPool, verifyTables } from './db/pool.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';

async function main() {
  const config = loadConfig();
  logger.info('config_loaded', { config: redactConfig(config) });
  if (config.isProd && !config.ipAllowlist.length) {
    logger.warn('ip_allowlist_empty', { message: 'IP_ALLOWLIST trống — ứng dụng nhận truy cập từ mọi IP' });
  }

  const pool = createPool(config.db);
  await verifyTables(pool);

  const container = await createContainer(config, pool);
  await container.services.presentations.recoverStale();
  await container.storage.cleanupUploads(0);

  const app = createApp({ config, pool, ...container });
  const server = app.listen(config.port, () => logger.info('server_listening', { port: config.port }));
  server.requestTimeout = 10 * 60 * 1000; // xuất PDF bài dài có thể mất vài phút
  server.headersTimeout = 65 * 1000;

  const tempTimer = setInterval(() => {
    container.storage.cleanupTemp().catch(() => {});
    container.storage.cleanupUploads(12 * 3600 * 1000).catch(() => {});
  }, 15 * 60 * 1000);
  tempTimer.unref();

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutdown_start', { signal });
    const force = setTimeout(() => process.exit(1), 20000);
    force.unref();
    server.close(async () => {
      await container.browser.close().catch(() => {});
      container.sessionStore.close();
      await pool.end().catch(() => {});
      logger.info('shutdown_done');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error('unhandled_rejection', { err }));
}

main().catch((err) => {
  logger.error('startup_failed', { err: { message: err.message } });
  process.exit(1);
});
