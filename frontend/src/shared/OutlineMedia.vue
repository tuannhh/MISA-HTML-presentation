<script setup>
// Media của 1 trang dàn ý: nhiều ảnh HOẶC 1 video (tải lên / YouTube). Hệ thống tự đặt media vào slide khi dựng bài:
// 1 ảnh hoặc video → hiển thị cạnh nội dung; từ 2 ảnh → trang bộ sưu tập ảnh.
import { computed, ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MTabs from '@/components/mds/MTabs.vue'
import VideoPicker from './VideoPicker.vue'
import MediaLibrary from './MediaLibrary.vue'
import { useToast } from '@/components/mds/toast.js'
import { IMAGE_ACCEPT } from '@/composables/useMedia.js'
import { SPEC_LIMITS as L } from '@/lib/slideModel.js'

const props = defineProps({
  slide: { type: Object, required: true },
  media: { type: Object, required: true },
  videoLibrary: { type: Array, default: () => [] },
})
const toast = useToast()
const s = computed(() => props.slide)
const mode = ref(s.value.video ? 'video' : 'image')
const TABS = computed(() => [
  { key: 'image', label: `Ảnh${s.value.images.length ? ` (${s.value.images.length})` : ''}` },
  { key: 'video', label: s.value.video ? 'Video (1)' : 'Video' },
])
const fileInput = ref(null)
const uploading = ref(0)
const libraryOpen = ref(false)
const imageLib = computed(() => props.media.ofKind('image').map((a) => ({ key: a.id, url: a.url, label: a.name || '' })))

function clearVideoFor(action) {
  if (!s.value.video) return
  s.value.video = null
  toast.info(`Đã bỏ video của trang này để ${action} (mỗi trang: nhiều ảnh hoặc 1 video)`)
}

function addImage(assetId) {
  if (s.value.images.length >= L.images) return toast.error(`Mỗi trang tối đa ${L.images} ảnh`)
  if (s.value.images.some((im) => im.asset === assetId)) return
  clearVideoFor('gắn ảnh')
  s.value.images.push({ asset: assetId, caption: '' })
}

const dragging = ref(false)
function onFiles(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  uploadAll(files)
}
// Kéo-thả ảnh từ Finder/Explorer vào khung ảnh của trang (cách thay thế khi hộp chọn tệp không tiện).
function onDrop(e) {
  dragging.value = false
  const files = [...(e.dataTransfer?.files || [])]
  if (files.length) uploadAll(files)
}
async function uploadAll(list) {
  const files = list.slice(0, L.images - s.value.images.length)
  for (const f of files) {
    uploading.value += 1
    try {
      const a = await props.media.uploadImage(f)
      addImage(a.id)
    } catch (err) {
      toast.error(`${f.name}: ${err.message}`)
    } finally {
      uploading.value -= 1
    }
  }
}

function setVideo(v) {
  if (v && s.value.images.length) {
    s.value.images = []
    toast.info('Đã bỏ ảnh của trang này để gắn video (mỗi trang: nhiều ảnh hoặc 1 video)')
  }
  s.value.video = v
}

function moveImage(i, dir) {
  const j = i + dir
  if (j < 0 || j >= s.value.images.length) return
  const [x] = s.value.images.splice(i, 1)
  s.value.images.splice(j, 0, x)
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <MTabs v-model="mode" :tabs="TABS" variant="pill" />
      <span class="text-[12px] text-[var(--mds-text-secondary)]">1 ảnh/video: đặt cạnh nội dung · từ 2 ảnh: bộ sưu tập</span>
    </div>

    <div
      v-if="mode === 'image'"
      class="flex flex-col gap-2 rounded-lg"
      :class="dragging ? 'outline-dashed outline-2 outline-offset-4 outline-[var(--mds-brand-600)]' : ''"
      @dragover.prevent="dragging = true"
      @dragleave.self="dragging = false"
      @drop.prevent="onDrop"
    >
      <div v-if="s.images.length" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div v-for="(im, i) in s.images" :key="im.asset" class="flex min-w-0 flex-col gap-1">
          <div class="group relative aspect-video overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)]">
            <img :src="media.assetUrl(im.asset)" alt="" class="h-full w-full object-cover" loading="lazy" />
            <div class="absolute right-1 top-1 flex gap-1">
              <button v-if="s.images.length > 1" type="button" class="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-40" :disabled="i === 0" aria-label="Chuyển ảnh lên trước" @click="moveImage(i, -1)"><MIcon name="chevron-left" :size="16" /></button>
              <button v-if="s.images.length > 1" type="button" class="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-40" :disabled="i === s.images.length - 1" aria-label="Chuyển ảnh ra sau" @click="moveImage(i, 1)"><MIcon name="chevron-right" :size="16" /></button>
              <button type="button" class="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white hover:bg-[var(--mds-danger)]" aria-label="Bỏ ảnh" @click="s.images.splice(i, 1)"><MIcon name="x" :size="16" /></button>
            </div>
          </div>
          <MInput v-model="im.caption" placeholder="Chú thích (tuỳ chọn)" :maxlength="L.caption" aria-label="Chú thích ảnh" />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <MButton :loading="uploading > 0" :disabled="s.images.length >= L.images" @click="fileInput?.click()">
          <template #icon><MIcon name="upload" :size="16" /></template>
          Tải ảnh lên
        </MButton>
        <MButton v-if="imageLib.length" variant="outline" :disabled="s.images.length >= L.images" @click="libraryOpen = true">
          <template #icon><MIcon name="folder" :size="16" /></template>
          Ảnh trong bài ({{ imageLib.length }})
        </MButton>
        <span class="hidden self-center text-[12px] text-[var(--mds-text-secondary)] md:inline">hoặc kéo-thả ảnh vào đây</span>
      </div>
      <input ref="fileInput" type="file" :accept="IMAGE_ACCEPT" multiple class="hidden" @change="onFiles" />
    </div>

    <VideoPicker v-else :model-value="s.video" :media="media" :library="videoLibrary" @update:model-value="setVideo" />

    <MediaLibrary v-model="libraryOpen" :items="imageLib" @pick="(it) => addImage(it.key)" />
  </div>
</template>
