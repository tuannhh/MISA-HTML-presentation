<script setup>
import { ref } from 'vue'

const props = defineProps({
  // Key của tab đang chọn (v-model)
  modelValue: { type: [String, Number], default: null },
  // Mảng tab: [{ key, label, disabled? }]
  tabs: { type: Array, required: true },
  // 'underline': gạch chân brand dưới tab active (điều hướng nội dung chính)
  // 'pill': tab active nền brand nhạt, chữ brand, bo tròn full (bộ lọc/segmented thứ cấp)
  variant: {
    type: String,
    default: 'underline',
    validator: (v) => ['underline', 'pill'].includes(v),
  },
})

const emit = defineEmits(['update:modelValue', 'change'])

const tabRefs = ref([])

function select(tab) {
  if (tab.disabled || tab.key === props.modelValue) return
  emit('update:modelValue', tab.key)
  emit('change', tab.key)
}

// MDS: điều khiển bàn phím ← → di chuyển giữa các tab (bỏ qua tab disabled),
// Home/End nhảy về đầu/cuối. Roving tabindex: chỉ tab active nhận Tab focus.
function onKeydown(e, index) {
  const enabled = props.tabs
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.disabled)
  if (!enabled.length) return

  const pos = enabled.findIndex(({ i }) => i === index)
  let next = null
  if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length]
  else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length]
  else if (e.key === 'Home') next = enabled[0]
  else if (e.key === 'End') next = enabled[enabled.length - 1]
  if (!next) return

  e.preventDefault()
  select(next.t)
  tabRefs.value[next.i]?.focus()
}
</script>

<template>
  <div>
    <!-- Tab bar -->
    <div
      role="tablist"
      class="flex items-center"
      :class="variant === 'underline' ? 'gap-1 border-b border-[var(--mds-border)]' : 'gap-1.5'"
    >
      <button
        v-for="(tab, index) in tabs"
        :key="tab.key"
        :ref="(el) => (tabRefs[index] = el)"
        type="button"
        role="tab"
        :aria-selected="tab.key === modelValue"
        :tabindex="tab.key === modelValue ? 0 : -1"
        :disabled="tab.disabled"
        class="relative whitespace-nowrap text-[13px] font-medium leading-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
        :class="[
          variant === 'underline'
            ? '-mb-px px-3 py-2'
            : 'rounded-full px-3 py-1.5',
          tab.disabled
            ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
            : tab.key === modelValue
              ? variant === 'underline'
                ? 'font-semibold text-[var(--mds-brand-600)]'
                : 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]'
              : 'text-[var(--mds-text)] hover:text-[var(--mds-brand-600)]',
        ]"
        @click="select(tab)"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
        <!-- Selected indicator: gạch dưới brand-600, rộng đúng bằng tab item -->
        <span
          v-if="variant === 'underline' && tab.key === modelValue"
          class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--mds-brand-600)]"
          aria-hidden="true"
        />
      </button>
    </div>

    <!-- Nội dung — dùng cùng v-model bên ngoài để đổi nội dung theo tab -->
    <div role="tabpanel">
      <slot />
    </div>
  </div>
</template>
