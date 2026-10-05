<script setup>
// Container toast — đặt DUY NHẤT 1 lần ở App.vue: <MToast />
// Hành vi MDS: góc trên phải, stack dọc mới nhất trên cùng, tối đa 3,
// tự đóng sau 5s (logic ở toast.js), rộng tối đa 400px.
import { useToast } from './toast.js'
import MIcon from './MIcon.vue'

const { toasts, remove } = useToast()

const iconNames = {
  success: 'circle-check',
  error: 'circle-x',
  warning: 'alert-triangle',
  info: 'info-circle',
}
// Màu icon theo token trạng thái MDS
const iconColor = {
  success: 'text-[var(--mds-success)]',
  error: 'text-[var(--mds-danger)]',
  warning: 'text-[var(--mds-warning)]',
  info: 'text-[var(--mds-info)]',
}
</script>

<template>
  <Teleport to="body">
    <!-- Vị trí MDS: góc trên bên phải, phía dưới thanh header -->
    <div class="pointer-events-none fixed right-4 top-4 z-[1100] flex flex-col items-end gap-2">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="translate-x-4 opacity-0"
        move-class="transition-transform duration-200"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex max-w-[400px] items-start gap-2 rounded-lg bg-[var(--mds-bg)] py-2.5 pl-3 pr-2 shadow-lg ring-1 ring-[var(--mds-border)]"
          role="status"
        >
          <MIcon :name="iconNames[toast.type]" :size="20" class="mt-px" :class="iconColor[toast.type]" />
          <!-- Message 13px — MDS khuyến nghị xuống dòng tối đa 2 dòng -->
          <p class="min-w-0 flex-1 text-[13px] leading-[18px] text-[var(--mds-text)]">
            {{ toast.message }}
          </p>
          <!-- Nút x đóng thủ công -->
          <button
            type="button"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] hover:text-[var(--mds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
            aria-label="Đóng thông báo"
            @click="remove(toast.id)"
          >
            <MIcon name="x" :size="16" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
