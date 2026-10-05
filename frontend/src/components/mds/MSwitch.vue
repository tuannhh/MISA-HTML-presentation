<script setup>
/**
 * MSwitch — toggle 36×20px, bật = nền success. Dùng ở form footer chứng từ
 * ("Hiển thị tài khoản" — popup-form.md mục 5) và các nơi cần bật/tắt nhanh.
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <label class="inline-flex select-none items-center gap-2" :class="disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'">
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="relative flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      :class="modelValue ? 'border-transparent bg-[var(--mds-success)]' : 'border-[var(--mds-border)] bg-[var(--mds-bg-disabled)]'"
      @click="toggle"
    >
      <span
        class="absolute h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        :class="modelValue ? 'translate-x-[18px]' : 'translate-x-0.5'"
      />
    </button>
    <span v-if="label" class="text-[13px] leading-[18px]">{{ label }}</span>
  </label>
</template>
