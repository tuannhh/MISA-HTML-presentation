<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MIcon from './MIcon.vue'

/**
 * MDatePicker — control chọn ngày chuẩn MDS 2.0, định dạng dd/MM/yyyy.
 * Cho phép GÕ TAY vào input (parse khi blur/Enter, gõ sai thì revert)
 * hoặc chọn trên lịch popover. Picker KHÔNG có nút Đồng ý → chọn ngày
 * là submit và đóng popover luôn (quy tắc chung MDS).
 */
const props = defineProps({
  modelValue: { type: Date, default: null },
  placeholder: { type: String, default: 'dd/MM/yyyy' },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' }, // có giá trị → viền danger + message đỏ dưới control
  min: { type: Date, default: null }, // ngày nhỏ nhất chọn được
  max: { type: Date, default: null }, // ngày lớn nhất chọn được
})

const emit = defineEmits(['update:modelValue', 'change', 'focus', 'blur'])

/* ── Tiện ích ngày thuần JS (không dùng thư viện ngoài) ─────── */
function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDate(d) {
  return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : ''
}

// Parse chuỗi dd/MM/yyyy → Date; trả null nếu sai định dạng hoặc
// ngày không tồn tại (vd 31/02/2024 — kiểm tra bằng round-trip)
function parseDate(text) {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  return d
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a, b) {
  return (
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Ngày nằm ngoài giới hạn min/max (so sánh theo ngày, bỏ phần giờ)
function isOutOfRange(d) {
  if (props.min && startOfDay(d) < startOfDay(props.min)) return true
  if (props.max && startOfDay(d) > startOfDay(props.max)) return true
  return false
}

/* ── State ──────────────────────────────────────────────────── */
const open = ref(false)
const view = ref('days') // days | months | years — drill-down chọn nhanh tháng/năm
const inputText = ref(formatDate(props.modelValue))
const today = startOfDay(new Date())

const viewMonth = ref((props.modelValue || today).getMonth())
const viewYear = ref((props.modelValue || today).getFullYear())
const yearPageStart = ref(0) // năm đầu của trang 12 năm trong view chọn năm

const triggerRef = ref(null)
const inputRef = ref(null)
const popoverRef = ref(null)
const popoverStyle = ref({})

// Đồng bộ text trong input khi giá trị đổi từ bên ngoài
watch(
  () => props.modelValue,
  (val) => {
    inputText.value = formatDate(val)
  }
)

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] // tuần bắt đầu Thứ 2 — chuẩn VN

// Lưới luôn đủ 6 hàng × 7 cột; ngày tháng trước/sau lấp đầy lưới
const dayCells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const offset = (first.getDay() + 6) % 7 // getDay: CN=0 → quy về T2=0
  const cells = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(viewYear.value, viewMonth.value, 1 - offset + i)
    cells.push({
      date,
      inMonth: date.getMonth() === viewMonth.value,
      isToday: isSameDay(date, today),
      isSelected: isSameDay(date, props.modelValue),
      isDisabled: isOutOfRange(date),
    })
  }
  return cells
})

// 12 năm hiển thị trong view chọn năm
const yearCells = computed(() =>
  Array.from({ length: 12 }, (_, i) => yearPageStart.value + i)
)

/* ── Định vị popover (teleport ra body), tự lật lên khi thiếu chỗ ── */
function updatePosition() {
  const trigger = triggerRef.value
  const pop = popoverRef.value
  if (!trigger || !pop) return
  const rect = trigger.getBoundingClientRect()
  const gap = 4
  const popH = pop.offsetHeight
  const popW = pop.offsetWidth
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceBelow < popH + gap && rect.top > popH + gap
  // Không cho popover tràn khỏi mép phải màn hình
  let left = rect.left
  if (left + popW > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - 8 - popW)
  }
  popoverStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: openUp ? `${rect.top - popH - gap}px` : `${rect.bottom + gap}px`,
  }
}

/* ── Mở / đóng ──────────────────────────────────────────────── */
function openPopover() {
  if (props.disabled || open.value) return
  open.value = true
  view.value = 'days'
  // Mở lịch tại tháng của giá trị đang chọn (hoặc tháng hiện tại)
  const base = props.modelValue || today
  viewMonth.value = base.getMonth()
  viewYear.value = base.getFullYear()
  nextTick(updatePosition)
}

function closePopover() {
  open.value = false
  view.value = 'days'
}

/* ── Chọn giá trị ───────────────────────────────────────────── */
function setValue(d) {
  // Chỉ emit khi giá trị thực sự đổi
  if (!isSameDay(d, props.modelValue)) {
    emit('update:modelValue', d)
    emit('change', d)
  }
  inputText.value = formatDate(d)
}

function selectDay(cell) {
  if (cell.isDisabled) return
  setValue(startOfDay(cell.date))
  closePopover()
}

// Nút tắt "Hôm nay" ở footer — chọn nhanh ngày hiện tại
function selectToday() {
  if (isOutOfRange(today)) return
  setValue(today)
  closePopover()
}

/* ── Điều hướng header ──────────────────────────────────────── */
function changeMonth(dir) {
  const d = new Date(viewYear.value, viewMonth.value + dir, 1)
  viewMonth.value = d.getMonth()
  viewYear.value = d.getFullYear()
}

// Click tên tháng → view chọn nhanh 12 tháng
function openMonthsView() {
  view.value = 'months'
}

// Click tên năm → view chọn nhanh lưới 12 năm (trang chứa năm đang xem)
function openYearsView() {
  yearPageStart.value = viewYear.value - (viewYear.value % 12)
  view.value = 'years'
}

function selectMonth(m) {
  viewMonth.value = m
  view.value = 'days'
}

// Chọn năm xong drill-down tiếp về chọn tháng
function selectYear(y) {
  viewYear.value = y
  view.value = 'months'
}

/* ── Gõ tay: parse khi blur/Enter, gõ sai thì revert ────────── */
function commitInput() {
  const text = inputText.value.trim()
  if (!text) {
    setValue(null)
    return
  }
  const d = parseDate(text)
  if (d && !isOutOfRange(d)) {
    setValue(d)
    // Nhảy lịch tới tháng vừa nhập
    viewMonth.value = d.getMonth()
    viewYear.value = d.getFullYear()
  } else {
    // Gõ sai định dạng / ngoài min-max → revert về giá trị cũ
    inputText.value = formatDate(props.modelValue)
  }
}

function onInputFocus(e) {
  // Hành vi MDS bắt buộc: focus tự select-all nội dung
  e.target.select()
  openPopover()
  emit('focus', e)
}

function onInputBlur(e) {
  commitInput()
  emit('blur', e)
}

function onInputKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitInput()
    closePopover()
  } else if (e.key === 'Escape') {
    // Esc đóng popover
    e.preventDefault()
    closePopover()
  }
}

// Nút × xóa giá trị khi đang có ngày chọn
function clear() {
  setValue(null)
  inputRef.value?.focus()
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
    // capture=true để bắt cả scroll của container cha
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  } else {
    document.removeEventListener('mousedown', onDocMousedown)
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }
})

// View đổi (days ↔ months ↔ years) làm chiều cao popover đổi → định vị lại
watch(view, () => nextTick(onReposition))

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})
</script>

<template>
  <div class="w-full">
    <!-- Trigger giống input: icon calendar trái + input gõ tay + nút × -->
    <div
      ref="triggerRef"
      class="flex h-[var(--mds-input-height)] w-full items-center gap-2 rounded-lg border bg-[var(--mds-bg)] px-3 transition-colors"
      :class="[
        error ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]',
        disabled
          ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)]'
          : !error
            ? 'hover:border-[var(--mds-brand-600)] focus-within:border-[var(--mds-brand-600)] focus-within:shadow-[0_0_0_2px_var(--mds-brand-100)]'
            : '',
      ]"
      @click="!disabled && inputRef?.focus()"
    >
      <!-- Icon calendar (stroke 1.5, từ assets/icons/calendar.svg) -->
      <MIcon name="calendar" :size="16" class="text-[var(--mds-icon-neutral)]" />

      <input
        ref="inputRef"
        v-model="inputText"
        type="text"
        :placeholder="placeholder"
        :disabled="disabled"
        role="combobox"
        :aria-expanded="open"
        aria-haspopup="dialog"
        class="h-full w-full min-w-0 flex-1 bg-transparent text-[13px] leading-[18px] text-[var(--mds-text)] outline-none placeholder:text-[var(--mds-text-placeholder)]"
        :class="disabled ? 'cursor-not-allowed' : ''"
        @focus="onInputFocus"
        @blur="onInputBlur"
        @keydown="onInputKeydown"
      />

      <!-- Nút × xóa khi có giá trị -->
      <button
        v-if="modelValue && !disabled"
        type="button"
        tabindex="-1"
        aria-label="Xóa ngày"
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:text-[var(--mds-text)]"
        @mousedown.prevent
        @click.stop="clear"
      >
        <MIcon name="x" :size="12" />
      </button>
    </div>

    <!-- Popover lịch teleport ra body, radius 4px theo spec popup -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        role="dialog"
        aria-label="Chọn ngày"
        :style="popoverStyle"
        class="z-[1000] w-[240px] rounded-xl border border-[var(--mds-border)] bg-[var(--mds-bg)] py-2 shadow-lg"
        @mousedown.prevent
      >
        <!-- Header điều hướng: ‹ › đổi tháng + click tên tháng/năm chọn nhanh -->
        <div class="flex items-center justify-between px-2 pb-2">
          <button
            type="button"
            aria-label="Tháng trước"
            class="flex h-6 w-6 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]"
            @click="view === 'years' ? (yearPageStart -= 12) : view === 'months' ? viewYear-- : changeMonth(-1)"
          >
            <MIcon name="chevron-left" :size="16" />
          </button>

          <!-- Nhãn giữa header theo từng view -->
          <div class="flex items-center gap-1 text-[13px] leading-[18px] font-medium text-[var(--mds-text)]">
            <template v-if="view === 'days'">
              <button
                type="button"
                class="rounded px-1 py-0.5 hover:bg-[var(--mds-bg-hover-soft)]"
                @click="openMonthsView"
              >
                Tháng {{ viewMonth + 1 }},
              </button>
              <button
                type="button"
                class="rounded px-1 py-0.5 hover:bg-[var(--mds-bg-hover-soft)]"
                @click="openYearsView"
              >
                {{ viewYear }}
              </button>
            </template>
            <button
              v-else-if="view === 'months'"
              type="button"
              class="rounded px-1 py-0.5 hover:bg-[var(--mds-bg-hover-soft)]"
              @click="openYearsView"
            >
              {{ viewYear }}
            </button>
            <span v-else class="px-1 py-0.5">
              {{ yearPageStart }} - {{ yearPageStart + 11 }}
            </span>
          </div>

          <button
            type="button"
            aria-label="Tháng sau"
            class="flex h-6 w-6 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]"
            @click="view === 'years' ? (yearPageStart += 12) : view === 'months' ? viewYear++ : changeMonth(1)"
          >
            <MIcon name="chevron-right" :size="16" />
          </button>
        </div>

        <div class="border-t border-[var(--mds-border)]" />

        <!-- View lưới ngày -->
        <template v-if="view === 'days'">
          <div class="grid grid-cols-7 px-2 pt-2">
            <!-- Hàng tên thứ: T2→CN, CN màu đỏ theo spec -->
            <div
              v-for="wd in weekdays"
              :key="wd"
              class="flex h-8 w-8 items-center justify-center text-[13px] leading-[18px] font-medium"
              :class="wd === 'CN' ? 'text-[var(--mds-danger)]' : 'text-[var(--mds-text)]'"
            >
              {{ wd }}
            </div>

            <!-- Ô ngày 32px -->
            <button
              v-for="cell in dayCells"
              :key="cell.date.getTime()"
              type="button"
              :disabled="cell.isDisabled"
              :aria-label="formatDate(cell.date)"
              class="flex h-8 w-8 items-center justify-center rounded text-[13px] leading-[18px]"
              :class="[
                cell.isSelected
                  ? 'bg-[var(--mds-brand-600)] font-medium text-white'
                  : cell.isDisabled
                    ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
                    : cell.isToday
                      ? 'border border-[var(--mds-brand-600)] font-medium text-[var(--mds-brand-600)] hover:bg-[var(--mds-bg-hover-soft)]'
                      : cell.inMonth
                        ? 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'
                        : 'text-[var(--mds-text-placeholder)] hover:bg-[var(--mds-bg-hover-soft)]',
              ]"
              @click="selectDay(cell)"
            >
              {{ cell.date.getDate() }}
            </button>
          </div>

          <div class="mt-2 border-t border-[var(--mds-border)]" />

          <!-- Footer: nút tắt "Hôm nay" (Button Text màu Brand, size Small) -->
          <div class="flex justify-center px-2 pt-2">
            <button
              type="button"
              class="rounded px-2 py-1 text-[13px] leading-[18px] font-medium text-[var(--mds-brand-600)] hover:bg-[var(--mds-bg-hover-soft)] active:text-[var(--mds-brand-800)]"
              @click="selectToday"
            >
              Hôm nay
            </button>
          </div>
        </template>

        <!-- View chọn nhanh tháng: 12 ô "Thg 1"…"Thg 12" -->
        <div v-else-if="view === 'months'" class="grid grid-cols-3 gap-1 px-2 pt-2">
          <button
            v-for="m in 12"
            :key="m"
            type="button"
            class="flex h-8 items-center justify-center rounded text-[13px] leading-[18px]"
            :class="
              m - 1 === viewMonth
                ? 'bg-[var(--mds-brand-600)] font-medium text-white'
                : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'
            "
            @click="selectMonth(m - 1)"
          >
            Thg {{ m }}
          </button>
        </div>

        <!-- View chọn nhanh năm: lưới 12 năm -->
        <div v-else class="grid grid-cols-3 gap-1 px-2 pt-2">
          <button
            v-for="y in yearCells"
            :key="y"
            type="button"
            class="flex h-8 items-center justify-center rounded text-[13px] leading-[18px]"
            :class="
              y === viewYear
                ? 'bg-[var(--mds-brand-600)] font-medium text-white'
                : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'
            "
            @click="selectYear(y)"
          >
            {{ y }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Message lỗi đỏ 12px dưới control -->
    <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
      {{ error }}
    </p>
  </div>
</template>
