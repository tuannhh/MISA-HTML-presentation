// Lớp phát video toàn màn hình dùng chung toàn ứng dụng.
// Khung trình chiếu (iframe sandbox, origin null) không phát được YouTube/Vimeo → khi người xem bấm video (hoặc video tự phát khi tới
// trang), deck gửi postMessage {type:'deck:video', …}; ứng dụng mở lớp phát + toàn màn hình (cử chỉ người dùng truyền từ iframe lên).
// Chỉ nhận tin từ iframe deck của chính ứng dụng (đánh dấu data-deck-frame) và chỉ phát nguồn đã kiểm tra.
import { reactive } from 'vue';

const YT_RE = /^[A-Za-z0-9_-]{11}$/;
const VM_RE = /^\d{5,12}$/;
const VH_RE = /^[0-9a-f]{6,24}$/i;
// Video tải lên: chỉ URL tệp của ứng dụng (có/không chữ ký).
const SRC_RE = /^\/api\/assets\/[0-9a-f-]{36}(\?exp=\d+&sig=[A-Za-z0-9_-]+)?$/i;

// fs: phóng toàn màn hình (mặc định có) · muted: phát không tiếng · auto: do tự phát (không phải người xem bấm).
export const player = reactive({ open: false, provider: '', id: '', hash: '', src: '', title: '', fs: true, muted: false, auto: false });

export function playVideo(v) {
  if (!v) return false;
  const opts = { fs: v.fs !== false, muted: v.muted === true, auto: v.auto === true };
  if (v.provider === 'youtube' && YT_RE.test(v.id || '')) Object.assign(player, { provider: 'youtube', id: v.id, hash: '', src: '', title: String(v.title || 'Video YouTube').slice(0, 200), ...opts });
  else if (v.provider === 'vimeo' && VM_RE.test(v.id || '')) {
    Object.assign(player, { provider: 'vimeo', id: v.id, hash: VH_RE.test(v.hash || '') ? v.hash : '', src: '', title: String(v.title || 'Video Vimeo').slice(0, 200), ...opts });
  } else if (v.provider === 'file' && SRC_RE.test(v.src || '')) Object.assign(player, { provider: 'file', id: '', hash: '', src: v.src, title: String(v.title || 'Video').slice(0, 200), ...opts });
  else return false;
  player.open = true;
  return true;
}

export function closeVideo() {
  player.open = false;
  player.id = '';
  player.hash = '';
  player.src = '';
}

/** Địa chỉ trình phát nhúng (autoplay) + trang gốc để mở khi nhúng bị chặn. */
export function embedUrls(p) {
  if (p.provider === 'youtube') {
    return {
      embed: `https://www.youtube-nocookie.com/embed/${p.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1${p.muted ? '&mute=1' : ''}`,
      page: `https://www.youtube.com/watch?v=${p.id}`,
      label: 'YouTube',
    };
  }
  if (p.provider === 'vimeo') {
    return {
      embed: `https://player.vimeo.com/video/${p.id}?autoplay=1&dnt=1&playsinline=1${p.hash ? `&h=${p.hash}` : ''}${p.muted ? '&muted=1' : ''}`,
      page: `https://vimeo.com/${p.id}${p.hash ? `/${p.hash}` : ''}`,
      label: 'Vimeo',
    };
  }
  return null;
}

let listening = false;
export function listenDeckVideos() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'deck:video') return;
    const fromDeck = [...document.querySelectorAll('iframe[data-deck-frame]')].some((f) => f.contentWindow === e.source);
    if (fromDeck) playVideo(d);
  });
}
