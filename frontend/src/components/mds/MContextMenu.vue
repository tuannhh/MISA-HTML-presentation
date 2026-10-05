<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import MIcon from './MIcon.vue'

const props = defineProps({
  // Mảng item: { key, label, icon?, danger?, disabled?, divider?, children? }
  // - icon: tên file trong assets/icons (vd 'pencil', 'trash') — render inline SVG stroke 1.5, 16px
  // - danger: chữ đỏ --mds-danger (xóa/hủy)
  // - divider: true → chỉ vẽ đường kẻ phân cách nhóm (theo spec Context menu MDS)
  // - children: mảng item con — submenu mở sang phải khi hover
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['select'])


const visible = ref(false)
const pos = ref({ x: 0, y: 0 })
const payload = ref(null)
const activeIndex = ref(-1)
// Submenu: index item cha đang mở, index item con đang active, hướng lật
const subOpen = ref(-1)
const subActive = ref(-1)
const subLeft = ref(false)
const subUp = ref(false)

const menuEl = ref(null)
const activatorEl = ref(null)
let subEl = null
function setSubEl(el) {
  subEl = el
}

// Cột icon chỉ chừa chỗ khi có ít nhất 1 item mang icon (giữ nhãn thẳng hàng theo spec)
const hasIcons = computed(() => props.items.some((it) => it.icon))

function closeSub() {
  subOpen.value = -1
  subActive.value = -1
  subLeft.value = false
  subUp.value = false
}

/* ── Mở/đóng ───────────────────────────────────────────── */

// API public: menuRef.open(event, payload) — định vị theo tọa độ chuột,
// tự lật khi sát mép màn hình
async function open(evt, pl) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault()
  payload.value = pl !== undefined ? pl : null
  activeIndex.value = -1
  closeSub()
  visible.value = true
  pos.value = { x: evt?.clientX ?? 0, y: evt?.clientY ?? 0 }
  await nextTick()
  const m = menuEl.value?.getBoundingClientRect()
  if (!m) return
  let { x, y } = pos.value
  // Sát mép phải/dưới → lật menu về phía ngược lại của con trỏ
  if (x + m.width > window.innerWidth - 8) x = Math.max(8, x - m.width)
  if (y + m.height > window.innerHeight - 8) y = Math.max(8, y - m.height)
  pos.value = { x, y }
  bindGlobal()
}

// Chế độ activator: click nút (⋮ / dropdown) → menu neo dưới nút, căn trái
async function onActivatorClick() {
  if (visible.value) {
    close()
    return
  }
  const r = activatorEl.value?.getBoundingClientRect()
  if (!r) return
  payload.value = null
  activeIndex.value = -1
  closeSub()
  visible.value = true
  pos.value = { x: r.left, y: r.bottom + 4 }
  await nextTick()
  const m = menuEl.value?.getBoundingClientRect()
  if (!m) return
  let { x, y } = pos.value
  // Lật theo cạnh nút khi thiếu chỗ
  if (x + m.width > window.innerWidth - 8) x = Math.max(8, r.right - m.width)
  if (y + m.height > window.innerHeight - 8) y = Math.max(8, r.top - m.height - 4)
  pos.value = { x, y }
  bindGlobal()
}

function close() {
  visible.value = false
  closeSub()
  unbindGlobal()
}

/* ── Đóng khi click ngoài / cuộn / resize ─────────────────── */

function onDocMousedown(e) {
  if (menuEl.value && menuEl.value.contains(e.target)) return
  // Click lên activator để handler toggle của nó xử lý, không đóng 2 lần
  if (activatorEl.value && activatorEl.value.contains(e.target)) return
  close()
}

function onScroll(e) {
  // Cuộn bên trong menu (danh sách dài) thì giữ nguyên
  if (menuEl.value && e.target instanceof Node && menuEl.value.contains(e.target)) return
  close()
}

function bindGlobal() {
  document.addEventListener('mousedown', onDocMousedown, true)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', close)
}

function unbindGlobal() {
  document.removeEventListener('mousedown', onDocMousedown, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', close)
}

onBeforeUnmount(unbindGlobal)

/* ── Chọn item ────────────────────────────────────────────── */

function selectItem(item) {
  if (!item || item.disabled || item.divider) return
  emit('select', { key: item.key, payload: payload.value })
  close()
}

function onRootClick(item, i) {
  if (item.disabled) return
  // Item có submenu: click chỉ mở submenu, không emit
  if (item.children && item.children.length) {
    activeIndex.value = i
    openSubFor(i, false)
    return
  }
  selectItem(item)
}

/* ── Submenu: mở sang phải khi hover, tự lật khi sát mép ──── */

async function openSubFor(i, focusFirst) {
  subOpen.value = i
  subLeft.value = false
  subUp.value = false
  subActive.value = focusFirst ? nextEnabled(props.items[i].children, -1, 1) : -1
  await nextTick()
  const r = subEl?.getBoundingClientRect()
  if (!r) return
  if (r.right > window.innerWidth - 8) subLeft.value = true
  if (r.bottom > window.innerHeight - 8) subUp.value = true
}

function onRootEnter(item, i) {
  if (item.disabled) {
    activeIndex.value = -1
    closeSub()
    return
  }
  activeIndex.value = i
  subActive.value = -1
  if (item.children && item.children.length) openSubFor(i, false)
  else closeSub()
}

/* ── Bàn phím: ↑↓ di chuyển, Enter chọn, →/← mở/đóng submenu, Esc đóng ── */

// Tìm index item chọn được kế tiếp (bỏ qua divider và disabled), xoay vòng
function nextEnabled(list, from, dir) {
  const n = list.length
  let i = from
  for (let s = 0; s < n; s++) {
    i = (i + dir + n) % n
    if (i < 0) i = dir > 0 ? 0 : n - 1
    const it = list[i]
    if (it && !it.divider && !it.disabled) return i
  }
  return -1
}

function onKeydown(e) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', ' ', 'Escape'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    close()
    return
  }
  const inSub = subOpen.value >= 0 && subActive.value >= 0
  const subItems = subOpen.value >= 0 ? props.items[subOpen.value]?.children || [] : []
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const dir = e.key === 'ArrowDown' ? 1 : -1
    if (inSub) {
      subActive.value = nextEnabled(subItems, subActive.value, dir)
    } else {
      activeIndex.value = nextEnabled(props.items, activeIndex.value, dir)
      closeSub()
    }
    return
  }
  const rootItem = props.items[activeIndex.value]
  if (e.key === 'ArrowRight') {
    if (!inSub && rootItem?.children?.length && !rootItem.disabled) openSubFor(activeIndex.value, true)
    return
  }
  if (e.key === 'ArrowLeft') {
    if (subOpen.value >= 0) closeSub()
    return
  }
  // Enter / Space
  if (inSub) {
    selectItem(subItems[subActive.value])
  } else if (rootItem?.children?.length) {
    openSubFor(activeIndex.value, true)
  } else {
    selectItem(rootItem)
  }
}

defineExpose({ open, close })
</script>

<template>
  <!-- Activator (tùy chọn): nút ⋮ / dropdown — click để mở menu neo dưới nút -->
  <span v-if="$slots.activator" ref="activatorEl" class="inline-flex" @click="onActivatorClick">
    <slot name="activator" />
  </span>

  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuEl"
      class="fixed z-[1100] max-h-[70vh] min-w-[180px] overflow-y-auto rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      role="menu"
      @contextmenu.prevent
    >
      <template v-for="(item, i) in items" :key="item.key ?? i">
        <!-- Đường kẻ ngăn cách giữa các nhóm chức năng liên quan (theo spec) -->
        <div v-if="item.divider" class="my-1 border-t border-[var(--mds-border)]" role="separator" />
        <div v-else class="relative">
          <button
            type="button"
            role="menuitem"
            :aria-disabled="item.disabled || undefined"
            :aria-haspopup="item.children && item.children.length ? 'menu' : undefined"
            class="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] leading-[18px]"
            :class="[
              item.disabled
                ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
                : item.danger
                  ? 'text-[var(--mds-danger)]'
                  : 'text-[var(--mds-text)]',
              !item.disabled && activeIndex === i ? 'bg-[var(--mds-bg-hover-soft)]' : '',
            ]"
            @mouseenter="onRootEnter(item, i)"
            @click="onRootClick(item, i)"
          >
            <!-- Icon 16px stroke 1.5; không có icon vẫn chừa chỗ để nhãn thẳng hàng -->
            <span
              v-if="hasIcons"
              class="flex w-4 shrink-0 items-center justify-center"
              :class="item.disabled || item.danger ? '' : 'text-[var(--mds-icon-neutral)]'"
            >
              <MIcon v-if="item.icon" :name="item.icon" :size="16" />
            </span>
            <span class="flex-1 truncate">{{ item.label }}</span>
            <!-- Mũi tên báo có submenu -->
            <MIcon v-if="item.children && item.children.length" name="chevron-right" :size="16" class="text-[var(--mds-icon-neutral)]" />
          </button>

          <!-- Submenu mở sang phải khi hover; lật sang trái/lên trên khi sát mép -->
          <div
            v-if="subOpen === i && item.children && item.children.length"
            :ref="setSubEl"
            class="absolute z-[1101] min-w-[180px] rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
            :class="[subLeft ? 'right-full' : 'left-full', subUp ? 'bottom-0' : 'top-0']"
            role="menu"
          >
            <template v-for="(child, j) in item.children" :key="child.key ?? j">
              <div v-if="child.divider" class="my-1 border-t border-[var(--mds-border)]" role="separator" />
              <button
                v-else
                type="button"
                role="menuitem"
                :aria-disabled="child.disabled || undefined"
                class="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] leading-[18px]"
                :class="[
                  child.disabled
                    ? 'cursor-not-allowed text-[var(--mds-text-placeholder)]'
                    : child.danger
                      ? 'text-[var(--mds-danger)]'
                      : 'text-[var(--mds-text)]',
                  !child.disabled && subActive === j ? 'bg-[var(--mds-bg-hover-soft)]' : '',
                ]"
                @mouseenter="subActive = child.disabled ? -1 : j"
                @click="selectItem(child)"
              >
                <span
                  v-if="item.children.some((c) => c.icon)"
                  class="flex w-4 shrink-0 items-center justify-center"
                  :class="child.disabled || child.danger ? '' : 'text-[var(--mds-icon-neutral)]'"
                >
                  <MIcon v-if="child.icon" :name="child.icon" :size="16" />
                </span>
                <span class="flex-1 truncate">{{ child.label }}</span>
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>
