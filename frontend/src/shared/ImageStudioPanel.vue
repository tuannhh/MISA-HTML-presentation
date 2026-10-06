<script setup>
// Nội dung "Đổi / chỉnh sửa ảnh" (dùng chung: dialog desktop, màn toàn màn hình mobile).
// 5 nguồn: tải ảnh mới · ảnh đã có trong bài · tìm ảnh Internet (Pixabay, nhập từ khoá) · tạo ảnh AI (Nano Banana 2 Lite, 1K)
// · chỉnh sửa ảnh hiện tại (cắt/xoay/màu/vị trí trong khung). Chọn ảnh mới → phát 'apply' với tham chiếu ảnh mới
// (giữ chú thích/kiểu hiển thị cũ, bỏ thông số chỉnh sửa của ảnh trước).
import { computed, ref, watch } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MTabs from '@/components/mds/MTabs.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import ImageEditor from './ImageEditor.vue'
import { useToast } from '@/components/mds/toast.js'
import { IMAGE_ACCEPT, MAX_IMAGE_MB } from '@/composables/useMedia.js'
import { SPEC_LIMITS as L } from '@/lib/slideModel.js'

const props = defineProps({
  image: { type: Object, default: null }, // tham chiếu ảnh hiện tại { asset, alt, caption, fit, src?, edit?, pos?, zoom? }
  aspect: { type: Number, default: 16 / 9 }, // tỷ lệ ô ảnh trên slide
  media: { type: Object, required: true }, // useMedia()
  assets: { type: Array, default: () => [] },
  suggest: { type: String, default: '' }, // gợi ý mô tả cho ảnh AI (vd. tiêu đề trang)
  compact: { type: Boolean, default: false },
  allowRemove: { type: Boolean, default: true },
  initialTab: { type: String, default: '' },
})
const emit = defineEmits(['apply', 'close'])
const toast = useToast()

const hasImage = computed(() => !!props.image?.asset)
const TABS = computed(() => [
  { key: 'upload', label: 'Tải lên' },
  { key: 'library', label: 'Ảnh trong bài' },
  { key: 'search', label: 'Tìm ảnh' },
  { key: 'ai', label: 'Tạo bằng AI' },
  { key: 'edit', label: 'Chỉnh sửa', disabled: !hasImage.value },
])
const tab = ref(props.initialTab || (hasImage.value ? 'edit' : 'search'))
const busy = ref('')

// Ảnh mới thay ảnh cũ: giữ chú thích + kiểu hiển thị, bỏ vị trí/phóng/chỉnh sửa (thuộc về ảnh cũ).
function pickAsset(assetId, alt = '') {
  const old = props.image || {}
  emit('apply', { asset: assetId, alt: alt || old.alt || '', caption: old.caption || '', fit: old.fit || 'cover', ...(old.frame ? { frame: old.frame } : {}) })
}

/* ---- Tải lên ---- */
const fileInput = ref(null)
const dragOver = ref(false)
async function uploadFile(file) {
  if (!file) return
  if (file.size > MAX_IMAGE_MB * 1048576) return toast.error(`Ảnh tối đa ${MAX_IMAGE_MB} MB`)
  busy.value = 'upload'
  try {
    const a = await props.media.uploadImage(file)
    pickAsset(a.id)
  } catch (err) {
    toast.error(err.message)
  } finally {
    busy.value = ''
  }
}
function onFile(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  uploadFile(f)
}
function onDrop(e) {
  dragOver.value = false
  uploadFile(e.dataTransfer?.files?.[0])
}

/* ---- Ảnh trong bài (ảnh gốc của ảnh đã chỉnh sửa vẫn được liệt kê để dùng lại) ---- */
const library = computed(() => props.assets.filter((a) => (!a.kind || a.kind === 'image') && a.url))

/* ---- Tìm ảnh Internet (Pixabay) ---- */
const q = ref(props.suggest.slice(0, L.searchQuery))
const orientation = ref('')
const ORIENT = [
  { label: 'Mọi hướng', value: '' },
  { label: 'Ảnh ngang', value: 'horizontal' },
  { label: 'Ảnh dọc', value: 'vertical' },
]
const hits = ref([])
const page = ref(1)
const hasNext = ref(false)
const searched = ref('')
const searching = ref(false)
let ctrl = null
async function search(more = false) {
  const term = q.value.trim()
  if (!term) return toast.error('Nhập từ khoá tìm ảnh')
  ctrl?.abort()
  ctrl = new AbortController()
  searching.value = true
  try {
    const p = more ? page.value + 1 : 1
    const res = await props.media.searchImages(term, { page: p, orientation: orientation.value, signal: ctrl.signal })
    hits.value = more ? [...hits.value, ...res.hits] : res.hits
    page.value = p
    hasNext.value = res.hasNext
    searched.value = term
  } catch (err) {
    if (err.name !== 'AbortError') toast.error(err.message)
  } finally {
    searching.value = false
  }
}
async function pickStock(h) {
  busy.value = `stock:${h.id}`
  try {
    const res = await props.media.importStock(h.id)
    pickAsset(res.asset.id, res.alt)
  } catch (err) {
    toast.error(err.message)
  } finally {
    busy.value = ''
  }
}

/* ---- Tạo ảnh AI ---- */
const AI_ASPECTS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9']
const nearestAspect = (a) => AI_ASPECTS.reduce((best, k) => {
  const [w, h] = k.split(':').map(Number)
  return Math.abs(Math.log(w / h / a)) < Math.abs(Math.log(best.r / a)) ? { k, r: w / h } : best
}, { k: '16:9', r: 16 / 9 }).k
const prompt = ref(props.suggest ? `Ảnh minh hoạ chuyên nghiệp cho nội dung: ${props.suggest}` : '')
const aiAspect = ref(nearestAspect(props.aspect))
const ASPECT_OPTIONS = AI_ASPECTS.map((k) => ({ label: k, value: k }))
const generated = ref(null) // { asset, alt }
async function generate() {
  const p = prompt.value.trim()
  if (!p) return toast.error('Nhập mô tả ảnh cần tạo')
  busy.value = 'ai'
  try {
    generated.value = await props.media.generateImage(p, aiAspect.value)
  } catch (err) {
    toast.error(err.message)
  } finally {
    busy.value = ''
  }
}

/* ---- Chỉnh sửa ---- */
const originalId = computed(() => props.image?.src || props.image?.asset || '')
const originalUrl = computed(() => props.media.assetUrl(originalId.value))
async function onEditApply({ edit, pos, zoom, fit }) {
  const img = { ...props.image, fit }
  delete img.pos
  delete img.zoom
  if (pos) img.pos = pos
  if (zoom) img.zoom = zoom
  const before = JSON.stringify(props.image?.edit || null)
  if (JSON.stringify(edit) === before) return emit('apply', img)
  busy.value = 'edit'
  try {
    const res = await props.media.editImage(originalId.value, edit)
    delete img.src
    delete img.edit
    if (res.edit) Object.assign(img, { asset: res.asset.id, src: res.src, edit: res.edit })
    else img.asset = res.src
    emit('apply', img)
  } catch (err) {
    toast.error(err.message)
  } finally {
    busy.value = ''
  }
}

watch(() => props.image?.asset, (v) => !v && tab.value === 'edit' && (tab.value = 'search'))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <div class="overflow-x-auto"><MTabs v-model="tab" :tabs="TABS" /></div>

    <!-- Tải lên -->
    <div v-if="tab === 'upload'" class="flex flex-col gap-3">
      <button
        type="button"
        class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center"
        :class="[compact ? 'min-h-[220px]' : 'min-h-[300px]', dragOver ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]']"
        :disabled="busy === 'upload'"
        @click="fileInput?.click()"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <MSpinner v-if="busy === 'upload'" :size="28" />
        <MIcon v-else name="upload" :size="32" class="text-[var(--mds-icon-neutral)]" />
        <span class="text-[14px] font-medium">{{ busy === 'upload' ? 'Đang tải ảnh lên…' : compact ? 'Chạm để chọn ảnh' : 'Kéo thả ảnh vào đây hoặc bấm để chọn tệp' }}</span>
        <span class="text-[12px] text-[var(--mds-text-secondary)]">PNG, JPEG, WebP, GIF, AVIF, HEIC · tối đa {{ MAX_IMAGE_MB }} MB</span>
      </button>
      <input ref="fileInput" type="file" :accept="IMAGE_ACCEPT" class="hidden" @change="onFile" />
    </div>

    <!-- Ảnh trong bài -->
    <div v-else-if="tab === 'library'">
      <p v-if="!library.length" class="py-10 text-center text-[13px] text-[var(--mds-text-secondary)]">Bài chưa có ảnh nào.</p>
      <div v-else class="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
        <button
          v-for="a in library"
          :key="a.id"
          type="button"
          class="relative aspect-video overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="a.id === image?.asset ? 'ring-2 ring-[var(--mds-brand-600)]' : 'hover:border-[var(--mds-brand-600)]'"
          :aria-label="`Dùng ảnh ${a.name || ''}`"
          @click="pickAsset(a.id)"
        >
          <img :src="a.url" alt="" class="h-full w-full object-cover" loading="lazy" />
        </button>
      </div>
    </div>

    <!-- Tìm ảnh -->
    <div v-else-if="tab === 'search'" class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2" @keydown.enter.prevent="search(false)">
        <div class="min-w-[200px] flex-1"><MInput v-model="q" placeholder="Từ khoá, vd: hội nghị, văn phòng, công nghệ AI" :maxlength="L.searchQuery" aria-label="Từ khoá tìm ảnh" /></div>
        <div class="w-[140px]"><MSelect v-model="orientation" :options="ORIENT" aria-label="Hướng ảnh" /></div>
        <MButton variant="primary" :loading="searching && !hits.length" @click="search(false)"><template #icon><MIcon name="search" :size="16" /></template>Tìm</MButton>
      </div>
      <div class="relative max-h-[50vh] min-h-[200px] overflow-y-auto">
        <p v-if="!searched && !searching" class="py-10 text-center text-[13px] text-[var(--mds-text-secondary)]">Nhập từ khoá (tiếng Việt hoặc tiếng Anh) để tìm ảnh miễn phí bản quyền.</p>
        <p v-else-if="searched && !hits.length && !searching" class="py-10 text-center text-[13px] text-[var(--mds-text-secondary)]">Không tìm thấy ảnh cho “{{ searched }}”. Thử từ khoá khác hoặc tiếng Anh.</p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            v-for="h in hits"
            :key="h.id"
            type="button"
            class="group relative aspect-[4/3] overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)] hover:border-[var(--mds-brand-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
            :aria-label="`Dùng ảnh: ${h.tags}`"
            :title="`${h.tags} — ${h.author}`"
            :disabled="!!busy"
            @click="pickStock(h)"
          >
            <img :src="h.preview" alt="" class="h-full w-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
            <span v-if="busy === `stock:${h.id}`" class="absolute inset-0 grid place-items-center bg-black/50"><MSpinner :size="24" /></span>
            <span class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-0.5 text-left text-[11px] text-white opacity-0 group-hover:opacity-100">{{ h.author }}</span>
          </button>
        </div>
        <div v-if="hasNext" class="mt-3 flex justify-center"><MButton variant="outline" :loading="searching" @click="search(true)">Xem thêm</MButton></div>
      </div>
      <p class="text-[12px] text-[var(--mds-text-secondary)]">
        Ảnh từ <a href="https://pixabay.com/" target="_blank" rel="noopener noreferrer" class="font-medium text-[var(--mds-brand-600)] hover:underline">Pixabay</a> — miễn phí dùng cho mục đích thương mại, không bắt buộc ghi nguồn.
      </p>
    </div>

    <!-- Tạo bằng AI -->
    <div v-else-if="tab === 'ai'" class="flex flex-col gap-3" :class="compact ? '' : 'md:flex-row'">
      <div class="flex min-w-0 flex-col gap-3" :class="compact ? '' : 'md:w-[320px] md:shrink-0'">
        <MTextarea v-model="prompt" :rows="5" :maxlength="L.aiPrompt" placeholder="Mô tả ảnh cần tạo: chủ thể, bối cảnh, phong cách, màu sắc…" />
        <div class="flex items-center gap-2">
          <span class="text-[13px] text-[var(--mds-text-secondary)]">Tỷ lệ</span>
          <div class="w-[120px]"><MSelect v-model="aiAspect" :options="ASPECT_OPTIONS" aria-label="Tỷ lệ ảnh" /></div>
          <MButton variant="ai" class="ml-auto" :loading="busy === 'ai'" @click="generate"><template #icon><MIcon name="sparkles" :size="16" /></template>{{ generated ? 'Tạo lại' : 'Tạo ảnh' }}</MButton>
        </div>
        <p class="text-[12px] text-[var(--mds-text-secondary)]">Nano Banana 2 Lite · 1K. Mỗi lần tạo mất khoảng 10–30 giây; ảnh được lưu vào “Ảnh trong bài”.</p>
      </div>
      <div class="relative grid min-h-[240px] flex-1 place-items-center overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)]">
        <div v-if="busy === 'ai'" class="flex flex-col items-center gap-2 text-[13px] text-[var(--mds-text-secondary)]"><MSpinner :size="28" />AI đang vẽ ảnh…</div>
        <template v-else-if="generated">
          <img :src="media.assetUrl(generated.asset.id)" alt="Ảnh AI vừa tạo" class="max-h-[46vh] w-full object-contain" />
          <div class="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
            <MButton variant="primary" @click="pickAsset(generated.asset.id, generated.alt)">Dùng ảnh này</MButton>
          </div>
        </template>
        <div v-else class="flex flex-col items-center gap-1 text-[13px] text-[var(--mds-text-secondary)]"><MIcon name="sparkles" :size="32" />Ảnh tạo ra sẽ hiện ở đây</div>
      </div>
    </div>

    <!-- Chỉnh sửa -->
    <div v-else-if="tab === 'edit' && hasImage">
      <ImageEditor
        :key="originalId"
        :src="originalUrl"
        :edit="image.edit || null"
        :pos="image.pos || null"
        :zoom="image.zoom || 1"
        :fit="image.fit || 'cover'"
        :aspect="aspect"
        :busy="busy === 'edit'"
        :compact="compact"
        @apply="onEditApply"
        @cancel="emit('close')"
      />
    </div>

    <div v-if="tab !== 'edit' && hasImage && allowRemove" class="flex justify-start border-t border-[var(--mds-border-light)] pt-3">
      <MButton variant="ghost" @click="emit('apply', null)"><template #icon><MIcon name="trash" :size="16" /></template>Gỡ ảnh khỏi khung</MButton>
    </div>
  </div>
</template>
