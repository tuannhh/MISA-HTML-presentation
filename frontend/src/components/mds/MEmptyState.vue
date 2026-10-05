<script setup>
defineProps({
  // 'initial': chưa từng có dữ liệu (MDS: chỉ hiện Thêm mới/Nhập khẩu, không hiện
  //            tìm kiếm/lọc/data table) | 'no-result': đã có dữ liệu nhưng đã xóa
  //            hết hoặc lọc/tìm kiếm không ra kết quả
  type: {
    type: String,
    default: 'initial',
    validator: (v) => ['initial', 'no-result'].includes(v),
  },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
})

// Icon minh họa theo trạng thái: database (initial) / search (no-result)
// — path từ assets/icons/, stroke 1.5
const icons = {
  initial: [
    'M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0',
    'M4 6v6a8 3 0 0 0 16 0v-6',
    'M4 12v6a8 3 0 0 0 16 0v-6',
  ],
  'no-result': ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
}
</script>

<template>
  <!-- MDS Empty State: căn giữa, top alignment, padding-top 120px cho thoáng -->
  <div class="flex flex-col items-center px-6 pt-[120px] pb-10 text-center">
    <!-- Illustration 48px màu placeholder — cách title 16px theo spec -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="mb-4 text-[var(--mds-text-placeholder)]"
      aria-hidden="true"
    >
      <path v-for="(d, i) in icons[type]" :key="i" :d="d" />
    </svg>

    <!-- Title 13px semibold -->
    <p v-if="title" class="text-[13px] font-semibold leading-[18px] text-[var(--mds-text)]">
      {{ title }}
    </p>

    <!-- Description 13px màu placeholder — cách title 4px theo spec -->
    <p
      v-if="description"
      class="mt-1 max-w-[360px] text-[13px] leading-[18px] text-[var(--mds-text-placeholder)]"
    >
      {{ description }}
    </p>

    <!-- CTA — cách description 24px theo spec. Trạng thái initial thường có
         nút "Thêm mới" / "Nhập khẩu" (MDS) -->
    <div v-if="$slots.actions" class="mt-6 flex items-center justify-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
