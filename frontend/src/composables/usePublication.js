// Xuất bản bài ra domain công khai (chỉ chủ bài) — trạng thái, xuất bản/cập nhật, gỡ. Dùng chung desktop/mobile.
// Máy chủ trả { enabled, published, url, publishedAt, outdated }; enabled=false khi DevOps chưa đặt PUBLISH_BASE_URL.
import { ref } from 'vue';
import { get, post, del } from '@/lib/api.js';

export function usePublication(id) {
  const state = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const busy = ref(''); // '' | 'publish' | 'unpublish'

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      state.value = (await get(`/api/presentations/${id}/publication`)).data;
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  async function run(kind, fn) {
    if (busy.value) return null;
    busy.value = kind;
    try {
      state.value = (await fn()).data;
      return state.value;
    } finally {
      busy.value = '';
    }
  }

  const publish = () => run('publish', () => post(`/api/presentations/${id}/publication`));
  const unpublish = () => run('unpublish', () => del(`/api/presentations/${id}/publication`));

  return { state, loading, error, busy, load, publish, unpublish };
}
