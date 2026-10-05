// Kiểm thử nhận diện ghi âm, ghép tư liệu nhiều tệp, áp trần số trang, tông nền → theme, schema gửi Gemini.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sniff, AUDIO_MIME } from '../../src/lib/fileType.js';
import { fitPieces } from '../../src/services/ingestService.js';
import { capSlides, themeForTone } from '../../src/services/specService.js';
import { deckResponseSchema } from '../../src/services/geminiService.js';
import { THEMES, TONE_THEMES } from '../../shared/deck/render.js';
import { CSS_THEMES, themeVarsCss } from '../../shared/deck/palette.js';

const head = (ascii, at = 0, len = 16) => {
  const b = Buffer.alloc(len);
  b.write(ascii, at, 'latin1');
  return b;
};

test('sniff: nhận diện ghi âm bằng magic bytes (không tin phần mở rộng)', () => {
  assert.equal(sniff(head('ID3\x04')), 'mp3');
  assert.equal(sniff(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0])), 'mp3');
  assert.equal(sniff(Buffer.from([0xff, 0xf1, 0x5c, 0x40, 0, 0])), 'aac');
  assert.equal(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')])), 'wav');
  assert.equal(sniff(Buffer.concat([Buffer.from('FORM'), Buffer.alloc(4), Buffer.from('AIFC')])), 'aiff');
  assert.equal(sniff(head('OggS')), 'ogg');
  assert.equal(sniff(head('fLaC')), 'flac');
  assert.equal(sniff(Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypM4A ')])), 'mp4');
  assert.equal(sniff(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42])), 'webm');
  // JPEG (FF D8) không bị nhầm là khung MPEG
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  // WebP vẫn là ảnh dù cũng bắt đầu bằng RIFF
  assert.equal(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'webp');
  for (const k of ['mp3', 'aac', 'wav', 'aiff', 'ogg', 'flac', 'mp4', 'webm']) assert.match(AUDIO_MIME[k], /^audio\//);
});

test('fitPieces: không vượt giới hạn, chia công bằng, tư liệu ngắn giữ nguyên', () => {
  const short = { label: 'ngắn', text: 'S'.repeat(100) };
  const a = { label: 'A', text: 'a'.repeat(50000) };
  const b = { label: 'B', text: 'b'.repeat(50000) };
  const out = fitPieces([short, a, b], 10000);
  assert.ok(out.length <= 10000, `dài ${out.length}`);
  assert.equal((out.match(/S/g) || []).length, 100);
  const na = (out.match(/a/g) || []).length;
  const nb = (out.match(/b/g) || []).length;
  assert.ok(Math.abs(na - nb) <= 2 && na > 4000, `a=${na} b=${nb}`);
  assert.match(out, /=== Tư liệu 2: A ===/);
  assert.match(out, /đã cắt bớt/);
  // 1 tư liệu đủ chỗ → giữ nguyên, không thêm đầu mục
  assert.equal(fitPieces([{ label: 'x', text: 'nội dung' }], 1000), 'nội dung');
  assert.equal(fitPieces([{ label: 'rỗng', text: '  ' }], 1000), '');
});

test('capSlides: cắt về trần, giữ trang kết; không đụng khi đủ', () => {
  const slides = Array.from({ length: 30 }, (_, i) => ({ layout: i === 29 ? 'closing' : 'bullets', title: `T${i}` }));
  const spec = capSlides({ slides: [...slides] }, 25);
  assert.equal(spec.slides.length, 25);
  assert.equal(spec.slides.at(-1).layout, 'closing');
  assert.equal(spec.slides[0].title, 'T0');
  assert.equal(capSlides({ slides: slides.slice(0, 7) }, 7).slides.length, 7);
});

test('tông nền: AI chọn lệch tông → về theme mặc định của tông; theme viết tay có CSS, theme sinh tự động có bảng màu', () => {
  assert.equal(themeForTone('midnight', 'light', TONE_THEMES), 'paper');
  assert.equal(themeForTone('ember', 'light', TONE_THEMES), 'ember');
  assert.equal(themeForTone('paper', 'dark', TONE_THEMES), 'midnight');
  const css = readFileSync(new URL('../../shared/deck/theme.css', import.meta.url), 'utf8');
  for (const t of [...TONE_THEMES.dark, ...TONE_THEMES.light]) {
    assert.ok(THEMES.includes(t));
    if (CSS_THEMES.includes(t)) {
      if (t !== 'midnight') assert.ok(css.includes(`[data-deck-theme="${t}"]`), `thiếu CSS cho ${t}`);
    } else {
      assert.match(themeVarsCss(t), new RegExp(`\\[data-deck-theme="${t}"\\]\\{.*--bg1:`), `thiếu biến màu cho ${t}`);
    }
  }
});

test('schema gửi Gemini: theme theo tông, KHÔNG có minItems/maxItems trên slides (Gemini trả 400)', () => {
  const light = deckResponseSchema({ tone: 'light', slidesHint: 'đúng 7 trang' });
  assert.deepEqual(light.properties.theme.enum, [...TONE_THEMES.light]);
  assert.equal(light.properties.slides.minItems, undefined);
  assert.equal(light.properties.slides.maxItems, undefined);
  assert.equal(light.properties.slides.description, 'đúng 7 trang');
  assert.deepEqual(deckResponseSchema({ tone: 'dark' }).properties.theme.enum, [...TONE_THEMES.dark]);
});
