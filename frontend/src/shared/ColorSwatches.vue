<script setup>
// Chọn màu theo bảng màu của bài (token đổi theo chủ đề) + màu tự chọn #RRGGBB.
// colors: { token: '#hex xem trước' } — thứ tự hiển thị theo IMG_COLORS.
import { computed } from 'vue'
import { IMG_COLORS } from '@shared/deck/imgstyle.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  compact: { type: Boolean, default: false },
  label: { type: String, default: 'Màu' },
})
const emit = defineEmits(['update:modelValue'])

const HEX = /^#[0-9a-f]{6}$/i
const items = computed(() => Object.entries(IMG_COLORS).map(([k, v]) => ({ key: k, label: v.label, hex: props.colors[k] || '#888888' })))
const custom = computed(() => (HEX.test(props.modelValue) ? props.modelValue : ''))
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" role="radiogroup" :aria-label="label">
    <button
      v-for="c in items"
      :key="c.key"
      type="button"
      role="radio"
      class="grid place-items-center rounded-full border-2"
      :class="[compact ? 'h-10 w-10' : 'h-7 w-7', modelValue === c.key ? 'border-[var(--mds-brand-600)]' : 'border-transparent hover:border-[var(--mds-border)]']"
      :aria-checked="modelValue === c.key"
      :aria-label="c.label"
      :title="c.label"
      @click="emit('update:modelValue', c.key)"
    >
      <span class="block rounded-full ring-1 ring-black/15" :class="compact ? 'h-7 w-7' : 'h-5 w-5'" :style="{ background: c.hex }" />
    </button>
    <label
      class="relative grid cursor-pointer place-items-center rounded-full border-2"
      :class="[compact ? 'h-10 w-10' : 'h-7 w-7', custom ? 'border-[var(--mds-brand-600)]' : 'border-transparent hover:border-[var(--mds-border)]']"
      title="Màu khác…"
    >
      <span
        class="block rounded-full ring-1 ring-black/15"
        :class="compact ? 'h-7 w-7' : 'h-5 w-5'"
        :style="{ background: custom || 'conic-gradient(#f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)' }"
      />
      <input type="color" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" :value="custom || '#2563eb'" aria-label="Màu khác" @input="(e) => emit('update:modelValue', e.target.value.toLowerCase())" />
    </label>
  </div>
</template>
