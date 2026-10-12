// Thông tin liên hệ của trang "Liên hệ" và "Ưu đãi" (slide.contact) — dùng chung renderer, specService, dàn ý và trình soạn thảo.
//   phones   : [{ number, label, channels: ['call','zalo','viber','telegram','imessage'] }] — mỗi số chọn các kênh nhắn/gọi
//   emails   : ['sales@misa.com.vn']          addresses: ['Tầng 9, …, Hà Nội']          website: 'https://amis.misa.vn/'
//   cta      : lời kêu gọi ("Liên hệ để được tư vấn miễn phí")
//   qr       : { asset (ảnh QR tải lên) | link (hệ thống tự tạo mã QR), caption }
// Liên kết bấm được (mở tab mới) dựng từ dữ liệu đã kiểm: tel:, mailto:, zalo.me, viber://, t.me, sms:, Google Maps.
import { safeHref } from './rich.js';

export const PHONE_CHANNELS = Object.freeze(['call', 'zalo', 'viber', 'telegram', 'imessage']);
export const CHANNEL_LABELS = Object.freeze({ call: 'Gọi điện', zalo: 'Zalo', viber: 'Viber', telegram: 'Telegram', imessage: 'iMessage' });
export const CONTACT_LIMITS = Object.freeze({
  phones: 3,
  phone: 24,
  phoneLabel: 40,
  emails: 2,
  email: 120,
  addresses: 2,
  address: 200,
  website: 300,
  cta: 120,
  qrLink: 500,
  qrCaption: 120,
});
// Lời kêu gọi gợi ý (trình soạn thảo + mẫu trang mới).
export const CTA_SUGGESTIONS = Object.freeze([
  'Liên hệ để được tư vấn miễn phí',
  'Liên hệ để được tư vấn ngay',
  'Đăng ký dùng thử miễn phí',
  'Nhận báo giá ngay hôm nay',
  'Quét mã QR để đăng ký',
]);

const PHONE_RE = /^\+?[\d\s.()-]{6,24}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;

/** Chữ số của số điện thoại (giữ dấu + đầu) — '+84 912 345 678' → '+84912345678'. */
export const phoneDigits = (s) => String(s ?? '').trim().replace(/(?!^\+)[^\d]/g, '');
export function validPhone(s) {
  const v = String(s ?? '').trim();
  const d = phoneDigits(v).replace('+', '');
  return PHONE_RE.test(v) && d.length >= 6 && d.length <= 15;
}
export const validEmail = (s) => EMAIL_RE.test(String(s ?? '').trim());

// Số Việt Nam viết kiểu nội địa (0xxx) → quốc tế (+84xxx) cho Viber/Telegram/iMessage (bắt buộc mã quốc gia).
const intl = (d) => (d.startsWith('+') ? d : d.startsWith('84') && d.length >= 11 ? `+${d}` : d.startsWith('0') ? `+84${d.slice(1)}` : `+${d}`);
// Zalo dùng số nội địa (zalo.me/0912345678).
const local = (d) => (d.startsWith('+84') ? `0${d.slice(3)}` : d.startsWith('+') ? d.slice(1) : d);

/** Liên kết của 1 kênh cho số điện thoại hợp lệ | null. Chỉ ghép từ chữ số đã kiểm. */
export function channelHref(channel, number) {
  if (!validPhone(number)) return null;
  const d = phoneDigits(number);
  switch (channel) {
    case 'call':
      return `tel:${d}`;
    case 'zalo':
      return `https://zalo.me/${local(d)}`;
    case 'viber':
      return `viber://chat?number=${encodeURIComponent(intl(d))}`;
    case 'telegram':
      return `https://t.me/${intl(d)}`;
    case 'imessage':
      return `sms:${intl(d)}`;
    default:
      return null;
  }
}
export const emailHref = (e) => (validEmail(e) ? `mailto:${String(e).trim()}` : null);
export const mapsHref = (a) => {
  const v = String(a ?? '').trim();
  return v ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}` : null;
};
/** Website người dùng gõ tắt ("amis.misa.vn") → https://… đã kiểm | null. Chỉ http(s). */
export function webHref(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const h = safeHref(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  return h && /^https?:/.test(h) ? h : null;
}
/** Hiển thị website gọn: bỏ https://, www. và dấu / cuối. */
export const webLabel = (h) => String(h ?? '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

/** Có ít nhất 1 thông tin liên hệ / QR để hiển thị. */
export function hasContact(ct) {
  if (!ct) return false;
  return !!((ct.phones || []).length || (ct.emails || []).length || (ct.addresses || []).length || ct.website || ct.qr?.asset || ct.qr?.link);
}

/** Khung rỗng cho trang mới (trình soạn thảo). */
export const emptyContact = (cta = '') => ({ phones: [{ number: '', label: '', channels: ['call', 'zalo'] }], emails: [''], addresses: [''], website: '', cta, qr: { asset: null, link: '', caption: '' } });
