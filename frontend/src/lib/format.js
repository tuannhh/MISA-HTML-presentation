// Định dạng hiển thị theo chuẩn Việt Nam.
const dt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : dt.format(d);
}

export function relativeTime(v) {
  if (!v) return '';
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ngày trước`;
  return formatDateTime(v).split(' ')[0];
}

export const RATIO_OPTIONS = [
  { label: '16:9 — Màn hình rộng', value: '16:9' },
  { label: '4:3 — Truyền thống', value: '4:3' },
  { label: '2:1 — Toàn cảnh', value: '2:1' },
  { label: '3:1 — Màn LED / sân khấu', value: '3:1' },
];

export const THEME_OPTIONS = [
  { label: 'Midnight — tối, sang trọng', value: 'midnight' },
  { label: 'Ocean — xanh doanh nghiệp', value: 'ocean' },
  { label: 'Aurora — tím sáng tạo', value: 'aurora' },
  { label: 'Paper — nền sáng', value: 'paper' },
];

export const STATUS_TAG = {
  generating: { color: 'info', label: 'Đang tạo' },
  ready: { color: 'success', label: 'Sẵn sàng' },
  failed: { color: 'danger', label: 'Lỗi' },
};

export const ratioCss = (r) => (r || '16:9').replace(':', ' / ');
