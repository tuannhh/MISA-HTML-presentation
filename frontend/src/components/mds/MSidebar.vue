<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MIcon from './MIcon.vue'
import { hasIcon } from './iconRegistry.generated.js'

/**
 * MSidebar — thanh điều hướng trái chuẩn MDS 2.0 (style sidebar TRẮNG).
 * 2 chế độ: Mở rộng (~240px, icon + label, nhóm con xổ dọc) và Thu gọn
 * (~56px, chỉ icon; hover hiện popover bên phải với label/menu con).
 * Active: rounded tab trong gutter, nền brand-50, chữ/icon brand-600 semibold.
 */
const props = defineProps({
  // [{ key, label, icon?, children?: [{ key, label }], badge? }]
  // icon: tên file SVG trong assets/icons (vd 'home', 'users'), không đuôi .svg
  items: { type: Array, default: () => [] },
  // key của item/child đang active (v-model)
  modelValue: { type: String, default: '' },
  // trạng thái thu gọn (v-model:collapsed)
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'update:collapsed'])


/* ── Trạng thái active ──────────────────────────────────────────
   Quy tắc MDS: item con active thì cha KHÔNG cần thể hiện active ở
   chế độ mở rộng; nhưng khi THU GỌN (con bị ẩn) thì cha phải active
   để người dùng biết đang ở phân hệ nào. */
const isActive = (key) => props.modelValue === key

function hasActiveChild(item) {
  return (item.children || []).some((c) => c.key === props.modelValue)
}

// Active hiển thị của item cấp 1 tùy theo chế độ
function parentActive(item) {
  if (isActive(item.key)) return true
  return props.collapsed && hasActiveChild(item)
}

/* ── Xổ / đóng nhóm con (chế độ mở rộng) ───────────────────── */
const openGroups = ref([]) // danh sách key nhóm đang xổ

function toggleGroup(key) {
  const i = openGroups.value.indexOf(key)
  i >= 0 ? openGroups.value.splice(i, 1) : openGroups.value.push(key)
}

const isOpen = (key) => openGroups.value.includes(key)

// Tự xổ nhóm chứa item con đang active (kể cả giá trị khởi tạo)
watch(
  () => props.modelValue,
  (val) => {
    const parent = props.items.find((it) =>
      (it.children || []).some((c) => c.key === val)
    )
    if (parent && !openGroups.value.includes(parent.key)) {
      openGroups.value.push(parent.key)
    }
  },
  { immediate: true }
)

/* ── Popover khi thu gọn ────────────────────────────────────────
   Hover item → popover nổi bên phải (teleport body, định vị theo
   getBoundingClientRect): item thường hiện label, item có children
   hiện menu con chọn được. Rời chuột khỏi cả item lẫn popover thì
   tự ẩn (delay nhỏ để kịp di chuột vào popover). */
const pop = ref(null) // { item, style }
const popRef = ref(null)
let hideTimer = null

function showPopover(item, ev) {
  if (!props.collapsed) return
  clearTimeout(hideTimer)
  const rect = ev.currentTarget.getBoundingClientRect()
  pop.value = {
    item,
    style: {
      position: 'fixed',
      left: `${rect.right + 6}px`,
      top: `${rect.top}px`,
    },
  }
  // Sau khi render: kẹp theo mép dưới viewport để menu con không tràn
  nextTick(() => {
    const el = popRef.value
    if (!el || !pop.value) return
    const maxTop = window.innerHeight - el.offsetHeight - 8
    if (rect.top > maxTop) {
      pop.value.style = { ...pop.value.style, top: `${Math.max(8, maxTop)}px` }
    }
  })
}

function scheduleHidePopover() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (pop.value = null), 120)
}

function cancelHidePopover() {
  clearTimeout(hideTimer)
}

// Cuộn/resize khi popover đang mở → đóng (anchor đã dịch chuyển)
function closePopover() {
  clearTimeout(hideTimer)
  pop.value = null
}

watch(pop, (val) => {
  if (val) {
    window.addEventListener('scroll', closePopover, true)
    window.addEventListener('resize', closePopover)
  } else {
    window.removeEventListener('scroll', closePopover, true)
    window.removeEventListener('resize', closePopover)
  }
})

// Đổi chế độ thu gọn/mở rộng thì dọn popover
watch(
  () => props.collapsed,
  () => closePopover()
)

onBeforeUnmount(() => {
  clearTimeout(hideTimer)
  window.removeEventListener('scroll', closePopover, true)
  window.removeEventListener('resize', closePopover)
})

/* ── Chọn item ─────────────────────────────────────────────── */
function selectKey(key) {
  emit('update:modelValue', key)
  closePopover()
}

function onItemClick(item, ev) {
  if (props.collapsed) {
    // Thu gọn: item có con → mở popover menu con (hỗ trợ cả touch);
    // item thường → chọn luôn
    item.children?.length ? showPopover(item, ev) : selectKey(item.key)
  } else {
    item.children?.length ? toggleGroup(item.key) : selectKey(item.key)
  }
}

function toggleCollapsed() {
  emit('update:collapsed', !props.collapsed)
}
</script>

<template>
  <!-- Sidebar trắng, border phải, transition width 200ms giữa 2 chế độ -->
  <aside
    class="flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--mds-border)] bg-[var(--mds-bg)] transition-[width] duration-200"
    :class="collapsed ? 'w-[var(--mds-layout-sidebar-sm-w)]' : 'w-[var(--mds-layout-sidebar-w)]'"
  >
    <nav class="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2" aria-label="Menu chính">
      <template v-for="item in items" :key="item.key">
        <!-- ── Item cấp 1 ── -->
        <button
          type="button"
          class="relative mb-1 flex h-8 w-full items-center rounded-lg text-[13px] leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="[
            collapsed ? 'justify-center' : 'gap-2.5 px-4 text-left',
            parentActive(item)
              ? 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]'
              : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-disabled)]',
          ]"
          :aria-expanded="item.children?.length ? (collapsed ? undefined : isOpen(item.key)) : undefined"
          :aria-current="parentActive(item) ? 'page' : undefined"
          :title="collapsed ? undefined : item.label"
          @click="onItemClick(item, $event)"
          @mouseenter="collapsed && showPopover(item, $event)"
          @mouseleave="collapsed && scheduleHidePopover()"
        >
          <!-- Icon 20px stroke 1.5 (wrapper relative để gắn chấm badge khi thu gọn) -->
          <span class="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <MIcon
              v-if="hasIcon(item.icon)"
              :name="item.icon"
              :size="20"
              :class="parentActive(item) ? '' : 'text-[var(--mds-icon-neutral)]'"
            />
            <!-- Fallback: icon không có trong bộ → ô tròn chữ cái đầu label -->
            <span
              v-else
              class="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--mds-brand-100)] text-[10px] font-semibold uppercase text-[var(--mds-brand-600)]"
            >
              {{ String(item.label || '?').trim().charAt(0) }}
            </span>
            <!-- Badge thu gọn: chấm đỏ góc trên phải icon -->
            <span
              v-if="collapsed && item.badge"
              class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--mds-danger)]"
              aria-hidden="true"
            />
          </span>

          <template v-if="!collapsed">
            <span class="flex-1 truncate">{{ item.label }}</span>
            <!-- Badge mở rộng: pill đỏ nhỏ cạnh label -->
            <span
              v-if="item.badge"
              class="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--mds-danger)] px-1 text-[11px] font-medium leading-none text-white"
            >
              {{ item.badge }}
            </span>
            <!-- Chevron xổ nhóm: xoay 180° khi đang mở -->
            <MIcon
              v-if="item.children?.length"
              name="chevron-down"
              :size="16"
              class="text-[var(--mds-icon-neutral)] transition-transform duration-200"
              :class="isOpen(item.key) ? 'rotate-180' : ''"
            />
          </template>
        </button>

        <!-- ── Nhóm con xổ dọc (chỉ ở chế độ mở rộng) ── -->
        <template v-if="!collapsed && item.children?.length && isOpen(item.key)">
          <button
            v-for="child in item.children"
            :key="child.key"
            type="button"
            class="relative mb-1 flex h-8 w-full items-center rounded-lg pl-[38px] pr-4 text-left text-[13px] leading-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
            :class="
              isActive(child.key)
                ? 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]'
                : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-disabled)]'
            "
            :aria-current="isActive(child.key) ? 'page' : undefined"
            @click="selectKey(child.key)"
          >
            <span class="truncate">{{ child.label }}</span>
          </button>
        </template>
      </template>
    </nav>

    <!-- ── Nút Thu gọn / Mở rộng: cuối sidebar, kẻ border-top ── -->
    <button
      type="button"
      class="flex h-10 w-full shrink-0 items-center border-t border-[var(--mds-border)] text-[13px] leading-[18px] text-[var(--mds-icon-neutral)] transition-colors hover:bg-[var(--mds-bg-disabled)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      :class="collapsed ? 'justify-center' : 'gap-2.5 px-4'"
      :aria-label="collapsed ? 'Mở rộng menu' : 'Thu gọn menu'"
      @click="toggleCollapsed"
    >
      <MIcon :name="collapsed ? 'chevrons-right' : 'chevrons-left'" :size="20" />
      <span v-if="!collapsed">Thu gọn</span>
    </button>
  </aside>

  <!-- ── Popover chế độ thu gọn (teleport body, nổi che giao diện) ── -->
  <Teleport to="body">
    <div
      v-if="pop"
      ref="popRef"
      :style="pop.style"
      class="z-[1000] min-w-[160px] max-w-[280px] rounded border border-[var(--mds-border)] bg-[var(--mds-bg)] py-1 shadow-lg"
      role="menu"
      @mouseenter="cancelHidePopover"
      @mouseleave="scheduleHidePopover"
    >
      <!-- Item có children: tên nhóm + menu con chọn được -->
      <template v-if="pop.item.children?.length">
        <div
          class="px-3 py-1.5 text-[13px] font-semibold leading-[18px] text-[var(--mds-text)]"
        >
          {{ pop.item.label }}
        </div>
        <button
          v-for="child in pop.item.children"
          :key="child.key"
          type="button"
          role="menuitem"
          class="flex h-8 w-full items-center px-3 text-left text-[13px] leading-[18px] transition-colors"
          :class="
            isActive(child.key)
              ? 'bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-600)]'
              : 'text-[var(--mds-text)] hover:bg-[var(--mds-bg-disabled)]'
          "
          @click="selectKey(child.key)"
        >
          <span class="truncate">{{ child.label }}</span>
        </button>
      </template>

      <!-- Item thường: chỉ hiện label (kèm badge nếu có) -->
      <div
        v-else
        class="flex items-center gap-2 px-3 py-1.5 text-[13px] leading-[18px] text-[var(--mds-text)]"
      >
        <span>{{ pop.item.label }}</span>
        <span
          v-if="pop.item.badge"
          class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--mds-danger)] px-1 text-[11px] font-medium leading-none text-white"
        >
          {{ pop.item.badge }}
        </span>
      </div>
    </div>
  </Teleport>
</template>
