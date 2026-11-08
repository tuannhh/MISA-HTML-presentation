// Thư mục sắp xếp "Bài của tôi" (lồng nhau tối đa 5 cấp) — dùng chung desktop/mobile.
// Giữ toàn bộ cây phẳng của người dùng (≤ 300 thư mục) rồi tính con/đường dẫn/cây chọn ở client.
import { ref, computed } from 'vue';
import { get, post, patch, del } from '@/lib/api.js';

export const MAX_DEPTH = 5;
export const ROOT_KEY = '__root';

export function useFolders() {
  const all = ref([]);
  const loaded = ref(false);
  const error = ref(null);

  const byId = computed(() => new Map(all.value.map((f) => [f.id, f])));
  const sortByName = (a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base', numeric: true });
  const childrenOf = (id) => all.value.filter((f) => (f.parentId || null) === (id || null)).sort(sortByName);
  // Đường dẫn từ gốc tới thư mục (không gồm gốc "Bài của tôi").
  function pathTo(id) {
    const out = [];
    for (let cur = byId.value.get(id); cur && out.length <= MAX_DEPTH; cur = byId.value.get(cur.parentId)) out.unshift(cur);
    return out;
  }
  const levelOf = (id) => pathTo(id).length;
  function heightOf(id) {
    const kids = childrenOf(id);
    return 1 + (kids.length ? Math.max(...kids.map((k) => heightOf(k.id))) : 0);
  }
  const isInside = (id, ancestorId) => pathTo(id).some((f) => f.id === ancestorId);
  const subCount = (id) => childrenOf(id).length;

  // Cây cho MTree (bộ chọn "Chuyển đến…"). moving = thư mục đang chuyển → khoá chính nó, con của nó và chỗ quá sâu.
  function pickerNodes({ moving = null } = {}) {
    const h = moving ? heightOf(moving) : 1;
    const build = (parentId) =>
      childrenOf(parentId).map((f) => ({
        id: f.id,
        label: f.name,
        disabled: !!moving && (f.id === moving || isInside(f.id, moving) || levelOf(f.id) + h > MAX_DEPTH),
        children: build(f.id),
      }));
    return [{ id: ROOT_KEY, label: 'Bài của tôi (ngoài thư mục)', children: build(null) }];
  }

  async function load() {
    error.value = null;
    try {
      all.value = (await get('/api/folders')).data;
      loaded.value = true;
    } catch (err) {
      error.value = err;
    }
  }
  async function create(name, parentId) {
    const f = (await post('/api/folders', { name, parentId: parentId || null })).data;
    all.value = [...all.value, f];
    return f;
  }
  async function rename(id, name) {
    const f = (await patch(`/api/folders/${id}`, { name })).data;
    all.value = all.value.map((x) => (x.id === id ? { ...x, ...f, decks: x.decks } : x));
    return f;
  }
  async function move(id, parentId) {
    const f = (await patch(`/api/folders/${id}`, { parentId: parentId || null })).data;
    all.value = all.value.map((x) => (x.id === id ? { ...x, ...f, decks: x.decks } : x));
    return f;
  }
  async function remove(id) {
    const res = (await del(`/api/folders/${id}`))?.data;
    await load(); // con + bài đã chuyển lên cha → lấy lại số đếm
    return res;
  }
  async function moveDecks(ids, folderId) {
    const res = (await post('/api/folders/move-decks', { ids, folderId: folderId || null })).data;
    await load();
    return res;
  }

  return { all, loaded, error, byId, childrenOf, pathTo, levelOf, subCount, pickerNodes, load, create, rename, move, remove, moveDecks };
}
