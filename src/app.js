// Lắp ráp ứng dụng Express: middleware bảo mật → phiên → API → giao diện tĩnh (SPA) → xử lý lỗi.
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { logger } from './lib/logger.js';
import { loadUser } from './middleware/auth.js';
import { csrfProtection, securityHeaders, rateLimits } from './middleware/security.js';
import { errorHandler, notFoundApi } from './middleware/errorHandler.js';
import { MySqlSessionStore } from './repositories/sessionStore.js';
import { authRoutes } from './routes/authRoutes.js';
import { presentationRoutes } from './routes/presentationRoutes.js';
import { assetRoutes } from './routes/assetRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { deckFontBuffer, deckFontFile, DECK_FONT_PATH } from './services/renderService.js';
import { ok } from './lib/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ config, pool, repos, services }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', false);

  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-Id', req.id);
    const started = process.hrtime.bigint();
    // Lấy đường dẫn NGAY lúc nhận request: Express 5 gán lại req.url/req.path tương đối trong router con (mount '/api/…'),
    // đến sự kiện 'finish' req.path không còn tiền tố /api → trước đây gần như mọi request API bị bỏ khỏi log.
    // Không ghi query string (có thể chứa chữ ký URL ảnh).
    const p = req.originalUrl.split('?')[0];
    res.on('finish', () => {
      if (p.startsWith('/api/') && p !== '/api/health') {
        logger.info('http', { id: req.id, m: req.method, p, s: res.statusCode, ms: Number((process.hrtime.bigint() - started) / 1000000n), u: req.user?.id });
      }
    });
    next();
  });

  app.use(securityHeaders());

  // Phông của bài trình bày: công khai, cho phép khung sandbox (origin null) tải. Chỉ tệp trong danh sách cho phép.
  const fontHeaders = { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' };
  app.get(DECK_FONT_PATH, (_req, res) => {
    res.set(fontHeaders);
    res.send(deckFontBuffer());
  });
  app.get('/deck-assets/fonts/*file', (req, res) => {
    const buf = deckFontFile([].concat(req.params.file).join('/'));
    if (!buf) return res.status(404).end();
    res.set(fontHeaders);
    return res.send(buf);
  });

  // Health: liveness không chạm DB; readiness kiểm tra DB.
  app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));
  app.get('/api/health/ready', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      ok(res, { status: 'ready', queue: services.presentations.queueStats() });
    } catch {
      res.status(503).json({ error: { code: 'NOT_READY', message: 'Cơ sở dữ liệu chưa sẵn sàng' } });
    }
  });

  const limits = rateLimits();
  const api = express.Router();
  api.use(limits.api);
  api.use(express.json({ limit: '2mb' }));
  api.use(
    session({
      name: 'mp.sid',
      secret: config.session.secret,
      store: services.sessionStore || new MySqlSessionStore(pool),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: config.trustProxy > 0,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.session.cookieSecure, maxAge: config.session.maxAgeHours * 3600 * 1000 },
    }),
  );
  api.use(loadUser(repos.users));
  api.use(csrfProtection(config));
  api.use('/auth', authRoutes({ auth: services.auth, users: repos.users, limits }));
  api.use('/presentations', presentationRoutes({ service: services.presentations, config, limits }));
  api.use('/assets', assetRoutes({ service: services.presentations }));
  api.use('/admin', adminRoutes({ auth: services.auth }));
  api.use(notFoundApi);
  app.use('/api', api);

  // Giao diện (Vite build). Mọi đường dẫn không phải /api trả index.html (SPA).
  const dist = path.join(ROOT, 'dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler(config));
  return app;
}
