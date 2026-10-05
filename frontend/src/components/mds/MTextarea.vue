<script setup>
import { computed, useAttrs } from 'vue'

// [MISA Presentation] Chuyển attr (autocomplete, inputmode, aria-*, id, name…) xuống control gốc thay vì div bọc
// để label/trình đọc màn hình và trình quản lý mật khẩu hoạt động. class/style vẫn ở phần tử gốc.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const controlAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const props = defineProps({
  modelValue: { type: String, default: '' },
  rows: { type: Number, default: 3 },
  maxlength: { type: Number, default: null }, // có giá trị → hiện đếm ký tự realtime góc dưới phải
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' }, // có giá trị → viền danger + message đỏ dưới control
})

const emit = defineEmits(['update:modelValue', 'change', 'focus', 'blur'])

const length = computed(() => (props.modelValue || '').length)
// Theo MDS: đếm "real-time cho biết số ký tự còn được nhập"
const remaining = computed(() =>
  props.maxlength != null ? Math.max(props.maxlength - length.value, 0) : null
)

function onInput(e) {
  emit('update:modelValue', e.target.value)
}

function onFocus(e) {
  // Hành vi MDS bắt buộc: focus tự bôi đen (select-all) toàn bộ nội dung
  e.target.select()
  emit('focus', e)
}
</script>

<template>
  <div class="w-full" :class="attrs.class" :style="attrs.style">
    <div class="relative w-full">
      <textarea
        v-bind="controlAttrs"
        :value="modelValue"
        :rows="rows"
        :maxlength="maxlength ?? undefined"
        :placeholder="placeholder"
        :disabled="disabled"
        class="w-full resize-y rounded-lg border bg-[var(--mds-bg)] px-3 py-[7px] text-[13px] leading-[18px] text-[var(--mds-text)] outline-none transition-colors placeholder:text-[var(--mds-text-placeholder)]"
        :class="[
          error ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]',
          disabled
            ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)]'
            : !error
              ? 'hover:border-[var(--mds-brand-600)] focus:border-[var(--mds-brand-600)] focus:shadow-[0_0_0_2px_var(--mds-brand-100)]'
              : '',
          maxlength != null ? 'pb-5' : '',
        ]"
        @input="onInput"
        @change="emit('change', $event)"
        @focus="onFocus"
        @blur="emit('blur', $event)"
      />

      <!-- Đếm ký tự realtime góc dưới phải: "đã nhập / tối đa" (còn lại = remaining) -->
      <span
        v-if="maxlength != null"
        class="pointer-events-none absolute bottom-2 right-3 text-[12px] leading-4 text-[var(--mds-text-placeholder)]"
        :title="`Còn ${remaining} ký tự được nhập`"
      >
        {{ length }}/{{ maxlength }}
      </span>
    </div>

    <!-- Message lỗi đỏ 12px dưới control -->
    <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
      {{ error }}
    </p>
  </div>
</template>
