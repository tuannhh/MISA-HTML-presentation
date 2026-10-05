<script setup>
// Chọn mẫu nền động (10 mẫu công nghệ + không hiệu ứng). Ô xem trước vẽ bằng đúng mã nền của deck, theo màu của tông đã chọn;
// chỉ ô đang chọn / đang rê chuột mới chuyển động (tránh 11 canvas cùng chạy).
import { computed, ref } from 'vue'
import DeckBgCanvas from './DeckBgCanvas.vue'
import { BACKGROUND_OPTIONS, previewColors } from '@/lib/design.js'

const props = defineProps({
  modelValue: { type: String, default: 'network' },
  theme: { type: String, default: 'midnight' },
  palette: { type: Object, default: null },
  name: { type: String, default: 'deck-bg' },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const hover = ref('')
const colors = computed(() => previewColors(props.theme, props.palette))
</script>

<template>
  <div role="radiogroup" aria-label="Mẫu nền" class="grid gap-2" :class="compact ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(132px,1fr))]'">
    <label
      v-for="o in BACKGROUND_OPTIONS"
      :key="o.value"
      class="flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border p-1.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
      :class="modelValue === o.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
      @mouseenter="hover = o.value"
      @mouseleave="hover = ''"
    >
      <input type="radio" class="sr-only" :name="name" :value="o.value" :checked="modelValue === o.value" @change="emit('update:modelValue', o.value)" />
      <span class="relative block aspect-[16/9] w-full overflow-hidden rounded-[4px]" :style="{ background: colors.bg }">
        <!-- Ô nhỏ (~150px): khung logic 640×360 + chồng 3 lớp để nét đủ rõ mà vẫn đúng hình mẫu -->
        <DeckBgCanvas v-if="o.value !== 'none'" :name="o.value" :colors="colors" :animate="modelValue === o.value || hover === o.value" :logical-width="640" :logical-height="360" :boost="3" class="absolute inset-0 opacity-90" />
        <span v-else class="absolute inset-0 grid place-items-center text-[11px]" :style="{ color: colors.ink, opacity: 0.6 }">Nền trơn</span>
      </span>
      <span class="truncate px-0.5 text-[12px] font-medium leading-4" :class="modelValue === o.value ? 'text-[var(--mds-brand-600)]' : 'text-[var(--mds-text)]'">{{ o.label }}</span>
    </label>
  </div>
</template>
