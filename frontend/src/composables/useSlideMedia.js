// Mở đúng hộp chọn media cho 1 ô ảnh/video (bấm trên khung xem trước, ở form nội dung hoặc bảng phần tử trang tự do)
// và ghi kết quả vào bản nháp. Dùng chung desktop (dialog) + mobile (màn toàn màn hình).
import { ref, computed } from 'vue';
import { mediaTarget, setMedia } from '@/lib/editPaths.js';
import { plainText } from '@shared/deck/rich.js';

export function useSlideMedia(draft, selected) {
  // { index, path, kind: 'image'|'video', aspect }
  const target = ref(null);
  const slideOf = (t) => (t ? draft.value?.spec?.slides?.[t.index] || null : null);
  const current = computed(() => (target.value ? mediaTarget(slideOf(target.value), target.value.path) : null));

  const imageOpen = computed({ get: () => target.value?.kind === 'image', set: (v) => !v && (target.value = null) });
  const videoOpen = computed({ get: () => target.value?.kind === 'video', set: (v) => !v && (target.value = null) });
  const image = computed(() => current.value?.image || null);
  const video = computed(() => current.value?.video || null);
  const aspect = computed(() => target.value?.aspect || 16 / 9);
  // Gợi ý mô tả/từ khoá cho ảnh AI và tìm ảnh: tiêu đề trang (hoặc chữ đầu tiên của trang tự do).
  const suggest = computed(() => {
    const s = slideOf(target.value);
    if (!s) return '';
    const firstText = (s.elements || []).find((e) => e.type === 'text' && e.text?.trim())?.text || '';
    // Ảnh/logo của 1 mục (thẻ) → gợi ý theo tiêu đề mục (vd. "OpenAI" → tìm logo OpenAI).
    const item = /^items\.(\d+)\.image$/.exec(target.value.path || '');
    const itemTitle = item ? s.items?.[Number(item[1])]?.title || '' : '';
    return plainText(itemTitle || (s.layout === 'free' ? firstText || s.title : s.title) || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  });
  const title = computed(() => {
    if (!target.value) return '';
    const n = target.value.index + 1;
    if (/^items\.\d+\.image$/.test(target.value.path || '')) return `Ảnh / logo thay biểu tượng — trang ${n}`;
    return target.value.kind === 'video' ? `Video — trang ${n}` : `Ảnh — trang ${n}`;
  });
  // Ô có thể đổi giữa ảnh ↔ video: ô media chính của trang (không áp dụng cho bộ sưu tập / phần tử ảnh).
  const canSwitch = computed(() => target.value?.path === 'slot');

  function open({ index = selected.value, path, kind = 'image', aspect: a } = {}) {
    if (!slideOf({ index }) || typeof path !== 'string') return;
    // Ô media chính đang chứa video → mở hộp video; ngược lại hộp ảnh.
    const t = mediaTarget(slideOf({ index }), path);
    if (!t) return;
    const k = t.kind === 'element-video' || (t.kind === 'slot' && t.video) ? 'video' : t.kind === 'element-image' ? 'image' : kind;
    target.value = { index, path, kind: k, aspect: Number.isFinite(a) && a > 0 ? a : 16 / 9 };
  }
  function switchTo(kind) {
    if (target.value) target.value = { ...target.value, kind };
  }
  function applyImage(img) {
    const t = target.value;
    if (t) setMedia(slideOf(t), t.path, { image: img });
  }
  function applyVideo(v) {
    const t = target.value;
    if (t) setMedia(slideOf(t), t.path, { video: v });
  }
  const close = () => (target.value = null);

  return { target, imageOpen, videoOpen, image, video, aspect, suggest, title, canSwitch, open, switchTo, applyImage, applyVideo, close };
}
