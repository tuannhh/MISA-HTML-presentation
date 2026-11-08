<script setup>
// Lớp phát video: tự phát + toàn màn hình (trừ khi video đặt "không phóng toàn màn hình"). YouTube qua youtube-nocookie, Vimeo qua
// player.vimeo.com (CSP frame-src cho phép), video tải lên qua <video>. Trình duyệt chặn tự phát có tiếng → phát không tiếng + nút
// "Bật tiếng". Esc / phím Trước–Sau của bút trình chiếu / nút Đóng / thoát toàn màn hình / video tải lên phát hết → đóng lớp phát.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MIcon from '@/components/mds/MIcon.vue'
import { player, closeVideo, listenDeckVideos, embedUrls } from '@/composables/useVideoPlayer.js'

const root = ref(null)
const closeBtn = ref(null)
const videoEl = ref(null)
const mutedFallback = ref(false)
let wasFullscreen = false
let returnFocus = null

const embed = computed(() => (player.open ? embedUrls(player) : null))
const CLOSE_KEYS = ['Escape', 'PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft']

async function startFile() {
  const v = videoEl.value
  if (!v) return
  v.muted = player.muted
  try {
    await v.play()
  } catch (err) {
    if (v.muted || err?.name !== 'NotAllowedError') return
    v.muted = true
    mutedFallback.value = true
    await v.play().catch(() => {})
  }
}

async function enter() {
  returnFocus = document.activeElement
  mutedFallback.value = false
  await nextTick()
  closeBtn.value?.focus()
  wasFullscreen = false
  if (player.provider === 'file') startFile()
  if (!player.fs || document.fullscreenElement) return
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

function unmute() {
  if (videoEl.value) videoEl.value.muted = false
  mutedFallback.value = false
}

function onFullscreenChange() {
  if (player.open && wasFullscreen && document.fullscreenElement !== root.value) {
    wasFullscreen = false
    closeVideo()
  }
}
function onKey(e) {
  if (!player.open || !CLOSE_KEYS.includes(e.key)) return
  // Phím mũi tên trong thanh điều khiển của <video> (tua) → để trình phát xử lý.
  if (e.key.startsWith('Arrow') && e.target === videoEl.value) return
  e.preventDefault()
  close()
}

watch(
  () => player.open && `${player.provider}:${player.id}:${player.src}`,
  (v) => v && enter(),
)
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
    <div v-if="player.open && embed" class="relative aspect-video max-h-full w-full max-w-[min(100vw,calc(100vh*16/9))]">
      <iframe
        :key="embed.embed"
        :src="embed.embed"
        :title="player.title"
        class="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>
    <video
      v-else-if="player.open"
      ref="videoEl"
      :key="player.src"
      :src="player.src"
      class="h-full w-full bg-black object-contain"
      controls
      playsinline
      @ended="close"
    />
    <div class="absolute right-3 top-3 flex items-center gap-2">
      <a
        v-if="embed"
        :href="embed.page"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex h-8 items-center gap-1 rounded-full bg-white/15 px-3 text-[13px] font-medium text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <MIcon name="external-link" :size="16" />Mở trên {{ embed.label }}
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
    <button
      v-if="mutedFallback"
      type="button"
      class="absolute bottom-6 right-6 inline-flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-[14px] font-medium text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      @click="unmute"
    >
      <MIcon name="volume" :size="18" />Bật tiếng
    </button>
  </div>
</template>
