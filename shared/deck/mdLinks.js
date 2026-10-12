// Liên kết trong dàn ý (văn bản thuần — dùng chung server + giao diện duyệt dàn ý): cú pháp markdown "[nhãn](URL)" — người dùng đọc/sửa được ngay trong ô nội dung dàn ý.
// Bước dựng bài: nhãn giữ trong chữ, URL gắn lại thành liên kết của chữ có định dạng (shared/deck/rich.js — linkPhrase).
// URL luôn qua safeHref (chỉ http(s)/mailto/tel); URL không hợp lệ hoặc không được phép → bỏ liên kết, giữ nhãn.
import { safeHref } from './rich.js';

const MD_LINK = /\[([^[\]\n]{1,160})\]\(([^()\s]{1,500})\)/g;

/** "[MISA AMIS](https://amis.misa.vn)" → "MISA AMIS". */
export const stripLinks = (text) => String(text ?? '').replace(MD_LINK, '$1');

/** Các liên kết hợp lệ trong chuỗi → [{ label, url }]. */
export function linksIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(MD_LINK)) {
    const url = safeHref(m[2]);
    const label = m[1].trim();
    if (url && label) out.push({ label, url });
  }
  return out;
}

/** Chuẩn hoá liên kết trong chuỗi: URL dạng chuẩn; hỏng hoặc allow(url) = false → chỉ giữ nhãn. */
export function cleanLinks(text, allow = () => true) {
  return String(text ?? '').replace(MD_LINK, (_m, label, url) => {
    const h = safeHref(url);
    const l = label.trim();
    return h && l && allow(h) ? `[${l}](${h})` : label;
  });
}

export const hasLinks = (text) => String(text ?? '').includes('](');
