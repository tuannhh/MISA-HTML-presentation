<script setup>
// Ảnh/video gửi kèm khi tạo bài từ nội dung nhập tay: chắc chắn được đưa vào bài, AI đặt vào trang hợp nội dung.
// Dùng chung desktop (kéo-thả + nút) và mobile (touch = nút xoá 44px, lưới 2 cột).
import { ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MSpinner from '@/components/mds/MSpinner.vue'

const props = defineProps({
  items: { type: Array, required: true },
  accept: { type: String, required: true },
  max: { type: Number, required: true },
  summary: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' },
  touch: { type: Boolean, default: false },
})
const emit = defineEmits(['add', 'remove'])
const input = ref(null)
const dragging = ref(false)

function onPick(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (files.length) emit('add', files)
}
function onDrop(e) {
  dragging.value = false
  if (props.disabled) return
  const files = [...(e.dataTransfer?.files || [])]
  if (files.length) emit('add', files)
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2" role="group" aria-label="Ảnh, video đưa vào bài">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span class="text-[13px] font-medium leading-[18px] text-[var(--mds-text)]">Ảnh, video đưa vào bài (tuỳ chọn)</span>
      <span v-if="summary" class="text-[12px] text-[var(--mds-text-secondary)]">{{ summary }}</span>
    </div>
    <div
      class="flex flex-col gap-3 rounded-lg border border-dashed p-3"
      :class="dragging ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] bg-[var(--mds-bg-page)]'"
      @dragover.prevent="dragging = !disabled"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <ul v-if="items.length" class="grid gap-2" :class="touch ? 'grid-cols-2' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5'">
        <li v-for="m in items" :key="m.id" class="flex min-w-0 flex-col gap-1">
          <div class="relative aspect-video overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)]">
            <img v-if="m.url" :src="m.url" alt="" class="h-full w-full object-cover" />
            <div v-else class="grid h-full w-full place-items-center text-[var(--mds-text-secondary)]"><MIcon name="video" :size="24" /></div>
            <span v-if="m.kind === 'video'" class="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <MIcon name="play" :size="12" />Video
            </span>
            <button
              type="button"
              class="absolute right-1 top-1 grid place-items-center rounded-full bg-black/55 text-white hover:bg-[var(--mds-danger)] disabled:opacity-40"
              :class="touch ? 'h-11 w-11' : 'h-8 w-8'"
              :disabled="disabled"
              :aria-label="`Bỏ ${m.file.name}`"
              @click="emit('remove', m.id)"
            >
              <MIcon name="x" :size="16" />
            </button>
          </div>
          <span class="truncate text-[12px] text-[var(--mds-text-secondary)]" :title="m.file.name">{{ m.file.name }}</span>
        </li>
      </ul>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MButton variant="outline" :size="touch ? 'lg' : 'md'" :class="touch ? 'w-full' : ''" :disabled="disabled || items.length >= max" @click="input?.click()">
          <template #icon><MSpinner v-if="busy" :size="16" /><MIcon v-else name="upload" :size="16" /></template>
          {{ busy ? 'Đang xử lý…' : 'Thêm ảnh, video' }}
        </MButton>
        <span v-if="!touch" class="text-[12px] text-[var(--mds-text-secondary)]">hoặc kéo-thả vào đây · tối đa {{ max }} tệp</span>
      </div>
      <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">
        Nội dung bạn nhập là cơ sở để AI viết bài; ảnh, video ở đây chắc chắn được đưa vào bài — AI tự đặt vào trang hợp nội dung
        (ảnh infographic/sơ đồ hiển thị trọn khung). Ảnh ≤ 15 MB (cả HEIC), video MP4/MOV/WebM ≤ 150 MB.
      </p>
    </div>
    <p v-if="error" class="text-[12px] text-[var(--mds-danger)]" role="alert">{{ error }}</p>
    <input ref="input" type="file" :accept="accept" multiple class="hidden" @change="onPick" />
  </div>
</template>
