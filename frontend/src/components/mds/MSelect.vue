<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MIcon from './MIcon.vue'

/**
 * MSelect — DropDownList chuẩn MDS 2.0.
 * Chỉ chọn từ danh sách, KHÔNG gõ tìm. Dùng cho 4–8 lựa chọn
 * (ít hơn → Radio, nhiều hơn → MCombobox).
 */
const props = defineProps({
  modelValue: { type: [String, Number, Boolean, Object], default: null },
  options: { type: Array, default: () => [] }, // [{ label, value, disabled? }]
  placeholder: { type: String, default: 'Chọn giá trị' },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' }, // có giá trị → viền danger + message đỏ dưới control
})

const emit = defineEmits(['update:modelValue', 'change', 'focus', 'blur'])

const open = ref(false)
const triggerRef = ref(null)
const popoverRef = ref(null)
const activeIndex = ref(-1) // index item đang "sáng" khi điều hướng bằng bàn phím
const popoverStyle = ref({})

const selectedOption = computed(() =>
  props.options.find((o) => o.value === props.modelValue)
)

/* ── Định vị popover (teleport ra body) ─────────────────────────
   Quy tắc MDS: min-width popover bằng trigger, mở rộng theo nội dung
   dài để đọc đủ thông tin. Tính theo getBoundingClientRect + position
   fixed; tự lật lên trên khi không đủ chỗ bên dưới. */
function updatePosition() {
  const trigger = triggerRef.value
  const pop = popoverRef.value
  if (!trigger || !pop) return
  const rect = trigger.getBoundingClientRect()
  const gap = 4
  const popH = pop.offsetHeight
  const popW = pop.offsetWidth
  const spaceBelow = window.innerHeight - rect.bottom
  // Lật lên trên khi bên dưới không đủ chỗ mà bên trên đủ
  const openUp = spaceBelow < popH + gap && rect.top > popH + gap
  // Không cho popover tràn khỏi mép phải màn hình khi nội dung dài
  let left = rect.left
  if (left + popW > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - 8 - popW)
  }
  popoverStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: openUp ? `${rect.top - popH - gap}px` : `${rect.bottom + gap}px`,
    minWidth: `${rect.width}px`,
  }
}

function scrollActiveIntoView() {
  const el = popoverRef.value?.querySelector('[data-active="true"]')
  el?.scrollIntoView({ block: 'nearest' })
}

/* ── Mở / đóng ──────────────────────────────────────────────── */
function openPopover() {
  if (props.disabled || open.value) return
  open.value = true
  // Đặt con trỏ bàn phím vào item đang chọn (hoặc item khả dụng đầu tiên)
  let idx = props.options.findIndex(
    (o) => o.value === props.modelValue && !o.disabled
  )
  if (idx < 0) idx = props.options.findIndex((o) => !o.disabled)
  activeIndex.value = idx
  nextTick(() => {
    updatePosition()
    scrollActiveIntoView()
  })
}

function closePopover() {
  open.value = false
  activeIndex.value = -1
}

function toggle() {
  open.value ? closePopover() : openPopover()
}

function selectOption(opt) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  closePopover()
  // Trả focus về trigger để tiếp tục thao tác bàn phím
  triggerRef.value?.focus()
}

/* ── Bàn phím (spec DropDownList): ↑↓ di chuyển, Enter submit,
     Esc đóng; mở bằng Enter/Space/↑↓ khi đang đóng ─────────── */
function moveActive(dir) {
  const opts = props.options
  if (!opts.length) return
  let i = activeIndex.value
  // Bỏ qua các item disabled, xoay vòng đầu↔cuối
  for (let n = 0; n < opts.length; n++) {
    i = (i + dir + opts.length) % opts.length
    if (!opts[i].disabled) {
      activeIndex.value = i
      break
    }
  }
  nextTick(scrollActiveIntoView)
}

function onKeydown(e) {
  if (props.disabled) return
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      openPopover()
    }
    return
  }
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveActive(-1)
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (activeIndex.value >= 0) selectOption(props.options[activeIndex.value])
      break
    case 'Escape':
      e.preventDefault()
      closePopover()
      break
    case 'Tab':
      // Tab rời control thì đóng popover, không chặn Tab
      closePopover()
      break
  }
}

/* ── Click ngoài đóng + bám theo trigger khi scroll/resize ──── */
function onDocMousedown(e) {
  if (
    !triggerRef.value?.contains(e.target) &&
    !popoverRef.value?.contains(e.target)
  ) {
    closePopover()
  }
}

function onReposition() {
  if (open.value) updatePosition()
}

watch(open, (val) => {
  if (val) {
    document.addEventListener('mousedown', onDocMousedown)
    // capture=true để bắt cả scroll của container cha (không chỉ window)
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  } else {
    document.removeEventListener('mousedown', onDocMousedown)
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})
</script>

<template>
  <div class="w-full">
    <!-- Trigger: giống input 32px, chevron xoay khi mở -->
    <button
      ref="triggerRef"
      type="button"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="disabled"
      class="flex h-[var(--mds-input-height)] w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-[13px] leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      :class="[
        error ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]',
        disabled
          ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)]'
          : 'cursor-pointer bg-[var(--mds-bg)]' +
            (!error ? ' hover:border-[var(--mds-brand-600)]' : ''),
      ]"
      @click="toggle"
      @keydown="onKeydown"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
    >
      <!-- Chưa chọn → hiện placeholder gợi ý (mờ) theo khuyến nghị MDS -->
      <span
        class="truncate"
        :class="
          selectedOption && !disabled
            ? 'text-[var(--mds-text)]'
            : 'text-[var(--mds-text-placeholder)]'
        "
      >
        {{ selectedOption ? selectedOption.label : placeholder }}
      </span>
      <MIcon
        name="chevron-down"
        :size="16"
        class="text-[var(--mds-icon-neutral)] transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <!-- Popover teleport ra body, radius 4px theo spec popup -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        role="listbox"
        :style="popoverStyle"
        class="z-[1000] max-h-[264px] w-max max-w-[min(480px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
      >
        <!-- Empty state trong popover -->
        <div
          v-if="!options.length"
          class="px-3 py-2 text-[13px] leading-[18px] text-[var(--mds-text-placeholder)]"
        >
          Không có dữ liệu
        </div>

        <div
          v-for="(opt, i) in options"
          :key="opt.value"
          role="option"
          :aria-selected="opt.value === modelValue"
          :aria-disabled="opt.disabled || undefined"
          :data-active="i === activeIndex"
          class="flex h-8 items-center gap-2 whitespace-nowrap px-3 text-[13px] leading-[18px]"
          :class="[
            opt.disabled
              ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
              : 'cursor-pointer',
            !opt.disabled && i === activeIndex
              ? 'bg-[var(--mds-bg-hover-soft)]'
              : '',
            // Item đang chọn: chữ Brand + icon check cuối dòng (KHÔNG checkbox đầu dòng)
            opt.value === modelValue && !opt.disabled
              ? 'font-medium text-[var(--mds-brand-600)]'
              : !opt.disabled
                ? 'text-[var(--mds-text)]'
                : '',
          ]"
          @mouseenter="!opt.disabled && (activeIndex = i)"
          @click="selectOption(opt)"
        >
          <span class="flex-1">{{ opt.label }}</span>
          <MIcon
            v-if="opt.value === modelValue"
            name="check"
            :size="16"
            class="text-[var(--mds-brand-600)]"
          />
        </div>
      </div>
    </Teleport>

    <!-- Message lỗi đỏ 12px dưới control -->
    <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
      {{ error }}
    </p>
  </div>
</template>
