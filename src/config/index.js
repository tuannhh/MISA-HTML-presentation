// Tầng cấu hình duy nhất của ứng dụng: mọi nơi khác đọc cấu hình qua module này,
// không tự đọc process.env. Fail-fast khi thiếu/sai cấu hình nhạy cảm ở production.
import path from 'node:path';

const DEV_SESSION_SECRET = 'dev-only-session-secret-change-me';
const RATIOS = ['16:9', '4:3', '2:1', '3:1'];

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : String(v).trim();
}

function int(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`Cấu hình ${name} không hợp lệ: "${raw}"`);
  }
  return n;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function list(name, fallback = []) {
  const raw = str(name);
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function loadConfig() {
  const env = str('NODE_ENV', 'development');
  const isProd = env === 'production';
  const storageDir = path.resolve(str('STORAGE_DIR', './data/storage'));

  const config = Object.freeze({
    env,
    isProd,
    isTest: env === 'test',
    port: int('PORT', 3000, { min: 1, max: 65535 }),
    appBaseUrl: str('APP_BASE_URL', 'http://localhost:3000'),
    trustProxy: int('TRUST_PROXY', 0, { min: 0, max: 10 }),
    session: Object.freeze({
      secret: str('SESSION_SECRET', isProd ? '' : DEV_SESSION_SECRET),
      cookieSecure: bool('SESSION_COOKIE_SECURE', isProd),
      maxAgeHours: int('SESSION_MAX_AGE_HOURS', 12, { min: 1, max: 24 * 30 }),
    }),
    db: Object.freeze({
      host: str('DB_HOST', '127.0.0.1'),
      port: int('DB_PORT', 3306, { min: 1, max: 65535 }),
      user: str('DB_USER', 'misa_presentation'),
      password: str('DB_PASSWORD'),
      database: str('DB_NAME', 'misa_presentation'),
      connectionLimit: int('DB_POOL_SIZE', 10, { min: 1, max: 100 }),
    }),
    gemini: Object.freeze({
      apiKey: str('GEMINI_API_KEY'),
      model: str('GEMINI_MODEL', 'gemini-3.8-flash'),
      timeoutMs: int('GEMINI_TIMEOUT_MS', 240000, { min: 10000, max: 900000 }),
      baseUrl: str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
    }),
    google: Object.freeze({
      apiKey: str('GOOGLE_API_KEY'),
    }),
    auth: Object.freeze({
      selfRegistration: bool('SELF_REGISTRATION', true),
      allowedEmailDomains: list('ALLOWED_EMAIL_DOMAINS', ['misa.com.vn']),
      bcryptRounds: int('BCRYPT_ROUNDS', 12, { min: 4, max: 15 }),
    }),
    storage: Object.freeze({
      root: storageDir,
      privateDir: path.join(storageDir, 'private'),
      tempDir: path.join(storageDir, 'temp'),
      tempTtlMinutes: int('TEMP_TTL_MINUTES', 60, { min: 5, max: 24 * 60 }),
    }),
    limits: Object.freeze({
      maxUploadMb: int('MAX_UPLOAD_MB', 50, { min: 1, max: 200 }),
      maxImageUploadMb: int('MAX_IMAGE_UPLOAD_MB', 15, { min: 1, max: 50 }),
      maxTextChars: int('MAX_TEXT_CHARS', 200000, { min: 1000, max: 2000000 }),
      maxImagesPerDeck: int('MAX_IMAGES_PER_DECK', 60, { min: 0, max: 300 }),
      generationConcurrency: int('GENERATION_CONCURRENCY', 2, { min: 1, max: 8 }),
      renderConcurrency: int('RENDER_CONCURRENCY', 2, { min: 1, max: 8 }),
    }),
    chromePath: str('CHROME_PATH', ''),
    // Trong container chạy user không đặc quyền, sandbox của Chromium cần user namespace → tắt có kiểm soát (chỉ nạp HTML nội bộ, chặn mạng).
    chromeNoSandbox: bool('CHROME_NO_SANDBOX', false),
    ratios: RATIOS,
  });

  validate(config);
  return config;
}

function validate(config) {
  const errors = [];
  if (!config.session.secret) errors.push('Thiếu SESSION_SECRET');
  if (config.isProd && config.session.secret === DEV_SESSION_SECRET) {
    errors.push('SESSION_SECRET đang là giá trị mặc định dành cho dev — không được dùng ở production');
  }
  if (config.isProd && config.session.secret.length < 32) errors.push('SESSION_SECRET phải dài tối thiểu 32 ký tự');
  if (config.isProd && !config.db.password) errors.push('Thiếu DB_PASSWORD');
  if (!config.isTest && !config.gemini.apiKey) errors.push('Thiếu GEMINI_API_KEY');
  if (errors.length) {
    throw new Error(`Cấu hình không hợp lệ:\n - ${errors.join('\n - ')}`);
  }
}

// Che các trường nhạy cảm khi cần in cấu hình ra log.
export function redactConfig(config) {
  return JSON.parse(
    JSON.stringify(config, (key, value) =>
      /secret|password|key|token/i.test(key) && value ? '***' : value,
    ),
  );
}
