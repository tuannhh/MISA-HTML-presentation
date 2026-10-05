<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MIcon from './MIcon.vue'
import MSpinner from './MSpinner.vue'

/**
 * MCombobox — ComboBox chuẩn MDS 2.0 (gõ tìm + chọn).
 * Dùng cho danh sách > 8 lựa chọn / danh mục: bắt buộc AutoComplete
 * (gõ để lọc, bỏ dấu tiếng Việt) + hỗ trợ LoadOnDemand qua emit 'search'.
 * Hỗ trợ Single (v-model là giá trị) và Multiple (v-model là mảng).
 */
const props = defineProps({
  modelValue: { type: [String, Number, Boolean, Object, Array], default: null },
  options: { type: Array, default: () => [] }, // [{ label, value, disabled? }]
  multiple: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Chọn giá trị' },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' }, // có giá trị → viền danger + message đỏ dưới control
  loading: { type: Boolean, default: false }, // spinner khi đang LoadOnDemand từ server
  allowCreate: { type: Boolean, default: false }, // thêm nhanh danh mục ngay từ combo (spec MDS)
})

const emit = defineEmits([
  'update:modelValue',
  'change',
  'search',
  'create',
  'focus',
  'blur',
])

const open = ref(false)
const wrapperRef = ref(null)
const inputRef = ref(null)
const popoverRef = ref(null)
const popoverStyle = ref({})
const inputText = ref('') // text hiển thị trong input (label đã chọn hoặc từ khóa)
const hasTyped = ref(false) // chỉ lọc sau khi người dùng thật sự gõ (mở lần đầu hiện đủ list)
const activeIndex = ref(-1)
let searchTimer = null

/* ── Cache label theo value ─────────────────────────────────────
   Khi LoadOnDemand, options từ server thay đổi theo từ khóa → tag/giá trị
   đã chọn có thể không còn trong options. Cache lại label để luôn hiển
   thị đúng tên item đã chọn. */
const labelCache = ref(new Map())
watch(
  () => props.options,
  (opts) => {
    for (const o of opts || []) labelCache.value.set(o.value, o.label)
    // Options về sau khi đã có giá trị (LoadOnDemand) → cập nhật lại text hiển thị
    if (!hasTyped.value && !open.value) syncText()
  },
  { immediate: true, deep: true }
)

function labelOf(value) {
  return labelCache.value.has(value) ? labelCache.value.get(value) : String(value)
}

/* ── AutoComplete: so khớp không phân biệt hoa thường + bỏ dấu ── */
function normalize(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu thanh/dấu mũ tiếng Việt
    .replace(/đ/g, 'd')
}

const filteredOptions = computed(() => {
  if (!hasTyped.value || !inputText.value.trim()) return props.options
  const q = normalize(inputText.value.trim())
  return props.options.filter((o) => normalize(o.label).includes(q))
})

/* ── Giá trị đã chọn ────────────────────────────────────────── */
const selectedValues = computed(() =>
  props.multiple
    ? Array.isArray(props.modelValue)
      ? props.modelValue
      : []
    : []
)

function isSelected(value) {
  return props.multiple
    ? selectedValues.value.includes(value)
    : value === props.modelValue
}

// Multiple: hiện tối đa 2 tag (item chọn đầu tiên ưu tiên hiển thị),
// phần còn lại gộp thành badge "+N" — không đẩy giao diện thành nhiều dòng
const visibleTags = computed(() => selectedValues.value.slice(0, 2))
const hiddenCount = computed(() => Math.max(0, selectedValues.value.length - 2))

// Dòng "thêm nhanh" khi gõ không khớp option nào (allowCreate)
const showCreate = computed(
  () =>
    props.allowCreate &&
    hasTyped.value &&
    inputText.value.trim() !== '' &&
    filteredOptions.value.length === 0 &&
    !props.loading
)

const showEmpty = computed(
  () => !props.loading && !filteredOptions.value.length && !showCreate.value
)

/* ── Đồng bộ text hiển thị với v-model (single) ─────────────── */
function syncText() {
  if (props.multiple) {
    inputText.value = ''
    return
  }
  inputText.value =
    props.modelValue !== null && props.modelValue !== undefined
      ? labelOf(props.modelValue)
      : ''
}

watch(
  () => props.modelValue,
  () => {
    // Không ghi đè khi người dùng đang gõ tìm
    if (!hasTyped.value) syncText()
  },
  { immediate: true }
)

/* ── Định vị popover (teleport ra body, bám theo trigger) ────── */
function updatePosition() {
  const trigger = wrapperRef.value
  const pop = popoverRef.value
  if (!trigger || !pop) return
  const rect = trigger.getBoundingClientRect()
  const gap = 4
  const popH = pop.offsetHeight
  const popW = pop.offsetWidth
  const spaceBelow = window.innerHeight - rect.bottom
  // Lật lên trên khi bên dưới không đủ chỗ mà bên trên đủ
  const openUp = spaceBelow < popH + gap && rect.top > popH + gap
  // Min-width bằng control, mở rộng theo nội dung nhưng không tràn mép phải
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
function firstEnabledIndex() {
  return filteredOptions.value.findIndex((o) => !o.disabled)
}

function openPopover() {
  if (props.disabled || open.value) return
  open.value = true
  // Đặt con trỏ vào item đang chọn (single) hoặc item khả dụng đầu tiên
  let idx = -1
  if (!props.multiple) {
    idx = filteredOptions.value.findIndex(
      (o) => o.value === props.modelValue && !o.disabled
    )
  }
  activeIndex.value = idx >= 0 ? idx : firstEnabledIndex()
  nextTick(() => {
    updatePosition()
    scrollActiveIntoView()
  })
}

function closePopover() {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  hasTyped.value = false
  // Đóng mà không chọn → khôi phục text về label đang chọn (single) / rỗng (multiple)
  syncText()
}

/* ── Chọn giá trị ───────────────────────────────────────────── */
function selectOption(opt) {
  if (opt.disabled) return
  if (props.multiple) {
    // Multiple: toggle giá trị, giữ popover mở để chọn tiếp
    const next = isSelected(opt.value)
      ? selectedValues.value.filter((v) => v !== opt.value)
      : [...selectedValues.value, opt.value]
    emit('update:modelValue', next)
    emit('change', next)
    // Xóa từ khóa để thấy lại toàn bộ danh sách sau khi chọn
    inputText.value = ''
    hasTyped.value = false
    nextTick(updatePosition)
  } else {
    emit('update:modelValue', opt.value)
    emit('change', opt.value)
    hasTyped.value = false
    inputText.value = opt.label
    open.value = false
    activeIndex.value = -1
  }
  // Focus luôn ở lại input để tiếp tục thao tác bàn phím
  inputRef.value?.focus()
}

function removeTag(value) {
  if (props.disabled) return
  const next = selectedValues.value.filter((v) => v !== value)
  emit('update:modelValue', next)
  emit('change', next)
  inputRef.value?.focus()
  nextTick(updatePosition)
}

// Thêm nhanh danh mục: emit 'create' với text đang gõ, parent tự thêm
// option + set giá trị (hành vi "Nhấn Enter để thêm mới" của MDS)
function doCreate() {
  const text = inputText.value.trim()
  if (!text) return
  emit('create', text)
  hasTyped.value = false
  if (props.multiple) {
    inputText.value = ''
  } else {
    closePopover()
  }
}

/* ── Nhập liệu & tìm kiếm ───────────────────────────────────── */
function onInput(e) {
  inputText.value = e.target.value
  hasTyped.value = true
  if (!open.value) openPopover()
  // Reset con trỏ về kết quả khả dụng đầu tiên của danh sách vừa lọc
  activeIndex.value = firstEnabledIndex()
  nextTick(() => {
    updatePosition()
    scrollActiveIntoView()
  })
  // LoadOnDemand: emit 'search' debounce 200ms để server lọc danh mục lớn
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => emit('search', inputText.value.trim()), 200)
}

function onFocus(e) {
  // Hành vi MDS bắt buộc: focus vào ô nhập liệu tự bôi đen (select-all)
  e.target.select()
  emit('focus', e)
}

function onBlur(e) {
  emit('blur', e)
}

/* ── Bàn phím: ↑↓ + Enter + Esc, focus luôn nằm trong input ──── */
function moveActive(dir) {
  const opts = filteredOptions.value
  if (!opts.length) return
  let i = activeIndex.value
  // Bỏ qua item disabled, xoay vòng đầu↔cuối
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
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      open.value ? moveActive(1) : openPopover()
      break
    case 'ArrowUp':
      e.preventDefault()
      open.value ? moveActive(-1) : openPopover()
      break
    case 'Enter':
      e.preventDefault()
      if (!open.value) {
        openPopover()
      } else if (showCreate.value) {
        doCreate()
      } else if (activeIndex.value >= 0) {
        selectOption(filteredOptions.value[activeIndex.value])
      }
      break
    case 'Escape':
      if (open.value) {
        e.preventDefault()
        closePopover()
      }
      break
    case 'Backspace':
      // Multiple: input rỗng + Backspace → xóa tag cuối cùng
      if (props.multiple && inputText.value === '' && selectedValues.value.length) {
        removeTag(selectedValues.value[selectedValues.value.length - 1])
      }
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
    !wrapperRef.value?.contains(e.target) &&
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

// Kết quả LoadOnDemand về (options đổi) → giữ con trỏ hợp lệ + tính lại vị trí
watch(filteredOptions, () => {
  if (!open.value) return
  if (
    activeIndex.value < 0 ||
    activeIndex.value >= filteredOptions.value.length ||
    filteredOptions.value[activeIndex.value]?.disabled
  ) {
    activeIndex.value = firstEnabledIndex()
  }
  nextTick(updatePosition)
})

function onWrapperClick() {
  if (props.disabled) return
  inputRef.value?.focus()
  openPopover()
}

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  document.removeEventListener('mousedown', onDocMousedown)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})
</script>

<template>
  <div class="w-full">
    <!-- Trigger: khung giống input 32px chứa tag (multiple) + ô gõ tìm -->
    <div
      ref="wrapperRef"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      class="flex h-[var(--mds-input-height)] w-full items-center gap-1 overflow-hidden rounded-lg border px-3 transition-colors"
      :class="[
        error ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]',
        disabled
          ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)]'
          : 'cursor-text bg-[var(--mds-bg)]' +
            (!error
              ? ' hover:border-[var(--mds-brand-600)] focus-within:border-[var(--mds-brand-600)] focus-within:shadow-[0_0_0_2px_var(--mds-brand-100)]'
              : ''),
      ]"
      @click="onWrapperClick"
    >
      <!-- Multiple: tối đa 2 tag + badge "+N", không xuống dòng -->
      <template v-if="multiple">
        <span
          v-for="value in visibleTags"
          :key="value"
          class="flex h-[22px] max-w-[120px] shrink-0 items-center gap-1 rounded bg-[var(--mds-bg-hover-soft)] px-1.5 text-[12px] leading-4 text-[var(--mds-text)]"
        >
          <span class="truncate">{{ labelOf(value) }}</span>
          <button
            v-if="!disabled"
            type="button"
            tabindex="-1"
            :aria-label="`Bỏ chọn ${labelOf(value)}`"
            class="flex h-3 w-3 shrink-0 items-center justify-center text-[var(--mds-icon-neutral)] hover:text-[var(--mds-text)]"
            @mousedown.prevent
            @click.stop="removeTag(value)"
          >
            <MIcon name="x" :size="12" />
          </button>
        </span>
        <span
          v-if="hiddenCount > 0"
          class="flex h-[22px] shrink-0 items-center rounded bg-[var(--mds-bg-hover-soft)] px-1.5 text-[12px] leading-4 text-[var(--mds-text)]"
        >
          +{{ hiddenCount }}
        </span>
      </template>

      <input
        ref="inputRef"
        type="text"
        :value="inputText"
        :placeholder="
          multiple && selectedValues.length ? '' : placeholder
        "
        :disabled="disabled"
        autocomplete="off"
        class="h-full w-full min-w-[40px] flex-1 bg-transparent text-[13px] leading-[18px] text-[var(--mds-text)] outline-none placeholder:text-[var(--mds-text-placeholder)]"
        :class="disabled ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]' : ''"
        @input="onInput"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
      />

      <!-- Spinner khi đang LoadOnDemand, ngược lại là chevron xoay khi mở -->
      <MSpinner v-if="loading" :size="16" class="text-[var(--mds-brand-600)]" />
      <MIcon
        v-else
        name="chevron-down"
        :size="16"
        class="cursor-pointer text-[var(--mds-icon-neutral)] transition-transform"
        :class="open ? 'rotate-180' : ''"
        @mousedown.prevent
        @click.stop="open ? closePopover() : onWrapperClick()"
      />
    </div>

    <!-- Popover teleport ra body, radius 4px theo spec popup.
         mousedown.prevent: click vào popover không cướp focus khỏi input -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        role="listbox"
        :aria-multiselectable="multiple || undefined"
        :style="popoverStyle"
        class="z-[1000] max-h-[264px] w-max max-w-[min(480px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
        @mousedown.prevent
      >
        <!-- Spinner load-on-demand -->
        <div
          v-if="loading"
          class="flex items-center gap-2 px-3 py-2 text-[13px] leading-[18px] text-[var(--mds-text-placeholder)]"
        >
          <MSpinner :size="16" class="text-[var(--mds-brand-600)]" />
          Đang tải dữ liệu...
        </div>

        <!-- Empty state trong popover -->
        <div
          v-else-if="showEmpty"
          class="px-3 py-2 text-[13px] leading-[18px] text-[var(--mds-text-placeholder)]"
        >
          Không có dữ liệu
        </div>

        <template v-if="!loading">
          <div
            v-for="(opt, i) in filteredOptions"
            :key="opt.value"
            role="option"
            :aria-selected="isSelected(opt.value)"
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
              // Item đã chọn: chữ Brand + icon check cuối dòng (KHÔNG checkbox đầu dòng)
              isSelected(opt.value) && !opt.disabled
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
              v-if="isSelected(opt.value)"
              name="check"
              :size="16"
              class="text-[var(--mds-brand-600)]"
            />
          </div>

          <!-- Thêm nhanh danh mục: gõ không khớp option nào → link button
               "Nhấn Enter để thêm mới" theo spec ComboBox MDS -->
          <div
            v-if="showCreate"
            data-active="true"
            class="flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap bg-[var(--mds-bg-hover-soft)] px-3 text-[13px] leading-[18px] text-[var(--mds-brand-600)]"
            @click="doCreate"
          >
            <MIcon name="plus" :size="16" />
            <span>Nhấn Enter để thêm mới «{{ inputText.trim() }}»</span>
          </div>
        </template>
      </div>
    </Teleport>

    <!-- Message lỗi đỏ 12px dưới control -->
    <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
      {{ error }}
    </p>
  </div>
</template>
