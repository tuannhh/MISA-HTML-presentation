// Danh sách bài trình bày (của tôi / công khai) + thao tác nhanh — dùng chung desktop/mobile.
import { ref, reactive, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { get, post, patch, del, download } from '@/lib/api.js';
import { useToast } from '@/components/mds/toast.js';

export const PAGE_SIZE = 24;

export function useDecks(scope) {
  const rows = ref([]);
  const total = ref(0);
  const page = ref(1);
  const q = ref('');
  const loading = ref(false);
  const error = ref(null);
  const busy = reactive({}); // id → tên thao tác đang chạy
  let pollTimer = null;
  let searchTimer = null;
  let ctrl = null;

  async function load({ silent = false } = {}) {
    ctrl?.abort();
    ctrl = new AbortController();
    if (!silent) loading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams({ scope, page: String(page.value), pageSize: String(PAGE_SIZE) });
      if (q.value.trim()) params.set('q', q.value.trim());
      const res = await get(`/api/presentations?${params}`, { signal: ctrl.signal });
      rows.value = res.data;
      total.value = res.meta?.total ?? res.data.length;
    } catch (err) {
      if (err.name !== 'AbortError') error.value = err;
    } finally {
      loading.value = false;
      schedulePoll();
    }
  }

  // Bài đang tạo hoặc chưa có ảnh bìa → tải lại nhẹ định kỳ.
  function schedulePoll() {
    clearTimeout(pollTimer);
    const pending = rows.value.some((r) => r.status === 'generating' || (r.status === 'ready' && !r.thumbnailUrl));
    if (pending) pollTimer = setTimeout(() => load({ silent: true }), 4000);
  }

  function search(v) {
    q.value = v ?? '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      page.value = 1;
      load();
    }, 300);
  }

  function goPage(p) {
    page.value = p;
    load();
  }

  async function run(id, name, fn) {
    busy[id] = name;
    try {
      return await fn();
    } finally {
      delete busy[id];
    }
  }

  const duplicate = (d) => run(d.id, 'duplicate', async () => (await post(`/api/presentations/${d.id}/duplicate`)).data);
  const remove = (d) =>
    run(d.id, 'remove', async () => {
      await del(`/api/presentations/${d.id}`);
      rows.value = rows.value.filter((r) => r.id !== d.id);
      total.value = Math.max(0, total.value - 1);
    });
  const setVisibility = (d, visibility) =>
    run(d.id, 'visibility', async () => {
      const res = await patch(`/api/presentations/${d.id}`, { visibility });
      Object.assign(d, { visibility: res.data.visibility, publishedAt: res.data.publishedAt });
    });
  const exportFile = (d, kind) => run(d.id, `export-${kind}`, () => download(`/api/presentations/${d.id}/export.${kind}`, `${d.title}.${kind}`));

  /* ---- xử lý chọn thao tác (menu) — xoá cần xác nhận qua dialog của trang ---- */
  const router = useRouter();
  const toast = useToast();
  const pendingRemove = ref(null);

  async function handle(key, d) {
    try {
      if (key === 'edit') return router.push(`/p/${d.id}/edit`);
      if (key === 'view') return router.push(`/p/${d.id}/view`);
      if (key === 'remove') return (pendingRemove.value = d);
      if (key === 'public' || key === 'private') {
        await setVisibility(d, key);
        return toast.success(key === 'public' ? 'Đã công khai — mọi người dùng đều xem được' : 'Đã chuyển về riêng tư');
      }
      if (key === 'duplicate') {
        const copy = await duplicate(d);
        toast.success('Đã tạo bản sao riêng tư');
        return router.push(`/p/${copy.id}/edit`);
      }
      if (key === 'export-html' || key === 'export-pdf') {
        toast.info(key === 'export-pdf' ? 'Đang dựng PDF, vui lòng chờ…' : 'Đang đóng gói HTML…');
        await exportFile(d, key === 'export-pdf' ? 'pdf' : 'html');
      }
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function confirmRemove() {
    const d = pendingRemove.value;
    pendingRemove.value = null;
    if (!d) return;
    try {
      await remove(d);
      toast.success('Đã xóa bài trình bày');
    } catch (err) {
      toast.error(err.message);
    }
  }

  onBeforeUnmount(() => {
    clearTimeout(pollTimer);
    clearTimeout(searchTimer);
    ctrl?.abort();
  });

  return { rows, total, page, q, loading, error, busy, load, search, goPage, duplicate, remove, setVisibility, exportFile, handle, pendingRemove, confirmRemove, pageSize: PAGE_SIZE };
}
