// Logic form "Tạo bài trình bày" dùng chung desktop/mobile: nguồn (tệp/link/văn bản), tỷ lệ, số trang, yêu cầu thêm.
import { reactive, ref, computed } from 'vue';
import { postForm } from '@/lib/api.js';

export const MAX_UPLOAD_MB = 50;
export const MAX_TEXT_CHARS = 200000;
export const ACCEPT = '.pptx,.docx,.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,text/markdown';

export function useCreate() {
  const form = reactive({ mode: 'file', file: null, url: '', text: '', ratio: '16:9', slideCount: 12, instructions: '', title: '' });
  const errors = reactive({});
  const submitting = ref(false);
  const submitError = ref(null);

  function validate() {
    for (const k of Object.keys(errors)) delete errors[k];
    if (form.mode === 'file' && !form.file) errors.file = 'Chọn tệp tài liệu';
    if (form.mode === 'file' && form.file && form.file.size > MAX_UPLOAD_MB * 1048576) errors.file = `Tệp tối đa ${MAX_UPLOAD_MB} MB`;
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
    const n = Number(form.slideCount);
    if (!Number.isInteger(n) || n < 3 || n > 40) errors.slideCount = 'Số trang từ 3 đến 40';
    if (form.instructions.length > 2000) errors.instructions = 'Tối đa 2000 ký tự';
    return Object.keys(errors).length === 0;
  }

  async function submit() {
    submitError.value = null;
    if (!validate()) return null;
    submitting.value = true;
    try {
      const fd = new FormData();
      if (form.mode === 'file') fd.set('file', form.file);
      if (form.mode === 'url') fd.set('url', form.url.trim());
      if (form.mode === 'text') fd.set('text', form.text.trim());
      fd.set('ratio', form.ratio);
      fd.set('slideCount', String(form.slideCount));
      if (form.instructions.trim()) fd.set('instructions', form.instructions.trim());
      if (form.title.trim()) fd.set('title', form.title.trim());
      return (await postForm('/api/presentations', fd)).data;
    } catch (err) {
      submitError.value = err;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  // Cầu nối MUpload (component chỉ chọn tệp; danh sách hiển thị do trang quản lý).
  const fileList = computed(() => (form.file ? [{ id: 'src', name: form.file.name, size: form.file.size, status: 'done' }] : []));
  function onSelectFiles(files) {
    form.file = files[0] || null;
    delete errors.file;
  }
  function onOversized() {
    errors.file = `Tệp tối đa ${MAX_UPLOAD_MB} MB`;
  }
  const clearFile = () => (form.file = null);

  return { form, errors, submitting, submitError, validate, submit, fileList, onSelectFiles, onOversized, clearFile };
}

export const SOURCE_MODES = [
  { label: 'Tải tệp lên', value: 'file', key: 'file' },
  { label: 'Dán đường link', value: 'url', key: 'url' },
  { label: 'Nhập nội dung', value: 'text', key: 'text' },
];
