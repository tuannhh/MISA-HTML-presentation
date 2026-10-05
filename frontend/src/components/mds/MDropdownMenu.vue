<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MIcon from './MIcon.vue'

/**
 * MDropdownMenu — menu thao tác gắn với nút, chuẩn MDS 2.0.
 * Dùng cho nút More (⋯) của MDS: các hành động phụ trên hàng danh
 * sách/card được gom vào menu này. Activator mặc định là icon button
 * ⋯ 32px vuông radius 8px đúng spec nút More.
 */
const props = defineProps({
  // [{ key, label, icon?, danger?, disabled?, divider? }]
  // icon: tên file SVG trong assets/icons (vd 'pencil', 'trash')
  items: { type: Array, default: () => [] },
  placement: {
    type: String,
    default: 'bottom-end', // menu căn mép phải activator (chuẩn nút More cuối hàng)
    validator: (v) => ['bottom-end', 'bottom-start'].includes(v),
  },
})

const emit = defineEmits(['select'])


const open = ref(false)
const activatorRef = ref(null)
const menuRef = ref(null)
const activeIndex = ref(-1) // index item đang "sáng" khi điều hướng bàn phím
const menuStyle = ref({ position: 'fixed', top: '-9999px', left: '-9999px' })

// Các index có thể chọn (bỏ qua divider và item disabled)
const enabledIndexes = computed(() =>
  props.items
    .map((it, i) => (!it.divider && !it.disabled ? i : -1))
    .filter((i) => i >= 0)
)

/* ── Định vị menu (teleport ra body) ────────────────────────────
   bottom-end: căn mép phải menu với mép phải activator (mặc định —
   nút More thường nằm cuối hàng). Tự lật lên trên khi sát mép dưới
   viewport; kẹp ngang để không tràn màn hình. */
function updatePosition() {
  const anchor = activatorRef.value?.firstElementChild
  const menu = menuRef.value
  if (!anchor || !menu) return
  const rect = anchor.getBoundingClientRect()
  const mw = menu.offsetWidth
  const mh = menu.offsetHeight
  const gap = 4
  const pad = 8
  const spaceBelow = window.innerHeight - rect.bottom
  // Lật lên trên khi bên dưới không đủ chỗ mà bên trên đủ
  const openUp = spaceBelow < mh + gap && rect.top > mh + gap
  let left =
    props.placement === 'bottom-end' ? rect.right - mw : rect.left
  left = Math.min(Math.max(left, pad), window.innerWidth - pad - mw)
  menuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: openUp ? `${rect.top - mh - gap}px` : `${rect.bottom + gap}px`,
  }
}

/* ── Mở / đóng ──────────────────────────────────────────────── */
function openMenu(focusFirst = true) {
  if (open.value) return
  open.value = true
  // Đặt con trỏ bàn phím vào item khả dụng đầu tiên
  activeIndex.value = focusFirst ? (enabledIndexes.value[0] ?? -1) : -1
  nextTick(() => {
    updatePosition()
    // Chuyển focus vào menu để nhận phím ↑↓/Enter/Esc
    menuRef.value?.focus()
  })
}

function closeMenu(returnFocus = true) {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  // Esc/chọn xong: trả focus về activator (spec bàn phím MDS)
  if (returnFocus) focusActivator()
}

function focusActivator() {
  const el = activatorRef.value?.querySelector(
    'button, [href], [tabindex]:not([tabindex="-1"])'
  )
  ;(el || activatorRef.value?.firstElementChild)?.focus?.()
}

function toggle() {
  open.value ? closeMenu(false) : openMenu()
}

function selectItem(item) {
  if (!item || item.divider || item.disabled) return
  emit('select', item.key)
  closeMenu()
}

/* ── Bàn phím ───────────────────────────────────────────────────
   Trên activator: Enter/Space/↓ mở menu. Trong menu: ↑↓ di chuyển
   (bỏ qua divider + disabled, xoay vòng), Enter chọn, Esc đóng và
   trả focus về activator, Tab đóng. */
function onActivatorKeydown(e) {
  if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
    e.preventDefault()
    openMenu()
  }
}

function moveActive(dir) {
  const idxs = enabledIndexes.value
  if (!idxs.length) return
  const pos = idxs.indexOf(activeIndex.value)
  const next =
    pos < 0
      ? dir > 0
        ? idxs[0]
        : idxs[idxs.length - 1]
      : idxs[(pos + dir + idxs.length) % idxs.length]
  activeIndex.value = next
  nextTick(() => {
    menuRef.value
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function onMenuKeydown(e) {
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
      if (activeIndex.value >= 0) selectItem(props.items[activeIndex.value])
      break
    case 'Escape':
      e.preventDefault()
      closeMenu()
      break
    case 'Tab':
      // Tab rời menu thì đóng, không chặn Tab
      closeMenu(false)
      break
  }
}

/* ── Click ngoài đóng + bám theo activator khi scroll/resize ── */
function onDocMousedown(e) {
  if (
    !activatorRef.value?.contains(e.target) &&
    !menuRef.value?.contains(e.target)
  ) {
    closeMenu(false)
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
  <!-- display:contents — wrapper không ảnh hưởng layout -->
  <span
    ref="activatorRef"
    class="contents"
    @click="toggle"
    @keydown="onActivatorKeydown"
  >
    <!-- Activator tùy biến qua slot; mặc định là nút More ⋯ chuẩn MDS -->
    <slot name="activator" :open="open">
      <button
        type="button"
        aria-haspopup="menu"
        :aria-expanded="open"
        aria-label="Thêm thao tác"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--mds-icon-neutral)] transition-colors hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
        :class="open ? 'bg-[var(--mds-bg-hover-soft)]' : ''"
      >
        <MIcon name="dots" :size="16" />
      </button>
    </slot>
  </span>

  <!-- Menu teleport ra body, radius 4px theo spec popup -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      role="menu"
      tabindex="-1"
      :style="menuStyle"
      class="z-[1000] max-h-[320px] min-w-[180px] overflow-y-auto rounded-xl border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg outline-none"
      @keydown="onMenuKeydown"
    >
      <template v-for="(item, i) in items" :key="item.key ?? i">
        <!-- Divider: kẻ phân nhóm -->
        <div
          v-if="item.divider"
          role="separator"
          class="my-1 border-t border-[var(--mds-border)]"
        />
        <div
          v-else
          role="menuitem"
          :aria-disabled="item.disabled || undefined"
          :data-active="i === activeIndex"
          class="flex h-8 items-center gap-2 whitespace-nowrap px-3 text-[13px] leading-[18px]"
          :class="[
            item.disabled
              ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
              : 'cursor-pointer',
            !item.disabled && i === activeIndex
              ? 'bg-[var(--mds-bg-hover-soft)]'
              : '',
            // Item nguy hiểm (Xóa...): chữ + icon màu danger
            !item.disabled &&
              (item.danger
                ? 'text-[var(--mds-danger)]'
                : 'text-[var(--mds-text)]'),
          ]"
          @mouseenter="!item.disabled && (activeIndex = i)"
          @click="selectItem(item)"
        >
          <MIcon
            v-if="item.icon"
            :name="item.icon"
            :size="16"
            :class="
              item.disabled || item.danger
                ? ''
                : 'text-[var(--mds-icon-neutral)]'
            "
          />
          <span class="flex-1">{{ item.label }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>
