<script setup>
// Bottom sheet hành động cho mini-app (MDS chưa có component riêng): hàng chạm 52px, icon MDS, Esc/chạm nền để đóng,
// đưa focus vào sheet khi mở và trả focus về chỗ cũ khi đóng.
import { nextTick, ref, watch, onBeforeUnmount } from 'vue'
import MIcon from '@/components/mds/MIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  items: { type: Array, default: () => [] }, // [{ key, label, icon, danger, disabled, divider }]
})
const emit = defineEmits(['update:modelValue', 'select'])
const sheet = ref(null)
let lastFocus = null

function close() {
  emit('update:modelValue', false)
}
function pick(it) {
  if (it.disabled) return
  emit('select', it.key) // phát trước khi đóng để trang cha còn biết sheet nào đang mở
  close()
}
const onKey = (e) => e.key === 'Escape' && close()

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      lastFocus = document.activeElement
      document.addEventListener('keydown', onKey)
      await nextTick()
      sheet.value?.querySelector('button:not([disabled])')?.focus()
    } else {
      document.removeEventListener('keydown', onKey)
      lastFocus?.focus?.()
    }
  },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="mds-mobile-app fixed inset-0 z-[1000] flex flex-col justify-end bg-black/40" @click.self="close">
      <div
        ref="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'Thao tác'"
        class="relative max-h-[80dvh] overflow-y-auto rounded-t-xl bg-[var(--mds-bg)] pt-2"
        :style="{ paddingBottom: 'calc(8px + var(--mds-mobile-safe-bottom))' }"
      >
        <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--mds-border)]" aria-hidden="true" />
        <p v-if="title" class="truncate px-4 pb-2 text-[14px] font-semibold leading-5 text-[var(--mds-text-secondary)]">{{ title }}</p>
        <template v-for="it in items" :key="it.key">
          <hr v-if="it.divider" class="my-1 border-[var(--mds-border-light)]" />
          <button
            v-else
            type="button"
            class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px] leading-6 active:bg-[var(--mds-bg-hover-soft)] disabled:opacity-40"
            :class="it.danger ? 'text-[var(--mds-danger)]' : 'text-[var(--mds-text)]'"
            :disabled="it.disabled"
            @click="pick(it)"
          >
            <MIcon v-if="it.icon" :name="it.icon" :size="24" :class="it.danger ? '' : 'text-[var(--mds-icon-neutral)]'" />
            <span class="min-w-0 flex-1 truncate">{{ it.label }}</span>
          </button>
        </template>
        <hr class="my-1 border-[var(--mds-border-light)]" />
        <button type="button" class="flex min-h-[52px] w-full items-center justify-center px-4 text-[16px] font-medium text-[var(--mds-text)] active:bg-[var(--mds-bg-hover-soft)]" @click="close">Đóng</button>
      </div>
    </div>
  </Teleport>
</template>
