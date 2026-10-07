// Chia sẻ theo người (chỉ chủ bài): danh sách người được mời, mời theo email, đổi quyền, gỡ — dùng chung desktop/mobile.
// Chế độ công khai do trang gọi (setVisibility) vì trang đang giữ bài (trình soạn thảo/danh sách) tự cập nhật trạng thái.
import { ref, reactive } from 'vue';
import { get, post, patch, del } from '@/lib/api.js';
import { SHARE_ROLE_LABEL } from '@/lib/deckActions.js';

export const SHARE_ROLE_OPTIONS = Object.entries(SHARE_ROLE_LABEL).map(([value, label]) => ({ value, label }));

export function useSharing(id) {
  const shares = ref([]);
  const max = ref(100);
  const loading = ref(false);
  const error = ref(null);
  const busy = reactive({}); // userId | 'invite' → đang xử lý

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await get(`/api/presentations/${id}/shares`);
      shares.value = data.shares;
      max.value = data.max;
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  async function run(key, fn) {
    busy[key] = true;
    try {
      return await fn();
    } finally {
      delete busy[key];
    }
  }

  // Mời lại người đã có trong danh sách = đổi quyền (máy chủ trả created=false).
  const invite = (email, role) =>
    run('invite', async () => {
      const { data } = await post(`/api/presentations/${id}/shares`, { email, role });
      const i = shares.value.findIndex((s) => s.userId === data.share.userId);
      if (i >= 0) shares.value.splice(i, 1, data.share);
      else shares.value.push(data.share);
      return data;
    });

  const setRole = (userId, role) =>
    run(userId, async () => {
      const { data } = await patch(`/api/presentations/${id}/shares/${userId}`, { role });
      const i = shares.value.findIndex((s) => s.userId === userId);
      if (i >= 0) shares.value.splice(i, 1, data.share);
    });

  const remove = (userId) =>
    run(userId, async () => {
      await del(`/api/presentations/${id}/shares/${userId}`);
      shares.value = shares.value.filter((s) => s.userId !== userId);
    });

  return { shares, max, loading, error, busy, load, invite, setRole, remove };
}
