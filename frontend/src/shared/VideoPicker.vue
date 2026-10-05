<script setup>
// Gắn video cho 1 trang: tải video lên (MP4/WebM/MOV) hoặc dán link YouTube → hiển thị ảnh bìa 16:9 + nút phát;
// khi trình chiếu, bấm vào video sẽ tự phát toàn màn hình. Bấm ảnh bìa ở đây để xem thử.
import { computed, ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MProgress from '@/components/mds/MProgress.vue'
import MediaLibrary from './MediaLibrary.vue'
import { useToast } from '@/components/mds/toast.js'
import { VIDEO_ACCEPT, MAX_VIDEO_MB, videoSource, looksLikeYouTube } from '@/composables/useMedia.js'
import { playVideo } from '@/composables/useVideoPlayer.js'
import { SPEC_LIMITS as L } from '@/lib/slideModel.js'

const props = defineProps({
  modelValue: { type: Object, default: null }, // { provider, id|asset, poster, title, caption } | null
  media: { type: Object, required: true }, // useMedia()
  library: { type: Array, default: () => [] }, // video đã có trong bài
  withCaption: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const toast = useToast()
const fileInput = ref(null)
const uploading = ref(false)
const progress = ref(0)
const ytOpen = ref(false)
const ytUrl = ref('')
const ytBusy = ref(false)
const libraryOpen = ref(false)

const v = computed(() => props.modelValue)
const posterUrl = computed(() => (v.value?.poster ? props.media.assetUrl(v.value.poster) : ''))
const label = computed(() => (v.value?.provider === 'youtube' ? 'YouTube' : 'Video tải lên'))
const libItems = computed(() =>
  props.library.map((x) => ({ key: x.provider === 'youtube' ? `yt:${x.id}` : `f:${x.asset}`, url: x.poster ? props.media.assetUrl(x.poster) : '', label: x.title || (x.provider === 'youtube' ? 'YouTube' : 'Video'), video: x })),
)
const currentKey = computed(() => (v.value ? (v.value.provider === 'youtube' ? `yt:${v.value.id}` : `f:${v.value.asset}`) : ''))

function set(patch) {
  emit('update:modelValue', patch ? { title: '', caption: '', poster: null, ...(v.value || {}), ...patch } : null)
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  uploading.value = true
  progress.value = 0
  try {
    const video = await props.media.uploadVideo(file, { onProgress: (p) => (progress.value = p) })
    emit('update:modelValue', { caption: v.value?.caption || '', ...video })
    toast.success('Đã tải video lên')
  } catch (err) {
    toast.error(err.message)
  } finally {
    uploading.value = false
  }
}

async function addYt() {
  const url = ytUrl.value.trim()
  if (!looksLikeYouTube(url)) return toast.error('Dán link YouTube dạng https://www.youtube.com/watch?v=… hoặc https://youtu.be/…')
  ytBusy.value = true
  try {
    const video = await props.media.addYouTube(url)
    emit('update:modelValue', { caption: v.value?.caption || '', ...video })
    ytOpen.value = false
    ytUrl.value = ''
  } catch (err) {
    toast.error(err.message)
  } finally {
    ytBusy.value = false
  }
}

function preview() {
  const src = videoSource(v.value, props.media)
  if (!src || !playVideo(src)) toast.error('Chưa phát thử được video này')
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <!-- Ảnh bìa 16:9 + nút phát (giống trên slide) -->
    <button
      v-if="v"
      type="button"
      class="group relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[#0B1220] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
      :aria-label="`Xem thử video ${v.title || ''}`"
      @click="preview"
    >
      <img v-if="posterUrl" :src="posterUrl" alt="" class="absolute inset-0 h-full w-full object-cover" />
      <span class="relative grid h-12 w-12 place-items-center rounded-full bg-black/60 text-white transition-transform group-hover:scale-110"><MIcon name="player-play" :size="24" /></span>
      <span class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold text-white" :class="v.provider === 'youtube' ? 'bg-[#E62117]' : 'bg-black/60'">
        <MIcon :name="v.provider === 'youtube' ? 'brand-youtube' : 'video'" :size="12" />{{ label }}
      </span>
    </button>
    <div v-else class="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-[var(--mds-border)] bg-[var(--mds-bg-page)] text-[var(--mds-text-secondary)]">
      <div class="flex flex-col items-center gap-1 px-4 text-center">
        <MIcon name="video" :size="28" />
        <span class="text-[12px]">Video MP4/WebM/MOV tối đa {{ MAX_VIDEO_MB }} MB hoặc link YouTube</span>
      </div>
    </div>
    <MProgress v-if="uploading" :value="progress" :label="progress < 100 ? `Đang tải video… ${progress}%` : 'Đang xử lý…'" />

    <div class="flex flex-wrap gap-2">
      <MButton :loading="uploading" :disabled="ytBusy" @click="fileInput?.click()">
        <template #icon><MIcon name="upload" :size="16" /></template>
        {{ v?.provider === 'file' ? 'Thay video' : 'Tải video lên' }}
      </MButton>
      <MButton variant="outline" :disabled="uploading" @click="ytOpen = !ytOpen">
        <template #icon><MIcon name="brand-youtube" :size="16" /></template>
        Link YouTube
      </MButton>
      <MButton v-if="library.length" variant="outline" @click="libraryOpen = true">
        <template #icon><MIcon name="folder" :size="16" /></template>
        Video trong bài ({{ library.length }})
      </MButton>
      <MButton v-if="v" variant="ghost" @click="emit('update:modelValue', null)">
        <template #icon><MIcon name="trash" :size="16" /></template>
        Bỏ video
      </MButton>
    </div>
    <input ref="fileInput" type="file" :accept="VIDEO_ACCEPT" class="hidden" @change="onFile" />

    <form v-if="ytOpen" class="flex items-start gap-2" @submit.prevent="addYt">
      <div class="min-w-0 flex-1">
        <MInput v-model="ytUrl" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" aria-label="Link YouTube" clearable />
      </div>
      <MButton variant="primary" type="submit" :loading="ytBusy">Thêm</MButton>
    </form>

    <template v-if="v">
      <MInput :model-value="v.title || ''" placeholder="Tên video (hiện khi phát)" :maxlength="L.videoTitle" aria-label="Tên video" @update:model-value="(x) => set({ title: x })" />
      <MInput v-if="withCaption" :model-value="v.caption || ''" placeholder="Chú thích hiển thị dưới video" :maxlength="L.caption" aria-label="Chú thích video" @update:model-value="(x) => set({ caption: x })" />
    </template>

    <MediaLibrary v-model="libraryOpen" title="Chọn video trong bài trình bày" :items="libItems" :selected="currentKey" @pick="(it) => emit('update:modelValue', { caption: v?.caption || '', ...it.video })" />
  </div>
</template>
