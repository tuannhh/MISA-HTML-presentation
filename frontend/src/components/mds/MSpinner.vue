<script setup>
// MSpinner — vòng xoay loading; stroke currentColor nên tự ăn màu chữ nơi đặt:
// trong nút primary sẽ trắng, đứng riêng đặt class text-[var(--mds-brand-600)]
defineProps({
  size: { type: Number, default: 16 }, // kích thước px
})
</script>

<template>
  <svg
    class="animate-spin shrink-0"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    role="status"
    aria-label="Đang tải"
  >
    <!-- Vòng mờ làm nền + cung đậm quay -->
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.2" />
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-dasharray="42"
      stroke-dashoffset="28"
    />
  </svg>
</template>
