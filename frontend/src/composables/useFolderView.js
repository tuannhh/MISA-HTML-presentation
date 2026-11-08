// Trạng thái màn "Bài của tôi" theo thư mục (dùng chung desktop/mobile): thư mục đang mở (?folder=…), đường dẫn,
// thư mục con, và 3 hộp thoại — đặt tên (tạo/đổi tên), chuyển đến (bài hoặc thư mục), xoá thư mục.
import { computed, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from '@/components/mds/toast.js';
import { useFolders, ROOT_KEY, MAX_DEPTH } from './useFolders.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useFolderView(list) {
  const route = useRoute();
  const router = useRouter();
  const toast = useToast();
  const folders = useFolders();

  const currentId = computed(() => (typeof route.query.folder === 'string' && UUID_RE.test(route.query.folder) ? route.query.folder.toLowerCase() : null));
  const current = computed(() => (currentId.value ? folders.byId.value.get(currentId.value) || null : null));
  const crumbs = computed(() => (currentId.value ? folders.pathTo(currentId.value) : []));
  const subfolders = computed(() => folders.childrenOf(currentId.value));
  // Đang tìm kiếm → danh sách là kết quả trên mọi thư mục, ẩn thư mục con.
  const searching = computed(() => !!list.q.value.trim());
  const canNest = computed(() => folders.levelOf(currentId.value) < MAX_DEPTH);

  function open(id) {
    const query = { ...route.query };
    if (id) query.folder = id;
    else delete query.folder;
    delete query.q;
    if (list.q.value) list.q.value = '';
    router.push({ query });
  }

  async function init() {
    await folders.load();
    // Thư mục trên URL không còn (đã xoá/không phải của mình) → về gốc.
    if (currentId.value && !folders.byId.value.has(currentId.value)) return open(null);
    await list.setFolder(currentId.value || 'root');
  }
  watch(currentId, (id) => list.setFolder(id || 'root'));

  /* ---- Đặt tên: tạo thư mục mới trong thư mục đang mở, hoặc đổi tên ---- */
  const nameDlg = reactive({ open: false, mode: 'create', folder: null, name: '', error: '', busy: false });
  function askCreate() {
    if (!canNest.value) return toast.warning(`Thư mục lồng tối đa ${MAX_DEPTH} cấp`);
    Object.assign(nameDlg, { open: true, mode: 'create', folder: null, name: '', error: '' });
  }
  function askRename(f) {
    Object.assign(nameDlg, { open: true, mode: 'rename', folder: f, name: f.name, error: '' });
  }
  async function submitName() {
    const name = nameDlg.name.replace(/\s+/g, ' ').trim();
    if (!name) return (nameDlg.error = 'Nhập tên thư mục');
    if (name.length > 120) return (nameDlg.error = 'Tên tối đa 120 ký tự');
    nameDlg.busy = true;
    try {
      if (nameDlg.mode === 'create') {
        await folders.create(name, currentId.value);
        toast.success('Đã tạo thư mục');
      } else {
        await folders.rename(nameDlg.folder.id, name);
        toast.success('Đã đổi tên thư mục');
      }
      nameDlg.open = false;
    } catch (err) {
      nameDlg.error = err.message;
    } finally {
      nameDlg.busy = false;
    }
  }

  /* ---- Chuyển đến: 1 bài (từ menu bài) hoặc 1 thư mục ---- */
  const moveDlg = reactive({ open: false, kind: 'deck', target: null, selected: ROOT_KEY, expanded: [], busy: false });
  const moveNodes = computed(() => (moveDlg.open ? folders.pickerNodes({ moving: moveDlg.kind === 'folder' ? moveDlg.target?.id : null }) : []));
  const moveFrom = computed(() => (moveDlg.kind === 'deck' ? moveDlg.target?.folderId || null : moveDlg.target?.parentId || null));
  function askMove(kind, target) {
    const from = kind === 'deck' ? target.folderId : target.parentId;
    Object.assign(moveDlg, { open: true, kind, target, selected: from || ROOT_KEY, expanded: [ROOT_KEY, ...folders.all.value.map((f) => f.id)] });
  }
  // Menu bài chọn "Chuyển vào thư mục…" → mở hộp chọn.
  watch(list.pendingMove, (d) => {
    if (!d) return;
    list.pendingMove.value = null;
    askMove('deck', d);
  });
  async function submitMove() {
    const to = moveDlg.selected === ROOT_KEY ? null : moveDlg.selected;
    if (to === moveFrom.value) return (moveDlg.open = false);
    moveDlg.busy = true;
    try {
      if (moveDlg.kind === 'deck') await moveDeckTo(moveDlg.target, to);
      else {
        await folders.move(moveDlg.target.id, to);
        toast.success(`Đã chuyển thư mục vào “${to ? folders.byId.value.get(to)?.name : 'Bài của tôi'}”`);
      }
      moveDlg.open = false;
    } catch (err) {
      toast.error(err.message);
    } finally {
      moveDlg.busy = false;
    }
  }

  // Chuyển 1 bài (menu hoặc kéo-thả lên thư mục/đường dẫn); bài rời khỏi danh sách đang xem nếu không còn thuộc thư mục này.
  async function moveDeckTo(d, folderId) {
    if ((d.folderId || null) === (folderId || null)) return;
    await folders.moveDecks([d.id], folderId);
    d.folderId = folderId || null;
    if (!searching.value && (folderId || null) !== currentId.value) {
      list.rows.value = list.rows.value.filter((r) => r.id !== d.id);
      list.total.value = Math.max(0, list.total.value - 1);
    }
    toast.success(`Đã chuyển “${d.title}” vào ${folderId ? `thư mục “${folders.byId.value.get(folderId)?.name}”` : 'Bài của tôi'}`);
  }
  async function dropDeck(deckId, folderId) {
    const d = list.rows.value.find((r) => r.id === deckId);
    if (!d || !d.isOwner) return;
    try {
      await moveDeckTo(d, folderId);
    } catch (err) {
      toast.error(err.message);
    }
  }

  /* ---- Xoá thư mục: bài + thư mục con chuyển lên thư mục cha ---- */
  const removeDlg = reactive({ open: false, folder: null });
  const askRemove = (f) => Object.assign(removeDlg, { open: true, folder: f });
  async function submitRemove() {
    const f = removeDlg.folder;
    removeDlg.open = false;
    if (!f) return;
    try {
      const wasOpen = currentId.value && (currentId.value === f.id || folders.pathTo(currentId.value).some((x) => x.id === f.id));
      await folders.remove(f.id);
      toast.success('Đã xóa thư mục — bài bên trong được chuyển ra ngoài');
      if (wasOpen) open(f.parentId || null);
      else await list.load({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  }

  const FOLDER_MENU = [
    { key: 'rename', label: 'Đổi tên', icon: 'pencil' },
    { key: 'move', label: 'Chuyển đến…', icon: 'arrows-move' },
    { key: 'd1', divider: true },
    { key: 'remove', label: 'Xóa thư mục', icon: 'trash', danger: true },
  ];
  function handleFolder(key, f) {
    if (key === 'rename') return askRename(f);
    if (key === 'move') return askMove('folder', f);
    if (key === 'remove') return askRemove(f);
  }
  const folderMeta = (f) => {
    const n = folders.subCount(f.id);
    return [n ? `${n} thư mục` : '', `${f.decks} bài`].filter(Boolean).join(' · ');
  };

  return {
    folders, currentId, current, crumbs, subfolders, searching, canNest, open, init,
    nameDlg, askCreate, askRename, submitName,
    moveDlg, moveNodes, askMove, submitMove, dropDeck,
    removeDlg, askRemove, submitRemove,
    FOLDER_MENU, handleFolder, folderMeta, ROOT_KEY,
  };
}
