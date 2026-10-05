// Bước duyệt dàn ý (dùng chung desktop/mobile): theo dõi AI lập dàn ý, sửa nội dung từng trang, gắn media,
// chọn thiết kế, lưu (khoá phiên bản outlineVersion) và "Dựng bài" → theo dõi tới khi bài sẵn sàng.
import { ref, computed, onBeforeUnmount } from 'vue';
import { get, put, post, del, ApiError } from '@/lib/api.js';
import { clone, SPEC_LIMITS } from '@/lib/slideModel.js';
import { useMedia } from '@/composables/useMedia.js';
import { withDesignDefaults } from '@/lib/design.js';

const pendingDrafts = new Map();
let seq = 0;
const newId = () => `s-${Date.now().toString(36)}${(seq++).toString(36)}`;

export const OUTLINE_LAYOUTS = [
  { value: 'auto', label: 'AI tự chọn' },
  { value: 'cover', label: 'Trang bìa' },
  { value: 'section', label: 'Mở đầu phần' },
  { value: 'agenda', label: 'Mục lục' },
  { value: 'bullets', label: 'Ý chính' },
  { value: 'cards', label: 'Thẻ nội dung' },
  { value: 'stats', label: 'Con số nổi bật' },
  { value: 'image', label: 'Ảnh / video lớn' },
  { value: 'gallery', label: 'Bộ sưu tập ảnh' },
  { value: 'timeline', label: 'Dòng thời gian' },
  { value: 'process', label: 'Quy trình' },
  { value: 'quote', label: 'Trích dẫn' },
  { value: 'comparison', label: 'So sánh' },
  { value: 'closing', label: 'Trang kết' },
];
export const OUTLINE_LAYOUT_LABEL = Object.fromEntries(OUTLINE_LAYOUTS.map((l) => [l.value, l.label]));

// Gợi ý cách viết từng dòng theo bố cục (khớp hướng dẫn AI ở bước dựng bài).
export const POINT_HINT = {
  stats: 'Mỗi dòng: “con số + đơn vị — diễn giải”, ví dụ “1.250 tỷ đồng — Doanh thu 2025”',
  timeline: 'Mỗi dòng: “Mốc thời gian: nội dung”, ví dụ “Q3/2026: Triển khai giai đoạn 1”',
  process: 'Mỗi dòng là 1 bước: “Tên bước: mô tả ngắn”',
  comparison: 'Mỗi dòng: “Tên cột: ý”, ví dụ “Trước: Báo cáo thủ công” · “Sau: Tự động hoá”',
  quote: 'Dòng 1: câu trích dẫn · Dòng 2: “Người nói: chức danh”',
  agenda: 'Mỗi dòng: “Tên phần: mô tả ngắn”',
  cards: 'Mỗi dòng: “Tiêu đề thẻ: diễn giải”',
  bullets: 'Mỗi dòng: “Ý chính: diễn giải”',
};

export const emptyOutlineSlide = (layout = 'auto') => ({ id: newId(), layout, title: '', subtitle: '', points: [''], notes: '', images: [], video: null });

export function useOutline(id, { onReady } = {}) {
  const deck = ref(null);
  const draft = ref(null);
  const baseline = ref('');
  const assets = ref([]);
  const loading = ref(true);
  const saving = ref(false);
  const building = ref(false);
  const loadError = ref(null);
  const saveError = ref(null);
  let pollTimer = null;
  let stopped = false;

  const media = useMedia(id, assets);
  const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== baseline.value);
  const slides = computed(() => draft.value?.slides || []);

  // Video đã dùng trong dàn ý + video tải lên chưa gắn trang nào (thư viện "Video trong bài").
  const videoLibrary = computed(() => {
    const out = new Map();
    for (const s of slides.value) if (s.video) out.set(s.video.provider === 'youtube' ? `yt:${s.video.id}` : `f:${s.video.asset}`, { ...s.video });
    for (const a of assets.value) if (a.kind === 'video' && !out.has(`f:${a.id}`)) out.set(`f:${a.id}`, { provider: 'file', asset: a.id, poster: null, title: (a.name || '').replace(/\.[a-z0-9]+$/i, ''), caption: '' });
    return [...out.values()];
  });

  function adopt(d) {
    deck.value = d;
    assets.value = d.assets || [];
    if (d.status === 'outline' && d.outline) {
      const o = clone(d.outline);
      o.design = withDesignDefaults(o.design || {});
      for (const s of o.slides) if (!s.points.length) s.points = [''];
      draft.value = o;
      baseline.value = JSON.stringify(o);
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    const st = deck.value?.status;
    if (stopped || !['outlining', 'generating'].includes(st)) return;
    pollTimer = setTimeout(async () => {
      try {
        const d = (await get(`/api/presentations/${id}`)).data;
        const keep = dirty.value ? clone(draft.value) : null;
        adopt(d);
        if (keep && d.status === 'outline') draft.value = keep;
        if (d.status === 'ready') {
          building.value = false;
          onReady?.(d);
          return;
        }
        if (d.status !== 'generating') building.value = false;
      } catch {
        /* thử lại ở vòng sau */
      }
      schedulePoll();
    }, 3000);
  }

  async function load() {
    loading.value = true;
    loadError.value = null;
    saveError.value = null;
    try {
      adopt((await get(`/api/presentations/${id}`)).data);
      const kept = pendingDrafts.get(id);
      pendingDrafts.delete(id);
      if (kept && kept.outlineVersion === deck.value.outlineVersion && deck.value.status === 'outline') draft.value = kept.draft;
      if (deck.value.status === 'ready') onReady?.(deck.value);
      schedulePoll();
    } catch (err) {
      loadError.value = err;
    } finally {
      loading.value = false;
    }
  }

  // Bỏ dòng trống, cắt khoảng trắng — server kiểm tra chặt (strict) phần còn lại.
  function prepare() {
    const o = clone(draft.value);
    o.title = String(o.title || '').trim();
    o.footer = String(o.footer || '').trim();
    for (const s of o.slides) {
      s.title = String(s.title || '').trim();
      s.subtitle = String(s.subtitle || '').trim();
      s.notes = String(s.notes || '').trim();
      s.points = (s.points || []).map((p) => String(p || '').trim()).filter(Boolean);
      s.images = (s.images || []).filter((im) => im.asset);
      if (s.video) s.images = [];
    }
    if (o.design?.palette && o.design.theme !== 'custom') o.design.palette = null;
    return o;
  }

  function validate() {
    const t = draft.value;
    if (!String(t.title || '').trim()) return 'Nhập tên bài trình bày';
    if (!t.slides.length) return 'Dàn ý cần ít nhất 1 trang';
    const empty = t.slides.findIndex((s) => !String(s.title || '').trim() && !(s.points || []).some((p) => String(p).trim()) && !s.images.length && !s.video);
    if (empty >= 0) return `Trang ${empty + 1} đang trống — nhập tiêu đề hoặc nội dung, hoặc xoá trang`;
    if (t.design.theme === 'custom' && !/^#[0-9a-f]{6}$/i.test(t.design.palette?.primary || '')) return 'Màu chính tuỳ chỉnh phải có dạng #RRGGBB';
    return '';
  }

  async function save() {
    if (!draft.value || saving.value) return false;
    saveError.value = null;
    const msg = validate();
    if (msg) {
      saveError.value = new ApiError(0, 'INVALID_OUTLINE', msg);
      return false;
    }
    saving.value = true;
    try {
      adopt((await put(`/api/presentations/${id}/outline`, { outline: prepare(), outlineVersion: deck.value.outlineVersion })).data);
      return true;
    } catch (err) {
      saveError.value = err;
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function build() {
    if (!draft.value || building.value) return false;
    saveError.value = null;
    const msg = validate();
    if (msg) {
      saveError.value = new ApiError(0, 'INVALID_OUTLINE', msg);
      return false;
    }
    building.value = true;
    try {
      const body = { outlineVersion: deck.value.outlineVersion };
      if (dirty.value) body.outline = prepare();
      await post(`/api/presentations/${id}/build`, body);
      baseline.value = JSON.stringify(draft.value);
      deck.value = { ...deck.value, status: 'generating', errorMessage: null };
      schedulePoll();
      return true;
    } catch (err) {
      building.value = false;
      saveError.value = err;
      return false;
    }
  }

  function discard() {
    if (deck.value) adopt(deck.value);
  }

  /* ---- thao tác trang ---- */
  function addSlide(after = slides.value.length - 1, layout = 'auto') {
    if (slides.value.length >= SPEC_LIMITS.outlineSlides) throw new ApiError(0, 'LIMIT', `Tối đa ${SPEC_LIMITS.outlineSlides} trang`);
    const s = emptyOutlineSlide(layout);
    draft.value.slides.splice(after + 1, 0, s);
    return s;
  }
  function removeSlide(i) {
    if (slides.value.length <= 1) throw new ApiError(0, 'LIMIT', 'Dàn ý cần ít nhất 1 trang');
    draft.value.slides.splice(i, 1);
  }
  function moveSlide(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= slides.value.length) return;
    const [s] = draft.value.slides.splice(i, 1);
    draft.value.slides.splice(j, 0, s);
  }
  function copySlide(i) {
    if (slides.value.length >= SPEC_LIMITS.outlineSlides) throw new ApiError(0, 'LIMIT', `Tối đa ${SPEC_LIMITS.outlineSlides} trang`);
    draft.value.slides.splice(i + 1, 0, { ...clone(draft.value.slides[i]), id: newId() });
  }

  const remove = () => del(`/api/presentations/${id}`);

  const onBeforeUnload = (e) => {
    if (dirty.value) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  onBeforeUnmount(() => {
    stopped = true;
    if (dirty.value && deck.value) pendingDrafts.set(id, { outlineVersion: deck.value.outlineVersion, draft: clone(draft.value) });
    clearTimeout(pollTimer);
    window.removeEventListener('beforeunload', onBeforeUnload);
  });

  return {
    deck, draft, slides, assets, media, videoLibrary, loading, saving, building, loadError, saveError, dirty,
    load, save, build, discard, addSlide, removeSlide, moveSlide, copySlide, remove,
  };
}
