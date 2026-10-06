<script setup>
// Bộ nhận diện thương hiệu của bài: ảnh trang bìa, trang mở đầu phần ("trang sub"), trang cảm ơn/kết, nền trang nội dung,
// dải đầu trang (header), dải chân trang (footer) — tải lên ảnh thiết kế sẵn của công ty / chiến dịch.
// + Mẫu thương hiệu: lưu toàn bộ thiết kế (màu, nền, phông, logo, ảnh nhận diện) để áp cho bài khác; mẫu công khai ai cũng áp được.
// Sửa trực tiếp vào object thiết kế (spec ở trình soạn thảo / outline.design ở bước dàn ý) như các tab khác của DesignPanel.
import { computed, onMounted, ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MDialog from '@/components/mds/MDialog.vue'
import MDropdownMenu from '@/components/mds/MDropdownMenu.vue'
import MediaLibrary from './MediaLibrary.vue'
import { useToast } from '@/components/mds/toast.js'
import { LOGO_ACCEPT } from '@/composables/useMedia.js'
import { themeSwatch, themeTone } from '@/lib/design.js'

const props = defineProps({
  design: { type: Object, required: true },
  media: { type: Object, required: true },
  ratio: { type: String, default: '16:9' },
  compact: { type: Boolean, default: false },
})
const toast = useToast()
const d = computed(() => props.design)

const SIZES = { '16:9': [1920, 1080], '4:3': [1600, 1200], '2:1': [2160, 1080], '3:1': [3240, 1080] }
const dims = computed(() => SIZES[props.ratio] || SIZES['16:9'])
const SLOTS = computed(() => {
  const [w, h] = dims.value
  return [
    { key: 'cover', label: 'Trang bìa', hint: `${w}×${h} px — chừa vùng trống cho tiêu đề`, band: false },
    { key: 'section', label: 'Trang mở đầu phần', hint: 'Trang “sub” ngăn cách các phần', band: false },
    { key: 'closing', label: 'Trang cảm ơn / kết', hint: 'Ảnh nền trang cuối', band: false },
    { key: 'page', label: 'Nền trang nội dung', hint: 'Nhạt, ít chi tiết để chữ dễ đọc', band: false },
    { key: 'header', label: 'Dải đầu trang', hint: `Ngang ${w}×80–200 px, trên trang nội dung`, band: true },
    { key: 'footer', label: 'Dải chân trang', hint: `Ngang ${w}×60–160 px, dưới trang nội dung`, band: true },
  ]
})
const EMPTY = { cover: null, page: null, section: null, closing: null, header: null, footer: null, footerText: true }
const b = computed(() => d.value.brand || null)
const has = computed(() => !!b.value && SLOTS.value.some((s) => b.value[s.key]))
const urlOf = (aid) => (aid ? props.media.assetUrl(aid) : '')

// Độ sáng ảnh nền toàn trang (thu nhỏ 24×14, bỏ điểm trong suốt): tối → chữ trang đó chuyển sáng (và ngược lại) khi khác tông bài.
async function imageTone(url) {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = 24
    cv.height = 14
    const g = cv.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0, cv.width, cv.height)
    const px = g.getImageData(0, 0, cv.width, cv.height).data
    let sum = 0
    let n = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 26) continue
      sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      n += 1
    }
    return n ? (sum / n < 128 ? 'dark' : 'light') : null
  } catch {
    return null
  }
}
const FULL = new Set(['cover', 'page', 'section', 'closing'])
async function setSlot(key, assetId) {
  const next = { ...EMPTY, ...(b.value || {}), [key]: assetId }
  const tones = { ...(next.tones || {}) }
  delete tones[key]
  next.tones = tones
  d.value.brand = SLOTS.value.some((s) => next[s.key]) ? next : null
  if (!assetId || !FULL.has(key)) return
  const t = await imageTone(urlOf(assetId))
  // Người dùng có thể đã đổi ảnh khác trong lúc đo → chỉ ghi khi ô vẫn là ảnh này.
  if (t && d.value.brand?.[key] === assetId) d.value.brand = { ...d.value.brand, tones: { ...(d.value.brand.tones || {}), [key]: t } }
}
// Chữ trên ảnh: ảnh tối → chữ sáng. Người dùng chỉnh tay khi ảnh nửa sáng nửa tối.
const inkOf = (key) => (b.value?.tones?.[key] || tone.value) === 'dark' ? 'light' : 'dark'
function setInk(key, ink) {
  if (!b.value) return
  d.value.brand = { ...b.value, tones: { ...(b.value.tones || {}), [key]: ink === 'light' ? 'dark' : 'light' } }
}
function setFooterText(on) {
  if (b.value) d.value.brand = { ...b.value, footerText: on }
}
function clearAll() {
  d.value.brand = null
}

/* ---- tải ảnh ---- */
const fileInput = ref(null)
const target = ref('')
const uploading = ref('')
function pick(key) {
  target.value = key
  fileInput.value?.click()
}
async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  const key = target.value
  if (!file || !key) return
  uploading.value = key
  try {
    const a = await props.media.uploadBrand(file)
    setSlot(key, a.id)
  } catch (err) {
    toast.error(err.message)
  } finally {
    uploading.value = ''
  }
}
// Chọn lại ảnh nhận diện đã tải trong bài (vd. dùng cùng 1 ảnh cho trang bìa và trang kết).
const libraryFor = ref('')
const libraryOpen = computed({ get: () => !!libraryFor.value, set: (v) => !v && (libraryFor.value = '') })
const brandImages = computed(() => props.media.ofKind('brand').map((a) => ({ key: a.id, url: a.url, label: a.name || '' })))
function onLibrary(it) {
  if (libraryFor.value) setSlot(libraryFor.value, it.key)
}

// Tông bài (sáng/tối) — so với tông ảnh nền để biết chữ trên ảnh đang sáng hay tối.
const tone = computed(() => themeTone(d.value.theme, d.value.palette))

/* ---- mẫu thương hiệu ---- */
const templates = ref([])
const loadingList = ref(false)
const listError = ref('')
const tplName = ref('')
const saving = ref(false)
const applying = ref('')
const renaming = ref('')
const renameText = ref('')
const removing = ref(null)

async function loadTemplates() {
  loadingList.value = true
  listError.value = ''
  try {
    templates.value = await props.media.listTemplates()
  } catch (err) {
    listError.value = err.message
  } finally {
    loadingList.value = false
  }
}
onMounted(loadTemplates)

const DESIGN_KEYS = ['theme', 'palette', 'background', 'font', 'logo', 'brand']
function currentDesign() {
  const out = {}
  for (const k of DESIGN_KEYS) out[k] = d.value[k] ?? null
  if (out.theme !== 'custom') out.palette = null
  if (d.value.style) out.style = d.value.style
  return JSON.parse(JSON.stringify(out))
}
async function saveTemplate() {
  const name = tplName.value.trim()
  if (!name) return toast.error('Nhập tên mẫu')
  saving.value = true
  try {
    const t = await props.media.saveTemplate(name, currentDesign())
    templates.value = [t, ...templates.value]
    tplName.value = ''
    toast.success(`Đã lưu mẫu “${t.name}”`)
  } catch (err) {
    toast.error(err.message)
  } finally {
    saving.value = false
  }
}
async function applyTemplate(t) {
  applying.value = t.id
  try {
    const res = await props.media.applyTemplate(t.id)
    for (const k of DESIGN_KEYS) d.value[k] = res.design[k] ?? null
    // Phong cách chỉ có ở bài đã dựng (spec); bước dàn ý không có trường này.
    if ('style' in d.value && res.design.style) d.value.style = res.design.style
    toast.success(`Đã áp mẫu “${res.name}” — bấm Lưu để giữ thay đổi`)
  } catch (err) {
    toast.error(err.message)
  } finally {
    applying.value = ''
  }
}
function startRename(t) {
  renaming.value = t.id
  renameText.value = t.name
}
async function doRename(t) {
  const name = renameText.value.trim()
  if (!name) return toast.error('Nhập tên mẫu')
  try {
    Object.assign(t, await props.media.updateTemplate(t.id, { name }))
    renaming.value = ''
  } catch (err) {
    toast.error(err.message)
  }
}
async function toggleShare(t) {
  try {
    Object.assign(t, await props.media.updateTemplate(t.id, { visibility: t.visibility === 'public' ? 'private' : 'public' }))
    toast.success(t.visibility === 'public' ? 'Mẫu đã công khai — mọi người dùng áp được' : 'Mẫu đã chuyển về riêng tư')
  } catch (err) {
    toast.error(err.message)
  }
}
async function doRemove() {
  const t = removing.value
  if (!t) return
  try {
    await props.media.deleteTemplate(t.id)
    templates.value = templates.value.filter((x) => x.id !== t.id)
    toast.success('Đã xoá mẫu')
  } catch (err) {
    toast.error(err.message)
  } finally {
    removing.value = null
  }
}
const menuFor = (t) => [
  { key: 'rename', label: 'Đổi tên', icon: 'pencil' },
  { key: 'share', label: t.visibility === 'public' ? 'Chuyển về riêng tư' : 'Công khai cho mọi người', icon: t.visibility === 'public' ? 'lock' : 'share' },
  { key: 'd', divider: true },
  { key: 'remove', label: 'Xoá mẫu', icon: 'trash', danger: true },
]
function onMenu(t, key) {
  if (key === 'rename') startRename(t)
  else if (key === 'share') toggleShare(t)
  else if (key === 'remove') removing.value = t
}
// Ảnh thu nhỏ của mẫu: ảnh bìa → nền trang → mảng màu của tông.
function thumbOf(t) {
  const br = t.design?.brand
  const id = br?.cover || br?.page
  return id && t.assets?.[id] ? t.assets[id].url : ''
}
const swatch = (t) => themeSwatch(t.design?.theme, t.design?.palette)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">
      Đưa bộ nhận diện của công ty hoặc chiến dịch vào bài. Chữ của bài vẫn nằm trên ảnh — nên thiết kế ảnh chừa vùng trống cho nội dung. PNG, JPG, WebP hoặc SVG.
    </p>

    <!-- 6 ô ảnh nhận diện -->
    <div class="grid grid-cols-2 gap-3">
      <div v-for="s in SLOTS" :key="s.key" class="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          class="relative grid w-full place-items-center overflow-hidden rounded-lg border bg-[var(--mds-bg-page)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="b?.[s.key] ? 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]' : 'border-dashed border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
          :style="{ aspectRatio: s.band ? `${dims[0]} / ${Math.round(dims[1] * 0.16)}` : `${dims[0]} / ${dims[1]}` }"
          :aria-label="`${b?.[s.key] ? 'Đổi' : 'Tải'} ảnh ${s.label.toLowerCase()}`"
          :disabled="!!uploading"
          @click="pick(s.key)"
        >
          <img v-if="b?.[s.key] && urlOf(b[s.key])" :src="urlOf(b[s.key])" alt="" class="h-full w-full" :class="s.band ? 'object-contain' : 'object-cover'" />
          <span v-else class="flex items-center gap-1 px-2 text-[11px] text-[var(--mds-text-secondary)]"><MIcon name="upload" :size="16" />Tải lên</span>
          <span v-if="uploading === s.key" class="absolute inset-0 grid place-items-center bg-black/40"><MSpinner :size="20" /></span>
        </button>
        <div class="flex min-w-0 items-center gap-0.5">
          <span class="min-w-0 flex-1 truncate text-[12px] font-medium leading-4">{{ s.label }}</span>
          <MButton v-if="brandImages.length" variant="icon" :aria-label="`Chọn ảnh đã tải cho ${s.label.toLowerCase()}`" @click="libraryFor = s.key"><template #icon><MIcon name="folder" :size="16" /></template></MButton>
          <MButton v-if="b?.[s.key]" variant="icon" :aria-label="`Bỏ ảnh ${s.label.toLowerCase()}`" @click="setSlot(s.key, null)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
        </div>
        <p class="text-[11px] leading-[14px] text-[var(--mds-text-secondary)]">{{ s.hint }}</p>
        <div v-if="!s.band && b?.[s.key]" role="radiogroup" :aria-label="`Màu chữ trên ${s.label.toLowerCase()}`" class="mt-0.5 flex gap-1">
          <button
            v-for="o in [{ v: 'dark', l: 'Chữ tối' }, { v: 'light', l: 'Chữ sáng' }]"
            :key="o.v"
            type="button"
            role="radio"
            :aria-checked="inkOf(s.key) === o.v"
            class="rounded-full border focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mds-brand-600)]"
            :class="[
              compact ? 'min-h-[44px] flex-1 px-2 text-[13px]' : 'px-2 text-[11px] leading-5',
              inkOf(s.key) === o.v ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-700)]' : 'border-[var(--mds-border)] text-[var(--mds-text-secondary)]',
            ]"
            @click="setInk(s.key, o.v)"
          >
            {{ o.l }}
          </button>
        </div>
      </div>
    </div>
    <input ref="fileInput" type="file" :accept="LOGO_ACCEPT" class="hidden" @change="onFile" />

    <template v-if="has">
      <MSwitch v-if="b.footer" :model-value="b.footerText !== false" label="Hiện tên bài & số trang trên dải chân trang" @update:model-value="setFooterText" />
      <p class="rounded-lg bg-[var(--mds-bg-page)] p-2 text-[12px] leading-4 text-[var(--mds-text-secondary)]">
        Màu chữ trên từng ảnh nền được tự chọn theo độ sáng ảnh (ảnh tối → chữ sáng); chỉnh tay bằng nút “Chữ tối / Chữ sáng” dưới mỗi ảnh.
      </p>
      <MButton variant="ghost" class="self-start" @click="clearAll"><template #icon><MIcon name="trash" :size="16" /></template>Bỏ toàn bộ ảnh nhận diện</MButton>
    </template>

    <!-- Mẫu thương hiệu -->
    <section class="flex flex-col gap-2 border-t border-[var(--mds-border)] pt-4" aria-labelledby="tpl-h">
      <h3 id="tpl-h" class="text-[14px] font-semibold">Mẫu thương hiệu</h3>
      <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">Lưu màu, nền, phông, logo và ảnh nhận diện của bài này thành mẫu để dùng lại. Mẫu công khai: mọi người dùng đều áp được (ví dụ bộ nhận diện công ty).</p>
      <div class="flex items-start gap-2" :class="compact ? 'flex-col items-stretch' : ''">
        <div class="min-w-0 flex-1"><MInput v-model="tplName" placeholder="Tên mẫu, ví dụ: Nhận diện công ty 2026" aria-label="Tên mẫu mới" @keydown.enter="saveTemplate" /></div>
        <MButton variant="outline" :loading="saving" @click="saveTemplate"><template #icon><MIcon name="bookmark" :size="16" /></template>Lưu thành mẫu</MButton>
      </div>

      <div v-if="loadingList" class="grid place-items-center py-4"><MSpinner :size="24" /></div>
      <p v-else-if="listError" class="text-[12px] text-[var(--mds-danger)]">{{ listError }} <button type="button" class="font-medium text-[var(--mds-brand-600)] hover:underline" @click="loadTemplates">Thử lại</button></p>
      <p v-else-if="!templates.length" class="rounded-lg border border-dashed border-[var(--mds-border)] p-3 text-center text-[12px] text-[var(--mds-text-secondary)]">Chưa có mẫu nào.</p>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="t in templates" :key="t.id" class="flex items-center gap-2 rounded-lg border border-[var(--mds-border)] p-2">
          <span class="relative block aspect-video w-16 shrink-0 overflow-hidden rounded-[4px] border border-[var(--mds-border)]" :style="{ background: swatch(t).bg }" aria-hidden="true">
            <img v-if="thumbOf(t)" :src="thumbOf(t)" alt="" class="h-full w-full object-cover" loading="lazy" />
            <template v-else>
              <span class="absolute left-[12%] top-[38%] block h-[12%] w-[46%] rounded-full" :style="{ background: swatch(t).a }" />
              <span class="absolute left-[12%] top-[58%] block h-[10%] w-[30%] rounded-full" :style="{ background: swatch(t).b }" />
            </template>
          </span>
          <div class="min-w-0 flex-1">
            <div v-if="renaming === t.id" class="flex items-center gap-1">
              <div class="min-w-0 flex-1"><MInput v-model="renameText" aria-label="Tên mẫu" @keydown.enter="doRename(t)" @keydown.esc="renaming = ''" /></div>
              <MButton variant="icon" aria-label="Lưu tên" @click="doRename(t)"><template #icon><MIcon name="check" :size="16" /></template></MButton>
              <MButton variant="icon" aria-label="Hủy đổi tên" @click="renaming = ''"><template #icon><MIcon name="x" :size="16" /></template></MButton>
            </div>
            <template v-else>
              <p class="truncate text-[13px] font-medium leading-[18px]">{{ t.name }}</p>
              <p class="truncate text-[11px] leading-4 text-[var(--mds-text-secondary)]">
                {{ t.isOwner ? (t.visibility === 'public' ? 'Của tôi · Công khai' : 'Của tôi · Riêng tư') : `Công khai · ${t.ownerName || 'người dùng khác'}` }}
              </p>
            </template>
          </div>
          <MButton v-if="renaming !== t.id" variant="outline" :loading="applying === t.id" :disabled="!!applying && applying !== t.id" @click="applyTemplate(t)">Áp dụng</MButton>
          <MDropdownMenu v-if="t.isOwner && renaming !== t.id" :items="menuFor(t)" @select="(k) => onMenu(t, k)" />
        </li>
      </ul>
    </section>

    <MediaLibrary v-model="libraryOpen" title="Chọn ảnh nhận diện đã tải" :items="brandImages" :selected="libraryFor ? b?.[libraryFor] || '' : ''" @pick="onLibrary" />
    <MDialog :model-value="!!removing" type="danger" title="Xoá mẫu thương hiệu?" confirm-text="Xoá" @update:model-value="(v) => !v && (removing = null)" @confirm="doRemove" @cancel="removing = null">
      <p class="text-[14px] leading-5">Mẫu “{{ removing?.name }}” và ảnh của mẫu sẽ bị xoá. Các bài đã áp mẫu vẫn giữ nguyên thiết kế.</p>
    </MDialog>
  </div>
</template>
