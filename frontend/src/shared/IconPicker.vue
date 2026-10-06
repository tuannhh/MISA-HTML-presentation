<script setup>
// Chọn biểu tượng cho 1 mục (thẻ, ý, ghi chú số liệu) — lưới có hình xem trước + tìm theo tên, hoặc thay bằng ẢNH/LOGO
// (vd. logo OpenAI, Gemini… trên thẻ). Ảnh mở hộp chọn ảnh của trang cha (emit 'image'); bỏ ảnh → quay về biểu tượng.
// SVG lấy từ bộ icon cố định của renderer (hằng số tin cậy, không phải dữ liệu người dùng).
import { computed, ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import { ICONS, ICON_NAMES } from '@shared/deck/icons.js'

const props = defineProps({
  modelValue: { type: String, default: 'sparkles' },
  // Ảnh đang thay biểu tượng: { asset, fit } | null; imageUrl = URL xem trước.
  image: { type: Object, default: null },
  imageUrl: { type: String, default: '' },
  // Cho phép thay bằng ảnh/logo (trang cha có hộp chọn ảnh).
  allowImage: { type: Boolean, default: true },
  label: { type: String, default: 'Biểu tượng' },
})
const emit = defineEmits(['update:modelValue', 'image', 'clear-image'])
const open = ref(false)
const q = ref('')
const list = computed(() => {
  const k = q.value.trim().toLowerCase()
  return k ? ICON_NAMES.filter((n) => n.includes(k)) : ICON_NAMES
})
const svg = (name) => ICONS[name] || ICONS.sparkles
function pick(name) {
  emit('update:modelValue', name)
  open.value = false
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div class="flex min-w-0 items-center gap-2">
      <button
        type="button"
        class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[6px] border border-[var(--mds-border)] bg-[var(--mds-bg)] px-2 text-left text-[13px] hover:border-[var(--mds-brand-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mds-brand-600)]"
        :aria-expanded="open"
        :aria-label="`${label}: ${image?.asset ? 'ảnh' : modelValue}. Bấm để đổi`"
        @click="open = !open"
      >
        <span class="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-[4px] bg-[var(--mds-bg-page)] text-[var(--mds-brand-600)]">
          <img v-if="image?.asset && imageUrl" :src="imageUrl" alt="" class="h-full w-full object-contain" />
          <!-- eslint-disable-next-line vue/no-v-html -->
          <svg v-else viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="svg(modelValue)" />
        </span>
        <span class="min-w-0 flex-1 truncate">{{ image?.asset ? 'Ảnh / logo' : modelValue }}</span>
        <MIcon :name="open ? 'chevron-up' : 'chevron-down'" :size="16" class="shrink-0 text-[var(--mds-text-secondary)]" />
      </button>
      <MButton v-if="allowImage" variant="outline" :aria-label="image?.asset ? 'Đổi ảnh / logo' : 'Dùng ảnh hoặc logo thay biểu tượng'" @click="emit('image')">
        <template #icon><MIcon name="photo" :size="16" /></template>
        {{ image?.asset ? 'Đổi ảnh' : 'Ảnh/logo' }}
      </MButton>
      <MButton v-if="image?.asset" variant="icon" aria-label="Bỏ ảnh, dùng biểu tượng" @click="emit('clear-image')"><template #icon><MIcon name="x" :size="16" /></template></MButton>
    </div>

    <div v-if="open" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-2">
      <MInput v-model="q" placeholder="Tìm biểu tượng (chart, users, shield…)" aria-label="Tìm biểu tượng" />
      <p v-if="image?.asset" class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">Đang dùng ảnh — chọn biểu tượng sẽ bỏ ảnh.</p>
      <div role="listbox" :aria-label="label" class="grid max-h-[220px] grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1 overflow-y-auto">
        <button
          v-for="n in list"
          :key="n"
          type="button"
          role="option"
          :aria-selected="!image?.asset && n === modelValue"
          :title="n"
          :aria-label="n"
          class="grid aspect-square place-items-center rounded-[6px] text-[var(--mds-text)] hover:bg-[var(--mds-bg-page)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="!image?.asset && n === modelValue ? 'bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)] ring-2 ring-[var(--mds-brand-600)]' : ''"
          @click="image?.asset ? (emit('clear-image'), pick(n)) : pick(n)"
        >
          <!-- eslint-disable-next-line vue/no-v-html -->
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="svg(n)" />
        </button>
      </div>
      <p v-if="!list.length" class="py-2 text-center text-[12px] text-[var(--mds-text-secondary)]">Không có biểu tượng phù hợp.</p>
    </div>
  </div>
</template>
