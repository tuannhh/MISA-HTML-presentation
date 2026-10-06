// Kiểm thử ảnh giao diện phần mềm: vùng cắt từ trang PDF (boxToRegion), cắt thật bằng AI giả lập (extractPdfUiShots, cần pdftoppm),
// đặt ảnh không bắt buộc vào dàn ý (placeUserMedia force=false), giữ khung trình duyệt qua dàn ý → spec, renderer tấm nền trắng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boxToRegion, extractPdfUiShots } from '../../src/services/pdfShotService.js';
import { placeUserMedia, normalizeOutline, applyOutlineMedia } from '../../src/services/outlineService.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeckHtml } from '../../shared/deck/render.js';
import { PDFDocument, rgb } from 'pdf-lib';

const U = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const slide = (layout, extra = {}) => ({ id: `s-${Math.random().toString(36).slice(2, 8)}`, layout, title: layout, subtitle: '', points: ['x'], notes: '', images: [], video: null, ...extra });

test('boxToRegion: toạ độ 0–1000 → điểm ảnh có nới mép; bỏ vùng quá nhỏ / gần cả trang / sai dạng', () => {
  const r = boxToRegion([200, 100, 800, 600], 2000, 1125);
  assert.ok(r.left < 200 && r.left >= 180 && r.top < 225 && r.width > 1000 && r.height > 675);
  assert.ok(r.left + r.width <= 2000 && r.top + r.height <= 1125);
  assert.equal(boxToRegion([0, 0, 50, 900], 2000, 1125), null, 'hẹp hơn 12% cạnh trang');
  assert.equal(boxToRegion([0, 0, 1000, 1000], 2000, 1125), null, 'cả trang slide');
  assert.equal(boxToRegion([1, 2, 3], 2000, 1125), null);
  assert.equal(boxToRegion(['a', 0, 500, 500], 2000, 1125), null);
  const edge = boxToRegion([-50, 850, 400, 1200], 2000, 1125);
  assert.ok(edge.left + edge.width <= 2000 && edge.top === 0, 'kẹp trong trang');
});

const hasPdftoppm = (() => {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('extractPdfUiShots: render trang, cắt vùng AI chỉ ra, bỏ vùng chất lượng thấp và ảnh trùng', { skip: !hasPdftoppm && 'thiếu pdftoppm' }, async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 2; i += 1) {
    const p = doc.addPage([960, 540]);
    p.drawRectangle({ x: 480, y: 100, width: 400, height: 340, color: rgb(0.2, 0.4, 0.9) });
    p.drawRectangle({ x: 520, y: 140, width: 120, height: 60, color: rgb(1, 1, 1) });
  }
  const buffer = Buffer.from(await doc.save());
  let seen = null;
  const gemini = {
    async locateUiShots({ pages }) {
      seen = pages;
      return {
        shots: [
          { page: 1, box_2d: [185, 500, 815, 917], device: 'web', title: 'Bảng điều khiển', quality: 3 },
          { page: 2, box_2d: [185, 500, 815, 917], device: 'web', title: 'Trùng trang 1', quality: 3 },
          { page: 2, box_2d: [0, 0, 300, 300], device: 'mobile', title: 'Mờ', quality: 1 },
          { page: 9, box_2d: [0, 0, 500, 500], device: 'web', title: 'Trang không tồn tại', quality: 3 },
        ],
      };
    },
  };
  const shots = await extractPdfUiShots([{ name: 'demo.pdf', buffer }], { gemini, tempDir: mkdtempSync(join(tmpdir(), 'shots-')) });
  assert.equal(seen.length, 2, 'AI xem ảnh mọi trang');
  assert.equal(shots.length, 1, 'bỏ ảnh trùng, chất lượng thấp, trang lạ');
  assert.equal(shots[0].ui.device, 'web');
  assert.match(shots[0].hint, /ẢNH GIAO DIỆN PHẦN MỀM .*trang 1.*Bảng điều khiển/);
  // AI lỗi / thiếu công cụ → không làm hỏng lượt tạo bài
  const none = await extractPdfUiShots([{ name: 'x.pdf', buffer }], { gemini: { locateUiShots: async () => { throw new Error('quota'); } }, tempDir: tmpdir() });
  assert.deepEqual(none, []);
  assert.deepEqual(await extractPdfUiShots([{ name: 'x.pdf', buffer }], { gemini, bin: 'khong-co-pdftoppm', tempDir: tmpdir() }), []);
});

test('placeUserMedia force=false: chỉ vào trang chữ ngắn hoặc trang mới khi còn hạn mức; hết chỗ thì bỏ, giữ khung trình duyệt', () => {
  const shot = (n) => ({ asset: U(n), fit: 'contain', frame: 'browser' });
  const full = [slide('cover'), slide('cards', { points: ['a', 'b', 'c', 'd', 'e', 'f'] }), slide('stats'), slide('closing')];
  const r0 = placeUserMedia(full, { images: [shot(1)], videos: [] }, { room: 0, force: false });
  assert.equal(r0.added, 0);
  assert.equal(full.flatMap((s) => s.images).length, 0, 'không ép vào trang thẻ 6 dòng / số liệu / bìa');

  const withRoom = [slide('cover'), slide('stats'), slide('closing')];
  const r1 = placeUserMedia(withRoom, { images: [1, 2, 3, 4, 5].map(shot), videos: [] }, { room: 1, force: false, chunk: 4, title: 'Giao diện sản phẩm' });
  assert.equal(r1.added, 1, 'thêm đúng 1 trang (hạn mức)');
  const g = withRoom.find((s) => s.title === 'Giao diện sản phẩm');
  assert.equal(g.layout, 'gallery');
  assert.equal(g.images.length, 4, 'tối đa 4 ảnh giao diện mỗi trang');
  assert.deepEqual(g.images[0], { asset: U(1), caption: '', fit: 'contain', frame: 'browser' });
  assert.equal(withRoom.at(-1).layout, 'closing');

  const text = [slide('cover'), slide('bullets', { points: ['a', 'b'] }), slide('closing')];
  placeUserMedia(text, { images: [shot(9)], videos: [] }, { room: 0, force: false });
  assert.equal(text[1].images[0].frame, 'browser', 'trang chữ ngắn nhận ảnh');
});

test('khung trình duyệt: dàn ý → slide → spec giữ frame (chỉ với ảnh trọn khung)', () => {
  const { outline } = normalizeOutline({ title: 'T', slides: [{ layout: 'image', title: 'Màn hình', points: ['a'], images: [{ asset: U(1), fit: 'contain', frame: 'browser' }] }] });
  assert.deepEqual(outline.slides[0].images[0], { asset: U(1), caption: '', fit: 'contain', frame: 'browser' });
  const s = applyOutlineMedia({ layout: 'image', items: [] }, outline.slides[0]);
  assert.equal(s.image.frame, 'browser');
  const { spec } = normalizeSpec({ title: 'T', slides: [{ layout: 'image', title: 'A', image: { asset: U(1), fit: 'contain', frame: 'browser' } }, { layout: 'image', title: 'B', image: { asset: U(2), fit: 'cover', frame: 'browser' } }] });
  assert.equal(spec.slides[0].image.frame, 'browser');
  assert.equal(spec.slides[1].image.frame, undefined, 'ảnh chụp (cover) không có khung');
});

test('renderer: ảnh trọn khung → tấm nền trắng đúng tỷ lệ asset, khung trình duyệt; ảnh rất ngang → cột ảnh rộng', () => {
  const { spec } = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'image', title: 'Bảng', caption: 'Quản lý người dùng', items: [{ title: 'a', text: 'b' }], image: { asset: U(1), fit: 'contain', frame: 'browser' } },
      { layout: 'image', title: 'Ảnh', image: { asset: U(2), fit: 'cover' } },
    ],
  });
  const meta = { [U(1)]: { width: 2600, height: 1000 }, [U(2)]: { width: 1600, height: 900 } };
  const html = renderDeckHtml(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}`, assetMeta: (id) => meta[id] || null, css: '', engineJs: '' });
  assert.match(html, /class="media plate web cap" style="--ar:2\.6000"/);
  assert.match(html, /class="pbar"/);
  assert.match(html, /class="im has-side wide/);
  assert.match(html, /<figcaption>Quản lý người dùng<\/figcaption>/);
  assert.equal((html.match(/class="media plate/g) || []).length, 1, 'ảnh chụp thật vẫn hiển thị kiểu cover');
});
