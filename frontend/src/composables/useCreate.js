// Logic form "Tạo bài trình bày" dùng chung desktop/mobile: nguồn (nhiều tệp/link/văn bản), tỷ lệ, tông màu
// (nền tối/sáng + Tự động / mẫu / tuỳ chỉnh 2 màu), số trang (tự động/tuỳ chỉnh), yêu cầu thêm.
// Giới hạn khớp server (MAX_UPLOAD_MB, MAX_UPLOAD_FILES, AUTO_MAX_SLIDES). Tạo xong → bước duyệt dàn ý.
import { reactive, ref, computed } from 'vue';
import { uploadForm } from '@/lib/api.js';
import { SOURCE_ACCEPT, sourceProblem, heicToJpeg } from '@/lib/fileKinds.js';

// Tổng dung lượng mọi tệp nguồn (không giới hạn riêng từng tệp).
export const MAX_UPLOAD_MB = 300;
export const MAX_UPLOAD_FILES = 20;
export const MAX_TEXT_CHARS = 200000;
export const AUTO_MAX_SLIDES = 25;
export const ACCEPT = SOURCE_ACCEPT;

const MB = 1048576;
export const formatMb = (bytes) => `${(bytes / MB).toLocaleString('vi-VN', { maximumFractionDigits: bytes < 10 * MB ? 1 : 0 })} MB`;

let seq = 0;

export function useCreate() {
  const form = reactive({
    mode: 'file', files: [], url: '', text: '', ratio: '16:9', tone: 'dark', theme: 'auto', primary: '', secondary: '',
    slideMode: 'auto', slideCount: 12, instructions: '', title: '',
  });
  const errors = reactive({});
  const submitting = ref(false);
  const progress = ref(null); // % tải tệp lên khi đang gửi
  const submitError = ref(null);

  const totalBytes = computed(() => form.files.reduce((n, f) => n + f.file.size, 0));

  function validate() {
    for (const k of Object.keys(errors)) delete errors[k];
    if (form.mode === 'file' && !form.files.length) errors.file = 'Chọn ít nhất 1 tệp tư liệu';
    if (form.mode === 'file' && totalBytes.value > MAX_UPLOAD_MB * MB) errors.file = `Tổng dung lượng tối đa ${MAX_UPLOAD_MB} MB`;
    if (form.mode === 'url') {
      try {
        const u = new URL(form.url.trim());
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      } catch {
        errors.url = 'Nhập đường link hợp lệ bắt đầu bằng http:// hoặc https://';
      }
    }
    if (form.mode === 'text' && form.text.trim().length < 20) errors.text = 'Nhập ít nhất 20 ký tự';
    if (form.mode === 'text' && form.text.length > MAX_TEXT_CHARS) errors.text = `Tối đa ${MAX_TEXT_CHARS.toLocaleString('vi-VN')} ký tự`;
    if (form.title.length > 200) errors.title = 'Tên bài tối đa 200 ký tự';
    if (form.slideMode === 'custom') {
      const n = Number(form.slideCount);
      if (!Number.isInteger(n) || n < 3 || n > 40) errors.slideCount = 'Số trang từ 3 đến 40';
    }
    if (form.instructions.length > 2000) errors.instructions = 'Tối đa 2000 ký tự';
    if (form.theme === 'custom' && !/^#[0-9a-f]{6}$/i.test(form.primary.trim())) errors.theme = 'Màu chính phải có dạng #RRGGBB';
    else if (form.theme === 'custom' && form.secondary.trim() && !/^#[0-9a-f]{6}$/i.test(form.secondary.trim())) errors.theme = 'Màu phụ phải có dạng #RRGGBB';
    return Object.keys(errors).length === 0;
  }

  async function submit() {
    submitError.value = null;
    if (!validate()) return null;
    submitting.value = true;
    try {
      const fd = new FormData();
      if (form.mode === 'file') for (const f of form.files) fd.append('files', f.file, f.file.name);
      if (form.mode === 'url') fd.set('url', form.url.trim());
      if (form.mode === 'text') fd.set('text', form.text.trim());
      fd.set('ratio', form.ratio);
      fd.set('tone', form.tone);
      fd.set('theme', form.theme);
      if (form.theme === 'custom') {
        fd.set('primary', form.primary.trim());
        if (form.secondary.trim()) fd.set('secondary', form.secondary.trim());
      }
      fd.set('slideCount', form.slideMode === 'auto' ? 'auto' : String(form.slideCount));
      if (form.instructions.trim()) fd.set('instructions', form.instructions.trim());
      if (form.title.trim()) fd.set('title', form.title.trim());
      progress.value = form.mode === 'file' ? 0 : null;
      return (await uploadForm('/api/presentations', fd, { onProgress: (p) => (progress.value = p) })).data;
    } catch (err) {
      submitError.value = err;
      return null;
    } finally {
      submitting.value = false;
      progress.value = null;
    }
  }

  // Cầu nối MUpload (component chỉ chọn tệp; danh sách hiển thị do trang quản lý).
  const fileList = computed(() =>
    form.files.map((f) => ({
      id: f.id,
      name: f.file.name,
      size: f.file.size,
      status: progress.value === null ? 'done' : 'uploading',
      progress: progress.value ?? 0,
    })),
  );

  // Chọn/kéo-thả tệp: kiểm tra loại ngay (báo lý do + cách xử lý), ảnh HEIC đổi sang JPEG trước khi đưa vào danh sách.
  async function onSelectFiles(files) {
    delete errors.file;
    const problems = [];
    const skipped = [];
    for (const picked of files) {
      const problem = sourceProblem(picked);
      if (problem) {
        problems.push(problem);
        continue;
      }
      let file;
      try {
        file = await heicToJpeg(picked);
      } catch (err) {
        problems.push(err.message);
        continue;
      }
      const dup = form.files.some((f) => f.file.name === file.name && f.file.size === file.size && f.file.lastModified === file.lastModified);
      if (dup) continue;
      if (form.files.length >= MAX_UPLOAD_FILES) {
        problems.push(`Tối đa ${MAX_UPLOAD_FILES} tệp mỗi lần tạo`);
        break;
      }
      if (totalBytes.value + file.size > MAX_UPLOAD_MB * MB) {
        skipped.push(file.name);
        continue;
      }
      form.files.push({ id: `f${++seq}`, file });
    }
    if (skipped.length) problems.push(`Vượt tổng ${MAX_UPLOAD_MB} MB — chưa thêm: ${skipped.join(', ')}`);
    if (problems.length) errors.file = problems.length > 3 ? `${problems.slice(0, 3).join(' · ')} · và ${problems.length - 3} tệp khác chưa thêm được` : problems.join(' · ');
  }
  function onOversized(files) {
    errors.file = `Vượt tổng ${MAX_UPLOAD_MB} MB — chưa thêm: ${files.map((f) => f.name).join(', ')}`;
  }
  function removeFile(id) {
    form.files = form.files.filter((f) => f.id !== id);
    delete errors.file;
  }

  return { form, errors, submitting, progress, submitError, totalBytes, validate, submit, fileList, onSelectFiles, onOversized, removeFile };
}

export const SOURCE_MODES = [
  { label: 'Tải tệp lên', value: 'file', key: 'file' },
  { label: 'Dán đường link', value: 'url', key: 'url' },
  { label: 'Nhập nội dung', value: 'text', key: 'text' },
];

export const SLIDE_MODES = [
  { label: `Tự động (tối đa ${AUTO_MAX_SLIDES})`, value: 'auto' },
  { label: 'Tuỳ chỉnh', value: 'custom' },
];
