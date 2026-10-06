<script setup>
// Xem trước nhanh thiết kế (trang bìa thu nhỏ): màu nền + nền động thật, phông tiêu đề/nội dung, màu nhấn, logo đúng vị trí/kích thước.
// Chỉ minh hoạ — giao diện thật do AI dựng ở bước sau (cùng bảng màu, nền, phông, logo).
import { computed, onMounted } from 'vue'
import DeckBgCanvas from './DeckBgCanvas.vue'
import { previewColors, fontStack, ensureDeckFonts, LOGO_SIZE } from '@/lib/design.js'
import { plainText } from '@shared/deck/rich.js'

const props = defineProps({
  design: { type: Object, required: true }, // { theme, palette, background, font, logo }
  media: { type: Object, required: true },
  title: { type: String, default: 'Tiêu đề bài trình bày' },
  subtitle: { type: String, default: '' },
  ratio: { type: String, default: '16:9' },
})
const SIZES = { '16:9': [2560, 1440], '4:3': [1920, 1440], '2:1': [2880, 1440], '3:1': [4320, 1440] }

const c = computed(() => previewColors(props.design.theme, props.design.palette))
const dims = computed(() => SIZES[props.ratio] || SIZES['16:9'])
const head = computed(() => fontStack(props.design.font?.heading))
const body = computed(() => fontStack(props.design.font?.body))
const lg = computed(() => props.design.logo)
const logoUrl = computed(() => {
  const l = lg.value
  if (!l?.asset || l.showOn === 'inner') return ''
  return props.media.assetUrl(l.removeBg && l.cutout ? l.cutout : l.asset)
})
// Kích thước logo theo phần trăm khung (logo cao size px trên khung cao 1440 px, rộng tối đa 1/3 slide).
const logoStyle = computed(() => {
  const l = lg.value
  const [W, H] = dims.value
  const h = Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, Number(l?.size) || LOGO_SIZE.def))
  const pos = l?.position || 'tr'
  const s = { height: `${(h / H) * 100}%`, maxWidth: '33%', top: 'auto', bottom: 'auto', left: 'auto', right: 'auto', transform: '' }
  const padY = `${(70 / H) * 100}%`
  const padX = `${(120 / W) * 100}%`
  if (pos[0] === 't') s.top = padY
  else s.bottom = padY
  if (pos[1] === 'l') s.left = padX
  else if (pos[1] === 'r') s.right = padX
  else {
    s.left = '50%'
    s.transform = 'translateX(-50%)'
  }
  return s
})
// Bộ nhận diện thương hiệu (khớp renderer brandFor): trang bìa có ảnh riêng → chỉ ảnh bìa; không thì nền trang nội dung + dải đầu/chân.
const br = computed(() => props.design.brand || null)
const brandUrl = (k) => (br.value?.[k] ? props.media.assetUrl(br.value[k]) : '')
const coverOwn = computed(() => brandUrl('cover'))
const brandBg = computed(() => coverOwn.value || brandUrl('page'))
const brandHead = computed(() => (coverOwn.value ? '' : brandUrl('header')))
const brandFoot = computed(() => (coverOwn.value ? '' : brandUrl('footer')))
// Ảnh nền khác tông với bài → chữ đổi màu (khớp ink-light/ink-dark của renderer).
const ink = computed(() => {
  const t = brandBg.value ? br.value?.tones?.[coverOwn.value ? 'cover' : 'page'] : null
  if (!t || t === c.value.tone) return c.value.ink
  return t === 'dark' ? '#F8FAFC' : '#0B0F19'
})
const titleWords = computed(() => {
  const words = plainText(props.title || '').trim().split(/\s+/)
  const k = Math.max(1, Math.ceil(words.length / 2))
  return { a: words.slice(0, words.length - k).join(' '), b: words.slice(words.length - k).join(' ') }
})
onMounted(ensureDeckFonts)
</script>

<template>
  <div class="relative w-full overflow-hidden rounded-lg border border-[var(--mds-border)] shadow-[var(--mds-shadow-card)]" :style="{ aspectRatio: `${dims[0]} / ${dims[1]}`, background: c.bg }" aria-label="Xem trước thiết kế" role="img">
    <span v-if="!brandBg" class="absolute inset-0" :style="{ background: `radial-gradient(60% 80% at 80% 20%, ${c.a}22, transparent 70%), radial-gradient(50% 70% at 10% 90%, ${c.b}1A, transparent 70%)` }" aria-hidden="true" />
    <img v-if="brandBg" :src="brandBg" alt="" class="absolute inset-0 h-full w-full object-cover" />
    <img v-if="brandHead" :src="brandHead" alt="" class="absolute inset-x-0 top-0 max-h-[26%] w-full object-cover object-top" />
    <img v-if="brandFoot" :src="brandFoot" alt="" class="absolute inset-x-0 bottom-0 max-h-[22%] w-full object-cover object-bottom" />
    <DeckBgCanvas v-if="design.background !== 'none' && !brandBg" :name="design.background" :colors="c" animate class="absolute inset-0 opacity-90" :logical-width="Math.round(dims[0] / 2)" :logical-height="Math.round(dims[1] / 2)" :boost="2" />
    <div class="absolute inset-y-0 left-[6%] flex w-[62%] flex-col justify-center gap-[4%]">
      <span class="block h-[3px] w-[10%] rounded-full" :style="{ background: c.a }" aria-hidden="true" />
      <p class="line-clamp-2 text-[clamp(14px,5.2cqw,30px)] font-extrabold leading-[1.1]" :style="{ fontFamily: head, color: ink }">
        {{ titleWords.a }} <span :style="{ color: c.a }">{{ titleWords.b }}</span>
      </p>
      <p class="line-clamp-2 text-[clamp(10px,2.4cqw,14px)] leading-snug opacity-80" :style="{ fontFamily: body, color: ink }">{{ plainText(subtitle) || 'Nội dung trình bày dùng phông chữ đã chọn' }}</p>
      <span class="flex gap-[2%]" aria-hidden="true">
        <span class="block h-[10px] w-[18%] rounded-full" :style="{ background: c.a }" />
        <span class="block h-[10px] w-[12%] rounded-full" :style="{ background: c.b }" />
      </span>
    </div>
    <img v-if="logoUrl" :src="logoUrl" alt="" class="absolute w-auto object-contain" :style="logoStyle" />
  </div>
</template>

<style scoped>
div[role='img'] { container-type: inline-size; }
</style>
