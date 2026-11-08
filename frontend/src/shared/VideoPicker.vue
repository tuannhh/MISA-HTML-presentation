<script setup>
// Gắn video cho 1 trang: tải video lên (MP4/WebM/MOV ≤ 200 MB — máy chủ nén lại chạy nền) hoặc dán link YouTube / Vimeo → ảnh bìa
// + nút phát. Tuỳ chọn trình chiếu (tự phát, phóng toàn màn hình, tắt tiếng) và — ở ô media của bố cục — căn trái/giữa/phải + cỡ.
// Bấm ảnh bìa ở đây để xem thử.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MProgress from '@/components/mds/MProgress.vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MediaLibrary from './MediaLibrary.vue'
import RangeField from './RangeField.vue'
import { useToast } from '@/components/mds/toast.js'
import { VIDEO_ACCEPT, MAX_VIDEO_MB, videoSource, looksLikeVideoLink, videoKey } from '@/composables/useMedia.js'
import { playVideo } from '@/composables/useVideoPlayer.js'
import { SPEC_LIMITS as L } from '@/lib/slideModel.js'
import { VIDEO_SIZE_MIN, VIDEO_SIZE_MAX } from '@shared/deck/video.js'

const props = defineProps({
  modelValue: { type: Object, default: null }, // { provider, id|asset, hash?, poster, title, caption, autoplay?, fullscreen?, muted?, align?, size? } | null
  media: { type: Object, required: true }, // useMedia()
  library: { type: Array, default: () => [] }, // video đã có trong bài
  withCaption: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  // Ô media của bố cục (không phải phần tử trang tự do) → có căn trái/giữa/phải + cỡ.
  layout: { type: Boolean, default: false },
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
const PROVIDER = { youtube: { label: 'YouTube', icon: 'brand-youtube', cls: 'bg-[#E62117]' }, vimeo: { label: 'Vimeo', icon: 'brand-vimeo', cls: 'bg-[#17A9DC]' }, file: { label: 'Video tải lên', icon: 'video', cls: 'bg-black/60' } }
const badge = computed(() => PROVIDER[v.value?.provider] || PROVIDER.file)
const libItems = computed(() =>
  props.library.map((x) => ({ key: videoKey(x), url: x.poster ? props.media.assetUrl(x.poster) : '', label: x.title || PROVIDER[x.provider]?.label || 'Video', video: x })),
)
const currentKey = computed(() => videoKey(v.value))
// Tuỳ chọn trình chiếu + vị trí của ô video hiện tại — giữ nguyên khi đổi sang video khác.
const OPT_KEYS = ['autoplay', 'fullscreen', 'muted', 'align', 'size']
const keepOpts = () => Object.fromEntries(OPT_KEYS.filter((k) => v.value?.[k] !== undefined).map((k) => [k, v.value[k]]))
// Video mới (tải lên / link / thư viện): chỉ lấy phần nhận dạng + ảnh bìa + tên của nguồn, giữ chú thích + tuỳ chọn của ô.
function pick(video) {
  const { autoplay, fullscreen, muted, align, size, caption, ...src } = video
  emit('update:modelValue', { caption: v.value?.caption || '', ...src, ...keepOpts() })
}

function set(patch) {
  emit('update:modelValue', patch ? { title: '', caption: '', poster: null, ...(v.value || {}), ...patch } : null)
}
// Bật/tắt tuỳ chọn: chỉ lưu khác mặc định (mặc định: bấm mới phát, toàn màn hình, có tiếng, căn giữa, đầy ô).
function setOpt(k, val, dflt) {
  const next = { ...(v.value || {}) }
  if (val === dflt || val === undefined) delete next[k]
  else next[k] = val
  emit('update:modelValue', next)
}
const sizePct = computed(() => v.value?.size || VIDEO_SIZE_MAX)

/* ---- trạng thái nén video tải lên (chạy nền trên máy chủ) ---- */
const asset = computed(() => (v.value?.provider === 'file' ? props.media.byId(v.value.asset) : null))
const optimizing = computed(() => ['pending', 'running'].includes(asset.value?.state))
let timer = null
function stopPoll() {
  clearTimeout(timer)
  timer = null
}
function poll() {
  stopPoll()
  if (!optimizing.value) return
  timer = setTimeout(async () => {
    const id = v.value?.asset
    const a = id ? await props.media.videoStatus(id).catch(() => null) : null
    if (a?.state === 'done') toast.success('Đã tối ưu video để trình chiếu mượt hơn')
    poll()
  }, 4000)
}
watch(optimizing, (on) => (on ? poll() : stopPoll()), { immediate: true })
onBeforeUnmount(stopPoll)

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  uploading.value = true
  progress.value = 0
  try {
    const video = await props.media.uploadVideo(file, { onProgress: (p) => (progress.value = p) })
    pick(video)
    toast.success('Đã tải video lên')
  } catch (err) {
    toast.error(err.message)
  } finally {
    uploading.value = false
  }
}

async function addYt() {
  const url = ytUrl.value.trim()
  if (!looksLikeVideoLink(url)) return toast.error('Dán link YouTube (youtube.com/watch?v=…, youtu.be/…) hoặc Vimeo (vimeo.com/…)')
  ytBusy.value = true
  try {
    const video = await props.media.addVideoLink(url)
    pick(video)
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
      <span class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold text-white" :class="badge.cls">
        <MIcon :name="badge.icon" :size="12" />{{ badge.label }}
      </span>
      <span v-if="optimizing" class="absolute bottom-2 left-2 right-2 inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-black/70 px-2 py-1 text-[12px] font-medium text-white" role="status">
        <MIcon name="refresh" :size="14" class="animate-spin" />Đang tối ưu video để trình chiếu mượt hơn…
      </span>
    </button>
    <div v-else class="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-[var(--mds-border)] bg-[var(--mds-bg-page)] text-[var(--mds-text-secondary)]">
      <div class="flex flex-col items-center gap-1 px-4 text-center">
        <MIcon name="video" :size="28" />
        <span class="text-[12px]">Video MP4/WebM/MOV tối đa {{ MAX_VIDEO_MB }} MB hoặc link YouTube / Vimeo</span>
      </div>
    </div>
    <MProgress v-if="uploading" :value="progress" :label="progress < 100 ? `Đang tải video… ${progress}%` : 'Đang xử lý…'" />

    <div class="flex flex-wrap gap-2">
      <MButton :loading="uploading" :disabled="ytBusy" @click="fileInput?.click()">
        <template #icon><MIcon name="upload" :size="16" /></template>
        {{ v?.provider === 'file' ? 'Thay video' : 'Tải video lên' }}
      </MButton>
      <MButton variant="outline" :disabled="uploading" @click="ytOpen = !ytOpen">
        <template #icon><MIcon name="link" :size="16" /></template>
        Link YouTube / Vimeo
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
        <MInput v-model="ytUrl" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=… hoặc https://vimeo.com/…" aria-label="Link video YouTube hoặc Vimeo" clearable />
      </div>
      <MButton variant="primary" type="submit" :loading="ytBusy">Thêm</MButton>
    </form>

    <template v-if="v">
      <MInput :model-value="v.title || ''" placeholder="Tên video (hiện khi phát)" :maxlength="L.videoTitle" aria-label="Tên video" @update:model-value="(x) => set({ title: x })" />
      <MInput v-if="withCaption" :model-value="v.caption || ''" placeholder="Chú thích hiển thị dưới video" :maxlength="L.caption" aria-label="Chú thích video" @update:model-value="(x) => set({ caption: x })" />

      <fieldset class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <legend class="px-1 text-[13px] font-semibold">Khi trình chiếu</legend>
        <!-- Mobile: cả hàng là vùng chạm ≥ 44px (MSwitch gốc chỉ cao 20px). -->
        <MSwitch class="max-md:min-h-11" :model-value="!!v.autoplay" label="Tự phát khi tới trang" @update:model-value="(x) => setOpt('autoplay', x, false)" />
        <MSwitch class="max-md:min-h-11" :model-value="v.fullscreen !== false" label="Phóng toàn màn hình khi phát" @update:model-value="(x) => setOpt('fullscreen', x, true)" />
        <MSwitch class="max-md:min-h-11" :model-value="!!v.muted" label="Tắt tiếng" @update:model-value="(x) => setOpt('muted', x, false)" />
        <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">
          {{ v.fullscreen === false ? 'Video phát ngay trong khung trên trang.' : 'Video phủ kín màn hình; bấm Sau / Esc trên bút trình chiếu để quay lại trang.' }}
          Trình duyệt chặn tự phát có tiếng khi người xem chưa bấm gì — khi đó video phát không tiếng, kèm nút “Bật tiếng”.
        </p>
      </fieldset>

      <fieldset v-if="layout" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <legend class="px-1 text-[13px] font-semibold">Vị trí và kích thước</legend>
        <div class="flex items-center gap-2">
          <span class="mr-auto text-[13px]">Căn trong ô</span>
          <div class="flex gap-1" role="group" aria-label="Căn video">
            <MButton
              v-for="a in ['left', 'center', 'right']"
              :key="a"
              variant="icon"
              :class="(v.align || 'center') === a ? 'bg-[var(--mds-brand-50)] text-[var(--mds-brand-600)]' : ''"
              :aria-pressed="(v.align || 'center') === a"
              :aria-label="{ left: 'Căn trái', center: 'Căn giữa', right: 'Căn phải' }[a]"
              @click="setOpt('align', a, 'center')"
            >
              <template #icon><MIcon :name="`layout-align-${a}`" :size="16" /></template>
            </MButton>
          </div>
        </div>
        <RangeField :model-value="sizePct" label="Cỡ video" :min="VIDEO_SIZE_MIN" :max="VIDEO_SIZE_MAX" :step="5" :reset="VIDEO_SIZE_MAX" :format="(x) => `${x}%`" @update:model-value="(x) => setOpt('size', x, VIDEO_SIZE_MAX)" />
      </fieldset>
    </template>

    <MediaLibrary v-model="libraryOpen" title="Chọn video trong bài trình bày" :items="libItems" :selected="currentKey" @pick="(it) => pick(it.video)" />
  </div>
</template>
