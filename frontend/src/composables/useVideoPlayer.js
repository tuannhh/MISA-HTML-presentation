// Lớp phát video toàn màn hình dùng chung toàn ứng dụng.
// Khung trình chiếu (iframe sandbox, origin null) không phát được YouTube → khi người xem bấm video, deck gửi
// postMessage {type:'deck:video', …}; ứng dụng mở lớp phát + toàn màn hình (cử chỉ người dùng truyền từ iframe lên).
// Chỉ nhận tin từ iframe deck của chính ứng dụng (đánh dấu data-deck-frame) và chỉ phát nguồn đã kiểm tra.
import { reactive } from 'vue';

const YT_RE = /^[A-Za-z0-9_-]{11}$/;
// Video tải lên: chỉ URL tệp của ứng dụng (có/không chữ ký).
const SRC_RE = /^\/api\/assets\/[0-9a-f-]{36}(\?exp=\d+&sig=[A-Za-z0-9_-]+)?$/i;

export const player = reactive({ open: false, provider: '', id: '', src: '', title: '' });

export function playVideo(v) {
  if (!v) return false;
  if (v.provider === 'youtube' && YT_RE.test(v.id || '')) Object.assign(player, { provider: 'youtube', id: v.id, src: '', title: String(v.title || 'Video YouTube').slice(0, 200) });
  else if (v.provider === 'file' && SRC_RE.test(v.src || '')) Object.assign(player, { provider: 'file', id: '', src: v.src, title: String(v.title || 'Video').slice(0, 200) });
  else return false;
  player.open = true;
  return true;
}

export function closeVideo() {
  player.open = false;
  player.id = '';
  player.src = '';
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
