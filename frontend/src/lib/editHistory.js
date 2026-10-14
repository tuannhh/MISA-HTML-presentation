// Lịch sử Hoàn tác (Ctrl/Cmd+Z) / Làm lại (Ctrl/Cmd+Shift+Z, Ctrl+Y) của bản nháp trình soạn thảo — không giới hạn số bước.
// Mỗi bước = ảnh chụp { tiêu đề, phần chung của spec (JSON), từng trang (JSON) }. Trang không đổi so với bước trước dùng lại
// đúng chuỗi của bước trước → sửa 1 trang chỉ tốn thêm đúng trang đó, không nhân cả bài theo số bước.
// Thuần JS (không phụ thuộc Vue) để test được; phần gắn với bản nháp + phím tắt nằm ở useEditor.

const parse = (s) => JSON.parse(s);

export function createEditHistory() {
  let stack = [];
  let pos = -1;

  function encode(state, prev) {
    const spec = state?.spec || {};
    const slides = Array.isArray(spec.slides) ? spec.slides : [];
    // Giữ vị trí khoá "slides" trong JSON → dựng lại đúng thứ tự khoá (so "chưa lưu" với bản gốc theo JSON).
    const m = JSON.stringify({ ...spec, slides: null });
    const known = new Map(prev ? prev.s.map((j) => [j, j]) : []);
    const s = slides.map((x) => {
      const j = JSON.stringify(x);
      return known.get(j) ?? j;
    });
    return { t: state?.title ?? '', m: prev && prev.m === m ? prev.m : m, s };
  }
  const same = (a, b) => !!a && !!b && a.t === b.t && a.m === b.m && a.s.length === b.s.length && a.s.every((x, i) => x === b.s[i]);

  // Trang đầu tiên khác nhau giữa 2 bước → chuyển tới trang vừa hoàn tác/làm lại; -1 = chỉ đổi tiêu đề/thiết lập chung.
  function firstDiff(a, b) {
    const n = Math.min(a.s.length, b.s.length);
    for (let i = 0; i < n; i++) if (a.s[i] !== b.s[i]) return i;
    return a.s.length === b.s.length ? -1 : Math.max(0, Math.min(n, a.s.length - 1));
  }

  // Dựng trạng thái của bước `snap`. Trang có JSON trùng trang đang hiển thị → giữ nguyên đối tượng đang có (giao diện không dựng
  // lại thừa); mỗi đối tượng chỉ dùng 1 lần (2 trang giống hệt nhau không bị dùng chung 1 đối tượng).
  function decode(snap, from, current) {
    const objs = new Map();
    from.s.forEach((j, i) => {
      const obj = current.spec.slides[i];
      if (!obj) return;
      if (!objs.has(j)) objs.set(j, []);
      objs.get(j).push(obj);
    });
    const spec = parse(snap.m);
    spec.slides = snap.s.map((j) => objs.get(j)?.shift() || parse(j));
    return { title: snap.t, spec };
  }

  /** Ghi trạng thái hiện tại thành 1 bước nếu khác bước đang đứng (thay đổi mới → bỏ nhánh "làm lại"). */
  function record(current) {
    const snap = encode(current, stack[pos]);
    if (pos >= 0 && same(snap, stack[pos])) return false;
    stack.length = pos + 1;
    stack.push(snap);
    pos += 1;
    return true;
  }

  function step(current, dir) {
    record(current); // thay đổi chưa kịp ghi (đang gõ dở) thành 1 bước trước, để làm lại được
    const to = pos + dir;
    if (to < 0 || to >= stack.length) return null;
    const from = stack[pos];
    pos = to;
    return { state: decode(stack[pos], from, current), index: firstDiff(stack[pos], from) };
  }

  return {
    record,
    /** → { state: { title, spec }, index } | null (hết bước). index = trang nên chuyển tới (-1: giữ nguyên). */
    undo: (current) => step(current, -1),
    redo: (current) => step(current, 1),
    /** Bắt đầu lại từ trạng thái này (mở bài). */
    reset(current) {
      stack = [];
      pos = -1;
      if (current) record(current);
    },
    /** Thay bước đang đứng bằng trạng thái này, không thêm bước (bản máy chủ chuẩn hoá sau khi lưu). */
    rebase(current) {
      if (pos < 0) return void record(current);
      stack[pos] = encode(current, stack[pos]);
    },
    /** Bước đang đứng có đúng là trạng thái này không (dùng lại lịch sử khi trang được dựng lại). */
    matches: (current) => pos >= 0 && same(encode(current, stack[pos]), stack[pos]),
    canUndo: () => pos > 0,
    canRedo: () => pos < stack.length - 1,
    size: () => stack.length,
  };
}

// Nhãn phím tắt trên tooltip: macOS/iPadOS dùng ⌘, còn lại Ctrl.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
export const HISTORY_SHORTCUTS = Object.freeze(IS_MAC ? { undo: '⌘Z', redo: '⌘⇧Z' } : { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z' });

/** Phím tắt lịch sử: 'undo' | 'redo' | null. Ctrl+Z / ⌘Z; Ctrl+Shift+Z / ⌘⇧Z; Ctrl+Y (thói quen Windows). */
export function historyKey(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return null;
  const k = String(e.key || '').toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey) return 'redo';
  return null;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image']);
/** Ô nhập chữ của ứng dụng (tên bài, ô tìm, ô trong hộp thoại…) → để trình duyệt tự hoàn tác chữ đang gõ trong ô. */
export function isTextField(t) {
  if (!t || t.nodeType !== 1) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  return t.tagName === 'INPUT' && !NON_TEXT_INPUTS.has(String(t.type || 'text').toLowerCase());
}
