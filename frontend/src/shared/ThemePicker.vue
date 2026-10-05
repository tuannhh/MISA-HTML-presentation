<script setup>
// Chọn tông màu bài trình bày: nền Tối/Sáng → gợi ý bảng màu hợp với nền đó (Tự động · mẫu có sẵn · Tuỳ chỉnh 2 màu).
// Tuỳ chỉnh: màu nhập được tự đẩy đậm/nhạt tới khi đủ tương phản với nền (shared/deck/palette.js) — báo lại màu thực dùng.
// Radio gốc (sr-only) để dùng được bằng bàn phím/trình đọc màn hình.
import { computed } from 'vue'
import MInput from '@/components/mds/MInput.vue'
import MIcon from '@/components/mds/MIcon.vue'
import { THEME_PRESETS, CUSTOM_THEME, CUSTOM_SUGGESTIONS, presetsForTone, themeSwatch, paletteVars, normHex } from '@/lib/design.js'

const props = defineProps({
  tone: { type: String, default: 'dark' },
  theme: { type: String, default: 'auto' },
  primary: { type: String, default: '' },
  secondary: { type: String, default: '' },
  // Màn tạo bài: có lựa chọn "Tự động" (AI chọn bảng màu trong tông).
  allowAuto: { type: Boolean, default: false },
  name: { type: String, default: 'deck-theme' },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['update:tone', 'update:theme', 'update:primary', 'update:secondary'])

const TONES = [
  { value: 'dark', label: 'Nền tối', desc: 'Chữ sáng trên nền đậm' },
  { value: 'light', label: 'Nền sáng', desc: 'Chữ đậm, tương phản cao' },
]

const customPalette = computed(() => ({ tone: props.tone, primary: normHex(props.primary) || CUSTOM_SUGGESTIONS[props.tone][0].primary, secondary: normHex(props.secondary) || normHex(props.primary) || CUSTOM_SUGGESTIONS[props.tone][0].secondary }))
const effective = computed(() => paletteVars(customPalette.value))

const options = computed(() => {
  const list = []
  if (props.allowAuto) list.push({ value: 'auto', label: 'Tự động', hint: 'AI chọn theo nội dung', auto: true, swatches: presetsForTone(props.tone).slice(0, 3).map((k) => themeSwatch(k)) })
  for (const k of presetsForTone(props.tone)) list.push({ value: k, label: THEME_PRESETS[k].label, hint: THEME_PRESETS[k].hint, swatch: themeSwatch(k) })
  list.push({ value: CUSTOM_THEME, label: 'Tuỳ chỉnh', hint: 'Tự chọn 2 màu', swatch: themeSwatch(CUSTOM_THEME, customPalette.value), custom: true })
  return list
})

function setTone(t) {
  if (t === props.tone) return
  emit('update:tone', t)
  // Mẫu thuộc tông kia → chuyển về lựa chọn mặc định của tông mới; Tuỳ chỉnh giữ nguyên 2 màu.
  if (props.theme !== CUSTOM_THEME && props.theme !== 'auto') emit('update:theme', props.allowAuto ? 'auto' : presetsForTone(t)[0])
}
function setTheme(v) {
  emit('update:theme', v)
  if (v === CUSTOM_THEME && !normHex(props.primary)) {
    const s = CUSTOM_SUGGESTIONS[props.tone][0]
    emit('update:primary', s.primary)
    emit('update:secondary', s.secondary)
  }
}
function setColor(which, v) {
  emit(which === 'primary' ? 'update:primary' : 'update:secondary', String(v || '').trim())
}
function suggest(s) {
  emit('update:primary', s.primary)
  emit('update:secondary', s.secondary)
}
const hexError = (v) => (v && !normHex(v) ? 'Dạng #RRGGBB' : '')
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <!-- Nền tối / sáng -->
    <div role="radiogroup" aria-label="Tông nền" class="grid grid-cols-2 gap-2">
      <label
        v-for="t in TONES"
        :key="t.value"
        class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
        :class="tone === t.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
      >
        <input type="radio" class="sr-only" :name="`${name}-tone`" :value="t.value" :checked="tone === t.value" @change="setTone(t.value)" />
        <span class="h-5 w-5 shrink-0 rounded-full border border-[var(--mds-border)]" :style="{ background: t.value === 'dark' ? '#0B1220' : '#FFFFFF' }" aria-hidden="true" />
        <span class="flex min-w-0 flex-col">
          <span class="text-[13px] font-semibold leading-[18px]">{{ t.label }}</span>
          <span v-if="!compact" class="truncate text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ t.desc }}</span>
        </span>
      </label>
    </div>

    <!-- Gợi ý bảng màu theo tông -->
    <div role="radiogroup" aria-label="Bảng màu" class="grid gap-2" :class="compact ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]'">
      <label
        v-for="o in options"
        :key="o.value"
        class="flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-2 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
        :class="theme === o.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
      >
        <input type="radio" class="sr-only" :name="name" :value="o.value" :checked="theme === o.value" @change="setTheme(o.value)" />
        <!-- Slide thu nhỏ minh hoạ: màu nền, chữ, 2 màu nhấn -->
        <span v-if="o.auto" class="grid aspect-[16/9] w-full grid-cols-3 overflow-hidden rounded-[4px] border border-[var(--mds-border)]" aria-hidden="true">
          <span v-for="(sw, k) in o.swatches" :key="k" class="flex flex-col justify-end gap-[3px] p-1" :style="{ background: sw.bg }">
            <span class="block h-[3px] w-3/4 rounded-full" :style="{ background: sw.ink }" />
            <span class="block h-[5px] w-1/2 rounded-[2px]" :style="{ background: sw.a }" />
          </span>
        </span>
        <span v-else class="flex aspect-[16/9] w-full flex-col justify-center gap-[4px] rounded-[4px] border border-[var(--mds-border)] px-3" :style="{ background: o.swatch.bg }" aria-hidden="true">
          <span class="flex gap-[4px]">
            <span class="block h-[5px] w-8 rounded-full" :style="{ background: o.swatch.ink }" />
            <span class="block h-[5px] w-4 rounded-full" :style="{ background: o.swatch.a }" />
          </span>
          <span class="block h-[3px] w-12 rounded-full opacity-60" :style="{ background: o.swatch.ink }" />
          <span class="mt-[2px] flex gap-[4px]">
            <span class="block h-[10px] w-[18px] rounded-[2px]" :style="{ background: o.swatch.a }" />
            <span class="block h-[10px] w-[18px] rounded-[2px]" :style="{ background: o.swatch.b }" />
          </span>
        </span>
        <span class="flex min-w-0 flex-col px-1">
          <span class="flex items-center gap-1 truncate text-[13px] font-semibold leading-[18px]">
            <MIcon v-if="o.auto" name="star" :size="14" class="shrink-0 text-[var(--mds-brand-600)]" />
            <MIcon v-else-if="o.custom" name="palette" :size="14" class="shrink-0 text-[var(--mds-brand-600)]" />
            {{ o.label }}
          </span>
          <span class="truncate text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ o.hint }}</span>
        </span>
      </label>
    </div>

    <!-- Tuỳ chỉnh 2 màu -->
    <div v-if="theme === CUSTOM_THEME" class="flex flex-col gap-3 rounded-lg border border-[var(--mds-border)] p-3">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div v-for="c in [{ key: 'primary', label: 'Màu chính', value: primary }, { key: 'secondary', label: 'Màu phụ', value: secondary }]" :key="c.key" class="flex min-w-0 flex-col gap-1">
          <span class="text-[13px] font-medium">{{ c.label }}</span>
          <div class="flex items-start gap-2">
            <input
              type="color"
              class="h-8 w-10 shrink-0 cursor-pointer rounded-[4px] border border-[var(--mds-border)] bg-transparent p-0.5"
              :value="normHex(c.value) || customPalette[c.key]"
              :aria-label="`Chọn ${c.label.toLowerCase()}`"
              @input="(e) => setColor(c.key, e.target.value.toUpperCase())"
            />
            <div class="min-w-0 flex-1">
              <MInput :model-value="c.value" placeholder="#RRGGBB" :maxlength="7" :aria-label="`${c.label} (mã hex)`" :error="hexError(c.value)" @update:model-value="(v) => setColor(c.key, v)" />
            </div>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[12px] text-[var(--mds-text-secondary)]">Gợi ý {{ tone === 'dark' ? 'nền tối' : 'nền sáng' }}:</span>
        <button
          v-for="sg in CUSTOM_SUGGESTIONS[tone]"
          :key="sg.label"
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--mds-border)] px-2 text-[12px] hover:border-[var(--mds-brand-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mds-brand-600)]"
          @click="suggest(sg)"
        >
          <span class="h-3 w-3 rounded-full" :style="{ background: sg.primary }" aria-hidden="true" />
          <span class="h-3 w-3 rounded-full" :style="{ background: sg.secondary }" aria-hidden="true" />
          {{ sg.label }}
        </button>
      </div>
      <p v-if="effective.adjusted" class="flex items-start gap-1 text-[12px] leading-4 text-[var(--mds-text-secondary)]">
        <MIcon name="info-circle" :size="16" class="shrink-0" />
        <span>
          Để chữ dễ đọc trên {{ tone === 'dark' ? 'nền tối' : 'nền sáng' }}, màu sẽ được chỉnh {{ tone === 'dark' ? 'sáng' : 'đậm' }} hơn:
          <span class="inline-flex items-center gap-1 align-middle"><span class="inline-block h-3 w-3 rounded-full" :style="{ background: effective.primary }" />{{ effective.primary }}</span>
          ·
          <span class="inline-flex items-center gap-1 align-middle"><span class="inline-block h-3 w-3 rounded-full" :style="{ background: effective.secondary }" />{{ effective.secondary }}</span>
        </span>
      </p>
    </div>
  </div>
</template>
