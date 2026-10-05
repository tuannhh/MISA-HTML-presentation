<script setup>
const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: undefined },
  // options: mảng { label, value, disabled? }
  options: { type: Array, default: () => [] },
  direction: {
    type: String,
    default: 'horizontal', // 'horizontal' | 'vertical'
    validator: (v) => ['horizontal', 'vertical'].includes(v),
  },
  disabled: { type: Boolean, default: false }, // disable cả nhóm
})

const emit = defineEmits(['update:modelValue', 'change'])

// name chung để trình duyệt gom nhóm radio (điều hướng bàn phím ←→ đúng chuẩn)
const groupName = `m-radio-${Math.random().toString(36).slice(2, 9)}`

function isDisabled(opt) {
  return props.disabled || !!opt.disabled
}

function select(opt, e) {
  if (isDisabled(opt)) return
  // Radio: chỉ chọn duy nhất 1 giá trị trong nhóm
  if (opt.value !== props.modelValue) {
    emit('update:modelValue', opt.value)
    emit('change', opt.value, e)
  }
}
</script>

<template>
  <div
    role="radiogroup"
    class="flex"
    :class="direction === 'vertical' ? 'flex-col gap-2' : 'flex-row flex-wrap gap-x-4 gap-y-2'"
  >
    <label
      v-for="opt in options"
      :key="opt.value"
      class="inline-flex items-center gap-2"
      :class="isDisabled(opt) ? 'cursor-not-allowed' : 'cursor-pointer'"
    >
      <!-- Input thật ẩn đi để giữ accessibility + điều khiển bàn phím -->
      <input
        type="radio"
        class="sr-only"
        :name="groupName"
        :value="opt.value"
        :checked="opt.value === modelValue"
        :disabled="isDisabled(opt)"
        @change="select(opt, $event)"
      />

      <!-- Chấm tròn 16px: checked = viền brand-600 + chấm giữa brand-600 -->
      <span
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
        :class="[
          opt.value === modelValue
            ? isDisabled(opt)
              ? 'border-[var(--mds-border)] bg-[var(--mds-bg-disabled)]'
              : 'border-[var(--mds-brand-600)] bg-[var(--mds-bg)]'
            : isDisabled(opt)
              ? 'border-[var(--mds-border)] bg-[var(--mds-bg-disabled)]'
              : 'border-[var(--mds-border)] bg-[var(--mds-bg)] hover:border-[var(--mds-brand-600)]',
        ]"
      >
        <span
          v-if="opt.value === modelValue"
          class="h-2 w-2 rounded-full"
          :class="isDisabled(opt) ? 'bg-[var(--mds-text-placeholder)]' : 'bg-[var(--mds-brand-600)]'"
        />
      </span>

      <!-- Label 13px, click được -->
      <span
        class="select-none text-[13px] leading-[18px]"
        :class="isDisabled(opt) ? 'text-[var(--mds-text-placeholder)]' : 'text-[var(--mds-text)]'"
      >
        {{ opt.label }}
      </span>
    </label>
  </div>
</template>
