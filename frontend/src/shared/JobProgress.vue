<script setup>
// Tiến trình job AI trong hàng đợi (roadmap B): Đã nhận → Đang chờ (vị trí, đã chờ, dự kiến bắt đầu) → AI đang xử lý
// (đã chạy, dự kiến còn). Thời gian dự kiến là trung bình ĐO ĐƯỢC của các job gần nhất trên máy chủ (deck.queue — xem
// src/lib/jobTracker.js); chưa có số đo thì ghi "đang ước tính". queue null (máy chủ vừa khởi động lại / job vừa xong) → không hiện.
import { computed } from 'vue'
import MIcon from '@/components/mds/MIcon.vue'
import MSpinner from '@/components/mds/MSpinner.vue'

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

const steps = computed(() => {
  const q = props.queue
  if (!q) return []
  const waiting = q.state === 'waiting'
  return [
    { key: 'received', label: 'Đã nhận yêu cầu', state: 'done', detail: '' },
    {
      key: 'wait',
      label: waiting ? 'Đang chờ đến lượt' : 'Đã đến lượt',
      state: waiting ? 'active' : 'done',
      detail: waiting
        ? [`Vị trí thứ ${q.position} trong hàng đợi`, q.startInSec == null ? 'đang ước tính thời gian chờ' : q.startInSec < 30 ? 'sắp đến lượt' : `dự kiến bắt đầu sau ${about(q.startInSec)}`].join(' · ')
        : q.waitedSec ? `Đã chờ ${dur(q.waitedSec)}` : '',
    },
    {
      key: 'run',
      label: q.kind === 'build' ? 'AI đang dựng bài' : 'AI đang lập dàn ý',
      state: waiting ? 'todo' : 'active',
      detail: waiting
        ? ''
        : [`Đã chạy ${dur(q.elapsedSec)}`, q.etaSec != null ? (q.etaSec > 0 ? `dự kiến còn ${about(q.etaSec)}` : 'lâu hơn dự kiến — AI vẫn đang xử lý') : 'chưa đủ số liệu để ước tính'].join(' · '),
    },
  ]
})
</script>

<template>
  <ol
    v-if="steps.length"
    class="flex w-full flex-col gap-3 text-left"
    :class="compact ? 'max-w-none' : 'max-w-[420px]'"
    aria-label="Tiến trình xử lý"
  >
    <li v-for="s in steps" :key="s.key" class="flex items-start gap-3" :aria-current="s.state === 'active' ? 'step' : undefined">
      <span
        class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        :class="s.state === 'done' ? 'bg-[var(--mds-bg-success-success-light)] text-[var(--mds-icon-success)]' : s.state === 'active' ? 'bg-[var(--mds-bg-brand-brand-light)] text-[var(--mds-icon-brand)]' : 'bg-[var(--mds-bg-neutral-neutral-light)] text-[var(--mds-icon-neutral-disabled)]'"
      >
        <MIcon v-if="s.state === 'done'" name="check" :size="16" />
        <MSpinner v-else-if="s.state === 'active' && s.key === 'run'" :size="14" />
        <MIcon v-else :name="s.key === 'wait' ? 'clock' : 'player-play'" :size="16" />
      </span>
      <span class="min-w-0">
        <span
          class="block font-medium"
          :class="[compact ? 'text-[15px] leading-6' : 'text-[14px] leading-5', s.state === 'todo' ? 'text-[var(--mds-text-placeholder)]' : 'text-[var(--mds-text-primary-neutral)]']"
        >{{ s.label }}</span>
        <span v-if="s.detail" class="block text-[var(--mds-text-secondary)]" :class="compact ? 'text-[14px] leading-5' : 'text-[13px] leading-[18px]'">{{ s.detail }}</span>
      </span>
    </li>
  </ol>
</template>
