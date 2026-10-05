// Công cụ dev: render test/fixtures/sample-spec.json ra file HTML 1 tệp để soát giao diện renderer.
// Dùng: node scripts/render-sample.js [ratio] [theme] [outFile]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { renderDeck } from '../src/services/renderService.js';

const [ratio = '16:9', theme, out = 'tmp/sample.html'] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(new URL('../test/fixtures/sample-spec.json', import.meta.url), 'utf8'));
if (theme) spec.theme = theme;
const html = renderDeck(spec, { ratio, embedFont: true });
mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
writeFileSync(out, html);
console.log(`Đã ghi ${out} (${(html.length / 1024).toFixed(0)} KB, tỷ lệ ${ratio})`);
