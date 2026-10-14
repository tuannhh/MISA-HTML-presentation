<script setup>
// Tiến trình job AI trong hàng đợi (roadmap B) — gọn: 1 thanh tiến trình + 1 dòng trạng thái (đang chờ: vị trí, dự kiến bắt đầu;
// đang chạy: đã chạy, dự kiến còn). Thời gian dự kiến là trung bình ĐO ĐƯỢC của các job gần nhất trên máy chủ (deck.queue — xem
// src/lib/jobTracker.js); chưa có số đo → thanh chạy không xác định. queue null (máy chủ vừa khởi động lại / job vừa xong) → không hiện.
import { computed } from 'vue'
import MProgress from '@/components/mds/MProgress.vue'

const props = defineProps({
  queue: { type: Object, default: null },
  compact: { type: Boolean, default: false },
})

function dur(sec) {
  if (sec == null) return ''
  if (sec < 60) return `${Math.max(1, Math.round(sec))} giây`
  return `${Math.ceil(sec / 60)} phút`
}
const about = (sec) => (sec == null ? '' : sec < 30 ? 'dưới 30 giây' : `khoảng ${dur(sec)}`)

const waiting = computed(() => props.queue?.state === 'waiting')

// % ước tính = đã chạy / (đã chạy + dự kiến còn); quá giờ dự kiến → đứng ở 95% (không bao giờ báo xong khi chưa xong).
const percent = computed(() => {
  const q = props.queue
  if (!q || waiting.value || q.etaSec == null) return null
  if (q.etaSec <= 0) return 95
  return Math.min(95, Math.max(3, Math.round((100 * q.elapsedSec) / (q.elapsedSec + q.etaSec))))
})

const status = computed(() => {
  const q = props.queue
  if (!q) return ''
  if (waiting.value) {
    return [`Đang chờ đến lượt — vị trí thứ ${q.position}`, q.startInSec == null ? 'đang ước tính' : q.startInSec < 30 ? 'sắp đến lượt' : `dự kiến bắt đầu sau ${about(q.startInSec)}`].join(' · ')
  }
  return [`Đã chạy ${dur(q.elapsedSec)}`, q.etaSec != null ? (q.etaSec > 0 ? `dự kiến còn ${about(q.etaSec)}` : 'lâu hơn dự kiến, AI vẫn đang xử lý') : 'đang ước tính thời gian'].join(' · ')
})
</script>

<template>
  <div v-if="queue" class="flex w-full flex-col gap-2" :class="compact ? 'max-w-none' : 'max-w-[420px]'">
    <MProgress v-if="percent != null" :value="percent" />
    <div v-else class="h-1.5 w-full overflow-hidden rounded-full bg-[var(--mds-bg-disabled)]" role="progressbar" aria-busy="true" :aria-valuetext="status">
      <div class="jp-indeterminate h-full w-1/3 rounded-full" :class="waiting ? 'bg-[var(--mds-bg-neutral-neutral-dark,var(--mds-text-placeholder))]' : 'bg-[var(--mds-brand-600)]'" />
    </div>
    <p class="text-[var(--mds-text-secondary)]" :class="compact ? 'text-[14px] leading-5' : 'text-[13px] leading-[18px]'" aria-live="polite">{{ status }}</p>
  </div>
</template>

<style scoped>
/* Thanh không xác định (chưa có số đo thời gian / đang chờ lượt): dải chạy qua lại. Tắt chuyển động khi người dùng yêu cầu. */
.jp-indeterminate { animation: jp-slide 1.6s ease-in-out infinite; }
@keyframes jp-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
@media (prefers-reduced-motion: reduce) { .jp-indeterminate { animation: none; width: 100%; opacity: .5; } }
</style>
