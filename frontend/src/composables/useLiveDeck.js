// Khung xem trước "sống" của trình soạn thảo (desktop + mobile): khung tải trang ở chế độ edit (?edit=1), sau đó ứng dụng
// dựng lại slide từ BẢN NHÁP bằng renderer dùng chung (shared/deck/render.js) và gửi vào khung — thấy ngay thay đổi, chưa cần lưu.
// Chiều ngược lại: sửa chữ trực tiếp, bấm ảnh/video để đổi, chọn/kéo/đổi cỡ phần tử trang tự do → cập nhật bản nháp.
// Mọi tin nhắn chỉ nhận từ đúng khung (e.source) và đều được kiểm tra (đường dẫn trường theo danh sách cho phép, số hữu hạn).
import { ref, watch, onBeforeUnmount } from 'vue';
import { deckParts } from '@shared/deck/render.js';
import { fontFaceCss } from '@shared/deck/fonts.js';
import { applyFrameEdit } from '@/lib/editPaths.js';
import { prepareSpecForSave, clone, SPEC_LIMITS } from '@/lib/slideModel.js';
import { newElementId } from '@shared/deck/free.js';

const FONT_BASE = '/deck-assets/fonts/';
const fin = (v, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : null);

/**
 * @param {Ref<HTMLIFrameElement>} frameRef
 * @param {{ draft: Ref, deck: Ref, selected: Ref<number>, assets: Ref<Array>, onMedia?: Function, onSave?: Function }} o
 */
export function useLiveDeck(frameRef, { draft, deck, selected, assets, onMedia, onSave }) {
  const ready = ref(false);
  // Phần tử trang tự do đang chọn trên khung: { index, id } | null
  const selectedEl = ref(null);
  let timer = null;
  let lastSent = '';

  const post = (msg) => {
    try {
      frameRef.value?.contentWindow?.postMessage(msg, '*');
    } catch {
      /* khung chưa sẵn sàng */
    }
  };

  function renderNow() {
    clearTimeout(timer);
    if (!ready.value || !draft.value || !deck.value) return;
    const byId = new Map((assets.value || []).map((a) => [a.id, a]));
    // Chuẩn hoá nhẹ như khi lưu (số liệu "62" → 62…) để hình hiển thị khớp bản sẽ lưu.
    const spec = prepareSpecForSave(draft.value.spec);
    spec.title = draft.value.title || spec.title;
    const parts = deckParts(spec, {
      ratio: deck.value.ratio,
      mode: 'edit',
      assetUrl: (id) => byId.get(id)?.url || null,
      assetMeta: (id) => {
        const a = byId.get(id);
        return a && a.width && a.height ? { width: a.width, height: a.height } : null;
      },
    });
    const css = `${fontFaceCss(parts.fontIds, (f) => `${location.origin}${FONT_BASE}${f}`)}\n${parts.rootCss}\n${parts.themeCss}`;
    const key = JSON.stringify([parts.slides, css, parts.attrs]);
    if (key === lastSent) return;
    lastSent = key;
    post({ type: 'deck:render', slides: parts.slides, css, attrs: parts.attrs, index: selected.value });
  }
  const schedule = (ms = 160) => {
    clearTimeout(timer);
    timer = setTimeout(renderNow, ms);
  };

  watch(() => draft.value, () => schedule(), { deep: true });
  watch(() => assets.value, () => schedule(), { deep: false });
  watch(selected, (i) => {
    selectedEl.value = null;
    post({ type: 'deck:goto', index: i });
  });

  const slideAt = (i) => draft.value?.spec?.slides?.[i] || null;
  const elementAt = (i, id) => (slideAt(i)?.elements || []).find((e) => e.id === id) || null;

  function onMessage(e) {
    if (!frameRef.value || e.source !== frameRef.value.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    const idx = Number.isInteger(d.index) ? d.index : -1;
    switch (d.type) {
      case 'deck:ready':
        ready.value = true;
        lastSent = '';
        renderNow();
        post({ type: 'deck:goto', index: selected.value });
        break;
      case 'deck:slide':
        if (idx >= 0 && idx !== selected.value) selected.value = idx;
        break;
      case 'deck:edit':
        if (draft.value && typeof d.value === 'string') applyFrameEdit(draft.value.spec, idx, d.path, d.value);
        break;
      case 'deck:media':
        if (slideAt(idx) && typeof d.path === 'string') {
          const w = Number(d.w);
          const h = Number(d.h);
          onMedia?.({ index: idx, path: d.path, kind: d.kind === 'video' ? 'video' : 'image', aspect: w > 0 && h > 0 ? w / h : 16 / 9 });
        }
        break;
      case 'deck:select':
        selectedEl.value = typeof d.id === 'string' && elementAt(idx, d.id) ? { index: idx, id: d.id } : null;
        break;
      case 'deck:geom': {
        const el = elementAt(idx, d.id);
        const x = fin(d.x, -50, 100);
        const y = fin(d.y, -50, 100);
        const w = fin(d.w, 2, 150);
        const h = fin(d.h, 2, 150);
        if (el && x !== null && y !== null && w !== null && h !== null) Object.assign(el, { x, y, w, h });
        break;
      }
      case 'deck:save':
        onSave?.();
        break;
      case 'deck:el':
        if (d.action === 'remove') removeElement(idx, d.id);
        else if (d.action === 'duplicate') duplicateElement(idx, d.id);
        break;
      default:
    }
  }
  window.addEventListener('message', onMessage);
  onBeforeUnmount(() => {
    clearTimeout(timer);
    window.removeEventListener('message', onMessage);
  });

  /* ---- thao tác phần tử (trang tự do + lớp chèn đè trên trang có bố cục; dùng chung thanh công cụ + phím tắt trên khung) ---- */
  function addElement(el) {
    const s = slideAt(selected.value);
    if (!s) return null;
    s.elements = s.elements || [];
    if (s.elements.length >= SPEC_LIMITS.elements) throw new Error(`Mỗi trang tối đa ${SPEC_LIMITS.elements} phần tử`);
    s.elements.push(el);
    selectedEl.value = { index: selected.value, id: el.id };
    // Chọn phần tử mới trên khung sau khi khung dựng lại.
    setTimeout(() => post({ type: 'deck:select', id: el.id, edit: el.type === 'text' }), 260);
    return el;
  }
  function removeElement(i, id) {
    const s = slideAt(i);
    if (!s?.elements) return;
    const k = s.elements.findIndex((e) => e.id === id);
    if (k >= 0) s.elements.splice(k, 1);
    if (selectedEl.value?.id === id) selectedEl.value = null;
  }
  function duplicateElement(i, id) {
    const s = slideAt(i);
    const src = elementAt(i, id);
    if (!s || !src || s.elements.length >= SPEC_LIMITS.elements) return;
    const copy = { ...clone(src), id: newElementId(), x: Math.min(95, src.x + 2), y: Math.min(95, src.y + 2) };
    s.elements.splice(s.elements.indexOf(src) + 1, 0, copy);
    selectedEl.value = { index: i, id: copy.id };
    setTimeout(() => post({ type: 'deck:select', id: copy.id }), 260);
  }
  // Đổi thứ tự lớp: lên trên cùng / xuống dưới cùng.
  function reorderElement(i, id, to) {
    const s = slideAt(i);
    const k = (s?.elements || []).findIndex((e) => e.id === id);
    if (k < 0) return;
    const [el] = s.elements.splice(k, 1);
    if (to === 'front') s.elements.push(el);
    else s.elements.unshift(el);
  }
  const selectElement = (id, edit = false) => {
    selectedEl.value = id ? { index: selected.value, id } : null;
    post({ type: 'deck:select', id, edit });
  };

  return { ready, selectedEl, renderNow, schedule, addElement, removeElement, duplicateElement, reorderElement, selectElement, elementAt };
}
