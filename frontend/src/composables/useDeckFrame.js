// Điều khiển khung trình chiếu (iframe sandbox) qua postMessage: theo dõi trang hiện tại, Trước/Sau — dùng chung desktop/mobile.
import { ref, onBeforeUnmount } from 'vue';

export function useDeckFrame(frameRef, initialCount = 0) {
  const index = ref(0);
  const count = ref(initialCount);

  const onMessage = (e) => {
    if (e.source !== frameRef.value?.contentWindow) return;
    const d = e.data;
    if (d && d.type === 'deck:slide' && Number.isInteger(d.index)) {
      index.value = d.index;
      if (Number.isInteger(d.count)) count.value = d.count;
    }
  };
  window.addEventListener('message', onMessage);
  onBeforeUnmount(() => window.removeEventListener('message', onMessage));

  function goto(i) {
    const target = Math.max(0, Math.min(Math.max(count.value - 1, 0), i));
    frameRef.value?.contentWindow?.postMessage({ type: 'deck:goto', index: target }, '*');
  }
  const go = (delta) => goto(index.value + delta);

  return { index, count, goto, go };
}
