// Link thư mục Google Drive (chia sẻ "Bất kỳ ai có đường liên kết") → danh sách tệp qua Drive API v3 (khoá GOOGLE_API_KEY) →
// tải từng tệp đọc được: Google Slides/Docs/Sheets xuất sang PPTX/DOCX/XLSX, tệp thường tải nguyên tệp. Việc ĐỌC nội dung
// (chữ, ảnh, trang) do ingestService làm như tệp tải lên — module này chỉ là phần gọi Drive.
// An toàn: chỉ gọi máy chủ cố định www.googleapis.com qua `fetch` được truyền vào (mặc định safeFetch — chống SSRF); ID thư mục /
// tệp chỉ gồm [A-Za-z0-9_-] (chặn chèn vào truy vấn `q`); khoá không bao giờ nằm trong thông báo lỗi.
// Hạn mức như tải tệp lên: ≤ maxUploadFiles tệp, tổng ≤ maxUploadMb, ảnh ≤ maxImageUploadMb; thư mục con sâu ≤ 2 cấp.
import { HttpError, badRequest, unprocessable } from '../lib/httpError.js';

const API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_LINK = /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|(?:embedded)?folderview\?)/;
const FOLDER_ID = /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/([\w-]{10,200})|(?:embedded)?folderview\?(?:[^#]*&)?id=([\w-]{10,200}))/;
const ID = /^[\w-]{10,200}$/;
const RESOURCE_KEY = /^[\w-]{1,200}$/;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
// Tệp gốc của Google → định dạng xuất (Drive chỉ xuất tệp ≤ 10 MB; lớn hơn → bỏ qua tệp đó).
const EXPORT = {
  'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Google Slides'],
  'application/vnd.google-apps.document': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Google Docs'],
  'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Google Sheets'],
};
// Loại tệp bộ đọc hỗ trợ (khớp SUPPORTED_HINT của ingestService) — lọc theo MIME/đuôi tệp TRƯỚC khi tải để không tải tệp vô ích.
const DOC_MIME = /^(?:application\/pdf|text\/(?:plain|markdown|x-markdown|csv|tab-separated-values)|application\/vnd\.openxmlformats-officedocument\.(?:presentationml\.presentation|wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.oasis\.opendocument\.(?:presentation|text))$/;
const DOC_EXT = /\.(?:pdf|pptx|docx|xlsx|odp|odt|txt|md|csv|tsv)$/i;
const IMAGE_MIME = /^image\/(?:png|jpeg|gif|webp|avif)$/;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif)$/i;
const AV_MIME = /^(?:audio\/.+|video\/(?:mp4|webm))$/;
const AV_EXT = /\.(?:mp3|m4a|wav|ogg|flac|aac|aiff?|mp4|webm)$/i;
const MAX_DEPTH = 2; // thư mục gốc + 2 cấp thư mục con
const MAX_FOLDERS = 30;
const MAX_LISTED = 1000;
const LIST_FIELDS = 'nextPageToken,files(id,name,mimeType,size,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey))';

const FORBIDDEN_MSG = 'Không mở được thư mục Google Drive. Hãy đặt chia sẻ thư mục "Bất kỳ ai có đường liên kết – Người xem" rồi thử lại.';
export const DRIVE_HINT = 'Thư mục cần có Google Slides/Docs/Sheets, PPTX, DOCX, XLSX, PDF, CSV, TXT/MD, ảnh hoặc ghi âm.';

export const isDriveFolderLink = (url) => FOLDER_LINK.test(String(url));

/** Mã thư mục + resourcekey (thư mục chia sẻ trước 2021 cần khoá này) từ link; null nếu không đọc được mã. */
export function driveFolderRef(url) {
  const m = FOLDER_ID.exec(String(url));
  if (!m) return null;
  const rk = new URL(url).searchParams.get('resourcekey');
  return { id: m[1] || m[2], resourceKey: rk && RESOURCE_KEY.test(rk) ? rk : null };
}

// Lỗi Drive API → thông báo cho người dùng. Khoá chưa bật Drive API / sai khoá / hết hạn mức: lỗi phía máy chủ (503, dừng cả thư
// mục); không có quyền / không tồn tại: thư mục chưa chia sẻ công khai.
function driveError(res) {
  let reason = '';
  try {
    const e = JSON.parse(res.body.toString('utf8')).error || {};
    reason = [e.status, ...(e.errors || []).map((x) => x.reason), ...(e.details || []).map((x) => x.reason)].join(' ');
  } catch {
    // thân lỗi không phải JSON → chỉ dựa vào mã HTTP
  }
  if (/SERVICE_DISABLED|accessNotConfigured|API_KEY_INVALID|keyInvalid|API_KEY_SERVICE_BLOCKED|API_KEY_\w+_BLOCKED|keyExpired/.test(reason)) {
    return new HttpError(503, 'DRIVE_UNAVAILABLE', 'Máy chủ chưa đọc được Google Drive (khoá Google chưa bật Google Drive API hoặc không hợp lệ). Hãy báo quản trị viên, hoặc dán link của từng tệp.');
  }
  if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED/.test(reason)) {
    return new HttpError(503, 'DRIVE_BUSY', 'Google Drive đang giới hạn lượt truy cập — thử lại sau ít phút.');
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) return unprocessable(FORBIDDEN_MSG, 'SOURCE_FORBIDDEN');
  return unprocessable(`Google Drive trả lỗi ${res.status}`, 'SOURCE_ERROR');
}
const fatal = (err) => err instanceof HttpError && (err.code === 'DRIVE_UNAVAILABLE' || err.code === 'DRIVE_BUSY');

// Nhóm ưu tiên khi thư mục nhiều tệp hơn hạn mức: tài liệu → ảnh → ghi âm/ghi hình (nặng, chỉ nghe tiếng). null = không đọc được.
function groupOf(it) {
  const mt = String(it.mimeType || '');
  if (EXPORT[mt]) return 0;
  if (mt.startsWith('application/vnd.google-apps.')) return null; // Biểu mẫu, Bản vẽ, Sites… không xuất được sang định dạng đọc được
  const name = String(it.name || '');
  // Tệp chữ: chỉ .txt/.md/.csv/.tsv hoặc không đuôi — Drive gắn text/plain cho cả tệp cấu hình, nhật ký (vd recording.conf của Zoom).
  const textOk = !mt.startsWith('text/') || DOC_EXT.test(name) || !/\.\w{1,8}$/.test(name);
  if ((DOC_MIME.test(mt) && textOk) || (!mt.startsWith('video/') && DOC_EXT.test(name))) return 0;
  if (IMAGE_MIME.test(mt) || IMAGE_EXT.test(name)) return 1;
  if (AV_MIME.test(mt) || AV_EXT.test(name)) return 2;
  return null;
}

/**
 * Liệt kê + tải tệp trong thư mục Drive công khai.
 * @returns {Promise<{ name: string, files: Array<{ name: string, buffer: Buffer, image: boolean }>, skipped: number }>}
 *   name = tên thư mục; files[].name = đường dẫn trong thư mục (tệp Google: kèm loại, vd "Kế hoạch (Google Slides)").
 */
export async function fetchDriveFolder(url, { apiKey, limits, fetch, deadlineMs = 480000 }) {
  const ref = driveFolderRef(url);
  if (!ref) throw badRequest('Link thư mục Google Drive không hợp lệ — hãy mở thư mục rồi sao chép lại link', 'INVALID_URL');
  if (!apiKey) throw badRequest('Máy chủ chưa bật đọc thư mục Google Drive (thiếu khoá Google) — hãy dán link của từng tệp trong thư mục', 'UNSUPPORTED_LINK');
  const deadline = Date.now() + deadlineMs;
  const call = async (path, params, id, key, opts = {}) => {
    const qs = new URLSearchParams({ ...params, supportsAllDrives: 'true', key: apiKey });
    const res = await fetch(`${API}${path}?${qs}`, {
      timeoutMs: opts.timeoutMs ?? 30000,
      maxBytes: opts.maxBytes ?? 4 * 1048576,
      maxRedirects: 3,
      headers: key ? { 'x-goog-drive-resource-keys': `${id}/${key}` } : {},
    });
    if (res.status >= 400) throw driveError(res);
    return res;
  };
  const json = (res) => {
    try {
      return JSON.parse(res.body.toString('utf8'));
    } catch {
      throw unprocessable('Google Drive trả dữ liệu không đọc được', 'SOURCE_ERROR');
    }
  };

  const root = json(await call(`/${ref.id}`, { fields: 'id,name,mimeType,size,resourceKey' }, ref.id, ref.resourceKey));
  const folderName = String(root.name || 'Thư mục Google Drive').normalize('NFC').slice(0, 120);
  const items = [];
  if (root.mimeType !== FOLDER_MIME) {
    items.push({ ...root, id: ref.id, resourceKey: ref.resourceKey || root.resourceKey, path: folderName }); // link "thư mục" trỏ tới 1 tệp
  } else {
    const queue = [{ id: ref.id, key: ref.resourceKey || root.resourceKey, depth: 0, prefix: '' }];
    let folders = 0;
    let listed = 0;
    while (queue.length && folders < MAX_FOLDERS && listed < MAX_LISTED) {
      const f = queue.shift();
      folders += 1;
      let token = '';
      try {
        do {
          const page = json(await call('', {
            q: `'${f.id}' in parents and trashed = false`,
            fields: LIST_FIELDS,
            pageSize: '200',
            orderBy: 'folder,name_natural',
            includeItemsFromAllDrives: 'true',
            ...(token ? { pageToken: token } : {}),
          }, f.id, f.key));
          for (const raw of Array.isArray(page.files) ? page.files : []) {
            listed += 1;
            // Lối tắt → tệp/thư mục đích.
            const sc = raw.mimeType === SHORTCUT_MIME ? raw.shortcutDetails : null;
            const it = sc ? { id: sc.targetId, name: raw.name, mimeType: sc.targetMimeType, resourceKey: sc.targetResourceKey } : raw;
            if (!ID.test(String(it.id || ''))) continue;
            const key = it.resourceKey && RESOURCE_KEY.test(it.resourceKey) ? it.resourceKey : null;
            const path = `${f.prefix}${String(it.name || 'tệp').normalize('NFC').slice(0, 160)}`;
            if (it.mimeType === FOLDER_MIME) {
              if (f.depth < MAX_DEPTH) queue.push({ id: it.id, key, depth: f.depth + 1, prefix: `${path}/` });
            } else items.push({ ...it, resourceKey: key, path });
          }
          token = typeof page.nextPageToken === 'string' ? page.nextPageToken : '';
        } while (token && listed < MAX_LISTED);
      } catch (err) {
        // Thư mục gốc lỗi → báo lỗi; thư mục con không mở được (chia sẻ riêng) → bỏ qua thư mục con đó.
        if (!f.depth || fatal(err) || !(err instanceof HttpError)) throw err;
      }
    }
  }

  const wanted = items.map((it) => ({ ...it, group: groupOf(it) })).filter((it) => it.group !== null);
  if (!wanted.length) {
    throw unprocessable(items.length ? `Thư mục Google Drive không có tệp đọc được. ${DRIVE_HINT}` : 'Thư mục Google Drive trống (hoặc các tệp bên trong chưa được chia sẻ công khai).', 'SOURCE_EMPTY');
  }
  wanted.sort((a, b) => a.group - b.group); // sort ổn định: giữ thứ tự Drive (thư mục, tên) trong từng nhóm
  let budget = limits.maxUploadMb * 1048576;
  const imageMax = (limits.maxImageUploadMb ?? 15) * 1048576;
  const files = [];
  let forbidden = 0;
  for (const it of wanted) {
    if (files.length >= limits.maxUploadFiles) break;
    const left = deadline - Date.now();
    if (left < 5000 || budget <= 0) break;
    const cap = it.group === 1 ? Math.min(imageMax, budget) : budget;
    if (Number(it.size) > cap) continue; // Drive báo trước dung lượng (tệp thường) → không tải tệp quá cỡ
    const ex = EXPORT[it.mimeType];
    try {
      const res = await call(ex ? `/${it.id}/export` : `/${it.id}`, ex ? { mimeType: ex[0] } : { alt: 'media' }, it.id, it.resourceKey, { timeoutMs: Math.min(300000, left), maxBytes: cap });
      if (!res.body?.length) continue;
      budget -= res.body.length;
      files.push({ name: ex ? `${it.path} (${ex[1]})` : it.path, buffer: res.body, image: it.group === 1 });
    } catch (err) {
      // Khoá/hạn mức → dừng (mọi tệp sau cũng lỗi). Lỗi riêng 1 tệp (chia sẻ riêng, xuất quá 10 MB, quá cỡ, mạng) → bỏ qua tệp đó.
      if (fatal(err)) throw err;
      if (err instanceof HttpError && err.code === 'SOURCE_FORBIDDEN') forbidden += 1;
    }
  }
  if (!files.length) {
    if (forbidden) throw unprocessable('Các tệp trong thư mục Google Drive chưa được chia sẻ công khai. Hãy đặt "Bất kỳ ai có đường liên kết – Người xem" cho thư mục (và các tệp) rồi thử lại.', 'SOURCE_FORBIDDEN');
    throw unprocessable(`Không tải được tệp nào trong thư mục Google Drive (tệp quá lớn hoặc lỗi mạng). ${DRIVE_HINT}`, 'SOURCE_EMPTY');
  }
  return { name: folderName, files, skipped: items.length - files.length };
}
