<script setup>
// Chọn tông nền bài trình bày (Tối/Sáng): radio gốc (bàn phím/trình đọc màn hình) + slide thu nhỏ minh hoạ màu.
// AI chỉ chọn theme trong tông đã chọn; theme sáng dùng chữ/hình đậm tương phản cao (xem shared/deck/theme.css).
import { TONE_OPTIONS } from '@/lib/format.js'

defineProps({
  modelValue: { type: String, default: 'dark' },
  name: { type: String, default: 'tone' },
  // compact (mobile): xếp dọc hình minh hoạ + nhãn để không bị chật ở bề ngang hẹp.
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div role="radiogroup" class="grid grid-cols-2 gap-2">
    <label
      v-for="o in TONE_OPTIONS"
      :key="o.value"
      class="flex min-w-0 cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
      :class="[
        compact ? 'flex-col items-center text-center' : 'items-center',
        modelValue === o.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]',
      ]"
    >
      <input type="radio" class="sr-only" :name="name" :value="o.value" :checked="modelValue === o.value" @change="emit('update:modelValue', o.value)" />
      <!-- Slide thu nhỏ: tiêu đề (màu chữ), cụm nhấn, 2 thẻ màu nhấn -->
      <span
        class="flex aspect-[16/9] w-[72px] shrink-0 flex-col justify-center gap-[3px] rounded-[4px] border border-[var(--mds-border)] px-2"
        :style="{ background: o.swatch.bg }"
        aria-hidden="true"
      >
        <span class="flex gap-[3px]">
          <span class="block h-[4px] w-6 rounded-full" :style="{ background: o.swatch.ink }" />
          <span class="block h-[4px] w-3 rounded-full" :style="{ background: o.swatch.accents[0] }" />
        </span>
        <span class="block h-[3px] w-8 rounded-full opacity-70" :style="{ background: o.swatch.ink }" />
        <span class="mt-[2px] flex gap-[3px]">
          <span v-for="c in o.swatch.accents" :key="c" class="block h-[8px] w-[14px] rounded-[2px]" :style="{ background: c }" />
        </span>
      </span>
      <span class="flex min-w-0 flex-col" :class="compact ? 'items-center' : ''">
        <span class="text-[13px] font-semibold leading-[18px] text-[var(--mds-text)]">{{ o.label }}</span>
        <span class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ o.desc }}</span>
      </span>
    </label>
  </div>
</template>
