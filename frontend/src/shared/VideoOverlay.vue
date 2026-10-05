<script setup>
// Lớp phát video: tự phát + toàn màn hình. YouTube qua youtube-nocookie (CSP frame-src cho phép), video tải lên qua <video>.
// Esc / nút Đóng / thoát toàn màn hình → đóng lớp phát.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MIcon from '@/components/mds/MIcon.vue'
import { player, closeVideo, listenDeckVideos } from '@/composables/useVideoPlayer.js'

const root = ref(null)
const closeBtn = ref(null)
let wasFullscreen = false
let returnFocus = null

const ytSrc = computed(() => (player.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${player.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1` : ''))
const ytLink = computed(() => (player.provider === 'youtube' ? `https://www.youtube.com/watch?v=${player.id}` : ''))

async function enter() {
  returnFocus = document.activeElement
  await nextTick()
  closeBtn.value?.focus()
  wasFullscreen = false
  try {
    if (root.value?.requestFullscreen) {
      await root.value.requestFullscreen({ navigationUI: 'hide' })
      wasFullscreen = true
    }
  } catch {
    /* trình duyệt từ chối toàn màn hình (không có cử chỉ người dùng) → vẫn phát trong lớp phủ */
  }
}

async function close() {
  if (document.fullscreenElement === root.value) await document.exitFullscreen().catch(() => {})
  closeVideo()
  if (returnFocus?.focus) returnFocus.focus()
}

function onFullscreenChange() {
  if (player.open && wasFullscreen && document.fullscreenElement !== root.value) {
    wasFullscreen = false
    closeVideo()
  }
}
function onKey(e) {
  if (player.open && e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

watch(() => player.open, (v) => v && enter())
onMounted(() => {
  listenDeckVideos()
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    v-show="player.open"
    ref="root"
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black"
    role="dialog"
    aria-modal="true"
    :aria-label="player.title || 'Video'"
    @click.self="close"
  >
    <div v-if="player.open" class="relative aspect-video max-h-full w-full max-w-[min(100vw,calc(100vh*16/9))]">
      <iframe
        v-if="player.provider === 'youtube'"
        :key="player.id"
        :src="ytSrc"
        :title="player.title"
        class="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
      <video v-else :key="player.src" :src="player.src" class="absolute inset-0 h-full w-full bg-black" controls autoplay playsinline />
    </div>
    <div class="absolute right-3 top-3 flex items-center gap-2">
      <a
        v-if="ytLink"
        :href="ytLink"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex h-8 items-center gap-1 rounded-full bg-white/15 px-3 text-[13px] font-medium text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <MIcon name="external-link" :size="16" />Mở trên YouTube
      </a>
      <button
        ref="closeBtn"
        type="button"
        class="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        aria-label="Đóng video"
        @click="close"
      >
        <MIcon name="x" :size="20" />
      </button>
    </div>
  </div>
</template>
