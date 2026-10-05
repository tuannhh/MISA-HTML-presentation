<script setup>
// Khung trang xác thực desktop: nền xám, card trắng 440px ở giữa.
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--mds-bg-page)] px-4 py-10">
    <div class="flex items-center gap-3">
      <img src="/favicon.svg" alt="" class="h-10 w-10" />
      <span class="text-[20px] font-semibold leading-7 text-[var(--mds-text)]">MISA Presentation</span>
    </div>
    <div class="w-full max-w-[440px] rounded-lg bg-[var(--mds-bg)] p-8 shadow-[var(--mds-shadow-card)]">
      <h1 class="text-[20px] font-semibold leading-7 text-[var(--mds-text)]">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-[14px] leading-5 text-[var(--mds-text-secondary)]">{{ subtitle }}</p>
      <div class="mt-6"><slot /></div>
    </div>
    <slot name="below" />
  </div>
</template>
