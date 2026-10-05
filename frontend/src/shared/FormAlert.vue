<script setup>
// Thông báo lỗi/nhắc nhở cấp form (lỗi cần người dùng xử lý — không dùng toast tự mất).
import MIcon from '@/components/mds/MIcon.vue'

defineProps({
  tone: { type: String, default: 'danger' }, // danger | info | warning | success
})
const STYLE = {
  danger: 'bg-[var(--mds-danger-soft)] text-[var(--mds-text)] [&_.ic]:text-[var(--mds-danger)]',
  info: 'bg-[var(--mds-info-soft)] text-[var(--mds-text)] [&_.ic]:text-[var(--mds-info)]',
  warning: 'bg-[var(--mds-warning-soft)] text-[var(--mds-text)] [&_.ic]:text-[var(--mds-warning)]',
  success: 'bg-[var(--mds-success-soft)] text-[var(--mds-text)] [&_.ic]:text-[var(--mds-success)]',
}
const ICON = { danger: 'alert-circle', info: 'info-circle', warning: 'alert-triangle', success: 'circle-check' }
</script>

<template>
  <div :role="tone === 'danger' ? 'alert' : 'status'" class="flex items-start gap-2 rounded-lg p-3 text-[13px] leading-[18px]" :class="STYLE[tone]">
    <MIcon :name="ICON[tone]" :size="16" class="ic mt-px shrink-0" />
    <div class="min-w-0 flex-1"><slot /></div>
  </div>
</template>
