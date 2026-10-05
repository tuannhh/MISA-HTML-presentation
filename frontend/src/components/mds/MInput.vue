<script setup>
import { computed, useAttrs, ref } from 'vue'

// [MISA Presentation] Chuyển attr (autocomplete, inputmode, aria-*, id, name…) xuống control gốc thay vì div bọc
// để label/trình đọc màn hình và trình quản lý mật khẩu hoạt động. class/style vẫn ở phần tử gốc.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const controlAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})
import MIcon from './MIcon.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' }, // text | password | number | email...
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  error: { type: String, default: '' }, // có giá trị → viền danger + message đỏ dưới input
  clearable: { type: Boolean, default: false }, // hiện nút × khi có giá trị
})

const emit = defineEmits(['update:modelValue', 'change', 'focus', 'blur', 'clear'])

const inputRef = ref(null)
// Toggle hiển thị mật khẩu (chỉ áp dụng khi type="password")
const showPassword = ref(false)

const isPassword = computed(() => props.type === 'password')
// Type thực tế của input: password đang "mở mắt" thì chuyển sang text
const actualType = computed(() =>
  isPassword.value && showPassword.value ? 'text' : props.type
)

const hasValue = computed(
  () => props.modelValue !== '' && props.modelValue !== null && props.modelValue !== undefined
)
const showClear = computed(
  () => props.clearable && hasValue.value && !props.disabled && !props.readonly
)

function onInput(e) {
  let val = e.target.value
  // Type number: emit dạng số để v-model nhận đúng kiểu dữ liệu
  if (props.type === 'number' && val !== '') val = Number(val)
  emit('update:modelValue', val)
}

function onFocus(e) {
  // Hành vi MDS bắt buộc: focus vào ô nhập liệu tự bôi đen (select-all)
  // toàn bộ nội dung để sửa giá trị nhanh hơn
  e.target.select()
  emit('focus', e)
}

function onBlur(e) {
  emit('blur', e)
}

function onChange(e) {
  emit('change', e)
}

function clear() {
  emit('update:modelValue', '')
  emit('clear')
  // Đưa focus lại input sau khi xóa để nhập tiếp ngay
  inputRef.value?.focus()
}
</script>

<template>
  <div class="w-full" :class="attrs.class" :style="attrs.style">
    <div
      class="flex h-[var(--mds-input-height)] w-full items-center gap-2 rounded-lg border bg-[var(--mds-bg)] px-3 transition-colors"
      :class="[
        error
          ? 'border-[var(--mds-danger)]'
          : 'border-[var(--mds-border)]',
        disabled
          ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)]'
          : !readonly && !error
            ? 'hover:border-[var(--mds-brand-600)] focus-within:border-[var(--mds-brand-600)] focus-within:shadow-[0_0_0_3px_rgba(4,153,228,0.12)]'
            : '',
      ]"
    >
      <!-- Slot prefix: icon 16px bên trái -->
      <span
        v-if="$slots.prefix"
        class="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--mds-icon-neutral)] [&>svg]:h-4 [&>svg]:w-4"
      >
        <slot name="prefix" />
      </span>

      <input
        v-bind="controlAttrs"
        ref="inputRef"
        :type="actualType"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        class="h-full w-full min-w-0 flex-1 bg-transparent text-[13px] leading-[18px] text-[var(--mds-text)] outline-none placeholder:text-[var(--mds-text-placeholder)]"
        :class="disabled ? 'cursor-not-allowed' : ''"
        @input="onInput"
        @change="onChange"
        @focus="onFocus"
        @blur="onBlur"
      />

      <!-- Nút × xóa nhanh nội dung (clearable) -->
      <button
        v-if="showClear"
        type="button"
        tabindex="-1"
        aria-label="Xóa nội dung"
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:text-[var(--mds-text)]"
        @mousedown.prevent
        @click="clear"
      >
        <MIcon name="x" :size="12" />
      </button>

      <!-- Nút mắt toggle hiển thị mật khẩu (chỉ với type=password) -->
      <button
        v-if="isPassword && !disabled"
        type="button"
        tabindex="-1"
        :aria-label="showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
        class="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--mds-icon-neutral)] hover:text-[var(--mds-text)]"
        @mousedown.prevent
        @click="showPassword = !showPassword"
      >
        <!-- eye: đang ẩn mật khẩu, bấm để hiện -->
        <MIcon v-if="!showPassword" name="eye" :size="16" />
        <!-- eye-off: đang hiện mật khẩu, bấm để ẩn -->
        <MIcon v-else name="eye-off" :size="16" />
      </button>

      <!-- Slot suffix: icon 16px bên phải -->
      <span
        v-if="$slots.suffix"
        class="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--mds-icon-neutral)] [&>svg]:h-4 [&>svg]:w-4"
      >
        <slot name="suffix" />
      </span>
    </div>

    <!-- Message lỗi đỏ 12px dưới input -->
    <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
      {{ error }}
    </p>
  </div>
</template>
