<script setup>
import { computed } from 'vue'

// MProgress — thanh tiến trình xác định; theo MDS dùng cho tác vụ dài >5s
// (tác vụ ngắn dùng MSpinner)
const props = defineProps({
  value: { type: Number, default: 0 }, // 0–100
  label: { type: String, default: '' }, // hiển thị % bên phải khi có
})

// Kẹp giá trị trong khoảng 0–100 để width luôn hợp lệ
const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
</script>

<template>
  <div class="flex w-full items-center gap-2">
    <div
      class="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--mds-bg-disabled)]"
      role="progressbar"
      :aria-valuenow="clamped"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <!-- Fill brand, transition width cho cảm giác tiến trình mượt -->
      <div
        class="h-full rounded-full bg-[var(--mds-brand-600)] transition-[width] duration-300 ease-out"
        :style="{ width: clamped + '%' }"
      />
    </div>
    <span
      v-if="label"
      class="shrink-0 text-[12px] leading-[18px] text-[var(--mds-text)]"
    >
      {{ label }}
    </span>
  </div>
</template>
