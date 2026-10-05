<script setup>
/**
 * MTree — cây phân cấp (folder/danh mục/phòng ban...), spec
 * references/components/tree.md. Node lá không có chevron nhưng vẫn chừa
 * chỗ để nhãn thẳng cột với node cùng cấp có chevron (mục 5 "Thụt lề").
 * Cây được "làm phẳng" (flatten) thành danh sách dòng hiển thị theo
 * expandedKeys để tránh phải viết component đệ quy trong 1 file SFC.
 */
import { computed } from 'vue'
import MCheckbox from './MCheckbox.vue'
import MIcon from './MIcon.vue'

const props = defineProps({
  // node: { id, label, subtext?, disabled?, accent?, children?: [] }
  nodes: { type: Array, required: true },
  checkable: { type: Boolean, default: false },
  // v-model:selected — id của node đang chọn (single-select, click vào nhãn)
  selected: { type: [String, Number, null], default: null },
  // v-model:expanded — mảng id các node cha đang mở rộng
  expanded: { type: Array, default: () => [] },
  // v-model:checked — mảng id đang check (cascade cha/con, tự tính indeterminate)
  checked: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:selected', 'update:expanded', 'update:checked', 'node-click'])

const INDENT_STEP = 20 // px mỗi cấp — token spacing không quy định cụ thể (xem tree.md mục 5)

/* ── Làm phẳng cây theo trạng thái mở rộng để render bằng v-for thường ── */
const flatRows = computed(() => {
  const rows = []
  function walk(list, depth) {
    for (const node of list) {
      const hasChildren = !!(node.children && node.children.length)
      rows.push({ node, depth, hasChildren })
      if (hasChildren && props.expanded.includes(node.id)) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(props.nodes, 0)
  return rows
})

/* ── Checkbox cascade cha/con + indeterminate (spec: có thể chọn nhiều node) ── */

function descendantIds(node) {
  const ids = []
  for (const child of node.children || []) {
    ids.push(child.id, ...descendantIds(child))
  }
  return ids
}

function isNodeChecked(node) {
  if (!node.children || node.children.length === 0) return props.checked.includes(node.id)
  const desc = descendantIds(node)
  return desc.length > 0 && desc.every((id) => props.checked.includes(id))
}

function isNodeIndeterminate(node) {
  if (!node.children || node.children.length === 0) return false
  const desc = descendantIds(node)
  const checkedCount = desc.filter((id) => props.checked.includes(id)).length
  return checkedCount > 0 && checkedCount < desc.length
}

function toggleCheck(node) {
  if (node.disabled) return
  const ids = [node.id, ...descendantIds(node)]
  const nowChecked = !isNodeChecked(node)
  let next
  if (nowChecked) {
    next = [...new Set([...props.checked, ...ids])]
  } else {
    next = props.checked.filter((id) => !ids.includes(id))
  }
  emit('update:checked', next)
}

/* ── Expand/collapse + chọn node ─────────────────────────────────────── */

function toggleExpand(node) {
  if (node.disabled) return
  const next = props.expanded.includes(node.id)
    ? props.expanded.filter((id) => id !== node.id)
    : [...props.expanded, node.id]
  emit('update:expanded', next)
}

function selectNode(node) {
  if (node.disabled) return
  emit('update:selected', node.id)
  emit('node-click', node)
}
</script>

<template>
  <div role="tree" class="select-none text-[13px] leading-[18px]">
    <div
      v-for="{ node, depth, hasChildren } in flatRows"
      :key="node.id"
      role="treeitem"
      tabindex="0"
      :aria-expanded="hasChildren ? expanded.includes(node.id) : undefined"
      :aria-selected="selected === node.id"
      :aria-disabled="node.disabled || undefined"
      class="flex items-center gap-1.5 rounded-lg py-1.5 pr-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--mds-brand-600)]"
      :class="[
        node.disabled
          ? 'cursor-not-allowed'
          : 'cursor-pointer hover:bg-[var(--mds-bg-hover-soft)]',
        selected === node.id && !node.disabled ? 'bg-[var(--mds-brand-50)]' : '',
      ]"
      :style="{ paddingLeft: depth * INDENT_STEP + 8 + 'px' }"
      @click="selectNode(node)"
      @keydown.enter.prevent="selectNode(node)"
    >
      <!-- Chevron: chỉ node có con mới có; node lá vẫn chừa chỗ để nhãn thẳng cột -->
      <button
        v-if="hasChildren"
        type="button"
        class="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--mds-icon-neutral)]"
        :disabled="node.disabled"
        :aria-label="expanded.includes(node.id) ? 'Thu gọn' : 'Mở rộng'"
        @click.stop="toggleExpand(node)"
      >
        <MIcon :name="expanded.includes(node.id) ? 'chevron-down' : 'chevron-right'" :size="16" />
      </button>
      <span v-else class="h-4 w-4 shrink-0" />

      <!-- Checkbox: tùy chọn, giữa chevron và nhãn (spec mục 2) -->
      <span v-if="checkable" class="shrink-0" @click.stop="toggleCheck(node)">
        <MCheckbox
          :model-value="isNodeChecked(node)"
          :indeterminate="isNodeIndeterminate(node)"
          :disabled="node.disabled"
        />
      </span>

      <!-- Nhãn: 1 dòng (Title) hoặc 2 dòng (Title + Subtext) -->
      <span class="min-w-0 flex-1 truncate">
        <span
          class="block truncate"
          :class="[
            node.disabled
              ? 'text-[var(--mds-text-placeholder)]'
              : node.accent
                ? 'text-[var(--mds-brand-600)]'
                : 'text-[var(--mds-text)]',
          ]"
        >
          {{ node.label }}
        </span>
        <span
          v-if="node.subtext"
          class="block truncate text-[12px] leading-[16px]"
          :class="node.disabled ? 'text-[var(--mds-text-placeholder)]' : 'text-[var(--mds-text-secondary)]'"
        >
          {{ node.subtext }}
        </span>
      </span>
    </div>
  </div>
</template>
