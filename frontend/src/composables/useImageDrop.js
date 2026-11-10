// Kéo-thả / dán ảnh vào trang đang sửa (dùng chung desktop + mobile).
// - Thả trúng 1 ô ảnh (1 tệp) → thay ảnh của ô đó, giữ chú thích/khung/lớp phủ.
// - Thả ra chỗ trống / nhiều tệp / dán → chèn ảnh tự do tại điểm thả (dán: giữa trang), giữ đúng tỷ lệ ảnh.
// Nguồn sự kiện: khung trang (deck:drop qua useLiveDeck.onDrop) + dán khi con trỏ đang ở ứng dụng (ngoài ô nhập liệu).
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { setMedia, mediaTarget } from '@/lib/editPaths.js';
import { ratioNum } from '@/lib/slideModel.js';
import { newElement } from '@shared/deck/free.js';
import { pickLook } from '@shared/deck/imgstyle.js';
import { dropRect } from '@/lib/dropRect.js';

export const MAX_DROP_FILES = 5;
// Tỷ lệ rộng/cao của ảnh (đọc trên máy, không cần tải lên). Không đọc được (vd. HEIC) → 4:3.
async function imageAspect(file) {
  try {
    const bmp = await createImageBitmap(file);
    const a = bmp.width / bmp.height;
    bmp.close?.();
    return a > 0 ? a : 4 / 3;
  } catch {
    return 4 / 3;
  }
}

/**
 * @param {{ ed, live, draft, deck, selected, toast }} o — ed: useEditor(), live: useLiveDeck()
 */
export function useImageDrop({ ed, live, draft, deck, selected, toast }) {
  const busy = ref(false);
  const slideAt = (i) => draft.value?.spec?.slides?.[i] || null;

  // Tìm lại trang đích SAU khi tải lên xong (CT-007): trong lúc chờ người dùng có thể xoá/đổi thứ tự trang, hoàn tác… nên không dùng
  // chỉ số cũ. Bám id trang; trang chưa có id (bản nháp cũ) → bám đối tượng.
  const locate = (slide) => {
    const list = draft.value?.spec?.slides || [];
    const i = slide.id ? list.findIndex((s) => s.id === slide.id) : list.indexOf(slide);
    return i < 0 ? null : { index: i, slide: list[i] };
  };
  const GONE = 'Ảnh đã tải vào thư viện của bài nhưng trang đích đã bị xoá nên chưa chèn';

  async function onDrop({ index, files, skipped = 0, path = null, x = 50, y = 50 }) {
    if (busy.value) return toast.info('Đang tải ảnh trước đó, vui lòng chờ…');
    if (!files.length) return skipped && toast.error('Chỉ kéo thả được tệp ảnh (PNG, JPEG, WebP, GIF, AVIF, HEIC)');
    const slide = slideAt(index);
    if (!slide) return;
    const list = files.slice(0, MAX_DROP_FILES);
    if (files.length > list.length) toast.info(`Mỗi lần chèn tối đa ${MAX_DROP_FILES} ảnh`);
    const target = path && list.length === 1 ? mediaTarget(slide, path) : null;
    busy.value = true;
    if (list.length > 1) toast.info(`Đang tải ${list.length} ảnh lên…`);
    let done = 0;
    let gone = false;
    try {
      if (target) {
        const a = await ed.uploadImage(list[0]);
        // Trang đích còn không, và ô cần thay còn đúng chỗ đó không (ô có thể đã bị xoá/đổi chỗ trong lúc tải).
        const at = locate(slide);
        const live2 = at && mediaTarget(at.slide, path);
        if (!live2) gone = true;
        else {
          const old = live2.image || {};
          setMedia(at.slide, path, { image: { asset: a.id, alt: '', caption: old.caption || '', fit: old.fit || 'cover', ...(old.frame && old.frame !== 'art' ? { frame: old.frame } : {}), ...pickLook(old) } });
          done = 1;
        }
      } else {
        const sa = ratioNum(deck.value?.ratio);
        for (const [i, file] of list.entries()) {
          const [a, ar] = await Promise.all([ed.uploadImage(file), imageAspect(file)]);
          const at = locate(slide);
          if (!at) {
            gone = true;
            break;
          }
          const el = newElement('image', dropRect(x + i * 3, y + i * 3, ar, sa));
          el.image = { asset: a.id, alt: '', caption: '', fit: 'cover' };
          if (selected.value !== at.index) selected.value = at.index;
          live.addElement(el);
          done++;
        }
      }
      if (gone) toast.error(done ? `Đã chèn ${done} ảnh; các ảnh còn lại đã tải vào thư viện nhưng trang đích đã bị xoá` : GONE);
      else toast.success(target ? 'Đã thay ảnh' : done > 1 ? `Đã chèn ${done} ảnh` : 'Đã chèn ảnh — kéo để di chuyển, kéo góc để đổi kích thước');
    } catch (err) {
      toast.error(done ? `Đã chèn ${done} ảnh; ảnh tiếp theo lỗi: ${err.message}` : err.message);
    } finally {
      busy.value = false;
    }
  }

  // Dán ảnh khi đang ở ứng dụng (không gõ trong ô nhập) → chèn ảnh mới giữa trang.
  function onPaste(e) {
    const t = e.target;
    if (t && (t.closest?.('input, textarea, select, [contenteditable]') || t.isContentEditable)) return;
    const all = [...(e.clipboardData?.files || [])];
    const files = all.filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    onDrop({ index: selected.value, files, skipped: all.length - files.length });
  }
  // Thả tệp ra ngoài khung trang: chặn trình duyệt mở ảnh sang tab mới (mất bài đang sửa).
  const blockFileDrop = (e) => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
  };

  onMounted(() => {
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', blockFileDrop);
    window.addEventListener('drop', blockFileDrop);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('paste', onPaste);
    window.removeEventListener('dragover', blockFileDrop);
    window.removeEventListener('drop', blockFileDrop);
  });

  return { busy, onDrop };
}
