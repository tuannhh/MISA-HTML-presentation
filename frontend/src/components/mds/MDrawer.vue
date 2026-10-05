<script setup>
import { computed, watch, onBeforeUnmount, useSlots } from 'vue'
import MIcon from './MIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  // Chiều rộng panel — nhận số (px) hoặc chuỗi CSS
  width: { type: [String, Number], default: 480 },
  // Cạnh trượt ra: 'right' (mặc định) | 'left'
  position: {
    type: String,
    default: 'right',
    validator: (v) => ['right', 'left'].includes(v),
  },
  // true (mặc định): có lớp phủ che nội dung, click phủ để đóng, khóa scroll nền.
  // false: KHÔNG che — đẩy nội dung trang sang một bên (padding body theo chiều rộng panel).
  overlay: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'close'])

const slots = useSlots()

const widthStyle = computed(() =>
  typeof props.width === 'number' ? `${props.width}px` : props.width
)

function close() {
  emit('update:modelValue', false)
  emit('close')
}

// MDS: phím Esc đóng drawer (tương đương Hủy)
function onKeydown(e) {
  if (e.key === 'Escape') close()
}

// Chế độ đẩy (overlay=false): thêm padding cho body đúng bằng chiều rộng panel
// để nội dung trang trượt sang, không bị che. Transition 200ms khớp với panel.
let pushTimer = null
function setPush(on) {
  const prop = props.position === 'right' ? 'paddingRight' : 'paddingLeft'
  document.body.style.transition = 'padding-left 0.2s ease, padding-right 0.2s ease'
  document.body.style[prop] = on ? widthStyle.value : ''
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    document.body.style.transition = ''
  }, 250)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
      if (props.overlay) {
        // Khóa scroll nền khi có lớp phủ (theo MDS)
        document.body.style.overflow = 'hidden'
      } else {
        setPush(true)
      }
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
      if (!props.overlay) setPush(false)
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  clearTimeout(pushTimer)
  if (props.modelValue) {
    document.body.style.overflow = ''
    if (!props.overlay) {
      document.body.style.transition = ''
      document.body.style[props.position === 'right' ? 'paddingRight' : 'paddingLeft'] = ''
    }
  }
})
</script>

<template>
  <Teleport to="body">
    <!-- Lớp phủ: click để đóng (chỉ khi overlay=true) -->
    <Transition name="mds-drawer-fade">
      <div
        v-if="modelValue && overlay"
        class="fixed inset-0 z-[1000] bg-black/50"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <!-- Panel trượt từ cạnh, transition 200ms -->
    <Transition :name="position === 'right' ? 'mds-drawer-right' : 'mds-drawer-left'">
      <section
        v-if="modelValue"
        class="fixed bottom-0 top-0 z-[1001] flex max-w-[100vw] flex-col bg-[var(--mds-bg)] shadow-2xl"
        :class="position === 'right' ? 'right-0' : 'left-0'"
        :style="{ width: widthStyle }"
        role="dialog"
        :aria-modal="overlay"
        :aria-label="title"
      >
        <!-- Header: title H3 16/22 semibold + nút x góc phải -->
        <div class="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--mds-border)] px-5 py-3">
          <h3 class="text-[16px] font-semibold leading-[22px] text-[var(--mds-text)] line-clamp-2">
            {{ title }}
          </h3>
          <button
            type="button"
            class="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] hover:text-[var(--mds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
            aria-label="Đóng"
            @click="close"
          >
            <MIcon name="x" :size="16" />
          </button>
        </div>

        <!-- Body: cuộn được, chiếm phần còn lại -->
        <div class="flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-[18px] text-[var(--mds-text)]">
          <slot />
        </div>

        <!-- Footer: nút xếp ưu tiên PHẢI→TRÁI, Primary ngoài cùng bên phải (theo MDS — thường Lưu/Hủy) -->
        <div
          v-if="slots.footer"
          class="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--mds-border)] px-5 py-3"
        >
          <slot name="footer" />
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style>
/* Bất khả kháng: transition trượt/fade cần selector động theo cạnh */
.mds-drawer-fade-enter-active,
.mds-drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}
.mds-drawer-fade-enter-from,
.mds-drawer-fade-leave-to {
  opacity: 0;
}
.mds-drawer-right-enter-active,
.mds-drawer-right-leave-active,
.mds-drawer-left-enter-active,
.mds-drawer-left-leave-active {
  transition: transform 0.2s ease;
}
.mds-drawer-right-enter-from,
.mds-drawer-right-leave-to {
  transform: translateX(100%);
}
.mds-drawer-left-enter-from,
.mds-drawer-left-leave-to {
  transform: translateX(-100%);
}
</style>
