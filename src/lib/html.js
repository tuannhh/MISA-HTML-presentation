// Escape theo ngữ cảnh HTML (nội dung thẻ và giá trị thuộc tính đặt trong dấu nháy kép).
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => MAP[c]);
}

export const escapeAttr = escapeHtml;
