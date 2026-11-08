<script setup>
// Trình chỉnh sửa ảnh đơn giản: cắt theo tỷ lệ, xoay 90° + xoay tinh, lật, sáng/tối – độ rực – tương phản,
// và "vị trí trong khung" (giữ nguyên khung trên slide, chỉ dịch/phóng ảnh bên trong).
// Phần cắt/xoay dùng Cropper.js v1 (không AI). Bấm Áp dụng → máy chủ áp thông số lên ẢNH GỐC bằng sharp
// (crop tính theo tỷ lệ của khung bao ảnh SAU khi xoay — khớp cách Cropper.getData() trả về).
// Vị trí/phóng trong khung (pos, zoom) chỉ là CSS lúc hiển thị → không cần tạo ảnh mới.
// "Khung" (bo góc, đổ bóng, viền) và "Lớp phủ" (màu + độ mờ) cũng chỉ là CSS (shared/deck/imgstyle.js) — xem trước
// bằng màu thật của bảng màu bài (prop colors) đặt vào biến CSS của khung xem trước.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MTooltip from '@/components/mds/MTooltip.vue'
import RangeField from './RangeField.vue'
import ColorSwatches from './ColorSwatches.vue'
import { BORDER_W, OVERLAY_OPACITY, lookCss, overlayCss } from '@shared/deck/imgstyle.js'

const props = defineProps({
  src: { type: String, required: true }, // URL ảnh GỐC (ref.src || ref.asset)
  edit: { type: Object, default: null }, // thông số đã áp lần trước
  pos: { type: Object, default: null }, // { x, y } % — object-position
  zoom: { type: Number, default: 1 },
  fit: { type: String, default: 'cover' },
  aspect: { type: Number, default: 16 / 9 }, // tỷ lệ khung ảnh trên slide
  busy: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }, // mobile: xếp dọc, chạm lớn
  look: { type: Object, default: null }, // { radius?, shadow?, border?, overlay? } đã đặt trước
  colors: { type: Object, default: () => ({}) }, // { accent, 'accent-2', text, bg, white, dark } → mã màu xem trước
})
const emit = defineEmits(['apply', 'cancel'])

const mode = ref('crop')
const MODES = [
  { key: 'crop', label: 'Cắt & xoay' },
  { key: 'color', label: 'Màu sắc' },
  { key: 'frame', label: 'Vị trí' },
  { key: 'look', label: 'Khung' },
  { key: 'overlay', label: 'Lớp phủ' },
]
const PREVIEW_MODES = ['frame', 'look', 'overlay']
const isPreview = computed(() => PREVIEW_MODES.includes(mode.value))

const e0 = props.edit || {}
const baseRot = ref(Math.round((e0.rotate || 0) / 90) * 90)
const fineRot = ref(Math.round(((e0.rotate || 0) - Math.round((e0.rotate || 0) / 90) * 90) * 10) / 10)
const flipH = ref(!!e0.flipH)
const flipV = ref(!!e0.flipV)
const brightness = ref(e0.brightness || 0)
const saturation = ref(e0.saturation || 0)
const contrast = ref(e0.contrast || 0)
const posX = ref(props.pos?.x ?? 50)
const posY = ref(props.pos?.y ?? 50)
const zm = ref(props.zoom > 1 ? props.zoom : 1)
const fitV = ref(props.fit === 'contain' ? 'contain' : 'cover')

/* ---- Khung & lớp phủ ('' = theo phong cách bài) ---- */
const l0 = props.look || {}
const radius = ref(l0.radius || '')
const shadow = ref(l0.shadow || '')
const borderMode = ref(l0.border === 'none' ? 'none' : l0.border?.w ? 'custom' : '')
const borderColor = ref(l0.border?.color || 'accent')
const borderW = ref(l0.border?.w || 4)
const ovKind = ref(l0.overlay?.kind || '')
const ovColor = ref(l0.overlay?.color || 'dark')
const ovOpacity = ref(l0.overlay?.opacity ?? OVERLAY_OPACITY.def)
const RADII = [
  { k: '', l: 'Theo mẫu' }, { k: 'none', l: 'Vuông' }, { k: 'sm', l: 'Nhỏ' }, { k: 'md', l: 'Vừa' }, { k: 'lg', l: 'Lớn' }, { k: 'circle', l: 'Tròn' },
]
const SHADOWS = [{ k: '', l: 'Theo mẫu' }, { k: 'none', l: 'Không' }, { k: 'sm', l: 'Nhẹ' }, { k: 'md', l: 'Vừa' }, { k: 'lg', l: 'Đậm' }]
const BORDERS = [{ k: '', l: 'Theo mẫu' }, { k: 'none', l: 'Không viền' }, { k: 'custom', l: 'Có viền' }]
const LOOK_GROUPS = [
  { t: 'Bo góc', opts: RADII, model: radius },
  { t: 'Đổ bóng', opts: SHADOWS, model: shadow },
  { t: 'Viền', opts: BORDERS, model: borderMode },
]
const OV_KINDS = [{ k: '', l: 'Không' }, { k: 'flat', l: 'Phủ đều' }, { k: 'fade', l: 'Mờ dần' }, { k: 'frosted', l: 'Kính mờ' }]
function currentLook() {
  return {
    radius: radius.value || null,
    shadow: shadow.value || null,
    border: borderMode.value === 'none' ? 'none' : borderMode.value === 'custom' ? { color: borderColor.value, w: borderW.value } : null,
    overlay: ovKind.value ? { kind: ovKind.value, color: ovColor.value, opacity: ovOpacity.value } : null,
  }
}
// Biến màu chủ đề cho khung xem trước (lookCss/overlayCss dùng var(--accent)…), số đo px thu nhỏ theo khung xem trước (~0,5 slide 1920).
const PREVIEW_K = 0.5
const scalePx = (css) => css.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${Math.round(n * PREVIEW_K * 10) / 10}px`)
const themeVars = computed(() => ({
  '--accent': props.colors.accent || '#2563eb',
  '--accent-2': props.colors['accent-2'] || '#7c3aed',
  '--text': props.colors.text || '#111827',
  '--bg2': props.colors.bg || '#ffffff',
}))
const lookStyle = computed(() => scalePx(lookCss(currentLook())))
const ovStyle = computed(() => scalePx(overlayCss(currentLook().overlay)))

const ASPECTS = computed(() => [
  { key: 'free', label: 'Tự do', ratio: NaN },
  { key: 'frame', label: 'Vừa khung', ratio: props.aspect },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
])
const aspectKey = ref('free')

const filterCss = computed(() => `brightness(${1 + brightness.value / 100}) saturate(${Math.max(0, 1 + saturation.value / 100)}) contrast(${Math.max(0.05, 1 + contrast.value / 100)})`)

/* ---- Cropper ---- */
const imgEl = ref(null)
const ready = ref(false)
const loadError = ref(false)
let cropper = null

// Kích thước khung bao ảnh sau khi xoay (đơn vị pixel ảnh gốc) — cùng công thức Cropper/sharp dùng.
function bbox(deg) {
  const d = cropper.getImageData()
  const r = (Math.abs(deg) % 180) * (Math.PI / 180)
  const s = Math.abs(Math.sin(r))
  const c = Math.abs(Math.cos(r))
  return { W: d.naturalWidth * c + d.naturalHeight * s, H: d.naturalWidth * s + d.naturalHeight * c }
}

function init() {
  cropper?.destroy()
  ready.value = false
  cropper = new Cropper(imgEl.value, {
    viewMode: 1,
    dragMode: 'move',
    autoCropArea: 1,
    background: false,
    checkCrossOrigin: false,
    checkOrientation: false,
    toggleDragModeOnDblclick: false,
    zoomOnWheel: false,
    ready() {
      cropper.rotateTo(baseRot.value + fineRot.value)
      cropper.scale(flipH.value ? -1 : 1, flipV.value ? -1 : 1)
      const cr = e0.crop
      if (cr) {
        const { W, H } = bbox(baseRot.value + fineRot.value)
        cropper.setData({ x: cr.x * W, y: cr.y * H, width: cr.w * W, height: cr.h * H })
      }
      ready.value = true
      applyFilterToCropper()
    },
  })
}
// Áp bộ lọc màu lên ảnh trong cropper để xem trước ngay (máy chủ áp tương đương bằng sharp khi Áp dụng).
function applyFilterToCropper() {
  if (!cropper) return
  const root = imgEl.value?.parentElement
  root?.querySelectorAll('.cropper-container img').forEach((im) => (im.style.filter = filterCss.value))
}
watch(filterCss, applyFilterToCropper)
onBeforeUnmount(() => cropper?.destroy())

function setAspect(k) {
  aspectKey.value = k
  const a = ASPECTS.value.find((x) => x.key === k)
  cropper?.setAspectRatio(a ? a.ratio : NaN)
}
function rotate90(dir) {
  baseRot.value = (baseRot.value + dir * 90) % 360
  cropper?.rotateTo(baseRot.value + fineRot.value)
}
watch(fineRot, (v) => cropper?.rotateTo(baseRot.value + v))
function flip(axis) {
  if (axis === 'h') flipH.value = !flipH.value
  else flipV.value = !flipV.value
  cropper?.scale(flipH.value ? -1 : 1, flipV.value ? -1 : 1)
}
function resetAll() {
  baseRot.value = 0
  fineRot.value = 0
  flipH.value = false
  flipV.value = false
  brightness.value = 0
  saturation.value = 0
  contrast.value = 0
  posX.value = 50
  posY.value = 50
  zm.value = 1
  aspectKey.value = 'free'
  radius.value = ''
  shadow.value = ''
  borderMode.value = ''
  ovKind.value = ''
  if (cropper) {
    cropper.reset()
    cropper.setAspectRatio(NaN)
    cropper.rotateTo(0)
    cropper.scale(1, 1)
  }
}

const r4 = (v) => Math.round(v * 10000) / 10000
function currentEdit() {
  const out = {}
  if (cropper && ready.value) {
    const d = cropper.getData()
    const { W, H } = bbox(d.rotate || 0)
    const x = Math.max(0, r4(d.x / W))
    const y = Math.max(0, r4(d.y / H))
    const w = Math.min(1 - x, r4(d.width / W))
    const h = Math.min(1 - y, r4(d.height / H))
    // Khung cắt gần như trọn ảnh → coi như không cắt.
    if (x > 0.002 || y > 0.002 || w < 0.996 || h < 0.996) out.crop = { x, y, w, h }
  } else if (e0.crop) out.crop = e0.crop
  const rot = Math.round((baseRot.value + fineRot.value) * 10) / 10
  if (rot % 360) out.rotate = rot
  if (flipH.value) out.flipH = true
  if (flipV.value) out.flipV = true
  for (const [k, v] of [['brightness', brightness.value], ['saturation', saturation.value], ['contrast', contrast.value]]) if (v) out[k] = v
  return Object.keys(out).length ? out : null
}

/* ---- Vị trí trong khung: xem trước bằng ảnh đã cắt/xoay (canvas) + kéo để dịch, thanh trượt để phóng ---- */
const framePreview = ref('')
watch(mode, (m) => {
  if (!PREVIEW_MODES.includes(m) || !cropper || !ready.value) return
  try {
    framePreview.value = cropper.getCroppedCanvas({ maxWidth: 1400, maxHeight: 1400, imageSmoothingQuality: 'high' }).toDataURL('image/jpeg', 0.86)
  } catch {
    framePreview.value = props.src
  }
})
const frameStyle = computed(() => ({
  objectFit: fitV.value,
  objectPosition: `${posX.value}% ${posY.value}%`,
  scale: String(zm.value),
  transformOrigin: `${posX.value}% ${posY.value}%`,
  filter: filterCss.value,
}))
let drag = null
function onFrameDown(ev) {
  if (mode.value !== 'frame' || (fitV.value !== 'cover' && zm.value <= 1)) return
  const box = ev.currentTarget.getBoundingClientRect()
  drag = { x: ev.clientX, y: ev.clientY, px: posX.value, py: posY.value, w: box.width, h: box.height }
  ev.currentTarget.setPointerCapture?.(ev.pointerId)
}
function onFrameMove(ev) {
  if (!drag) return
  // Kéo sang phải = thấy phần bên trái ảnh → object-position giảm. Chia theo kích thước khung × độ phóng (cảm giác "cầm ảnh kéo").
  const k = 100 / Math.max(0.5, zm.value)
  posX.value = Math.round(Math.min(100, Math.max(0, drag.px - ((ev.clientX - drag.x) / drag.w) * k)))
  posY.value = Math.round(Math.min(100, Math.max(0, drag.py - ((ev.clientY - drag.y) / drag.h) * k)))
}
const onFrameUp = () => (drag = null)
function nudge(dx, dy) {
  posX.value = Math.min(100, Math.max(0, posX.value + dx))
  posY.value = Math.min(100, Math.max(0, posY.value + dy))
}

function apply() {
  const pos = posX.value !== 50 || posY.value !== 50 ? { x: posX.value, y: posY.value } : null
  emit('apply', { edit: currentEdit(), pos, zoom: zm.value > 1 ? Math.round(zm.value * 100) / 100 : null, fit: fitV.value, look: currentLook() })
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <div class="-mx-1 overflow-x-auto px-1 pb-1"><MTabs v-model="mode" :tabs="MODES" variant="pill" /></div>
    <div class="flex min-w-0 flex-col gap-3" :class="compact ? '' : 'md:flex-row'">
      <!-- Vùng ảnh -->
      <div class="relative min-w-0 flex-1">
        <div v-show="!isPreview" class="relative overflow-hidden rounded-lg bg-[#1b1f2a]" :class="compact ? 'h-[46dvh]' : 'h-[440px]'">
          <img ref="imgEl" :src="src" alt="Ảnh đang chỉnh sửa" class="block max-w-full" @load="init" @error="loadError = true" />
          <div v-if="!ready && !loadError" class="absolute inset-0 grid place-items-center text-[13px] text-white/80">Đang tải ảnh…</div>
          <div v-if="loadError" class="absolute inset-0 grid place-items-center text-[13px] text-white/80">Không tải được ảnh gốc</div>
        </div>
        <div v-if="isPreview" class="flex flex-col items-center gap-2 rounded-lg p-5" :class="mode === 'frame' ? '' : 'bg-[var(--mds-bg-page)]'" :style="themeVars">
          <div
            class="relative w-full touch-none select-none overflow-hidden bg-[var(--mds-bg-page)]"
            :class="[mode === 'frame' && (fitV === 'cover' || zm > 1) ? 'cursor-grab active:cursor-grabbing' : '', mode === 'frame' || !lookStyle ? 'rounded-lg ring-1 ring-[var(--mds-border)]' : '']"
            :style="[{ aspectRatio: String(aspect), maxHeight: compact ? '40dvh' : '400px', maxWidth: compact ? '100%' : `${400 * aspect}px` }, mode === 'frame' ? '' : lookStyle]"
            @pointerdown="onFrameDown"
            @pointermove="onFrameMove"
            @pointerup="onFrameUp"
            @pointercancel="onFrameUp"
          >
            <img :src="framePreview || src" alt="" draggable="false" class="pointer-events-none h-full w-full" :style="frameStyle" />
            <i v-if="mode !== 'frame' && ovStyle" class="pointer-events-none absolute inset-0" style="border-radius: inherit" :style="ovStyle" aria-hidden="true" />
          </div>
          <p class="text-[12px] text-[var(--mds-text-secondary)]">{{ mode === 'frame' ? 'Khung giữ nguyên như trên trang — kéo ảnh để chọn phần hiển thị.' : 'Xem trước theo màu của chủ đề bài.' }}</p>
        </div>
      </div>

      <!-- Công cụ -->
      <div class="flex shrink-0 flex-col gap-3" :class="compact ? '' : 'md:w-[320px]'">

        <template v-if="mode === 'crop'">
          <div>
            <p class="mb-1 text-[12px] font-semibold text-[var(--mds-text-secondary)]">Tỷ lệ cắt</p>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="a in ASPECTS"
                :key="a.key"
                type="button"
                class="rounded-full border px-3 text-[13px]"
                :class="[compact ? 'min-h-10' : 'h-8', aspectKey === a.key ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]']"
                :aria-pressed="aspectKey === a.key"
                @click="setAspect(a.key)"
              >
                {{ a.label }}
              </button>
            </div>
          </div>
          <div>
            <p class="mb-1 text-[12px] font-semibold text-[var(--mds-text-secondary)]">Xoay & lật</p>
            <div class="flex flex-wrap gap-1">
              <MTooltip content="Xoay trái 90°"><MButton variant="icon" aria-label="Xoay trái 90°" @click="rotate90(-1)"><template #icon><MIcon name="rotate" :size="16" /></template></MButton></MTooltip>
              <MTooltip content="Xoay phải 90°"><MButton variant="icon" aria-label="Xoay phải 90°" @click="rotate90(1)"><template #icon><MIcon name="rotate-clockwise" :size="16" /></template></MButton></MTooltip>
              <MTooltip content="Lật ngang"><MButton variant="icon" :class="flipH ? 'bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : ''" aria-label="Lật ngang" :aria-pressed="flipH" @click="flip('h')"><template #icon><MIcon name="flip-vertical" :size="16" /></template></MButton></MTooltip>
              <MTooltip content="Lật dọc"><MButton variant="icon" :class="flipV ? 'bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : ''" aria-label="Lật dọc" :aria-pressed="flipV" @click="flip('v')"><template #icon><MIcon name="flip-horizontal" :size="16" /></template></MButton></MTooltip>
            </div>
          </div>
          <RangeField v-model="fineRot" label="Xoay tinh" :min="-45" :max="45" :step="0.5" :format="(v) => `${v}°`" />
        </template>

        <template v-else-if="mode === 'color'">
          <RangeField v-model="brightness" label="Sáng / tối" />
          <RangeField v-model="saturation" label="Độ rực màu" />
          <RangeField v-model="contrast" label="Tương phản" />
          <p class="text-[12px] text-[var(--mds-text-secondary)]">Bấm đúp vào thanh trượt để về mặc định.</p>
        </template>

        <template v-else-if="mode === 'look'">
          <div v-for="g in LOOK_GROUPS" :key="g.t">
            <p class="mb-1 text-[12px] font-semibold text-[var(--mds-text-secondary)]">{{ g.t }}</p>
            <div class="flex flex-wrap gap-1" role="radiogroup" :aria-label="g.t">
              <button
                v-for="o in g.opts"
                :key="o.k"
                type="button"
                role="radio"
                class="rounded-full border px-3 text-[13px]"
                :class="[compact ? 'min-h-10' : 'h-8', g.model.value === o.k ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]']"
                :aria-checked="g.model.value === o.k"
                @click="g.model.value = o.k"
              >
                {{ o.l }}
              </button>
            </div>
          </div>
          <template v-if="borderMode === 'custom'">
            <ColorSwatches v-model="borderColor" :colors="colors" :compact="compact" label="Màu viền" />
            <RangeField v-model="borderW" label="Độ dày viền" :min="BORDER_W.min" :max="BORDER_W.max" :reset="4" :format="(v) => `${v} px`" />
          </template>
          <p class="text-[12px] text-[var(--mds-text-secondary)]">"Theo mẫu" = giữ kiểu ảnh của phong cách bài. Màu theo bảng màu tự đổi khi đổi chủ đề.</p>
        </template>

        <template v-else-if="mode === 'overlay'">
          <div>
            <p class="mb-1 text-[12px] font-semibold text-[var(--mds-text-secondary)]">Kiểu phủ</p>
            <div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Kiểu phủ">
              <button
                v-for="o in OV_KINDS"
                :key="o.k"
                type="button"
                role="radio"
                class="rounded-full border px-3 text-[13px]"
                :class="[compact ? 'min-h-10' : 'h-8', ovKind === o.k ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]']"
                :aria-checked="ovKind === o.k"
                @click="ovKind = o.k"
              >
                {{ o.l }}
              </button>
            </div>
          </div>
          <template v-if="ovKind">
            <div>
              <p class="mb-1 text-[12px] font-semibold text-[var(--mds-text-secondary)]">Màu phủ</p>
              <ColorSwatches v-model="ovColor" :colors="colors" :compact="compact" label="Màu phủ" />
            </div>
            <RangeField v-model="ovOpacity" label="Độ đậm" :min="OVERLAY_OPACITY.min" :max="OVERLAY_OPACITY.max" :reset="OVERLAY_OPACITY.def" :format="(v) => `${v}%`" />
          </template>
          <p class="text-[12px] text-[var(--mds-text-secondary)]">Lớp phủ giúp chữ đặt trên ảnh dễ đọc hơn. "Mờ dần" đậm ở đáy ảnh; "Kính mờ" làm nhoè ảnh phía sau.</p>
        </template>

        <template v-else>
          <div class="flex gap-1">
            <button
              v-for="f in [{ k: 'cover', l: 'Lấp đầy khung' }, { k: 'contain', l: 'Hiện trọn ảnh' }]"
              :key="f.k"
              type="button"
              class="flex-1 rounded-lg border px-2 text-[13px]"
              :class="[compact ? 'min-h-10' : 'h-8', fitV === f.k ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : 'border-[var(--mds-border)]']"
              :aria-pressed="fitV === f.k"
              @click="fitV = f.k"
            >
              {{ f.l }}
            </button>
          </div>
          <RangeField v-model="zm" label="Phóng to" :min="1" :max="3" :step="0.05" :reset="1" :format="(v) => `${Math.round(v * 100)}%`" />
          <div class="grid grid-cols-3 gap-1 self-start" aria-label="Dịch ảnh">
            <span />
            <MButton variant="icon" class="border border-[var(--mds-border)]" aria-label="Dịch lên" @click="nudge(0, 5)"><template #icon><MIcon name="arrow-up" :size="16" /></template></MButton>
            <span />
            <MButton variant="icon" class="border border-[var(--mds-border)]" aria-label="Dịch trái" @click="nudge(5, 0)"><template #icon><MIcon name="arrow-left" :size="16" /></template></MButton>
            <MButton variant="icon" class="border border-[var(--mds-border)]" aria-label="Về giữa" @click="(posX = 50), (posY = 50)"><template #icon><MIcon name="arrows-move" :size="16" /></template></MButton>
            <MButton variant="icon" class="border border-[var(--mds-border)]" aria-label="Dịch phải" @click="nudge(-5, 0)"><template #icon><MIcon name="arrow-right" :size="16" /></template></MButton>
            <span />
            <MButton variant="icon" class="border border-[var(--mds-border)]" aria-label="Dịch xuống" @click="nudge(0, -5)"><template #icon><MIcon name="arrow-down" :size="16" /></template></MButton>
            <span />
          </div>
        </template>

        <div class="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-[var(--mds-border-light)] pt-3">
          <MButton variant="ghost" class="mr-auto" @click="resetAll"><template #icon><MIcon name="refresh" :size="16" /></template>Đặt lại</MButton>
          <MButton variant="outline" :disabled="busy" @click="emit('cancel')">Hủy</MButton>
          <MButton variant="primary" :loading="busy" :disabled="!ready && !loadError" @click="apply">Áp dụng</MButton>
        </div>
      </div>
    </div>
  </div>
</template>
