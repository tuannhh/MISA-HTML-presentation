// Hook nạp module cho test composable giao diện trong Node: '@/…' → frontend/src, '@shared/…' → shared,
// và '@/lib/api.js' → bản giả (test/helpers/fake-api.mjs) để điều khiển phản hồi máy chủ.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function resolve(specifier, context, next) {
  if (specifier === '@/lib/api.js') return { url: pathToFileURL(join(ROOT, 'test/helpers/fake-api.mjs')).href, shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(join(ROOT, 'frontend/src', specifier.slice(2))).href, context);
  if (specifier.startsWith('@shared/')) return next(pathToFileURL(join(ROOT, 'shared', specifier.slice(8))).href, context);
  return next(specifier, context);
}
