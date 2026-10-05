<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue'

/**
 * MTooltip — Tooltip chuẩn MDS 2.0.
 * Bọc quanh element gốc (slot default), hiện bubble nền tối khi hover
 * hoặc focus bằng bàn phím (focus-visible). Theo quy định MDS: mọi
 * chức năng đã gán phím tắt PHẢI có tooltip ghi rõ phím tắt → prop
 * `shortcut` hiển thị dạng kbd nhỏ cạnh nội dung.
 */
const props = defineProps({
  content: { type: String, default: '' }, // nội dung tooltip (hoặc dùng slot #content)
  placement: {
    type: String,
    default: 'top',
    validator: (v) => ['top', 'bottom', 'left', 'right'].includes(v),
  },
  shortcut: { type: String, default: '' }, // phím tắt, vd: 'Ctrl+S'
  delay: { type: Number, default: 300 }, // ms chờ trước khi hiện (tránh nhấp nháy khi lướt chuột)
})

const slots = useSlots()

const visible = ref(false)
const wrapRef = ref(null)
const tipRef = ref(null)
// Khởi tạo ngoài màn hình để đo kích thước trước khi định vị (tránh flash)
const tipStyle = ref({ position: 'fixed', top: '-9999px', left: '-9999px' })
const arrowStyle = ref({})
const actualPlacement = ref(props.placement) // placement thực tế sau khi tự lật
let showTimer = null

// KHÔNG hiện tooltip khi không có nội dung (content rỗng và không có slot)
const hasContent = computed(
  () => (props.content && props.content.trim() !== '') || !!slots.content
)

/* ── Định vị bubble (teleport ra body) ──────────────────────────
   Tính theo getBoundingClientRect của element gốc; tự lật sang phía
   đối diện khi sát mép viewport, kẹp ngang/dọc để không tràn màn hình. */
function updatePosition() {
  const anchor = wrapRef.value?.firstElementChild
  const tip = tipRef.value
  if (!anchor || !tip) return
  const rect = anchor.getBoundingClientRect()
  const tw = tip.offsetWidth
  const th = tip.offsetHeight
  const gap = 8 // khoảng cách bubble ↔ element (đã gồm mũi tên)
  const pad = 8 // khoảng an toàn với mép viewport

  // Tự lật khi phía ưu tiên không đủ chỗ mà phía đối diện đủ
  let p = props.placement
  if (p === 'top' && rect.top - th - gap < pad && window.innerHeight - rect.bottom - th - gap > pad) p = 'bottom'
  else if (p === 'bottom' && window.innerHeight - rect.bottom - th - gap < pad && rect.top - th - gap > pad) p = 'top'
  else if (p === 'left' && rect.left - tw - gap < pad && window.innerWidth - rect.right - tw - gap > pad) p = 'right'
  else if (p === 'right' && window.innerWidth - rect.right - tw - gap < pad && rect.left - tw - gap > pad) p = 'left'
  actualPlacement.value = p

  let top = 0
  let left = 0
  if (p === 'top') {
    top = rect.top - th - gap
    left = rect.left + rect.width / 2 - tw / 2
  } else if (p === 'bottom') {
    top = rect.bottom + gap
    left = rect.left + rect.width / 2 - tw / 2
  } else if (p === 'left') {
    top = rect.top + rect.height / 2 - th / 2
    left = rect.left - tw - gap
  } else {
    top = rect.top + rect.height / 2 - th / 2
    left = rect.right + gap
  }
  // Kẹp trong viewport
  left = Math.min(Math.max(left, pad), window.innerWidth - pad - tw)
  top = Math.min(Math.max(top, pad), window.innerHeight - pad - th)
  tipStyle.value = { position: 'fixed', top: `${top}px`, left: `${left}px` }

  // Mũi tên luôn chỉ vào tâm element gốc (kể cả khi bubble bị kẹp lệch)
  if (p === 'top' || p === 'bottom') {
    const ax = Math.min(Math.max(rect.left + rect.width / 2 - left - 4, 6), tw - 14)
    arrowStyle.value = { left: `${ax}px` }
  } else {
    const ay = Math.min(Math.max(rect.top + rect.height / 2 - top - 4, 6), th - 14)
    arrowStyle.value = { top: `${ay}px` }
  }
}

/* ── Hiện / ẩn ──────────────────────────────────────────────── */
function show() {
  if (!hasContent.value || visible.value) return
  clearTimeout(showTimer)
  // Chờ `delay` ms trước khi hiện (mặc định 300ms)
  showTimer = setTimeout(() => {
    visible.value = true
    tipStyle.value = { position: 'fixed', top: '-9999px', left: '-9999px' }
    nextTick(updatePosition)
  }, props.delay)
}

function hide() {
  clearTimeout(showTimer)
  showTimer = null
  visible.value = false
}

// Chỉ hiện khi focus bằng bàn phím (focus-visible), không hiện khi click chuột
function onFocusIn(e) {
  if (e.target.matches?.(':focus-visible')) show()
}

// Esc ẩn tooltip (bắt ở document để hoạt động cả khi hiện do hover)
function onDocKeydown(e) {
  if (e.key === 'Escape') hide()
}

function onReposition() {
  if (visible.value) updatePosition()
}

watch(visible, (val) => {
  if (val) {
    document.addEventListener('keydown', onDocKeydown)
    // capture=true để bắt cả scroll của container cha
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
  } else {
    document.removeEventListener('keydown', onDocKeydown)
    window.removeEventListener('scroll', onReposition, true)
    window.removeEventListener('resize', onReposition)
  }
})

onBeforeUnmount(() => {
  clearTimeout(showTimer)
  document.removeEventListener('keydown', onDocKeydown)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('resize', onReposition)
})
</script>

<template>
  <!-- display:contents — wrapper không ảnh hưởng layout của element gốc -->
  <span
    ref="wrapRef"
    class="contents"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="onFocusIn"
    @focusout="hide"
  >
    <slot />
  </span>

  <Teleport to="body">
    <!-- Bubble nền tối: token chữ chính làm nền, chữ trắng (token nền) -->
    <div
      v-if="visible"
      ref="tipRef"
      role="tooltip"
      :style="tipStyle"
      class="pointer-events-none z-[1100] max-w-[260px] rounded bg-[var(--mds-text)] px-2 py-1.5 text-[12px] leading-4 text-[var(--mds-bg)] shadow-md"
    >
      <span class="inline-flex items-center gap-1.5">
        <slot name="content">{{ content }}</slot>
        <!-- Phím tắt dạng kbd nhỏ cạnh nội dung (quy định tooltip phím tắt MDS) -->
        <kbd
          v-if="shortcut"
          class="rounded-sm border border-[var(--mds-icon-neutral)] px-1 font-sans text-[11px] leading-4"
        >{{ shortcut }}</kbd>
      </span>
      <!-- Mũi tên nhỏ: hình vuông 8px xoay 45°, cùng màu nền bubble -->
      <span
        :style="arrowStyle"
        class="absolute h-2 w-2 rotate-45 bg-[var(--mds-text)]"
        :class="{
          'bottom-[-4px]': actualPlacement === 'top',
          'top-[-4px]': actualPlacement === 'bottom',
          'right-[-4px]': actualPlacement === 'left',
          'left-[-4px]': actualPlacement === 'right',
        }"
      />
    </div>
  </Teleport>
</template>
