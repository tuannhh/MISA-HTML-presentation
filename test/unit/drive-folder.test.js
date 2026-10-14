// Link thư mục Google Drive: đọc mã thư mục + resourcekey, liệt kê qua Drive API (phân trang, thư mục con, lối tắt), lọc loại tệp
// trước khi tải, xuất tệp Google sang Office, hạn mức tệp/dung lượng/ảnh, lỗi rõ ràng (chưa chia sẻ, chưa bật API, hết hạn mức).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sharp from 'sharp';
import { driveFolderRef, isDriveFolderLink } from '../../src/services/driveFolder.js';
import { precheckSource, ingestSource } from '../../src/services/ingestService.js';

const KEY = 'test-key-khong-that-123';
const LIMITS = { maxUploadMb: 300, maxTextChars: 200000, maxImageUploadMb: 15, maxImagesPerDeck: 60, maxLinkImages: 24, maxSourceLinks: 5, maxUploadFiles: 20 };
const FOLDER = 'application/vnd.google-apps.folder';
const ROOT = 'FOLDERroot0001';
const SUB = 'FOLDERsub00001';
const LINK = `https://drive.google.com/drive/folders/${ROOT}?usp=sharing&resourcekey=0-rk1`;
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function pptx(text) {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types/>');
  z.file('ppt/presentation.xml', '<p:presentation/>');
  z.file('ppt/slides/slide1.xml', `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`);
  return z.generateAsync({ type: 'nodebuffer' });
}
async function docx(text) {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types/>');
  z.file('word/document.xml', `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}
const json = (status, v) => ({ status, contentType: 'application/json', body: Buffer.from(JSON.stringify(v)) });
const apiErr = (status, reason, extra = {}) => json(status, { error: { code: status, errors: [{ reason }], ...extra } });

/**
 * Drive giả: folders = { id: { name, pages: [[item…], …] } }, media = { id: Buffer | () => response }, exports = { id: Buffer }.
 * Ghi lại mọi lượt gọi (URL đã phân tích + header + maxBytes) để kiểm tra.
 */
function fakeDrive({ folders, media = {}, exports = {}, root = null }) {
  const calls = [];
  const fetch = async (raw, opts) => {
    const u = new URL(raw);
    calls.push({ u, headers: opts.headers || {}, maxBytes: opts.maxBytes });
    assert.ok(String(raw).startsWith('https://www.googleapis.com/drive/v3/files'), 'chỉ gọi Drive API');
    assert.equal(u.searchParams.get('key'), KEY);
    const rest = u.pathname.replace(/^\/drive\/v3\/files/, '');
    if (!rest) {
      const id = /^'([\w-]+)' in parents and trashed = false$/.exec(u.searchParams.get('q'))[1];
      const f = folders[id];
      if (!f) return apiErr(404, 'notFound');
      if (f.fail) return f.fail;
      const n = Number(u.searchParams.get('pageToken') || 0);
      return json(200, { files: f.pages[n] || [], ...(n + 1 < f.pages.length ? { nextPageToken: String(n + 1) } : {}) });
    }
    const [, id, op] = /^\/([\w-]+)(\/export)?$/.exec(rest);
    if (op) return exports[id] ? { status: 200, contentType: u.searchParams.get('mimeType'), body: exports[id] } : apiErr(403, 'exportSizeLimitExceeded');
    if (u.searchParams.get('alt') === 'media') {
      const m = media[id];
      if (typeof m === 'function') return m();
      return m ? { status: 200, contentType: 'application/octet-stream', body: m } : apiErr(404, 'notFound');
    }
    if (root) return root;
    if (folders[id]) return json(200, { id, name: folders[id].name, mimeType: FOLDER });
    return apiErr(404, 'notFound');
  };
  return { fetch, calls };
}

test('driveFolderRef / isDriveFolderLink: mọi dạng link thư mục, resourcekey; link tệp không phải thư mục', () => {
  assert.deepEqual(driveFolderRef(`https://drive.google.com/drive/folders/${ROOT}?resourcekey=0-AbC_1`), { id: ROOT, resourceKey: '0-AbC_1' });
  assert.deepEqual(driveFolderRef(`https://drive.google.com/drive/u/1/folders/${ROOT}`), { id: ROOT, resourceKey: null });
  assert.equal(driveFolderRef(`https://drive.google.com/folderview?usp=x&id=${ROOT}`).id, ROOT);
  assert.equal(driveFolderRef(`https://drive.google.com/embeddedfolderview?id=${ROOT}#list`).id, ROOT);
  assert.equal(driveFolderRef(`https://drive.google.com/drive/folders/${ROOT}?resourcekey=<x>`).resourceKey, null, 'resourcekey lạ → bỏ');
  assert.equal(driveFolderRef('https://drive.google.com/drive/folders/abc'), null, 'mã quá ngắn');
  assert.ok(isDriveFolderLink('https://drive.google.com/drive/folders/abc'));
  assert.ok(!isDriveFolderLink(`https://drive.google.com/file/d/${ROOT}/view`));
  assert.ok(!isDriveFolderLink(`https://drive.google.com/open?id=${ROOT}`));
});

test('precheckSource: thư mục Drive cần khoá Google, kiểm tra mã thư mục, giữ resourcekey', async () => {
  await assert.rejects(precheckSource({ urls: [LINK] }, LIMITS), (e) => e.code === 'UNSUPPORTED_LINK' && /dán link của từng tệp/.test(e.message));
  const ok = await precheckSource({ urls: [`${LINK}#x`] }, LIMITS, { driveFolders: true });
  assert.deepEqual(ok.urls, [LINK]);
  await assert.rejects(
    precheckSource({ urls: ['https://misa.vn/a', 'https://drive.google.com/drive/folders/'] }, LIMITS, { driveFolders: true }),
    (e) => e.code === 'INVALID_URL' && /^Link 2: Link thư mục Google Drive không hợp lệ/.test(e.message),
  );
});

test('ingestSource thư mục Drive: phân trang + thư mục con + lối tắt, xuất Google Slides, lọc loại/cỡ trước khi tải, ảnh có nguồn', async () => {
  const img = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#245FDF' } }).jpeg().toBuffer();
  const drive = fakeDrive({
    folders: {
      [ROOT]: {
        name: 'Hội thảo VH 2026',
        pages: [
          [
            { id: SUB, name: 'Ảnh', mimeType: FOLDER, resourceKey: '0-rksub' },
            { id: 'SLIDES00001', name: 'Kế hoạch', mimeType: 'application/vnd.google-apps.presentation' },
            { id: 'FORM0000001', name: 'Đăng ký', mimeType: 'application/vnd.google-apps.form' },
            { id: 'CONF0000001', name: 'recording.conf', mimeType: 'text/plain', size: '100' },
          ],
          [
            { id: 'NOTE0000001', name: 'Ghi chú.md', mimeType: 'text/markdown', size: '80' },
            { id: 'SHORT000001', name: 'Báo cáo', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 'DOCX0000001', targetMimeType: DOCX, targetResourceKey: '0-rk2' } },
            { id: 'VIDEO000001', name: 'clip.mp4', mimeType: 'video/mp4', size: String(500 * 1048576) },
            { id: 'LOCKED00001', name: 'khoa.pdf', mimeType: 'application/pdf', size: '10' },
            { id: 'BAD/../x', name: 'tà.pdf', mimeType: 'application/pdf' },
          ],
        ],
      },
      [SUB]: {
        name: 'Ảnh',
        pages: [[
          { id: 'IMG00000001', name: 'san-khau.jpg', mimeType: 'image/jpeg', size: String(img.length) },
          { id: 'IMG00000002', name: 'rat-to.jpg', mimeType: 'image/jpeg', size: String(20 * 1048576) },
        ]],
      },
    },
    exports: { SLIDES00001: await pptx('Mục tiêu diễn đàn văn hoá doanh nghiệp') },
    media: {
      NOTE0000001: Buffer.from('# Ghi chú\nKhách mời phát biểu khai mạc lúc 8 giờ 30.'),
      DOCX0000001: await docx('Báo cáo tổng kết năm 2025'),
      IMG00000001: img,
      LOCKED00001: () => apiErr(403, 'forbidden'),
    },
  });
  const out = await ingestSource({ urls: [LINK] }, { limits: LIMITS, googleApiKey: KEY, fetch: drive.fetch });

  assert.deepEqual(out.pieces.map((p) => p.label), ['Kế hoạch (Google Slides)', 'Ghi chú.md', 'Báo cáo']);
  assert.match(out.pieces[0].text, /Mục tiêu diễn đàn/);
  assert.deepEqual(out.docs.map((d) => d.ext), ['pptx', 'docx'], 'slide/văn bản giữ tệp gốc để render trang');
  const loose = out.images.filter((im) => im.standalone);
  assert.equal(loose.length, 1);
  assert.equal(loose[0].hint, 'ảnh trong thư mục Google Drive "Hội thảo VH 2026" — tệp "Ảnh/san-khau.jpg"');

  const got = (id) => drive.calls.filter((c) => c.u.pathname.includes(`/${id}`));
  for (const id of ['FORM0000001', 'CONF0000001', 'VIDEO000001', 'IMG00000002']) assert.equal(got(id).length, 0, `không tải ${id}`);
  assert.ok(!drive.calls.some((c) => c.u.pathname.includes('BAD')), 'mã tệp lạ → không ghép vào đường dẫn');
  assert.equal(got('SLIDES00001')[0].u.searchParams.get('mimeType'), PPTX);
  assert.equal(got('DOCX0000001')[0].headers['x-goog-drive-resource-keys'], 'DOCX0000001/0-rk2', 'lối tắt → tệp đích + khoá của đích');
  assert.ok(got('IMG00000001')[0].maxBytes <= 15 * 1048576, 'ảnh ≤ maxImageUploadMb');
  const lists = drive.calls.filter((c) => c.u.searchParams.has('q'));
  assert.equal(lists.length, 3, 'thư mục gốc 2 trang + thư mục con 1 trang');
  assert.equal(lists[0].headers['x-goog-drive-resource-keys'], `${ROOT}/0-rk1`);
  assert.equal(lists[2].headers['x-goog-drive-resource-keys'], `${SUB}/0-rksub`);
  assert.equal(lists[0].u.searchParams.get('includeItemsFromAllDrives'), 'true');

  // Hạn mức số tệp: 1 → chỉ tệp tài liệu đầu tiên (tài liệu trước ảnh).
  const one = fakeDrive({ folders: { [ROOT]: { name: 'X', pages: [[{ id: 'IMG00000001', name: 'a.jpg', mimeType: 'image/jpeg' }, { id: 'NOTE0000001', name: 'b.txt', mimeType: 'text/plain' }]] } }, media: { IMG00000001: img, NOTE0000001: Buffer.from('Nội dung ghi chú đủ dài để làm tư liệu.') } });
  const o1 = await ingestSource({ urls: [LINK] }, { limits: { ...LIMITS, maxUploadFiles: 1 }, googleApiKey: KEY, fetch: one.fetch });
  assert.deepEqual(o1.pieces.map((p) => p.label), ['b.txt']);
  assert.equal(o1.images.length, 0);
});

test('ingestSource thư mục Drive: lỗi rõ ràng, không lộ khoá, link lỗi báo theo thứ tự', async () => {
  const run = (drive, opts = {}) => ingestSource({ urls: opts.urls || [LINK] }, { limits: LIMITS, googleApiKey: 'apiKey' in opts ? opts.apiKey : KEY, fetch: drive.fetch });
  const noKey = (e) => !String(e.message).includes(KEY);

  await assert.rejects(run(fakeDrive({ folders: {} })), (e) => e.code === 'SOURCE_FORBIDDEN' && /Bất kỳ ai có đường liên kết/.test(e.message));
  await assert.rejects(
    run(fakeDrive({ folders: {}, root: apiErr(403, 'accessNotConfigured', { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] }) })),
    (e) => e.status === 503 && e.code === 'DRIVE_UNAVAILABLE' && noKey(e),
  );
  await assert.rejects(run(fakeDrive({ folders: {}, root: apiErr(400, 'badRequest', { details: [{ reason: 'API_KEY_INVALID' }] }) })), (e) => e.code === 'DRIVE_UNAVAILABLE');
  await assert.rejects(run(fakeDrive({ folders: {}, root: apiErr(429, 'rateLimitExceeded') })), (e) => e.code === 'DRIVE_BUSY');
  await assert.rejects(run(fakeDrive({ folders: { [ROOT]: { name: 'R', pages: [[]] } } })), (e) => e.code === 'SOURCE_EMPTY' && /trống/.test(e.message));
  await assert.rejects(
    run(fakeDrive({ folders: { [ROOT]: { name: 'R', pages: [[{ id: 'FORM0000001', name: 'f', mimeType: 'application/vnd.google-apps.form' }, { id: 'ZIP00000001', name: 'a.zip', mimeType: 'application/zip' }]] } } })),
    (e) => e.code === 'SOURCE_EMPTY' && /không có tệp đọc được/.test(e.message),
  );
  const locked = fakeDrive({ folders: { [ROOT]: { name: 'R', pages: [[{ id: 'LOCKED00001', name: 'a.pdf', mimeType: 'application/pdf' }]] } }, media: { LOCKED00001: () => apiErr(403, 'forbidden') } });
  await assert.rejects(run(locked), (e) => e.code === 'SOURCE_FORBIDDEN' && /Các tệp trong thư mục/.test(e.message));
  // Hết hạn mức giữa chừng → dừng cả thư mục (không thử tiếp từng tệp).
  const busy = fakeDrive({ folders: { [ROOT]: { name: 'R', pages: [[{ id: 'NOTE0000001', name: 'a.txt', mimeType: 'text/plain' }, { id: 'NOTE0000002', name: 'b.txt', mimeType: 'text/plain' }]] } }, media: { NOTE0000001: () => apiErr(403, 'userRateLimitExceeded'), NOTE0000002: Buffer.from('x') } });
  await assert.rejects(run(busy), (e) => e.code === 'DRIVE_BUSY');
  assert.ok(!busy.calls.some((c) => c.u.pathname.includes('NOTE0000002')));
  // Thư mục con không mở được → bỏ qua thư mục con, vẫn đọc tệp ở thư mục gốc.
  const subLocked = fakeDrive({
    folders: { [ROOT]: { name: 'R', pages: [[{ id: SUB, name: 'Riêng', mimeType: FOLDER }, { id: 'NOTE0000001', name: 'a.txt', mimeType: 'text/plain' }]] }, [SUB]: { name: 'Riêng', pages: [], fail: apiErr(404, 'notFound') } },
    media: { NOTE0000001: Buffer.from('Nội dung ghi chú ở thư mục gốc đủ dài.') },
  });
  assert.deepEqual((await run(subLocked)).pieces.map((p) => p.label), ['a.txt']);
  // Không có khoá (cấu hình đổi sau precheck) → báo dán link từng tệp, không gọi Drive.
  const idle = fakeDrive({ folders: {} });
  await assert.rejects(run(idle, { apiKey: '' }), (e) => e.code === 'UNSUPPORTED_LINK');
  assert.equal(idle.calls.length, 0);
  // Nhiều link: lỗi của thư mục ghi rõ link thứ mấy.
  await assert.rejects(run(fakeDrive({ folders: {} }), { urls: [LINK, 'https://misa.vn/a'] }), (e) => /^Link 1 \(drive\.google\.com\): Không mở được thư mục/.test(e.message));
});
