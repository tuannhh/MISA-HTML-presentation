<script setup>
// Chọn phông chữ cho tiêu đề và nội dung. Phông được nhúng sẵn trong bài (không phụ thuộc máy người xem),
// ô chọn hiển thị mẫu chữ tiếng Việt bằng chính phông đó.
import { onMounted } from 'vue'
import { FONT_OPTIONS, ensureDeckFonts } from '@/lib/design.js'

const props = defineProps({
  modelValue: { type: Object, default: () => ({ heading: 'inter', body: 'inter' }) },
  name: { type: String, default: 'deck-font' },
})
const emit = defineEmits(['update:modelValue'])
const ROLES = [
  { key: 'heading', label: 'Tiêu đề', sample: 'Chuyển đổi số 2026', weight: 800, size: 17 },
  { key: 'body', label: 'Nội dung', sample: 'Dữ liệu thông minh, quyết định nhanh hơn', weight: 400, size: 13 },
]
const set = (role, v) => emit('update:modelValue', { ...props.modelValue, [role]: v })
// Kiểu chữ tiêu đề trang: mặc định viết hoa đầu câu (không lưu trường), hoặc VIẾT HOA TOÀN BỘ (hiển thị bằng CSS, chữ gốc giữ nguyên).
const CASES = [
  { value: 'sentence', label: 'Viết hoa đầu câu', sample: 'Chương trình ưu đãi MISA AMIS' },
  { value: 'upper', label: 'Viết hoa toàn bộ', sample: 'CHƯƠNG TRÌNH ƯU ĐÃI MISA AMIS' },
]
const titleCase = () => (props.modelValue.titleCase === 'upper' ? 'upper' : 'sentence')
function setCase(v) {
  const { titleCase: _old, ...rest } = props.modelValue
  emit('update:modelValue', v === 'upper' ? { ...rest, titleCase: 'upper' } : rest)
}
onMounted(ensureDeckFonts)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <fieldset v-for="r in ROLES" :key="r.key" class="flex min-w-0 flex-col gap-1">
      <legend class="mb-1 text-[13px] font-medium">Phông {{ r.label.toLowerCase() }}</legend>
      <div role="radiogroup" :aria-label="`Phông ${r.label.toLowerCase()}`" class="grid grid-cols-1 gap-1.5">
        <label
          v-for="f in FONT_OPTIONS"
          :key="f.value"
          class="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
          :class="modelValue[r.key] === f.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
        >
          <input type="radio" class="sr-only" :name="`${name}-${r.key}`" :value="f.value" :checked="modelValue[r.key] === f.value" @change="set(r.key, f.value)" />
          <span class="w-[92px] shrink-0 text-[12px] text-[var(--mds-text-secondary)]">{{ f.label }}</span>
          <span class="min-w-0 flex-1 truncate leading-6 text-[var(--mds-text)]" :style="{ fontFamily: f.stack, fontWeight: r.weight, fontSize: `${r.size}px` }">{{ r.sample }}</span>
        </label>
      </div>
    </fieldset>
    <fieldset class="flex min-w-0 flex-col gap-1">
      <legend class="mb-1 text-[13px] font-medium">Kiểu chữ tiêu đề trang</legend>
      <div role="radiogroup" aria-label="Kiểu chữ tiêu đề trang" class="grid grid-cols-1 gap-1.5">
        <label
          v-for="c in CASES"
          :key="c.value"
          class="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
          :class="titleCase() === c.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
        >
          <input type="radio" class="sr-only" :name="`${name}-case`" :value="c.value" :checked="titleCase() === c.value" @change="setCase(c.value)" />
          <span class="w-[92px] shrink-0 text-[12px] text-[var(--mds-text-secondary)]">{{ c.label }}</span>
          <span class="min-w-0 flex-1 truncate text-[14px] font-bold leading-6 text-[var(--mds-text)]">{{ c.sample }}</span>
        </label>
      </div>
      <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">MISA, AMIS, ASP, AI, JETPAY luôn viết hoa.</p>
    </fieldset>
  </div>
</template>
