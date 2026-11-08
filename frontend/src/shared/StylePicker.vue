<script setup>
// Bảng chọn kiểu trình bày có hình xem trước: kiểu của bố cục hiện tại + (bố cục dạng danh sách) kiểu của bố cục cùng họ —
// chọn là đổi ngay, GIỮ NGUYÊN nội dung (các mục chuyển qua lại items ↔ steps — useEditor.changeLayout).
// Kiểu mờ = chưa hợp nội dung hiện tại (số mục, số liệu %, có ảnh…); hình thu nhỏ: frontend/src/lib/stylePreviews.js.
import { computed, ref } from 'vue'
import MIcon from '@/components/mds/MIcon.vue'
import { VARIANTS, fits, resolveVariant, LIST_KEY, familyOf } from '@shared/deck/variants.js'
import { chartFromStats, statsFromChart } from '@shared/deck/chart.js'
import { VARIANT_LABELS, LAYOUT_LABEL, ratioNum } from '@/lib/slideModel.js'
import { stylePreview } from '@/lib/stylePreviews.js'

const props = defineProps({
  slide: { type: Object, required: true },
  ratio: { type: String, default: '16:9' },
})
const emit = defineEmits(['pick'])

const r = computed(() => ratioNum(props.ratio))
const cur = computed(() => resolveVariant(props.slide, r.value))
// Nội dung trang nếu đổi sang bố cục L (mục lấy từ danh sách đang có) — để biết kiểu nào hợp.
function asLayout(L) {
  const s = props.slide
  const from = LIST_KEY[s.layout]
  const to = LIST_KEY[L]
  const v = { ...s, layout: L }
  if (from && to && from !== to && !(s[to] || []).length) v[to] = s[from] || []
  // Con số ↔ Biểu đồ: dữ liệu bên kia dựng từ số liệu đang có (như useEditor.changeLayout).
  if (L === 'chart' && !s.chart) v.chart = chartFromStats(s.stats)
  if (L === 'stats' && !(s.stats || []).length && s.chart) v.stats = statsFromChart(s.chart)
  return v
}
const tiles = (L) => {
  const sv = asLayout(L)
  return (VARIANTS[L] || []).map((v) => ({ layout: L, value: v, label: VARIANT_LABELS[L]?.[v] || v, ok: fits(L, v, sv, r.value), svg: stylePreview(L, v) }))
}
const own = computed(() => tiles(props.slide.layout))
const family = computed(() => (familyOf(props.slide.layout) || []).filter((L) => L !== props.slide.layout).map((L) => ({ layout: L, label: LAYOUT_LABEL[L], tiles: tiles(L) })))
const more = ref(false)
const pick = (t) => t.ok && emit('pick', { layout: t.layout, variant: t.value })
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div role="radiogroup" aria-label="Kiểu trình bày" class="grid grid-cols-3 gap-2">
      <button
        v-for="t in own"
        :key="t.value"
        type="button"
        role="radio"
        :aria-checked="cur === t.value"
        :disabled="!t.ok"
        :title="t.ok ? t.label : `${t.label} — chưa hợp nội dung hiện tại`"
        class="spv group flex min-w-0 flex-col gap-1 rounded-lg p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--mds-brand-600)] disabled:cursor-not-allowed disabled:opacity-45"
        @click="pick(t)"
      >
        <span
          class="block aspect-video w-full overflow-hidden rounded-md border bg-white"
          :class="cur === t.value ? 'border-2 border-[var(--mds-brand-600)]' : 'border-[var(--mds-border)] group-enabled:group-hover:border-[var(--mds-brand-600)]'"
          v-html="t.svg"
        />
        <span class="truncate text-[12px] leading-4" :class="cur === t.value ? 'font-semibold text-[var(--mds-brand-700)]' : ''">{{ t.label }}</span>
      </button>
    </div>
    <template v-if="family.length">
      <button type="button" class="flex items-center gap-1 self-start text-[13px] font-medium text-[var(--mds-brand-600)] hover:underline" :aria-expanded="more" @click="more = !more">
        <MIcon :name="more ? 'chevron-up' : 'chevron-down'" :size="16" />{{ more ? 'Ẩn kiểu của bố cục khác' : 'Đổi sang bố cục khác — giữ nguyên nội dung' }}
      </button>
      <div v-if="more" class="flex flex-col gap-3">
        <section v-for="g in family" :key="g.layout" class="flex flex-col gap-1">
          <h4 class="text-[12px] font-semibold uppercase tracking-wide text-[var(--mds-text-secondary)]">{{ g.label }}</h4>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="t in g.tiles"
              :key="t.value"
              type="button"
              :disabled="!t.ok"
              :title="t.ok ? `${g.label}: ${t.label}` : `${g.label}: ${t.label} — chưa hợp nội dung hiện tại`"
              class="spv group flex min-w-0 flex-col gap-1 rounded-lg p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--mds-brand-600)] disabled:cursor-not-allowed disabled:opacity-45"
              @click="pick(t)"
            >
              <span class="block aspect-video w-full overflow-hidden rounded-md border border-[var(--mds-border)] bg-white group-enabled:group-hover:border-[var(--mds-brand-600)]" v-html="t.svg" />
              <span class="truncate text-[12px] leading-4">{{ t.label }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style>
/* Màu các khối trong hình thu nhỏ (SVG chèn bằng v-html → không dùng style scoped). */
.spv svg { display: block; width: 100%; height: 100%; }
.spv svg .a { fill: var(--mds-brand-600); }
.spv svg .b { fill: var(--mds-brand-100); }
.spv svg .p { fill: #fff; stroke: var(--mds-neutral-300); stroke-width: .5; }
.spv svg .o { fill: none; stroke: var(--mds-brand-600); stroke-width: .7; }
.spv svg .h { fill: #3b4352; }
.spv svg .l { fill: #c3c9d3; }
.spv svg .w { fill: #fff; }
.spv svg .w2 { fill: rgba(255, 255, 255, .7); }
.spv svg .i { fill: var(--mds-brand-100); }
.spv svg .id { fill: var(--mds-brand-300); }
.spv svg .g { fill: rgba(255, 255, 255, .85); }
.spv svg .ln { stroke: var(--mds-brand-300); stroke-width: .8; }
.spv svg .lt { stroke: var(--mds-neutral-300); stroke-width: .5; }
.spv svg .pl { fill: none; stroke: var(--mds-brand-600); stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round; }
.spv svg .ar { stroke: #3b4352; stroke-width: 1; stroke-linecap: round; }
.spv svg .rg { fill: none; stroke: var(--mds-brand-100); stroke-width: 2.4; }
.spv svg .rf { fill: none; stroke: var(--mds-brand-600); stroke-width: 2.4; stroke-linecap: round; transform: rotate(-90deg); transform-origin: center; transform-box: fill-box; }
</style>
