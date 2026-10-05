<script setup>
/**
 * MUpload — khu vực đính kèm/tải tệp lên. Chưa có spec riêng trong
 * references/ (đợt Tree/Upload/validation helper) — dựng theo pattern
 * dropzone đã dùng ở popup-form.md mục 5 (paperclip + label + chú thích
 * dung lượng + dropzone dashed 1.5px bo 8px) và quy ước chung MDS (nút 32px,
 * token màu var(--mds-*), trạng thái Loading/Error nhất quán với MButton).
 * Component KHÔNG tự upload lên server — chỉ chọn/kéo-thả file rồi emit ra
 * cho cha xử lý; cha tự quản lý mảng modelValue (id, name, size, status,
 * progress, errorMessage) để hiển thị tiến trình thật.
 */
import { computed, ref } from 'vue'
import MIcon from './MIcon.vue'
import MSpinner from './MSpinner.vue'

const props = defineProps({
  // modelValue: [{ id, name, size (bytes), status: 'uploading'|'done'|'error', progress? (0-100), errorMessage? }]
  modelValue: { type: Array, default: () => [] },
  accept: { type: String, default: '' },
  multiple: { type: Boolean, default: true },
  maxSizeMB: { type: Number, default: 5 },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: 'Đính kèm' },
  // [MISA Presentation] block: dropzone rộng hết khung (form 1 cột rộng); sizeHint: thay chú thích "Dung lượng tối đa…"
  // (vd. giới hạn theo TỔNG dung lượng nhiều tệp); hint: dòng phụ trong dropzone.
  block: { type: Boolean, default: false },
  sizeHint: { type: String, default: '' },
  hint: { type: String, default: '' },
})

const emit = defineEmits(['select-files', 'oversized', 'remove', 'retry'])

const inputRef = ref(null)
const isDragOver = ref(false)

const maxSizeBytes = computed(() => props.maxSizeMB * 1024 * 1024)

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Icon theo phần mở rộng: ảnh dùng 'photo', văn bản dùng 'file-text', còn lại 'file'
function iconForFile(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'photo'
  if (['doc', 'docx', 'txt', 'pdf', 'xls', 'xlsx'].includes(ext)) return 'file-text'
  return 'file'
}

function pickFiles(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) return
  const valid = files.filter((f) => f.size <= maxSizeBytes.value)
  const oversized = files.filter((f) => f.size > maxSizeBytes.value)
  if (valid.length) emit('select-files', valid)
  if (oversized.length) emit('oversized', oversized)
}

function onInputChange(e) {
  pickFiles(e.target.files)
  e.target.value = '' // cho phép chọn lại đúng file đó lần sau
}

function openBrowse() {
  if (!props.disabled) inputRef.value?.click()
}

function onDrop(e) {
  isDragOver.value = false
  if (props.disabled) return
  pickFiles(e.dataTransfer?.files)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2 text-[var(--mds-text)]">
      <MIcon name="paperclip" :size="16" class="text-[var(--mds-icon-neutral)]" />
      <span class="font-medium">{{ label }}</span>
      <span class="text-[12px] text-[var(--mds-text-secondary)]">{{ sizeHint || `Dung lượng tối đa ${maxSizeMB}MB` }}</span>
    </div>

    <!-- Dropzone: click hoặc kéo-thả để chọn file.
         [MISA Presentation] Trước đây là <label @click.prevent> BỌC <input type=file>: input.click() nổi bọt lên label và bị
         preventDefault → trình duyệt huỷ hộp chọn tệp (bấm không mở cửa sổ). Nay là div role=button, input nằm ngoài. -->
    <div
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-disabled="disabled ? 'true' : undefined"
      class="flex w-full items-center justify-center rounded-lg border-[1.5px] border-dashed text-center text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      :class="[
        block ? 'min-h-[96px] flex-col gap-1 px-4 py-4' : 'h-[60px] max-w-[420px]',
        disabled
          ? 'cursor-not-allowed border-[var(--mds-border)] text-[var(--mds-text-placeholder)]'
          : 'cursor-pointer text-[var(--mds-text-secondary)] hover:border-[var(--mds-brand-600)] hover:bg-[var(--mds-brand-50)]',
        isDragOver && !disabled ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)]',
      ]"
      @click="openBrowse"
      @keydown.enter.prevent="openBrowse"
      @keydown.space.prevent="openBrowse"
      @dragover.prevent="!disabled && (isDragOver = true)"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <!-- [MISA Presentation] block: icon + dòng phụ cho dropzone rộng -->
      <MIcon v-if="block" name="upload" :size="20" class="text-[var(--mds-icon-neutral)]" />
      <span :class="block ? 'text-[13px] font-medium text-[var(--mds-text)]' : ''">Kéo/thả tệp vào đây hoặc bấm vào đây</span>
      <span v-if="block && hint" class="text-[12px] text-[var(--mds-text-secondary)]">{{ hint }}</span>
    </div>
    <input
      ref="inputRef"
      type="file"
      class="hidden"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      @change="onInputChange"
    />

    <!-- Danh sách file đã chọn/đang tải -->
    <ul v-if="modelValue.length" class="flex flex-col gap-1">
      <li
        v-for="item in modelValue"
        :key="item.id"
        class="flex items-center gap-2 rounded-lg border border-[var(--mds-border-light,var(--mds-border))] px-3 py-2 text-[13px]"
      >
        <MIcon :name="iconForFile(item.name)" :size="16" class="shrink-0 text-[var(--mds-icon-neutral)]" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[var(--mds-text)]">{{ item.name }}</div>
          <div class="flex items-center gap-2 text-[12px]">
            <span class="text-[var(--mds-text-secondary)]">{{ formatSize(item.size) }}</span>
            <!-- Progress bar khi đang tải -->
            <span v-if="item.status === 'uploading'" class="h-1 w-24 overflow-hidden rounded-full bg-[var(--mds-bg-disabled)]">
              <span
                class="block h-full rounded-full bg-[var(--mds-brand-600)] transition-all"
                :style="{ width: (item.progress ?? 0) + '%' }"
              />
            </span>
            <span v-else-if="item.status === 'error'" class="text-[var(--mds-danger)]">
              {{ item.errorMessage || 'Tải lên thất bại' }}
            </span>
          </div>
        </div>

        <!-- Trạng thái + thao tác bên phải -->
        <MSpinner v-if="item.status === 'uploading'" :size="16" class="shrink-0 text-[var(--mds-brand-600)]" />
        <MIcon v-else-if="item.status === 'done'" name="circle-check" :size="16" class="shrink-0 text-[var(--mds-success)]" />
        <button
          v-if="item.status === 'error'"
          type="button"
          class="shrink-0 text-[12px] font-medium text-[var(--mds-brand-600)] hover:underline"
          @click="emit('retry', item.id)"
        >
          Thử lại
        </button>
        <button
          type="button"
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] hover:text-[var(--mds-danger)]"
          aria-label="Xóa tệp"
          @click="emit('remove', item.id)"
        >
          <MIcon name="x" :size="16" />
        </button>
      </li>
    </ul>
  </div>
</template>
