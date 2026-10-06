<script setup>
// Trình chỉnh sửa ảnh đơn giản (kiểu Gamma): cắt theo tỷ lệ, xoay 90° + xoay tinh, lật, sáng/tối – độ rực – tương phản,
// và "vị trí trong khung" (giữ nguyên khung trên slide, chỉ dịch/phóng ảnh bên trong).
// Phần cắt/xoay dùng Cropper.js v1 (không AI). Bấm Áp dụng → máy chủ áp thông số lên ẢNH GỐC bằng sharp
// (crop tính theo tỷ lệ của khung bao ảnh SAU khi xoay — khớp cách Cropper.getData() trả về).
// Vị trí/phóng trong khung (pos, zoom) chỉ là CSS lúc hiển thị → không cần tạo ảnh mới.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MTooltip from '@/components/mds/MTooltip.vue'
import RangeField from './RangeField.vue'

const props = defineProps({
  src: { type: String, required: true }, // URL ảnh GỐC (ref.src || ref.asset)
  edit: { type: Object, default: null }, // thông số đã áp lần trước
  pos: { type: Object, default: null }, // { x, y } % — object-position
  zoom: { type: Number, default: 1 },
  fit: { type: String, default: 'cover' },
  aspect: { type: Number, default: 16 / 9 }, // tỷ lệ khung ảnh trên slide
  busy: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }, // mobile: xếp dọc, chạm lớn
})
const emit = defineEmits(['apply', 'cancel'])

const mode = ref('crop')
const MODES = [
  { key: 'crop', label: 'Cắt & xoay' },
  { key: 'color', label: 'Màu sắc' },
  { key: 'frame', label: 'Vị trí trong khung' },
]

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
  if (m !== 'frame' || !cropper || !ready.value) return
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
  if (fitV.value !== 'cover' && zm.value <= 1) return
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
  emit('apply', { edit: currentEdit(), pos, zoom: zm.value > 1 ? Math.round(zm.value * 100) / 100 : null, fit: fitV.value })
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3" :class="compact ? '' : 'md:flex-row'">
    <!-- Vùng ảnh -->
    <div class="relative min-w-0 flex-1">
      <div v-show="mode !== 'frame'" class="relative overflow-hidden rounded-lg bg-[#1b1f2a]" :class="compact ? 'h-[46dvh]' : 'h-[440px]'">
        <img ref="imgEl" :src="src" alt="Ảnh đang chỉnh sửa" class="block max-w-full" @load="init" @error="loadError = true" />
        <div v-if="!ready && !loadError" class="absolute inset-0 grid place-items-center text-[13px] text-white/80">Đang tải ảnh…</div>
        <div v-if="loadError" class="absolute inset-0 grid place-items-center text-[13px] text-white/80">Không tải được ảnh gốc</div>
      </div>
      <div v-if="mode === 'frame'" class="flex flex-col items-center gap-2">
        <div
          class="relative w-full touch-none select-none overflow-hidden rounded-lg bg-[var(--mds-bg-page)] ring-1 ring-[var(--mds-border)]"
          :class="fitV === 'cover' || zm > 1 ? 'cursor-grab active:cursor-grabbing' : ''"
          :style="{ aspectRatio: String(aspect), maxHeight: compact ? '46dvh' : '440px', maxWidth: compact ? '100%' : `${440 * aspect}px` }"
          @pointerdown="onFrameDown"
          @pointermove="onFrameMove"
          @pointerup="onFrameUp"
          @pointercancel="onFrameUp"
        >
          <img :src="framePreview || src" alt="" draggable="false" class="pointer-events-none h-full w-full" :style="frameStyle" />
        </div>
        <p class="text-[12px] text-[var(--mds-text-secondary)]">Khung giữ nguyên như trên trang — kéo ảnh để chọn phần hiển thị.</p>
      </div>
    </div>

    <!-- Công cụ -->
    <div class="flex shrink-0 flex-col gap-3" :class="compact ? '' : 'md:w-[300px]'">
      <MTabs v-model="mode" :tabs="MODES" variant="pill" />

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
</template>
