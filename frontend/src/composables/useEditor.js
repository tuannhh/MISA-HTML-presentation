// Logic trình soạn thảo dùng chung desktop/mobile: tải bài, bản nháp, lưu (khoá phiên bản), thao tác slide, ảnh, chia sẻ, xuất.
import { ref, computed, onBeforeUnmount } from 'vue';
import { get, patch, postForm, del, post, download, ApiError } from '@/lib/api.js';
import { newSlide, duplicateSlide, ensureLayoutContent, prepareSpecForSave, clone, SPEC_LIMITS } from '@/lib/slideModel.js';

// Bản nháp chưa lưu được giữ tạm khi trang bị gỡ (vd. đổi bề mặt desktop ↔ mobile khi xoay/thu nhỏ cửa sổ).
const pendingDrafts = new Map();

export function useEditor(id) {
  const deck = ref(null);
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

  function adopt(d) {
    deck.value = d;
    if (d.status === 'ready' && d.spec) {
      draft.value = { title: d.title, spec: clone(d.spec) };
      baseline.value = JSON.stringify({ t: draft.value.title, s: draft.value.spec });
      if (selected.value >= d.spec.slides.length) selected.value = Math.max(0, d.spec.slides.length - 1);
    }
  }

  async function load() {
    loading.value = true;
    loadError.value = null;
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

  /* ---- ảnh ---- */
  async function uploadImage(file) {
    const form = new FormData();
    form.set('file', file);
    const res = await postForm(`/api/presentations/${id}/assets`, form);
    deck.value.assets = [...(deck.value.assets || []), res.data];
    return res.data;
  }
  const assetUrl = (assetId) => deck.value?.assets?.find((a) => a.id === assetId)?.url || '';

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
    deck, draft, slide, selected, loading, saving, loadError, saveError, dirty, previewUrl, previewKey,
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
