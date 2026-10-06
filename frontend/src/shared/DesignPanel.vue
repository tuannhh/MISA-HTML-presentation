<script setup>
// Thiết kế toàn bài: Màu sắc (+ phong cách) · Nền động · Phông chữ · Logo · Thương hiệu (ảnh nhận diện + mẫu) (+ chân trang).
// Sửa trực tiếp vào object thiết kế
// (outline.design ở bước dàn ý, hoặc chính spec trong trình soạn thảo — cùng các trường theme/palette/background/font/logo).
import { computed, ref } from 'vue'
import MTabs from '@/components/mds/MTabs.vue'
import MInput from '@/components/mds/MInput.vue'
import FormField from './FormField.vue'
import ThemePicker from './ThemePicker.vue'
import BackgroundPicker from './BackgroundPicker.vue'
import FontPicker from './FontPicker.vue'
import LogoSettings from './LogoSettings.vue'
import BrandSettings from './BrandSettings.vue'
import DesignPreview from './DesignPreview.vue'
import { CUSTOM_THEME, themeTone } from '@/lib/design.js'
import { SPEC_LIMITS as L, STYLE_OPTIONS } from '@/lib/slideModel.js'

const props = defineProps({
  design: { type: Object, required: true },
  media: { type: Object, required: true },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  ratio: { type: String, default: '16:9' },
  // Chân trang (v-model:footer) — undefined = không hiển thị ô nhập.
  footer: { type: String, default: undefined },
  compact: { type: Boolean, default: false },
  showPreview: { type: Boolean, default: true },
})
const emit = defineEmits(['update:footer'])
// Trường thiết kế mặc định đã được bổ sung khi nạp dữ liệu (withDesignDefaults ở composable).
const d = computed(() => props.design)
const tab = ref('color')
const TABS = [
  { key: 'color', label: 'Màu sắc' },
  { key: 'bg', label: 'Nền' },
  { key: 'font', label: 'Phông chữ' },
  { key: 'logo', label: 'Logo' },
  { key: 'brand', label: 'Thương hiệu' },
]
// Phong cách hình khối chỉ có ở bài đã dựng (spec.style) — bước dàn ý chưa có.
const hasStyle = computed(() => typeof d.value.style === 'string')

const tone = computed(() => themeTone(d.value.theme, d.value.palette))
function onTone(t) {
  if (d.value.theme === CUSTOM_THEME && d.value.palette) d.value.palette.tone = t
}
function onTheme(v) {
  if (v === CUSTOM_THEME) d.value.palette = d.value.palette || { tone: tone.value, primary: '', secondary: '' }
  else d.value.palette = null
  d.value.theme = v
}
function onColor(key, v) {
  if (!d.value.palette) d.value.palette = { tone: tone.value, primary: '', secondary: '' }
  d.value.palette[key] = v
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <DesignPreview v-if="showPreview" :design="d" :media="media" :title="title" :subtitle="subtitle" :ratio="ratio" />
    <div class="-mx-1 overflow-x-auto px-1 pb-1"><MTabs v-model="tab" :tabs="TABS" variant="pill" /></div>

    <template v-if="tab === 'color'">
      <ThemePicker
        :tone="tone"
        :theme="d.theme"
        :primary="d.palette?.primary || ''"
        :secondary="d.palette?.secondary || ''"
        :compact="compact"
        @update:tone="onTone"
        @update:theme="onTheme"
        @update:primary="(v) => onColor('primary', v)"
        @update:secondary="(v) => onColor('secondary', v)"
      />
      <fieldset v-if="hasStyle" class="flex flex-col gap-2">
        <legend class="mb-1 text-[13px] font-medium">Phong cách trình bày</legend>
        <div role="radiogroup" aria-label="Phong cách trình bày" class="grid grid-cols-2 gap-2">
          <button
            v-for="o in STYLE_OPTIONS"
            :key="o.value"
            type="button"
            role="radio"
            :aria-checked="d.style === o.value"
            class="flex flex-col items-start rounded-lg border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--mds-brand-600)]"
            :class="d.style === o.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
            @click="d.style = o.value"
          >
            <span class="text-[13px] font-medium leading-[18px]" :class="d.style === o.value ? 'text-[var(--mds-brand-700)]' : ''">{{ o.label }}</span>
            <span class="text-[11px] leading-4 text-[var(--mds-text-secondary)]">{{ o.hint }}</span>
          </button>
        </div>
      </fieldset>
    </template>
    <div v-else-if="tab === 'bg'" class="flex flex-col gap-2">
      <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">Hiệu ứng chuyển động phía sau nội dung, theo màu của tông đã chọn. {{ compact ? 'Chạm để chọn và xem chuyển động.' : 'Rê chuột để xem chuyển động.' }}</p>
      <BackgroundPicker v-model="d.background" :theme="d.theme" :palette="d.palette" :compact="compact" />
    </div>
    <div v-else-if="tab === 'font'" class="flex flex-col gap-2">
      <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">Phông được nhúng kèm bài trình bày — máy chiếu/máy khác không cài phông vẫn hiển thị đúng, đủ dấu tiếng Việt.</p>
      <FontPicker v-model="d.font" />
    </div>
    <LogoSettings v-else-if="tab === 'logo'" v-model="d.logo" :media="media" :theme="d.theme" :palette="d.palette" />
    <BrandSettings v-else-if="tab === 'brand'" :design="d" :media="media" :ratio="ratio" :compact="compact" />

    <FormField v-if="footer !== undefined" label="Chân trang" hint="Hiển thị ở góc dưới mỗi trang; để trống sẽ dùng tên bài">
      <MInput :model-value="footer" :error="(footer || '').length > L.footer ? `Tối đa ${L.footer} ký tự` : ''" @update:model-value="(v) => emit('update:footer', v)" />
    </FormField>
  </div>
</template>
