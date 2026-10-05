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
  { label: 'Midnight — nền tối, xanh đêm', value: 'midnight' },
  { label: 'Ocean — nền tối, xanh dương', value: 'ocean' },
  { label: 'Aurora — nền tối, tím sáng tạo', value: 'aurora' },
  { label: 'Paper — nền sáng, xanh dương – đen', value: 'paper' },
  { label: 'Ember — nền sáng, cam – đen', value: 'ember' },
];

// Tông nền khi tạo bài. `swatch` là màu MINH HOẠ của bài trình bày (lấy từ shared/deck/theme.css),
// không phải màu giao diện ứng dụng → được phép là mã màu cố định.
export const TONE_OPTIONS = [
  { value: 'dark', label: 'Tối', desc: 'Nền tối, chữ sáng', swatch: { bg: '#0A1530', ink: '#EEF3FF', accents: ['#2EE6D6', '#4D8DFF'] } },
  { value: 'light', label: 'Sáng', desc: 'Nền sáng, chữ đậm tương phản cao', swatch: { bg: '#F7F9FC', ink: '#0B1220', accents: ['#1D4ED8', '#B83A0B'] } },
];

export const STATUS_TAG = {
  generating: { color: 'info', label: 'Đang tạo' },
  ready: { color: 'success', label: 'Sẵn sàng' },
  failed: { color: 'danger', label: 'Lỗi' },
};

export const ratioCss = (r) => (r || '16:9').replace(':', ' / ');
