// Đường dẫn thân thiện của 1 bài: /<tên-bài>/<mã 8 ký tự>/<tính năng> (vd. /gioi-thieu-amis-oneAI/1234abcd/edit).
// Tên bài chỉ để dễ đọc/chia sẻ — định vị bằng mã; đổi tên bài thì đường dẫn cũ vẫn mở đúng bài.
export const DECK_FEATURES = ['outline', 'edit', 'view'];

// Bỏ dấu tiếng Việt, giữ chữ hoa/thường (oneAI), ký tự khác → '-'.
export function slugify(title) {
  const s = String(title || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'bai-trinh-bay';
}

// d: { id, code, title }; bài cũ chưa có mã (dữ liệu chưa chạy changelog) → đường dẫn theo id.
export function deckPath(d, feature = 'edit') {
  if (!d) return '/decks';
  return d.code ? `/${slugify(d.title)}/${d.code}/${feature}` : `/p/${d.id}/${feature}`;
}
