<script setup>
// Vẽ mẫu nền động của bài trình bày (shared/deck/backgrounds.js — cùng mã với deck thật) vào 1 canvas nhỏ.
// Hình học tính theo khung logic 1280×720 rồi thu nhỏ bằng transform → mật độ giống hệt slide thật.
// animate=false: đứng yên ở t=0 (tiết kiệm CPU khi có nhiều ô); người dùng bật "giảm chuyển động" → luôn đứng yên.
// boost > 1: thu nhỏ nhiều thì nét mảnh/alpha thấp gần như biến mất → vẽ ra canvas phụ rồi chồng `boost` lớp
// (alpha ≈ 1 − (1 − a)^boost) để ô xem trước rõ như khi nhìn slide cỡ thật.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DeckBg } from '@/lib/design.js'

const props = defineProps({
  name: { type: String, default: 'network' },
  colors: { type: Object, required: true }, // { node, edge, accent, accent2, tone }
  animate: { type: Boolean, default: false },
  logicalWidth: { type: Number, default: 1280 },
  logicalHeight: { type: Number, default: 720 },
  boost: { type: Number, default: 1 },
})

const canvas = ref(null)
let painter = null
let out = null // ctx canvas hiển thị khi vẽ qua canvas phụ (boost)
let buf = null
let raf = 0
let t0 = 0
let ro = null
const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function setup() {
  const cv = canvas.value
  if (!cv) return
  const rect = cv.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round((rect.width || 320) * dpr))
  const h = Math.max(1, Math.round((rect.height || 180) * dpr))
  cv.width = w
  cv.height = h
  const layers = Math.max(1, Math.min(4, Math.round(props.boost)))
  out = layers > 1 ? cv.getContext('2d') : null
  buf = layers > 1 ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null
  const ctx = (buf || cv).getContext('2d')
  ctx.setTransform(w / props.logicalWidth, 0, 0, h / props.logicalHeight, 0, 0)
  painter = props.name === 'none'
    ? null
    : DeckBg.create(ctx, { name: props.name, width: props.logicalWidth, height: props.logicalHeight, node: props.colors.node, edge: props.colors.edge, accent: props.colors.accent, accent2: props.colors.accent2, light: props.colors.tone === 'light', seed: 7 })
  if (!painter) ctx.clearRect(0, 0, props.logicalWidth, props.logicalHeight)
  draw(0)
}

function draw(t) {
  painter?.draw(t)
  if (!out) return
  out.clearRect(0, 0, buf.width, buf.height)
  if (!painter) return
  for (let k = Math.min(4, Math.round(props.boost)); k > 0; k -= 1) out.drawImage(buf, 0, 0)
}

function loop(ts) {
  if (!t0) t0 = ts
  draw((ts - t0) / 1000)
  raf = requestAnimationFrame(loop)
}

function sync() {
  cancelAnimationFrame(raf)
  raf = 0
  t0 = 0
  if (props.animate && !reduce && painter) raf = requestAnimationFrame(loop)
  else draw(0)
}

watch(() => [props.name, props.colors.node, props.colors.edge, props.colors.accent, props.colors.accent2, props.colors.tone], () => {
  setup()
  sync()
})
watch(() => props.animate, sync)

onMounted(() => {
  setup()
  sync()
  ro = new ResizeObserver(() => {
    setup()
    if (!raf) draw(0)
  })
  ro.observe(canvas.value)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="block h-full w-full" aria-hidden="true" />
</template>
