<script setup>
/**
 * MCollapseExpandPanel — tab nhỏ thu/mở một khối nội dung (hàng KPI trên bảng,
 * panel Detail...), gắn vào đường kẻ phân cách theo 1 trong 4 cạnh.
 * Spec: references/patterns/sidebar.md mục 1 (CollapseExpandPanel) —
 * tab 40×16px (side top/bottom) hoặc 16×40px (side left/right), nền trắng
 * hoặc xám, viền 1px, bo 4px ở 2 góc phía KHÔNG gắn vào đường kẻ, icon chevron
 * 13px đảo chiều theo side + trạng thái collapsed.
 */
import MIcon from './MIcon.vue'

const props = defineProps({
  // Cạnh của khối nội dung mà tab này gắn vào (đường kẻ nằm ở cạnh đối diện
  // hướng bo góc) — quyết định tab ngang (top/bottom) hay dọc (left/right)
  side: {
    type: String,
    default: 'bottom',
    validator: (v) => ['top', 'bottom', 'left', 'right'].includes(v),
  },
  collapsed: { type: Boolean, default: false },
  background: {
    type: String,
    default: 'white',
    validator: (v) => ['white', 'neutral'].includes(v),
  },
})
const emit = defineEmits(['update:collapsed', 'toggle'])

const ROUNDED_CORNERS = {
  // Bo góc ở 2 góc phía KHÔNG gắn vào đường kẻ (phía "nhô ra")
  bottom: 'rounded-b',
  top: 'rounded-t',
  left: 'rounded-l',
  right: 'rounded-r',
}

// Icon chevron trỏ theo hướng hành động tiếp theo: khi mở, trỏ về phía nội
// dung (thu vào); khi thu gọn, trỏ ra ngoài (mở ra lại)
const CHEVRON_ICON = {
  bottom: { expanded: 'chevron-up', collapsed: 'chevron-down' },
  top: { expanded: 'chevron-down', collapsed: 'chevron-up' },
  left: { expanded: 'chevron-right', collapsed: 'chevron-left' },
  right: { expanded: 'chevron-left', collapsed: 'chevron-right' },
}

function toggle() {
  const next = !props.collapsed
  emit('update:collapsed', next)
  emit('toggle', next)
}
</script>

<template>
  <button
    type="button"
    class="flex shrink-0 items-center justify-center border transition-colors"
    :class="[
      ROUNDED_CORNERS[side],
      side === 'top' || side === 'bottom' ? 'h-4 w-10' : 'h-10 w-4',
      background === 'neutral' ? 'bg-[var(--mds-bg-page)]' : 'bg-[var(--mds-bg)]',
      'border-[var(--mds-border-light,var(--mds-border))] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]',
    ]"
    :aria-label="collapsed ? 'Mở rộng' : 'Thu gọn'"
    :aria-expanded="!collapsed"
    @click="toggle"
  >
    <MIcon :name="collapsed ? CHEVRON_ICON[side].collapsed : CHEVRON_ICON[side].expanded" :size="12" />
  </button>
</template>
