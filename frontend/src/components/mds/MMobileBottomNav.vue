<script setup>
/**
 * MMobileBottomNav — điều hướng cấp một của APP CON, không phải bottom nav của
 * native host MISA AMIS. Chỉ dùng 3–5 mục; `kind: 'fab'` dành cho đúng một thao
 * tác tạo/tải lên thường xuyên ở giữa thanh.
 */
import MIcon from './MIcon.vue'

defineProps({
  items: {
    type: Array,
    required: true,
    validator: (items) => items.length >= 3 && items.length <= 5,
  }, // [{ key, label, icon, kind?: 'fab', ariaLabel? }]
  active: { type: String, required: true },
})

const emit = defineEmits(['select'])
</script>

<template>
  <nav
    aria-label="Điều hướng ứng dụng"
    class="grid shrink-0 border-t border-[var(--mds-border-light)] bg-[var(--mds-bg)]"
    :style="{
      gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
      minHeight: 'calc(var(--mds-mobile-bottom-nav-height) + var(--mds-mobile-safe-bottom))',
      paddingBottom: 'var(--mds-mobile-safe-bottom)',
    }"
  >
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="mds-mobile-nav-item mds-mobile-column-gap-1 flex min-w-0 flex-col items-center justify-center gap-1 overflow-visible px-1 py-1 text-center active:bg-[var(--mds-bg-hover-soft)]"
      :class="active === item.key ? 'font-medium text-[var(--mds-brand-600)]' : 'text-[var(--mds-text-secondary)]'"
      :aria-label="item.ariaLabel || item.label"
      :aria-current="active === item.key ? 'page' : undefined"
      :title="item.label"
      @click="emit('select', item.key)"
    >
      <span
        v-if="item.kind === 'fab'"
        class="-mt-5 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--mds-brand-600)] text-white shadow-[var(--mds-shadow-md)]"
      >
        <MIcon :name="item.icon" :size="24" />
      </span>
      <MIcon v-else :name="item.icon" :size="24" />
      <span class="block w-full truncate whitespace-nowrap text-[11px] leading-[14px]">
        {{ item.label }}
      </span>
    </button>
  </nav>
</template>
