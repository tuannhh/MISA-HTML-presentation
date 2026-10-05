<script setup>
import { computed, watch, onBeforeUnmount } from 'vue'
import MIcon from './MIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  // Chiều rộng dialog — nhận số (px) hoặc chuỗi CSS
  width: { type: [String, Number], default: '480px' },
  // 'default': dialog thông báo (chỉ nút Đóng) | 'confirm': xác nhận hành động
  // | 'danger': xác nhận hành động nguy hiểm (xóa/hủy — nút primary màu đỏ)
  type: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'confirm', 'danger'].includes(v),
  },
  confirmText: { type: String, default: '' },
  cancelText: { type: String, default: 'Hủy' },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

// MDS: KHÔNG chồng (stack) nhiều dialog — luồng nhiều bước dùng Popup.
// Đếm số dialog đang mở toàn cục để cảnh báo dev khi vi phạm.
if (!window.__mdsOpenDialogs) window.__mdsOpenDialogs = { count: 0 }

const widthStyle = computed(() =>
  typeof props.width === 'number' ? `${props.width}px` : props.width
)

// Nhãn nút primary mặc định theo type (MDS: dialog thông báo dùng "Đóng",
// dialog xác nhận dùng cụm từ hành động)
const primaryLabel = computed(() => {
  if (props.confirmText) return props.confirmText
  if (props.type === 'danger') return 'Xóa'
  if (props.type === 'confirm') return 'Đồng ý'
  return 'Đóng'
})

// Dialog thông báo (default) chỉ có 1 nút; confirm/danger có thêm nút Hủy
const showCancel = computed(() => props.type !== 'default')

function close() {
  emit('update:modelValue', false)
}

function onCancel() {
  emit('cancel')
  close()
}

function onConfirm() {
  emit('confirm')
  close()
}

// MDS: phím Esc đóng dialog (tương đương Hủy)
function onKeydown(e) {
  if (e.key === 'Escape') onCancel()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      window.__mdsOpenDialogs.count++
      if (window.__mdsOpenDialogs.count > 1) {
        console.warn('[MDS] MDialog: không hỗ trợ dialog chồng dialog — dùng Popup cho luồng nhiều bước.')
      }
      document.addEventListener('keydown', onKeydown)
      // Khóa scroll nền khi dialog mở
      document.body.style.overflow = 'hidden'
    } else {
      window.__mdsOpenDialogs.count = Math.max(0, window.__mdsOpenDialogs.count - 1)
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  }
)

onBeforeUnmount(() => {
  if (props.modelValue) {
    window.__mdsOpenDialogs.count = Math.max(0, window.__mdsOpenDialogs.count - 1)
    document.body.style.overflow = ''
  }
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="mds-dialog">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div
          class="mds-dialog-panel flex max-h-[calc(100vh-64px)] w-full flex-col rounded-lg bg-[var(--mds-bg)] shadow-xl"
          :style="{ maxWidth: widthStyle }"
        >
          <!-- Header: title H3 16/22 semibold + nút x góc phải -->
          <div class="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <!-- MDS: tiêu đề tự xuống dòng, tối đa 2 dòng -->
            <h3 class="text-[16px] font-semibold leading-[22px] text-[var(--mds-text)] line-clamp-2">
              {{ title }}
            </h3>
            <button
              type="button"
              class="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] hover:text-[var(--mds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
              aria-label="Đóng"
              @click="onCancel"
            >
              <MIcon name="x" :size="16" />
            </button>
          </div>

          <!-- Body -->
          <div class="overflow-y-auto px-5 py-2 text-[13px] leading-[18px] text-[var(--mds-text)]">
            <slot />
          </div>

          <!-- Footer: nút xếp 1 hàng, ưu tiên PHẢI→TRÁI (Primary ngoài cùng bên phải — theo MDS) -->
          <div class="flex items-center justify-end gap-2 px-5 pb-4 pt-3">
            <slot name="footer">
              <button
                v-if="showCancel"
                type="button"
                class="h-8 min-w-[80px] rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] px-[14px] text-[13px] font-medium leading-[18px] text-[var(--mds-text)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
                @click="onCancel"
              >
                {{ cancelText }}
              </button>
              <button
                type="button"
                class="h-8 min-w-[80px] rounded-lg px-[14px] text-[13px] font-medium leading-[18px] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
                :class="
                  type === 'danger'
                    ? 'bg-[var(--mds-danger)] hover:brightness-95 active:brightness-90'
                    : 'bg-[var(--mds-brand-600)] hover:bg-[var(--mds-brand-700)] active:bg-[var(--mds-brand-800)]'
                "
                @click="onConfirm"
              >
                {{ primaryLabel }}
              </button>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* Bất khả kháng: transition fade (overlay) + scale nhẹ (panel) cần CSS lồng nhau */
.mds-dialog-enter-active,
.mds-dialog-leave-active {
  transition: opacity 0.15s ease;
}
.mds-dialog-enter-active .mds-dialog-panel,
.mds-dialog-leave-active .mds-dialog-panel {
  transition: transform 0.15s ease;
}
.mds-dialog-enter-from,
.mds-dialog-leave-to {
  opacity: 0;
}
.mds-dialog-enter-from .mds-dialog-panel,
.mds-dialog-leave-to .mds-dialog-panel {
  transform: scale(0.95);
}
</style>
