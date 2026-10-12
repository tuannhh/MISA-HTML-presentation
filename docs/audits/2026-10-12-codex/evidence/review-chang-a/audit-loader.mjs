import { resolve as original } from '../../../../../test/helpers/alias-loader.mjs';
export function resolve(s, c, next) {
  if (s === '@/lib/api.js') return { url: new URL('./audit-api.mjs', import.meta.url).href, shortCircuit: true };
  return original(s, c, next);
}
