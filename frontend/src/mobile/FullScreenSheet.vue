<script setup>
// Màn con toàn màn hình (mobile) mở chồng trong cùng route: thanh trên có nút quay lại + tiêu đề, nội dung cuộn, chân tuỳ chọn.
// Dùng cho: đổi/chỉnh sửa ảnh, chọn video, chèn trang, thuộc tính phần tử trang tự do. Esc / nút quay lại để đóng.
import { watch, onBeforeUnmount } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const close = () => emit('update:modelValue', false)
const onKey = (e) => e.key === 'Escape' && close()
watch(
  () => props.modelValue,
  (open) => {
    if (open) document.addEventListener('keydown', onKey)
    else document.removeEventListener('keydown', onKey)
    document.body.style.overflow = open ? 'hidden' : ''
  },
)
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="mds-mobile-app fixed inset-0 z-[1000] flex flex-col bg-[var(--mds-bg)]" role="dialog" aria-modal="true" :aria-label="title">
      <div class="flex min-h-14 shrink-0 items-center gap-1 border-b border-[var(--mds-border-light)] px-1" :style="{ paddingTop: 'var(--mds-mobile-safe-top, 0px)' }">
        <MButton variant="icon" aria-label="Quay lại" @click="close"><template #icon><MIcon name="arrow-left" :size="24" /></template></MButton>
        <h2 class="min-w-0 flex-1 truncate text-[17px] font-semibold">{{ title }}</h2>
        <slot name="actions" />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <slot />
      </div>
      <div v-if="$slots.footer" class="shrink-0 border-t border-[var(--mds-border-light)] px-4 pt-3" :style="{ paddingBottom: 'calc(12px + var(--mds-mobile-safe-bottom, 0px))' }">
        <slot name="footer" />
      </div>
    </div>
  </Teleport>
</template>
