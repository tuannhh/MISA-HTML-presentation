// Tầng cấu hình duy nhất của ứng dụng: mọi nơi khác đọc cấu hình qua module này,
// không tự đọc process.env. Fail-fast khi thiếu/sai cấu hình nhạy cảm ở production.
import path from 'node:path';
import { parseIpAllowlist } from '../lib/ipAllowlist.js';

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

function publishConfig(raw) {
  if (!raw) return Object.freeze({ baseUrl: '', host: '' });
  let url = null;
  try {
    url = new URL(raw);
  } catch {
    /* báo lỗi ở validate */
  }
  const valid = url && /^https?:$/.test(url.protocol) && (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash && !url.username;
  return Object.freeze({ baseUrl: valid ? url.origin : '', host: valid ? url.hostname.toLowerCase() : '', raw, valid: Boolean(valid) });
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
    // Xuất bản công khai: domain riêng (vd. https://slides.misa.vn) do DevOps đặt; trống = tắt tính năng. Phân luồng theo domain:
    // request tới host này chỉ thấy trang đã xuất bản (src/routes/publicSiteRoutes.js), không bao giờ tới giao diện/API nội bộ.
    publish: publishConfig(str('PUBLISH_BASE_URL', '')),
    trustProxy: int('TRUST_PROXY', 0, { min: 0, max: 10 }),
    // Chỉ cho truy cập từ các IP/dải IP này (máy chủ đặt trong mạng MISA; DevOps điền IP thật). Rỗng = không giới hạn.
    // Phân tách bằng dấu phẩy/khoảng trắng; nhận IP đơn, CIDR, khoảng a-b; IPv4 + IPv6. Xem lib/ipAllowlist.js.
    ipAllowlist: Object.freeze(str('IP_ALLOWLIST').split(/[\s,;]+/).filter(Boolean)),
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
      // Chuyển thể ghi âm dài / đọc PDF lớn chậm hơn nhiều so với dựng bài.
      mediaTimeoutMs: int('GEMINI_MEDIA_TIMEOUT_MS', 900000, { min: 60000, max: 1800000 }),
      baseUrl: str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
      // Tạo ảnh minh hoạ (Nano Banana 2 Lite) — ảnh 1K theo câu lệnh; dùng chung GEMINI_API_KEY.
      imageModel: str('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-lite-image'),
      imageSize: str('GEMINI_IMAGE_SIZE', '1K'),
      imageTimeoutMs: int('GEMINI_IMAGE_TIMEOUT_MS', 90000, { min: 10000, max: 300000 }),
    }),
    // Ảnh minh hoạ do AI tạo: tự động khi dựng bài (tuỳ chọn lúc tạo bài, mặc định bật) + theo yêu cầu trong trình soạn thảo.
    aiImages: Object.freeze({
      enabled: bool('AI_IMAGES', true),
      perDeck: int('AI_IMAGES_PER_DECK', 6, { min: 0, max: 20 }),
      concurrency: int('AI_IMAGES_CONCURRENCY', 3, { min: 1, max: 8 }),
    }),
    // Tìm ảnh trên Internet theo từ khoá (Pixabay API — ảnh miễn phí bản quyền, tải về máy chủ khi người dùng chọn).
    pixabay: Object.freeze({
      apiKey: str('PIXABAY_API_KEY'),
      baseUrl: str('PIXABAY_BASE_URL', 'https://pixabay.com/api/'),
    }),
    google: Object.freeze({
      apiKey: str('GOOGLE_API_KEY'),
    }),
    auth: Object.freeze({
      bcryptRounds: int('BCRYPT_ROUNDS', 12, { min: 4, max: 15 }),
    }),
    storage: Object.freeze({
      root: storageDir,
      privateDir: path.join(storageDir, 'private'),
      tempDir: path.join(storageDir, 'temp'),
      tempTtlMinutes: int('TEMP_TTL_MINUTES', 60, { min: 5, max: 24 * 60 }),
      // Tệp nguồn tải lên nằm đây tới khi AI xử lý xong (ngoài tempDir vì job có thể chờ hàng đợi lâu hơn TTL tạm).
      uploadDir: path.join(storageDir, 'uploads'),
    }),
    limits: Object.freeze({
      // Tổng dung lượng mọi tệp nguồn của 1 lần tạo (không giới hạn riêng từng tệp).
      maxUploadMb: int('MAX_UPLOAD_MB', 300, { min: 1, max: 2000 }),
      maxUploadFiles: int('MAX_UPLOAD_FILES', 20, { min: 1, max: 50 }),
      // Tổng ký tự tư liệu (văn bản + bản chuyển thể ghi âm/PDF) gửi cho AI ở bước dựng bài.
      maxSourceChars: int('MAX_SOURCE_CHARS', 400000, { min: 10000, max: 3000000 }),
      maxImageUploadMb: int('MAX_IMAGE_UPLOAD_MB', 15, { min: 1, max: 50 }),
      maxTextChars: int('MAX_TEXT_CHARS', 200000, { min: 1000, max: 2000000 }),
      maxImagesPerDeck: int('MAX_IMAGES_PER_DECK', 60, { min: 0, max: 300 }),
      // Video tải lên gắn vào slide (mỗi tệp) và số video tối đa/bài.
      maxVideoMb: int('MAX_VIDEO_MB', 150, { min: 1, max: 2000 }),
      maxVideosPerDeck: int('MAX_VIDEOS_PER_DECK', 10, { min: 0, max: 50 }),
      // Ảnh/video người dùng gửi kèm khi tạo bài (bắt buộc đưa vào bài) — số tệp tối đa mỗi lần tạo (video còn theo MAX_VIDEOS_PER_DECK).
      maxCreateMedia: int('MAX_CREATE_MEDIA', 20, { min: 0, max: 60 }),
      // Tệp HTML xuất ra nhúng luôn video tải lên khi tổng dung lượng video không vượt mức này (vượt → chỉ có ảnh bìa).
      exportVideoMb: int('EXPORT_VIDEO_MB', 200, { min: 0, max: 2000 }),
      generationConcurrency: int('GENERATION_CONCURRENCY', 2, { min: 1, max: 8 }),
      renderConcurrency: int('RENDER_CONCURRENCY', 2, { min: 1, max: 8 }),
    }),
    // Nhận diện + cắt ảnh giao diện phần mềm và sơ đồ từ tư liệu (visualService): render trang PDF (poppler pdftoppm), PPTX/DOCX/ODP/ODT
    // (LibreOffice → PDF) → AI khoanh vùng, phân loại → cắt để đưa nguyên vẹn vào bài. Tên biến PDF_UI_SHOTS* giữ từ bản chỉ cắt PDF.
    visuals: Object.freeze({
      enabled: bool('PDF_UI_SHOTS', true),
      bin: str('PDFTOPPM_PATH', 'pdftoppm'),
      office: bool('OFFICE_VISUALS', true),
      soffice: str('SOFFICE_PATH', 'soffice'),
      officeTimeoutMs: int('OFFICE_RENDER_TIMEOUT_MS', 120000, { min: 10000, max: 600000 }),
      maxPages: int('PDF_UI_SHOT_PAGES', 40, { min: 1, max: 200 }),
      maxShots: int('PDF_UI_SHOTS_MAX', 24, { min: 0, max: 60 }),
    }),
    chromePath: str('CHROME_PATH', ''),
    // Trong container chạy user không đặc quyền, sandbox của Chromium cần user namespace → tắt có kiểm soát (chỉ nạp HTML nội bộ, chặn mạng).
    chromeNoSandbox: bool('CHROME_NO_SANDBOX', false),
    // Giới hạn tần suất API (mỗi phút) theo người dùng đã đăng nhập. Không giới hạn theo IP: mọi người vào qua mạng/VPN MISA chung 1 IP.
    rate: Object.freeze({
      userPerMin: int('RATE_LIMIT_USER_PER_MIN', 600, { min: 30, max: 100000 }),
    }),
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
  // Production: địa chỉ truy cập và cờ cookie phải khớp — https mà cookie không secure thì phiên lộ qua HTTP; http mà cookie secure thì không đăng nhập được.
  if (config.isProd) {
    const https = /^https:/i.test(config.appBaseUrl);
    if (https && !config.session.cookieSecure) errors.push('APP_BASE_URL là https nhưng SESSION_COOKIE_SECURE=false — đặt SESSION_COOKIE_SECURE=true');
    if (!https && config.session.cookieSecure) errors.push('APP_BASE_URL là http nhưng SESSION_COOKIE_SECURE=true — trình duyệt sẽ không giữ phiên đăng nhập; dùng https hoặc đặt SESSION_COOKIE_SECURE=false');
  }
  if (config.publish.raw && !config.publish.valid) errors.push('PUBLISH_BASE_URL phải là http(s)://domain (không có đường dẫn/tham số), vd. https://slides.misa.vn');
  if (config.publish.host && config.publish.host === new URL(config.appBaseUrl).hostname.toLowerCase()) {
    errors.push('PUBLISH_BASE_URL phải là domain riêng, khác APP_BASE_URL (domain công khai chỉ phục vụ trang đã xuất bản)');
  }
  const badIps = parseIpAllowlist(config.ipAllowlist).errors;
  if (badIps.length) errors.push(`IP_ALLOWLIST có mục không hợp lệ: ${badIps.join(', ')}`);
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
