<script setup>
// Chọn tỷ lệ khung slide: radio gốc (bàn phím/trình đọc màn hình) + hình minh hoạ đúng tỷ lệ.
import { RATIO_OPTIONS, ratioCss } from '@/lib/format.js'

defineProps({
  modelValue: { type: String, default: '16:9' },
  name: { type: String, default: 'ratio' },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div role="radiogroup" class="grid gap-2" :class="compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'">
    <label
      v-for="o in RATIO_OPTIONS"
      :key="o.value"
      class="flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
      :class="modelValue === o.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
    >
      <input type="radio" class="sr-only" :name="name" :value="o.value" :checked="modelValue === o.value" @change="emit('update:modelValue', o.value)" />
      <span class="flex h-10 w-full items-center justify-center" aria-hidden="true">
        <span
          class="block max-h-full max-w-[72px] rounded-[3px] border-2"
          :class="modelValue === o.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-100)]' : 'border-[var(--mds-icon-neutral)]'"
          :style="{ aspectRatio: ratioCss(o.value), width: '100%' }"
        />
      </span>
      <span class="text-[13px] font-semibold leading-[18px] text-[var(--mds-text)]">{{ o.value }}</span>
      <span class="w-full truncate text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ o.label.split('— ')[1] }}</span>
    </label>
  </div>
</template>
