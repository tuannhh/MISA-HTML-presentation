// Logger JSON một dòng, tự che các trường nhạy cảm (secret/password/key/token/cookie).
const SENSITIVE = /secret|password|passwd|api[-_]?key|token|cookie|authorization/i;
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'test' ? LEVELS.warn : LEVELS.info);

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 5) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE.test(k) ? '***' : redact(v, depth + 1);
  }
  return out;
}

function write(level, msg, meta) {
  if (LEVELS[level] < minLevel) return;
  const line = { t: new Date().toISOString(), level, msg, ...(meta ? redact(meta) : {}) };
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

export const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
