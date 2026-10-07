// Phiên bản của bài đã chia sẻ: bản gốc (lần đầu chia sẻ) + tối đa 5 bản handoff — dùng chung desktop/mobile.
// Chủ bài và người được mời sửa handoff/xoá bản của mình; chỉ chủ bài khôi phục (không chọn bản → về bản gốc).
import { ref, computed } from 'vue';
import { get, post, del } from '@/lib/api.js';

export function useVersions(id) {
  const items = ref([]);
  const handoffs = ref(0);
  const max = ref(5);
  const canRestore = ref(false);
  const loading = ref(false);
  const error = ref(null);
  const busy = ref(''); // 'handoff' | 'restore' | id bản đang xoá

  const baseline = computed(() => items.value.find((v) => v.kind === 'baseline') || null);
  const full = computed(() => handoffs.value >= max.value);

  function adopt(data) {
    items.value = data.items;
    handoffs.value = data.handoffs;
    max.value = data.max;
    canRestore.value = data.canRestore;
  }

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      adopt((await get(`/api/presentations/${id}/versions`)).data);
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  async function run(key, fn) {
    busy.value = key;
    try {
      return await fn();
    } finally {
      busy.value = '';
    }
  }

  // specVersion = bản đang lưu mà người dùng nhìn thấy; máy chủ chụp đúng bản đó (bài vừa bị lưu đè → 409).
  const handoff = (specVersion, note) => run('handoff', async () => adopt((await post(`/api/presentations/${id}/versions`, { specVersion, note })).data));
  const remove = (versionId) => run(versionId, async () => adopt((await del(`/api/presentations/${id}/versions/${versionId}`)).data));
  // versionId null → bản gốc. Trả về bài sau khi khôi phục để trang cập nhật bản nháp.
  const restore = (versionId, specVersion) =>
    run('restore', async () => {
      const body = { specVersion };
      if (versionId) body.versionId = versionId;
      return (await post(`/api/presentations/${id}/restore`, body)).data;
    });
  const previewUrl = (versionId) => `/api/presentations/${id}/versions/${versionId}/preview`;

  return { items, handoffs, max, canRestore, loading, error, busy, baseline, full, load, handoff, remove, restore, previewUrl };
}
