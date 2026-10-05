<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MIcon from './MIcon.vue'

/**
 * MDateRangePicker — chọn khoảng ngày chuẩn MDS 2.0 (dạng nâng cao có preset).
 * Popover gồm: cột preset VN bên trái + 2 lịch tháng liền kề bên phải.
 * Chọn start rồi end (hover hiện preview khoảng); có nút Đồng ý ("Áp dụng")
 * → phải bấm Áp dụng mới submit giá trị, "Hủy"/Esc bỏ thay đổi (quy tắc MDS).
 */
const props = defineProps({
  // { start: Date|null, end: Date|null }
  modelValue: {
    type: Object,
    default: () => ({ start: null, end: null }),
  },
  placeholder: { type: String, default: 'dd/MM/yyyy - dd/MM/yyyy' },
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

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

// Ngày nằm ngoài giới hạn min/max (so sánh theo ngày)
function isOutOfRange(d) {
  if (props.min && startOfDay(d) < startOfDay(props.min)) return true
  if (props.max && startOfDay(d) > startOfDay(props.max)) return true
  return false
}

/* ── State ──────────────────────────────────────────────────── */
const open = ref(false)
const today = startOfDay(new Date())

// Bản nháp trong popover — chỉ submit khi bấm "Áp dụng"
const draftStart = ref(null)
const draftEnd = ref(null)
const hoverDate = ref(null) // ngày đang hover để vẽ preview khoảng

// Tháng gốc của panel trái; panel phải luôn là tháng liền kề (+1)
const baseMonth = ref(today.getMonth())
const baseYear = ref(today.getFullYear())

const triggerRef = ref(null)
const popoverRef = ref(null)
const popoverStyle = ref({})

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] // tuần bắt đầu Thứ 2 — chuẩn VN

// Text hiển thị trên trigger: "dd/MM/yyyy - dd/MM/yyyy"
const displayText = computed(() => {
  const { start, end } = props.modelValue || {}
  if (!start && !end) return ''
  return `${formatDate(start)} - ${formatDate(end)}`
})

const hasValue = computed(() => !!(props.modelValue?.start || props.modelValue?.end))

/* ── Preset VN: click chọn ngay bản nháp + highlight preset khớp ── */
// Thứ 2 đầu tuần của một ngày bất kỳ
function mondayOf(d) {
  return addDays(d, -((d.getDay() + 6) % 7))
}

const presets = computed(() => {
  const monday = mondayOf(today)
  const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3
  return [
    { label: 'Hôm nay', start: today, end: today },
    { label: 'Hôm qua', start: addDays(today, -1), end: addDays(today, -1) },
    { label: 'Tuần này', start: monday, end: addDays(monday, 6) },
    { label: 'Tuần trước', start: addDays(monday, -7), end: addDays(monday, -1) },
    {
      label: 'Tháng này',
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    },
    {
      label: 'Tháng trước',
      start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      end: new Date(today.getFullYear(), today.getMonth(), 0),
    },
    {
      label: 'Quý này',
      start: new Date(today.getFullYear(), quarterStartMonth, 1),
      end: new Date(today.getFullYear(), quarterStartMonth + 3, 0),
    },
    {
      label: 'Năm nay',
      start: new Date(today.getFullYear(), 0, 1),
      end: new Date(today.getFullYear(), 11, 31),
    },
  ]
})

// Preset đang khớp với bản nháp (để highlight)
function isActivePreset(p) {
  return isSameDay(p.start, draftStart.value) && isSameDay(p.end, draftEnd.value)
}

function selectPreset(p) {
  draftStart.value = p.start
  draftEnd.value = p.end
  hoverDate.value = null
  // Nhảy lịch về tháng bắt đầu của preset
  baseMonth.value = p.start.getMonth()
  baseYear.value = p.start.getFullYear()
}

/* ── Lưới ngày 2 panel (6 hàng × 7 cột, lấp đầy bằng ngày ngoài tháng) ── */
function buildCells(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // getDay: CN=0 → quy về T2=0
  const start = draftStart.value ? startOfDay(draftStart.value).getTime() : null
  const end = draftEnd.value ? startOfDay(draftEnd.value).getTime() : null
  // Đang chọn dở (có start chưa có end) + hover → preview khoảng tạm
  const preview =
    start !== null && end === null && hoverDate.value
      ? [Math.min(start, hoverDate.value.getTime()), Math.max(start, hoverDate.value.getTime())]
      : null

  const cells = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - offset + i)
    const t = date.getTime()
    const isStart = start !== null && t === start
    const isEnd = end !== null && t === end
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      isToday: isSameDay(date, today),
      isDisabled: isOutOfRange(date),
      isStart,
      isEnd,
      // Ô nằm giữa khoảng đã chọn (không tính 2 đầu)
      inRange: start !== null && end !== null && t > start && t < end,
      // Ô nằm trong khoảng preview khi hover (không tính ô start)
      inPreview: !!preview && t > preview[0] && t < preview[1] && !isStart,
    })
  }
  return cells
}

const leftCells = computed(() => buildCells(baseYear.value, baseMonth.value))
const rightCells = computed(() => {
  const d = new Date(baseYear.value, baseMonth.value + 1, 1)
  return buildCells(d.getFullYear(), d.getMonth())
})

// Nhãn tháng "Tháng M, YYYY" cho từng panel
const leftLabel = computed(() => `Tháng ${baseMonth.value + 1}, ${baseYear.value}`)
const rightLabel = computed(() => {
  const d = new Date(baseYear.value, baseMonth.value + 1, 1)
  return `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`
})

function changeMonth(dir) {
  const d = new Date(baseYear.value, baseMonth.value + dir, 1)
  baseMonth.value = d.getMonth()
  baseYear.value = d.getFullYear()
}

/* ── Chọn ngày: start trước rồi end; click lùi ngày → làm start mới ── */
function selectDay(cell) {
  if (cell.isDisabled) return
  const d = startOfDay(cell.date)
  if (!draftStart.value || draftEnd.value) {
    // Bắt đầu lượt chọn mới
    draftStart.value = d
    draftEnd.value = null
  } else if (d < draftStart.value) {
    draftStart.value = d
  } else {
    draftEnd.value = d
  }
  hoverDate.value = null
}

function onCellHover(cell) {
  if (cell.isDisabled) return
  hoverDate.value = startOfDay(cell.date)
}

/* ── Class cho từng ô ngày (dải range liền mạch, ô 32px) ────── */
function cellClass(cell) {
  if (cell.isDisabled) {
    return 'cursor-not-allowed rounded text-[var(--mds-text-placeholder)]'
  }
  if (cell.isStart || cell.isEnd) {
    // 2 đầu khoảng: nền brand-600 chữ trắng, bo góc phía ngoài dải
    const single =
      (cell.isStart && cell.isEnd) ||
      (cell.isStart && !draftEnd.value && !hoverDate.value)
    return [
      'bg-[var(--mds-brand-600)] font-medium text-white',
      single ? 'rounded' : cell.isStart ? 'rounded-l' : 'rounded-r',
    ].join(' ')
  }
  if (cell.inRange) {
    // Ô giữa khoảng đã chọn: nền brand-50, không bo góc để tạo dải liền
    return `rounded-none bg-[var(--mds-brand-50)] ${
      cell.inMonth ? 'text-[var(--mds-text)]' : 'text-[var(--mds-text-placeholder)]'
    }`
  }
  if (cell.inPreview) {
    // Preview khi hover lúc đang chọn dở: nền brand nhạt
    return `rounded-none bg-[var(--mds-bg-hover-soft)] ${
      cell.inMonth ? 'text-[var(--mds-text)]' : 'text-[var(--mds-text-placeholder)]'
    }`
  }
  if (cell.isToday) {
    // Hôm nay: viền brand, không tô nền
    return 'rounded border border-[var(--mds-brand-600)] font-medium text-[var(--mds-brand-600)] hover:bg-[var(--mds-bg-hover-soft)]'
  }
  return `rounded hover:bg-[var(--mds-bg-hover-soft)] ${
    cell.inMonth ? 'text-[var(--mds-text)]' : 'text-[var(--mds-text-placeholder)]'
  }`
}

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

/* ── Mở / đóng / submit ─────────────────────────────────────── */
function openPopover() {
  if (props.disabled || open.value) return
  open.value = true
  // Nạp bản nháp từ giá trị hiện tại
  draftStart.value = props.modelValue?.start ? startOfDay(props.modelValue.start) : null
  draftEnd.value = props.modelValue?.end ? startOfDay(props.modelValue.end) : null
  hoverDate.value = null
  const base = draftStart.value || today
  baseMonth.value = base.getMonth()
  baseYear.value = base.getFullYear()
  nextTick(updatePosition)
}

function closePopover() {
  open.value = false
  hoverDate.value = null
}

// "Áp dụng" — submit bản nháp (cần đủ start + end)
function apply() {
  if (!draftStart.value || !draftEnd.value) return
  const val = { start: draftStart.value, end: draftEnd.value }
  if (
    !isSameDay(val.start, props.modelValue?.start) ||
    !isSameDay(val.end, props.modelValue?.end)
  ) {
    emit('update:modelValue', val)
    emit('change', val)
  }
  closePopover()
  triggerRef.value?.focus()
}

// "Hủy" / Esc — bỏ bản nháp, đóng popover
function cancel() {
  closePopover()
  triggerRef.value?.focus()
}

// Nút × xóa khoảng đã chọn
function clear() {
  emit('update:modelValue', { start: null, end: null })
  emit('change', { start: null, end: null })
}

function onKeydown(e) {
  if (e.key === 'Escape' && open.value) {
    // Esc đóng popover (không áp dụng bản nháp)
    e.preventDefault()
    cancel()
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
    // capture=true để bắt cả scroll của container cha
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
    <!-- Trigger giống input 32px: icon calendar + "dd/MM/yyyy - dd/MM/yyyy" + nút × -->
    <button
      ref="triggerRef"
      type="button"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :disabled="disabled"
      class="flex h-[var(--mds-input-height)] w-full items-center gap-2 rounded-lg border px-3 text-left text-[13px] leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      :class="[
        error ? 'border-[var(--mds-danger)]' : 'border-[var(--mds-border)]',
        disabled
          ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)]'
          : 'cursor-pointer bg-[var(--mds-bg)]' +
            (!error ? ' hover:border-[var(--mds-brand-600)]' : ''),
      ]"
      @click="open ? cancel() : openPopover()"
      @keydown="onKeydown"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
    >
      <!-- Icon calendar (stroke 1.5, từ assets/icons/calendar.svg) -->
      <MIcon name="calendar" :size="16" class="text-[var(--mds-icon-neutral)]" />

      <span
        class="flex-1 truncate"
        :class="
          displayText && !disabled
            ? 'text-[var(--mds-text)]'
            : 'text-[var(--mds-text-placeholder)]'
        "
      >
        {{ displayText || placeholder }}
      </span>

      <!-- Nút × xóa khi có giá trị -->
      <span
        v-if="hasValue && !disabled"
        role="button"
        tabindex="-1"
        aria-label="Xóa khoảng ngày"
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:text-[var(--mds-text)]"
        @mousedown.prevent
        @click.stop="clear"
      >
        <MIcon name="x" :size="12" />
      </span>
    </button>

    <!-- Popover teleport ra body, radius 4px: preset trái + 2 lịch liền kề phải -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="popoverRef"
        role="dialog"
        aria-label="Chọn khoảng ngày"
        :style="popoverStyle"
        class="z-[1000] flex max-w-[calc(100vw-16px)] rounded-xl border border-[var(--mds-border)] bg-[var(--mds-bg)] shadow-lg"
        @keydown="onKeydown"
      >
        <!-- Cột preset VN, ngăn với lịch bằng divider dọc -->
        <div class="w-32 shrink-0 border-r border-[var(--mds-border)] py-2">
          <button
            v-for="p in presets"
            :key="p.label"
            type="button"
            class="flex h-8 w-full items-center px-3 text-left text-[13px] leading-[18px]"
            :class="
              isActivePreset(p)
                ? 'bg-[var(--mds-bg-hover-soft)] font-medium text-[var(--mds-brand-600)]'
                : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)]'
            "
            @click="selectPreset(p)"
          >
            {{ p.label }}
          </button>
        </div>

        <!-- Vùng lịch + footer -->
        <div class="flex flex-col py-2">
          <div class="flex" @mouseleave="hoverDate = null">
            <!-- 2 panel tháng liền kề -->
            <div
              v-for="(panel, pi) in [
                { label: leftLabel, cells: leftCells },
                { label: rightLabel, cells: rightCells },
              ]"
              :key="pi"
              class="w-[240px] px-2"
              :class="pi === 1 ? 'border-l border-[var(--mds-border)]' : ''"
            >
              <!-- Header panel: panel trái có ‹ lùi tháng, panel phải có › tiến tháng -->
              <div class="flex h-8 items-center justify-between">
                <button
                  v-if="pi === 0"
                  type="button"
                  aria-label="Tháng trước"
                  class="flex h-6 w-6 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]"
                  @click="changeMonth(-1)"
                >
                  <MIcon name="chevron-left" :size="16" />
                </button>
                <span v-else class="h-6 w-6" />

                <span class="text-[13px] leading-[18px] font-medium text-[var(--mds-text)]">
                  {{ panel.label }}
                </span>

                <button
                  v-if="pi === 1"
                  type="button"
                  aria-label="Tháng sau"
                  class="flex h-6 w-6 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]"
                  @click="changeMonth(1)"
                >
                  <MIcon name="chevron-right" :size="16" />
                </button>
                <span v-else class="h-6 w-6" />
              </div>

              <div class="grid grid-cols-7">
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
                  v-for="cell in panel.cells"
                  :key="cell.date.getTime()"
                  type="button"
                  :disabled="cell.isDisabled"
                  :aria-label="formatDate(cell.date)"
                  class="flex h-8 w-8 items-center justify-center text-[13px] leading-[18px]"
                  :class="cellClass(cell)"
                  @mouseenter="onCellHover(cell)"
                  @click="selectDay(cell)"
                >
                  {{ cell.date.getDate() }}
                </button>
              </div>
            </div>
          </div>

          <div class="mt-2 border-t border-[var(--mds-border)]" />

          <!-- Footer: Hủy + Áp dụng (Primary ngoài cùng phải theo quy tắc dialog MDS) -->
          <div class="flex items-center justify-end gap-2 px-2 pt-2">
            <button
              type="button"
              class="flex h-8 min-w-[80px] items-center justify-center rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] px-[14px] text-[13px] leading-[18px] font-medium text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
              @click="cancel"
            >
              Hủy
            </button>
            <button
              type="button"
              :disabled="!draftStart || !draftEnd"
              class="flex h-8 min-w-[80px] items-center justify-center rounded-lg px-[14px] text-[13px] leading-[18px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
              :class="
                !draftStart || !draftEnd
                  ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)]'
                  : 'bg-[var(--mds-brand-600)] text-white hover:bg-[var(--mds-brand-700)] active:bg-[var(--mds-brand-800)]'
              "
              @click="apply"
            >
              Áp dụng
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Message lỗi đỏ 12px dưới control -->
    <p v-if="error" class="mt-1 text-[12px] leading-4 text-[var(--mds-danger)]">
      {{ error }}
    </p>
  </div>
</template>
