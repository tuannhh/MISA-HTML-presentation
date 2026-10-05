<script setup>
// MImageViewer — slideshow fullscreen cho ảnh nghiệp vụ/đính kèm.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MIcon from './MIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  images: { type: Array, default: () => [] },
  initialIndex: { type: Number, default: 0 },
  downloadable: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change', 'download'])
const index = ref(0)
const current = computed(() => props.images[index.value] || {})
const hasPrevious = computed(() => index.value > 0)
const hasNext = computed(() => index.value < props.images.length - 1)

function select(nextIndex) {
  if (nextIndex < 0 || nextIndex >= props.images.length) return
  index.value = nextIndex
  emit('change', nextIndex)
}
function close() { emit('update:modelValue', false) }
function onKeydown(event) {
  if (!props.modelValue) return
  if (event.key === 'Escape') close()
  if (event.key === 'ArrowLeft') select(index.value - 1)
  if (event.key === 'ArrowRight') select(index.value + 1)
}
function onImageError(event) { event.target.classList.add('hidden') }

watch(() => [props.modelValue, props.initialIndex, props.images.length], () => {
  if (props.modelValue) select(Math.min(Math.max(props.initialIndex, 0), Math.max(props.images.length - 1, 0)))
}, { immediate: true })
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="fixed inset-0 z-[1100] flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true" :aria-label="current.name || current.alt || 'Xem ảnh'">
      <header class="flex min-h-12 items-center gap-3 border-b border-white/15 px-3 pt-[env(safe-area-inset-top)] sm:px-5">
        <div class="min-w-0 flex-1 truncate text-[14px] font-medium">{{ current.name || current.alt || 'Xem ảnh' }}</div>
        <span class="shrink-0 text-[13px] text-white/70">{{ images.length ? `${index + 1} / ${images.length}` : '0 / 0' }}</span>
        <button v-if="downloadable" type="button" class="grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" title="Tải xuống" @click="emit('download', { image: current, index })"><MIcon name="download" :size="20" /></button>
        <button type="button" class="grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" title="Đóng" @click="close"><MIcon name="x" :size="20" /></button>
      </header>

      <main class="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">
        <button v-if="images.length > 1" type="button" class="absolute left-2 grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white disabled:cursor-not-allowed disabled:opacity-30 hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:left-5" :disabled="!hasPrevious" title="Ảnh trước" @click="select(index - 1)"><MIcon name="chevron-left" :size="24" /></button>
        <img v-if="current.src" :src="current.src" :alt="current.alt || current.name || ''" class="max-h-full max-w-full object-contain" @error="onImageError" />
        <div v-else class="text-[13px] text-white/70">Không thể tải ảnh</div>
        <button v-if="images.length > 1" type="button" class="absolute right-2 grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white disabled:cursor-not-allowed disabled:opacity-30 hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:right-5" :disabled="!hasNext" title="Ảnh tiếp theo" @click="select(index + 1)"><MIcon name="chevron-right" :size="24" /></button>
      </main>

      <nav v-if="images.length > 1" class="flex shrink-0 gap-2 overflow-x-auto border-t border-white/15 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5" aria-label="Danh sách ảnh">
        <button v-for="(image, imageIndex) in images" :key="`${image.src}-${imageIndex}`" type="button" class="h-12 w-16 shrink-0 overflow-hidden rounded border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" :class="imageIndex === index ? 'border-[var(--mds-brand-400)]' : 'border-transparent opacity-65 hover:opacity-100'" :aria-label="`Xem ảnh ${imageIndex + 1}`" @click="select(imageIndex)"><img :src="image.src" :alt="image.alt || ''" class="h-full w-full object-cover" /></button>
      </nav>
    </div>
  </Teleport>
</template>
