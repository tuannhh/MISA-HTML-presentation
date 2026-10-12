// Đường dẫn thân thiện cho trang xuất bản công khai: "Giới thiệu AMIS tổng thể" → "gioi-thieu-amis-tong-the".
// Chỉ [a-z0-9-], tối đa 80 ký tự (cắt ở ranh giới từ), không rỗng. Slug chỉ để đọc — khoá thật là mã 8 ký tự phía sau.
export const SLUG_MAX = 80;
export const SLUG_FALLBACK = 'bai-trinh-bay';

export function publicSlug(title) {
  const base = String(title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return SLUG_FALLBACK;
  if (base.length <= SLUG_MAX) return base;
  const cut = base.slice(0, SLUG_MAX + 1);
  const at = cut.lastIndexOf('-');
  return (at > 20 ? cut.slice(0, at) : base.slice(0, SLUG_MAX)).replace(/-+$/, '');
}

// "/<slug>-<code>" → { slug, code } (code: đúng 8 ký tự [a-z0-9] cuối). Sai dạng → null.
export function parsePublicPath(p) {
  const m = /^\/([a-z0-9][a-z0-9-]{0,119})-([a-z0-9]{8})\/?$/.exec(String(p));
  return m ? { slug: m[1], code: m[2] } : null;
}
