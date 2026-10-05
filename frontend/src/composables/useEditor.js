// Logic trình soạn thảo dùng chung desktop/mobile: tải bài, bản nháp, lưu (khoá phiên bản), thao tác slide,
// media (ảnh, video, YouTube, logo), thiết kế, chia sẻ, xuất.
import { ref, computed, onBeforeUnmount } from 'vue';
import { get, patch, del, post, download, ApiError } from '@/lib/api.js';
import { newSlide, duplicateSlide, ensureLayoutContent, prepareSpecForSave, clone, SPEC_LIMITS } from '@/lib/slideModel.js';
import { useMedia } from '@/composables/useMedia.js';
import { withDesignDefaults } from '@/lib/design.js';

// Bản nháp chưa lưu được giữ tạm khi trang bị gỡ (vd. đổi bề mặt desktop ↔ mobile khi xoay/thu nhỏ cửa sổ).
const pendingDrafts = new Map();

export function useEditor(id, { onOutline } = {}) {
  const deck = ref(null);
  const assets = ref([]);
  const media = useMedia(id, assets);
  const draft = ref(null);
  const baseline = ref('');
  const loading = ref(true);
  const saving = ref(false);
  const loadError = ref(null);
  const saveError = ref(null);
  const selected = ref(0);
  const previewKey = ref(Date.now());
  let pollTimer = null;

  const dirty = computed(() => !!draft.value && JSON.stringify({ t: draft.value.title, s: draft.value.spec }) !== baseline.value);
  const slide = computed(() => draft.value?.spec?.slides?.[selected.value] || null);
  const previewUrl = computed(() => (deck.value?.status === 'ready' ? `/api/presentations/${id}/preview?v=${previewKey.value}` : ''));

  // Video đã dùng trong bài + video tải lên chưa gắn trang nào (thư viện "Video trong bài").
  const videoLibrary = computed(() => {
    const out = new Map();
    for (const s of draft.value?.spec?.slides || []) if (s.video) out.set(s.video.provider === 'youtube' ? `yt:${s.video.id}` : `f:${s.video.asset}`, { ...s.video });
    for (const a of assets.value) if (a.kind === 'video' && !out.has(`f:${a.id}`)) out.set(`f:${a.id}`, { provider: 'file', asset: a.id, poster: null, title: (a.name || '').replace(/\.[a-z0-9]+$/i, ''), caption: '' });
    return [...out.values()];
  });

  function adopt(d) {
    deck.value = d;
    assets.value = d.assets || [];
    if (['outlining', 'outline'].includes(d.status) && d.isOwner) onOutline?.(d);
    if (d.status === 'ready' && d.spec) {
      draft.value = { title: d.title, spec: withDesignDefaults(clone(d.spec)) };
      baseline.value = JSON.stringify({ t: draft.value.title, s: draft.value.spec });
      if (selected.value >= d.spec.slides.length) selected.value = Math.max(0, d.spec.slides.length - 1);
    }
  }

  async function load() {
    loading.value = true;
    loadError.value = null;
    saveError.value = null;
    try {
      adopt((await get(`/api/presentations/${id}`)).data);
      const kept = pendingDrafts.get(id);
      pendingDrafts.delete(id);
      if (kept && kept.specVersion === deck.value.specVersion) {
        draft.value = kept.draft;
        selected.value = Math.min(kept.selected, kept.draft.spec.slides.length - 1);
      }
      schedulePoll();
    } catch (err) {
      loadError.value = err;
    } finally {
      loading.value = false;
    }
  }

  // Bài đang được AI tạo → hỏi lại trạng thái định kỳ.
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (deck.value?.status !== 'generating') return;
    pollTimer = setTimeout(async () => {
      try {
        adopt((await get(`/api/presentations/${id}`)).data);
        previewKey.value = Date.now();
      } catch {
        /* thử lại ở vòng sau */
      }
      schedulePoll();
    }, 2500);
  }

  async function save() {
    if (!draft.value || saving.value) return false;
    saving.value = true;
    saveError.value = null;
    try {
      const spec = prepareSpecForSave(draft.value.spec);
      spec.title = draft.value.title.trim() || spec.title;
      const body = { spec, specVersion: deck.value.specVersion };
      if (draft.value.title !== deck.value.title) body.title = draft.value.title.trim();
      adopt((await patch(`/api/presentations/${id}`, body)).data);
      previewKey.value = Date.now();
      return true;
    } catch (err) {
      saveError.value = err;
      return false;
    } finally {
      saving.value = false;
    }
  }

  function discard() {
    if (deck.value) adopt(deck.value);
  }

  // Đổi thuộc tính lưu ngay (tỷ lệ, chia sẻ) — không làm mất bản nháp nội dung đang sửa.
  async function updateMeta(fields) {
    const keep = dirty.value ? clone(draft.value) : null;
    adopt((await patch(`/api/presentations/${id}`, fields)).data);
    if (keep) draft.value = keep;
    if (fields.ratio) previewKey.value = Date.now();
  }

  /* ---- thao tác slide ---- */
  const slides = () => draft.value.spec.slides;
  function addSlide(layout = 'bullets') {
    if (slides().length >= SPEC_LIMITS.slides) throw new ApiError(0, 'LIMIT', `Tối đa ${SPEC_LIMITS.slides} trang`);
    slides().splice(selected.value + 1, 0, newSlide(layout));
    selected.value += 1;
  }
  function copySlide(i = selected.value) {
    if (slides().length >= SPEC_LIMITS.slides) throw new ApiError(0, 'LIMIT', `Tối đa ${SPEC_LIMITS.slides} trang`);
    slides().splice(i + 1, 0, duplicateSlide(slides()[i]));
    selected.value = i + 1;
  }
  function removeSlide(i = selected.value) {
    if (slides().length <= 1) throw new ApiError(0, 'LIMIT', 'Bài trình bày cần ít nhất 1 trang');
    slides().splice(i, 1);
    selected.value = Math.min(i, slides().length - 1);
  }
  function moveSlide(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= slides().length) return;
    const [s] = slides().splice(i, 1);
    slides().splice(j, 0, s);
    selected.value = j;
  }
  function changeLayout(layout) {
    if (!slide.value) return;
    slide.value.layout = layout;
    ensureLayoutContent(slide.value);
  }

  /* ---- media ---- */
  const uploadImage = (file) => media.uploadImage(file);
  const assetUrl = (assetId) => media.assetUrl(assetId);

  /* ---- khác ---- */
  const exportHtml = () => download(`/api/presentations/${id}/export.html`, `${deck.value.title}.html`);
  const exportPdf = () => download(`/api/presentations/${id}/export.pdf`, `${deck.value.title}.pdf`);
  const remove = () => del(`/api/presentations/${id}`);
  const duplicate = async () => (await post(`/api/presentations/${id}/duplicate`)).data;

  const onBeforeUnload = (e) => {
    if (dirty.value) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  onBeforeUnmount(() => {
    if (dirty.value) pendingDrafts.set(id, { specVersion: deck.value.specVersion, draft: clone(draft.value), selected: selected.value });
    clearTimeout(pollTimer);
    window.removeEventListener('beforeunload', onBeforeUnload);
  });

  return {
    deck, draft, slide, selected, loading, saving, loadError, saveError, dirty, previewUrl, previewKey, assets, media, videoLibrary,
    load, save, discard, updateMeta, addSlide, copySlide, removeSlide, moveSlide, changeLayout,
    uploadImage, assetUrl, exportHtml, exportPdf, remove, duplicate,
  };
}

// Đồng bộ slide đang chọn với khung xem trước (iframe sandbox) qua postMessage.
export function usePreviewSync(frameRef, selected) {
  function goto(index) {
    try {
      frameRef.value?.contentWindow?.postMessage({ type: 'deck:goto', index }, '*');
    } catch {
      /* khung chưa sẵn sàng */
    }
  }
  const onMessage = (e) => {
    if (e.source !== frameRef.value?.contentWindow) return;
    const d = e.data;
    if (d && d.type === 'deck:slide' && Number.isInteger(d.index)) selected.value = d.index;
  };
  window.addEventListener('message', onMessage);
  onBeforeUnmount(() => window.removeEventListener('message', onMessage));
  return { goto };
}
