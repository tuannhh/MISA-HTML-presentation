<script setup>
import { computed } from 'vue'
import MIcon from './MIcon.vue'

// MTag — nhãn (tag) kiểu soft chuẩn MDS: nền nhạt + chữ đậm cùng tông
const props = defineProps({
  color: {
    type: String,
    default: 'neutral',
    validator: (v) => ['brand', 'success', 'warning', 'danger', 'neutral', 'info'].includes(v),
  },
  size: {
    type: String,
    default: 'md', // 'sm' 20px | 'md' 24px
    validator: (v) => ['sm', 'md'].includes(v),
  },
  closable: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

// Nền nhạt tạo từ chính token màu (color-mix 12% trên nền trong suốt) — không hard-code hex
const colorClasses = computed(() => {
  switch (props.color) {
    case 'brand':
      return 'bg-[var(--mds-brand-100)] text-[var(--mds-brand-700)]'
    case 'success':
      return 'bg-[var(--mds-success-soft)] text-[var(--mds-success)]'
    case 'warning':
      return 'bg-[var(--mds-warning-soft)] text-[var(--mds-warning)]'
    case 'danger':
      return 'bg-[var(--mds-danger-soft)] text-[var(--mds-danger)]'
    case 'info':
      return 'bg-[var(--mds-info-soft)] text-[var(--mds-info)]'
    default: // neutral
      return 'bg-[var(--mds-bg-disabled)] text-[var(--mds-text)]'
  }
})

const sizeClasses = computed(() => (props.size === 'sm' ? 'h-5' : 'h-6'))
</script>

<template>
  <span
    class="mds-tag inline-flex max-w-full min-w-0 select-none items-center gap-1 whitespace-nowrap rounded px-2 text-[12px] font-medium leading-none"
    :class="[colorClasses, sizeClasses]"
  >
    <span class="min-w-0 truncate"><slot /></span>
    <!-- Nút đóng: icon x.svg 12px, emit 'close' để cha tự xóa tag -->
    <button
      v-if="closable"
      type="button"
      class="-mr-1 inline-flex shrink-0 items-center justify-center rounded hover:bg-[color-mix(in_srgb,currentColor_15%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      aria-label="Đóng"
      @click="emit('close')"
    >
      <MIcon name="x" :size="12" />
    </button>
  </span>
</template>
