<script setup>
import { computed } from 'vue'

const props = defineProps({
  // Boolean khi dùng đơn lẻ; Array khi dùng theo nhóm (kèm prop value)
  modelValue: { type: [Boolean, Array], default: false },
  value: { type: [String, Number, Boolean, Object], default: undefined }, // giá trị của item khi modelValue là Array
  label: { type: String, default: '' },
  inputAriaLabel: { type: String, default: '' },
  // Trạng thái không xác định: dùng cho checkbox đầu danh sách khi các item
  // bên dưới có cái chọn, có cái không (theo spec MDS Checkbox)
  indeterminate: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const isArrayMode = computed(() => Array.isArray(props.modelValue))

const checked = computed(() =>
  isArrayMode.value ? props.modelValue.includes(props.value) : !!props.modelValue
)

function toggle(e) {
  if (props.disabled) return
  let next
  if (isArrayMode.value) {
    // Chế độ Array: thêm/bỏ value khỏi mảng
    next = checked.value
      ? props.modelValue.filter((v) => v !== props.value)
      : [...props.modelValue, props.value]
  } else {
    next = !checked.value
  }
  emit('update:modelValue', next)
  emit('change', next, e)
}
</script>

<template>
  <label
    class="inline-flex items-start gap-2"
    :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer'"
  >
    <!-- Input thật ẩn đi để giữ accessibility + điều khiển bàn phím -->
    <input
      type="checkbox"
      class="sr-only"
      :checked="checked"
      :disabled="disabled"
      :aria-checked="indeterminate ? 'mixed' : checked"
      :aria-label="inputAriaLabel || undefined"
      @change="toggle"
    />

    <!-- Ô checkbox 16px, radius 4px -->
    <span
      class="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
      :class="[
        checked || indeterminate
          ? disabled
            ? 'border-[var(--mds-bg-disabled)] bg-[var(--mds-bg-disabled)]'
            : 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-600)]'
          : [
              error ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]',
              disabled
                ? 'bg-[var(--mds-bg-disabled)]'
                : 'bg-[var(--mds-bg)] hover:border-[var(--mds-brand-600)]',
            ],
      ]"
    >
      <!-- Indeterminate: gạch ngang trắng (ưu tiên hơn checked) -->
      <svg
        v-if="indeterminate"
        viewBox="0 0 16 16"
        fill="none"
        class="h-3 w-3"
        :class="disabled ? 'text-[var(--mds-text-placeholder)]' : 'text-[var(--mds-bg)]'"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M3.5 8h9" />
      </svg>
      <!-- Checked: dấu check trắng -->
      <svg
        v-else-if="checked"
        viewBox="0 0 16 16"
        fill="none"
        class="h-3 w-3"
        :class="disabled ? 'text-[var(--mds-text-placeholder)]' : 'text-[var(--mds-bg)]'"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 8.5l3.2 3.2L13 5" />
      </svg>
    </span>

    <!-- Label 13px, click được (nằm trong thẻ label) -->
    <span
      v-if="label || $slots.default"
      class="select-none text-[13px] leading-[18px]"
      :class="disabled ? 'text-[var(--mds-text-placeholder)]' : 'text-[var(--mds-text)]'"
    >
      <slot>{{ label }}</slot>
    </span>
  </label>

  <!-- Message lỗi đỏ 12px dưới control -->
  <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
    {{ error }}
  </p>
</template>
