// Escape theo ngữ cảnh HTML (nội dung thẻ và giá trị thuộc tính đặt trong dấu nháy kép).
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => MAP[c]);
}

export const escapeAttr = escapeHtml;

// Giải mã thực thể XML/HTML cơ bản (&lt; &gt; &quot; &apos; &amp; và &#123; &#x1F;) — chữ trong tài liệu Office, trang web.
export function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}
