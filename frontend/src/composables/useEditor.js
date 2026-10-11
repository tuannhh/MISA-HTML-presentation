// Logic trình soạn thảo dùng chung desktop/mobile: tải bài, bản nháp, lưu (khoá phiên bản), thao tác slide,
// media (ảnh, video, YouTube, logo), thiết kế, chia sẻ, xuất.
import { ref, computed, onBeforeUnmount } from 'vue';
import { get, patch, del, post, download, ApiError } from '@/lib/api.js';
import { newSlide, duplicateSlide, ensureLayoutContent, prepareSpecForSave, clone, SPEC_LIMITS, BUILD_LAYOUTS } from '@/lib/slideModel.js';
import { useMedia } from '@/composables/useMedia.js';
import { withDesignDefaults } from '@/lib/design.js';
import { decorsFor } from '@shared/deck/layers.js';

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
  // Phiên bản máy chủ mà BẢN NHÁP xuất phát từ đó. Lưu luôn gửi phiên bản này (không phải phiên bản mới nhất của `deck`):
  // nếu người khác đã lưu trong lúc mình sửa thì máy chủ trả 409 thay vì bị ghi đè lặng lẽ.
  let draftVersion = null;

  const dirty = computed(() => !!draft.value && JSON.stringify({ t: draft.value.title, s: draft.value.spec }) !== baseline.value);
  const slide = computed(() => draft.value?.spec?.slides?.[selected.value] || null);
  // edit=1: khung xem trước sửa trực tiếp (chủ bài + người được mời sửa) — nội dung khung được dựng lại từ bản nháp (useLiveDeck).
  const previewUrl = computed(() => (deck.value?.status === 'ready' ? `/api/presentations/${id}/preview?edit=1&v=${previewKey.value}` : ''));

  // Video đã dùng trong bài + video tải lên chưa gắn trang nào (thư viện "Video trong bài").
  const videoLibrary = computed(() => {
    const out = new Map();
    for (const s of draft.value?.spec?.slides || []) if (s.video) out.set(s.video.provider === 'youtube' ? `yt:${s.video.id}` : `f:${s.video.asset}`, { ...s.video });
    for (const a of assets.value) if (a.kind === 'video' && !out.has(`f:${a.id}`)) out.set(`f:${a.id}`, { provider: 'file', asset: a.id, poster: null, title: (a.name || '').replace(/\.[a-z0-9]+$/i, ''), caption: '' });
    return [...out.values()];
  });

  const snapshot = () => JSON.stringify({ t: draft.value?.title, s: draft.value?.spec });

  function adopt(d) {
    deck.value = d;
    assets.value = d.assets || [];
    if (['outlining', 'outline'].includes(d.status) && d.isOwner) onOutline?.(d);
    if (d.status === 'ready' && d.spec) {
      draft.value = { title: d.title, spec: withDesignDefaults(clone(d.spec)) };
      draftVersion = d.specVersion;
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
        draftVersion = kept.specVersion;
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
      const body = { spec, specVersion: draftVersion ?? deck.value.specVersion };
      if (draft.value.title !== deck.value.title) body.title = draft.value.title.trim();
      const sent = snapshot();
      const res = (await patch(`/api/presentations/${id}`, body)).data;
      // Người dùng gõ thêm trong lúc chờ phản hồi → giữ bản nháp mới (nền = bản vừa lưu, nên vẫn "chưa lưu"), không để bản máy chủ đè mất.
      const typed = snapshot() !== sent ? clone(draft.value) : null;
      adopt(res);
      if (typed) draft.value = typed;
      // Khung xem trước đã hiển thị bản nháp (dựng trực tiếp) → không cần tải lại khung sau khi lưu.
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

  // Nhận bài mới từ máy chủ (vd. sau khi khôi phục phiên bản) — bỏ bản nháp, dựng lại khung xem trước.
  function applyDeck(d) {
    adopt(d);
    saveError.value = null;
    previewKey.value = Date.now();
  }

  // Đổi thuộc tính lưu ngay (tỷ lệ, chia sẻ) — không làm mất bản nháp nội dung đang sửa.
  async function updateMeta(fields) {
    const keep = dirty.value ? clone(draft.value) : null;
    const keepVersion = draftVersion;
    adopt((await patch(`/api/presentations/${id}`, fields)).data);
    if (keep) {
      // Bản nháp vẫn xuất phát từ phiên bản cũ: nếu người khác đã lưu trong lúc đó, lần lưu sau phải báo xung đột.
      draft.value = keep;
      draftVersion = keepVersion;
    }
    if (fields.ratio) previewKey.value = Date.now();
  }

  /* ---- thao tác slide ---- */
  const slides = () => draft.value.spec.slides;
  // template: mẫu bố cục cho trang tự do (trang trắng, tiêu đề + nội dung, ảnh trái – chữ phải…).
  function addSlide(layout = 'bullets', template = 'blank') {
    if (slides().length >= SPEC_LIMITS.slides) throw new ApiError(0, 'LIMIT', `Tối đa ${SPEC_LIMITS.slides} trang`);
    slides().splice(selected.value + 1, 0, newSlide(layout, template));
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
  // Trình chiếu: áp cùng cách trình chiếu cho mọi trang có "ý" (trang bìa/mục/trích dẫn/kết không có ý → bỏ qua).
  function setBuildAll(build) {
    let n = 0;
    for (const s of draft.value?.spec.slides || []) {
      if (!BUILD_LAYOUTS.includes(s.layout)) continue;
      if (build === 'auto') delete s.build;
      else s.build = build;
      n += 1;
    }
    return n;
  }

  function changeLayout(layout) {
    if (!slide.value) return;
    slide.value.layout = layout;
    // Vị trí chữ đã dời thuộc về bố cục cũ; hoạ tiết đã tắt chỉ giữ loại bố cục mới còn có.
    delete slide.value.moves;
    const keep = (slide.value.hide || []).filter((k) => decorsFor(layout).includes(k));
    if (keep.length) slide.value.hide = keep;
    else delete slide.value.hide;
    ensureLayoutContent(slide.value);
  }
  // "Áp cho mọi trang" ở mục Hoạ tiết: tắt đúng các hoạ tiết này trên mọi trang có chúng (hoạ tiết khác hiện lại).
  function setDecorAll(hide) {
    const want = new Set(Array.isArray(hide) ? hide : []);
    let n = 0;
    for (const s of draft.value?.spec.slides || []) {
      const keys = decorsFor(s.layout);
      const next = keys.filter((k) => want.has(k));
      if (next.length) s.hide = next;
      else delete s.hide;
      n += 1;
    }
    return n;
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
    if (dirty.value) pendingDrafts.set(id, { specVersion: draftVersion ?? deck.value.specVersion, draft: clone(draft.value), selected: selected.value });
    clearTimeout(pollTimer);
    window.removeEventListener('beforeunload', onBeforeUnload);
  });

  return {
    deck, draft, slide, selected, loading, saving, loadError, saveError, dirty, previewUrl, previewKey, assets, media, videoLibrary,
    load, save, discard, applyDeck, updateMeta, addSlide, copySlide, removeSlide, moveSlide, changeLayout, setBuildAll, setDecorAll,
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
