<script setup>
// Thanh trượt có nhãn + giá trị (MDS 2.0 chưa có Slider): input range gốc của trình duyệt — dùng được bằng bàn phím/trình đọc
// màn hình, tô màu brand qua accent-color. Bấm đúp vào thanh để về giá trị mặc định.
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  label: { type: String, required: true },
  min: { type: Number, default: -100 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  reset: { type: Number, default: 0 },
  format: { type: Function, default: (v) => (v > 0 ? `+${v}` : String(v)) },
  icon: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const set = (v) => emit('update:modelValue', Math.min(props.max, Math.max(props.min, Number(v))))
</script>

<template>
  <label class="flex flex-col gap-1">
    <span class="flex items-center justify-between text-[13px] leading-[18px]">
      <span class="flex items-center gap-1 text-[var(--mds-text)]"><slot name="icon" />{{ label }}</span>
      <span class="tabular-nums text-[var(--mds-text-secondary)]">{{ format(modelValue) }}</span>
    </span>
    <input
      type="range"
      class="h-6 w-full cursor-pointer accent-[var(--mds-brand-600)]"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :aria-label="label"
      @input="set($event.target.value)"
      @dblclick="set(reset)"
    />
  </label>
</template>
