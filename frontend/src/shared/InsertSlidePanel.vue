<script setup>
// Chèn trang mới: (1) trang tự do — trang trắng hoặc mẫu bố cục gợi ý (tiêu đề + nội dung, ảnh trái – chữ phải, bảng, video…),
// sau đó kéo thả/đổi cỡ phần tử ngay trên khung xem trước; (2) bố cục có cấu trúc như AI dùng (ý chính, số liệu, quy trình…).
// Hình thu nhỏ của mẫu vẽ bằng khối đơn giản từ chính dữ liệu mẫu (shared/deck/free.js) — luôn khớp với trang được tạo.
import MIcon from '@/components/mds/MIcon.vue'
import { FREE_TEMPLATES } from '@shared/deck/free.js'
import { LAYOUTS } from '@/lib/slideModel.js'

defineProps({ compact: { type: Boolean, default: false } })
const emit = defineEmits(['pick'])
const structured = LAYOUTS.filter((l) => l.value !== 'free')
const box = (e) => ({ left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${e.h}%` })
const lines = (e) => (e.style === 'title' || e.style === 'heading' ? 1 : Math.max(1, Math.min(4, Math.round(e.h / 12))))
</script>

<template>
  <div class="flex flex-col gap-5">
    <section>
      <h3 class="mb-2 text-[14px] font-semibold">Trang tự do</h3>
      <p class="mb-3 text-[12px] text-[var(--mds-text-secondary)]">Tự sắp xếp chữ, ảnh, bảng, video — kéo để di chuyển, kéo góc để đổi kích thước ngay trên khung xem trước.</p>
      <div class="grid gap-3" :class="compact ? 'grid-cols-2' : 'grid-cols-3'">
        <button
          v-for="t in FREE_TEMPLATES"
          :key="t.key"
          type="button"
          class="group flex flex-col gap-1 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          @click="emit('pick', { layout: 'free', template: t.key })"
        >
          <span class="relative block aspect-video w-full overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)] group-hover:border-[var(--mds-brand-600)]">
            <span v-if="!t.elements.length" class="absolute inset-0 grid place-items-center text-[var(--mds-icon-neutral)]"><MIcon name="plus" :size="24" /></span>
            <span v-for="(e, k) in t.elements" :key="k" class="absolute" :style="box(e)">
              <span v-if="e.type === 'text'" class="flex h-full w-full flex-col gap-[3px] p-[3px]" :class="[e.fill === 'panel' ? 'rounded bg-white/80 ring-1 ring-[var(--mds-border)]' : '', e.align === 'center' ? 'items-center' : '']">
                <span v-for="n in lines(e)" :key="n" class="block rounded-full" :class="[e.style === 'title' || e.style === 'heading' ? 'h-[5px] bg-[var(--mds-text)]' : 'h-[3px] bg-[var(--mds-text-secondary)] opacity-60', e.color === 'accent' ? '!bg-[var(--mds-brand-600)]' : '']" :style="{ width: n === lines(e) && n > 1 ? '60%' : '90%' }" />
              </span>
              <span v-else-if="e.type === 'image'" class="grid h-full w-full place-items-center rounded-[3px] bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]"><MIcon name="photo" :size="14" /></span>
              <span v-else-if="e.type === 'video'" class="grid h-full w-full place-items-center rounded-[3px] bg-[#1b1f2a] text-white"><MIcon name="player-play" :size="14" /></span>
              <span v-else-if="e.type === 'table'" class="grid h-full w-full grid-cols-3 gap-px overflow-hidden rounded-[3px] bg-[var(--mds-border)]">
                <span v-for="n in 12" :key="n" class="block" :class="n <= 3 ? 'bg-[var(--mds-brand-600)] opacity-70' : 'bg-white'" />
              </span>
              <span v-else class="block h-full w-full rounded bg-white/85 ring-1 ring-[var(--mds-border)]" />
            </span>
          </span>
          <span class="text-[13px] font-medium leading-[18px] group-hover:text-[var(--mds-brand-600)]">{{ t.label }}</span>
        </button>
      </div>
    </section>
    <section>
      <h3 class="mb-2 text-[14px] font-semibold">Bố cục có sẵn</h3>
      <div class="grid gap-2" :class="compact ? 'grid-cols-1' : 'grid-cols-3'">
        <button
          v-for="l in structured"
          :key="l.value"
          type="button"
          class="flex items-center gap-2 rounded-lg border border-[var(--mds-border)] px-3 text-left text-[13px] hover:border-[var(--mds-brand-600)] hover:text-[var(--mds-brand-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="compact ? 'min-h-12 text-[15px]' : 'h-10'"
          @click="emit('pick', { layout: l.value })"
        >
          <MIcon :name="l.icon" :size="16" class="text-[var(--mds-icon-neutral)]" />{{ l.label }}
        </button>
      </div>
    </section>
  </div>
</template>
