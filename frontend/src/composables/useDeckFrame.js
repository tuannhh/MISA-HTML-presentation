// Điều khiển khung trình chiếu (iframe sandbox) qua postMessage: theo dõi trang + ý hiện tại, Trước/Sau theo từng ý,
// chuyển phím bút trình chiếu (PageDown/PageUp/F5/"."…) vào khung khi trang cha đang giữ focus — dùng chung desktop/mobile.
import { ref, computed, onBeforeUnmount } from 'vue';

const NEXT_KEYS = ['ArrowRight', 'PageDown', 'ArrowDown', ' '];
const PREV_KEYS = ['ArrowLeft', 'PageUp', 'ArrowUp'];

export function useDeckFrame(frameRef, initialCount = 0, { keys = false } = {}) {
  const index = ref(0);
  const count = ref(initialCount);
  const step = ref(0); // số ý đã hiện trên trang hiện tại
  const steps = ref(0); // tổng số bước của trang (0 = trang hiện toàn bộ)

  const send = (msg) => frameRef.value?.contentWindow?.postMessage(msg, '*');
  const onMessage = (e) => {
    if (e.source !== frameRef.value?.contentWindow) return;
    const d = e.data;
    if (d && d.type === 'deck:slide' && Number.isInteger(d.index)) {
      index.value = d.index;
      if (Number.isInteger(d.count)) count.value = d.count;
      step.value = Number.isInteger(d.step) ? d.step : 0;
      steps.value = Number.isInteger(d.steps) ? d.steps : 0;
    }
  };
  window.addEventListener('message', onMessage);

  // Phím chỉ tới trang cha khi focus nằm ngoài khung (vd. vừa bấm nút) — bỏ qua khi đang gõ trong ô nhập.
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === ' ' && t && /^(BUTTON|A)$/.test(t.tagName)) return;
    if (NEXT_KEYS.includes(e.key)) { e.preventDefault(); next(); }
    else if (PREV_KEYS.includes(e.key)) { e.preventDefault(); prev(); }
    else if (e.key === '.' || e.key === 'b' || e.key === 'B') send({ type: 'deck:cmd', cmd: 'black' });
    else if (e.key === 'Escape') send({ type: 'deck:cmd', cmd: 'esc' });
  };
  if (keys) window.addEventListener('keydown', onKey);
  onBeforeUnmount(() => {
    window.removeEventListener('message', onMessage);
    if (keys) window.removeEventListener('keydown', onKey);
  });

  function goto(i) {
    const target = Math.max(0, Math.min(Math.max(count.value - 1, 0), i));
    send({ type: 'deck:goto', index: target });
  }
  const go = (delta) => goto(index.value + delta);
  // Sau/Trước theo từng ý (khung tự sang trang khi hết ý).
  const next = () => send({ type: 'deck:step', dir: 1 });
  const prev = () => send({ type: 'deck:step', dir: -1 });
  const atStart = computed(() => index.value <= 0 && step.value <= 0);
  const atEnd = computed(() => index.value >= count.value - 1 && step.value >= steps.value);

  return { index, count, step, steps, goto, go, next, prev, atStart, atEnd };
}
