<script setup>
// Form nội dung 1 slide (trường hiển thị theo layout). Sửa trực tiếp vào object slide của bản nháp;
// bấm Lưu ở trang cha mới gửi lên server và render lại.
import { computed, ref } from 'vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import FormField from './FormField.vue'
import ImagePicker from './ImagePicker.vue'
import VideoPicker from './VideoPicker.vue'
import MTabs from '@/components/mds/MTabs.vue'
import IconPicker from './IconPicker.vue'
import { LAYOUTS, LAYOUT_FIELDS, TONE_OPTIONS, VARIANT_LABELS, ITEM_IMAGE_LAYOUTS, BUILD_OPTIONS, BUILD_LAYOUTS, ratioNum, SPEC_LIMITS as L, emptyItem, emptyStat, emptyColumn } from '@/lib/slideModel.js'
import { VARIANTS, fits, resolveVariant } from '@shared/deck/variants.js'
import { plainText, repaintRich } from '@shared/deck/rich.js'

const props = defineProps({
  slide: { type: Object, required: true },
  assets: { type: Array, default: () => [] },
  upload: { type: Function, required: true },
  // useMedia() — có thì ô media nhận cả video (tải lên / YouTube).
  media: { type: Object, default: null },
  videoLibrary: { type: Array, default: () => [] },
  // Trang cha có "Đổi / chỉnh sửa ảnh" (ImageStudio) → nút mở ở từng ô ảnh; phát 'media' như khi bấm ảnh trên khung xem trước.
  studio: { type: Boolean, default: false },
  // Tỷ lệ khung bài ('16:9'…) — một số kiểu trình bày chỉ hợp khung rộng.
  ratio: { type: String, default: '16:9' },
  // URL xem trước ảnh theo mã asset (ảnh/logo thay biểu tượng của mục).
  assetUrl: { type: Function, default: () => '' },
})
const emit = defineEmits(['change-layout', 'media', 'build-all'])

const s = computed(() => props.slide)
// Ô ảnh chỉ nhận ảnh (asset cũ không có kind = ảnh).
const imageAssets = computed(() => props.assets.filter((a) => !a.kind || a.kind === 'image'))
const mediaTab = ref(props.slide.video ? 'video' : 'image')
const MEDIA_TABS = [
  { key: 'image', label: 'Ảnh' },
  { key: 'video', label: 'Video' },
]
function setImage(v) {
  s.value.image = v
  if (v?.asset) s.value.video = null
}
function setVideo(v) {
  s.value.video = v
  if (v) s.value.image = null
}
const has = (f) => LAYOUT_FIELDS[s.value.layout]?.includes(f)
// Độ dài tính theo chữ hiển thị (bỏ thẻ định dạng màu/đậm).
const tooLong = (v, max) => {
  const n = plainText(v).length
  return n > max ? `Tối đa ${max} ký tự (hiện ${n})` : ''
}
// Ô chữ có định dạng (màu, đậm, giữ liền — đặt bằng thanh công cụ trên khung xem trước): form hiển thị chữ thường;
// sửa ở form thì phần chữ không đổi giữ nguyên định dạng (repaintRich).
const rx = (obj, key) => ({
  modelValue: plainText(obj?.[key] ?? ''),
  'onUpdate:modelValue': (v) => {
    obj[key] = repaintRich(obj[key], v)
  },
})
const layoutOptions = LAYOUTS.map((l) => ({ label: l.label, value: l.value }))

// Kiểu trình bày (biến thể) — chỉ bật kiểu còn hợp nội dung hiện có (số mục, số liệu %, có ảnh…).
const ratioN = computed(() => ratioNum(props.ratio))
const variants = computed(() =>
  (VARIANTS[s.value.layout] || []).map((v) => ({ value: v, label: VARIANT_LABELS[s.value.layout]?.[v] || v, ok: fits(s.value.layout, v, s.value, ratioN.value) })),
)
const variant = computed(() => resolveVariant(s.value, ratioN.value))
function setVariant(v) {
  s.value.variant = v
}
// Trình chiếu từng ý (người dùng chọn, không qua AI) — 'auto' = xoá trường.
const canBuild = computed(() => BUILD_LAYOUTS.includes(s.value.layout))
const build = computed({
  get: () => s.value.build || 'auto',
  set: (v) => {
    if (v === 'auto') delete s.value.build
    else s.value.build = v
  },
})
const itemImages = computed(() => ITEM_IMAGE_LAYOUTS.includes(s.value.layout))
function clearItemImage(it) {
  delete it.image
}

const itemLabel = computed(() => ({ agenda: 'Mục', bullets: 'Ý', cards: 'Thẻ', stats: 'Ý bổ sung', image: 'Ý bên cạnh ảnh' }[s.value.layout] || 'Mục'))
const stepLabel = computed(() => (s.value.layout === 'timeline' ? 'Mốc' : 'Bước'))

const tagsText = computed({
  get: () => (s.value.tags || []).map((t) => plainText(t)).join(', '),
  set: (v) => {
    const old = s.value.tags || []
    s.value.tags = v.split(',').map((t) => t.trim()).filter(Boolean).slice(0, L.tags).map((t, i) => repaintRich(old[i] || '', t))
  },
})

function move(list, i, dir) {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const [x] = list.splice(i, 1)
  list.splice(j, 0, x)
}

// Mỗi dòng một ý (xuống dòng bên trong 1 ý — gõ trên khung xem trước — hiển thị thành dấu cách ở form).
function pointsText(col) {
  return (col.points || []).map((p) => plainText(p).replace(/\n/g, ' ')).join('\n')
}
function setPoints(col, v) {
  const old = col.points || []
  col.points = v.split('\n').slice(0, L.points).map((p, i) => (old[i] !== undefined && plainText(old[i]).replace(/\n/g, ' ') === p ? old[i] : repaintRich(old[i] || '', p)))
}

function setGalleryImage(i, v) {
  if (v) s.value.images.splice(i, 1, v)
  else s.value.images.splice(i, 1)
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <FormField label="Bố cục trang">
      <MSelect :model-value="s.layout" :options="layoutOptions" @update:model-value="(v) => emit('change-layout', v)" />
    </FormField>
    <FormField v-if="variants.length > 1" label="Kiểu trình bày" group hint="Kiểu mờ chưa hợp nội dung hiện tại (số mục, số liệu, ảnh…)">
      <div role="radiogroup" aria-label="Kiểu trình bày" class="flex flex-wrap gap-1.5">
        <button
          v-for="v in variants"
          :key="v.value"
          type="button"
          role="radio"
          :aria-checked="variant === v.value"
          :disabled="!v.ok"
          class="rounded-full border px-3 py-1 text-[12px] leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--mds-brand-600)] disabled:cursor-not-allowed disabled:border-dashed disabled:text-[var(--mds-text-secondary)] disabled:opacity-60"
          :class="variant === v.value ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-700)]' : 'border-[var(--mds-border)] hover:border-[var(--mds-brand-600)]'"
          @click="setVariant(v.value)"
        >
          {{ v.label }}
        </button>
      </div>
    </FormField>

    <FormField v-if="canBuild" label="Trình chiếu khi bấm Sau" :hint="s.layout === 'free' ? 'Bật “Hiện khi bấm” ở từng phần tử để chúng hiện lần lượt' : 'Dùng phím →, PageDown hoặc bút trình chiếu. Bấm vào khối nội dung khi trình chiếu để phóng to'">
      <div class="flex min-w-0 flex-col gap-2">
        <MSelect v-model="build" :options="BUILD_OPTIONS" aria-label="Cách trình chiếu trang" />
        <MButton variant="ghost" class="self-start" @click="emit('build-all', build)"><template #icon><MIcon name="copy" :size="16" /></template>Áp cho mọi trang</MButton>
      </div>
    </FormField>

    <FormField v-if="has('kicker')" label="Nhãn chủ đề" hint="Dòng nhỏ phía trên tiêu đề, 1–3 từ">
      <MInput v-bind="rx(s, 'kicker')" :error="tooLong(s.kicker, L.kicker)" placeholder="Ví dụ: Thực trạng" />
    </FormField>
    <FormField v-if="has('title')" label="Tiêu đề" required>
      <MTextarea v-bind="rx(s, 'title')" :rows="2" :maxlength="L.title" />
    </FormField>
    <FormField v-if="has('highlight')" label="Cụm từ nhấn mạnh" hint="Phải nằm nguyên văn trong tiêu đề — sẽ được tô màu">
      <MInput
        v-model="s.highlight"
        :error="s.highlight && !plainText(s.title).includes(s.highlight) ? 'Cụm từ không có trong tiêu đề' : tooLong(s.highlight, L.highlight)"
      />
    </FormField>
    <FormField v-if="has('subtitle')" label="Mô tả ngắn">
      <MTextarea v-bind="rx(s, 'subtitle')" :rows="2" :maxlength="L.subtitle" />
    </FormField>
    <FormField v-if="has('caption')" :label="s.layout === 'image' ? 'Chú thích ảnh' : 'Dòng thông tin'" :hint="s.layout === 'cover' ? 'Ví dụ: người trình bày · ngày' : ''">
      <MInput v-bind="rx(s, 'caption')" :error="tooLong(s.caption, L.caption)" />
    </FormField>
    <FormField v-if="has('tags')" label="Nhãn (phân tách bằng dấu phẩy)" :hint="`Tối đa ${L.tags} nhãn`">
      <MInput v-model="tagsText" placeholder="AI First, ERP, Dữ liệu" />
    </FormField>
    <FormField v-if="has('icon') && !s.image?.asset && !s.video" label="Biểu tượng trung tâm" group>
      <IconPicker v-model="s.icon" :allow-image="false" label="Biểu tượng trung tâm" />
    </FormField>

    <!-- Trích dẫn -->
    <template v-if="has('quote')">
      <FormField label="Nội dung trích dẫn" required>
        <MTextarea v-bind="rx(s.quote, 'text')" :rows="4" :maxlength="L.quoteText" />
      </FormField>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Người nói"><MInput v-bind="rx(s.quote, 'author')" :error="tooLong(s.quote.author, L.quoteAuthor)" /></FormField>
        <FormField label="Chức danh"><MInput v-bind="rx(s.quote, 'role')" :error="tooLong(s.quote.role, L.quoteAuthor)" /></FormField>
      </div>
    </template>

    <!-- Số liệu -->
    <section v-if="has('stats')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">Con số ({{ s.stats.length }}/{{ L.stats }})</h3>
      <div v-for="(st, i) in s.stats" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">Số liệu {{ i + 1 }}</span>
          <div class="flex">
            <MButton variant="icon" aria-label="Lên" :disabled="i === 0" @click="move(s.stats, i, -1)"><template #icon><MIcon name="chevron-up" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xuống" :disabled="i === s.stats.length - 1" @click="move(s.stats, i, 1)"><template #icon><MIcon name="chevron-down" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xoá số liệu" @click="s.stats.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <MInput v-model="st.prefix" placeholder="Tiền tố (+)" :error="tooLong(st.prefix, L.statPrefix)" />
          <MInput v-model="st.value" placeholder="Giá trị" :error="tooLong(st.value, L.statText)" />
          <MInput v-model="st.suffix" placeholder="Hậu tố (%)" :error="tooLong(st.suffix, L.statSuffix)" />
        </div>
        <MInput v-bind="rx(st, 'label')" placeholder="Diễn giải" :error="tooLong(st.label, L.statLabel)" />
      </div>
      <MButton v-if="s.stats.length < L.stats" variant="outline" @click="s.stats.push(emptyStat())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm số liệu</MButton>
    </section>

    <!-- Mục / ý / thẻ -->
    <section v-if="has('items')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">{{ itemLabel }} ({{ s.items.length }}/{{ L.items }})</h3>
      <div v-for="(it, i) in s.items" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">{{ itemLabel }} {{ i + 1 }}</span>
          <div class="flex">
            <MButton variant="icon" aria-label="Lên" :disabled="i === 0" @click="move(s.items, i, -1)"><template #icon><MIcon name="chevron-up" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xuống" :disabled="i === s.items.length - 1" @click="move(s.items, i, 1)"><template #icon><MIcon name="chevron-down" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xoá mục" @click="s.items.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
          </div>
        </div>
        <MInput v-bind="rx(it, 'title')" placeholder="Tiêu đề" :error="tooLong(it.title, L.itemTitle)" />
        <MTextarea v-bind="rx(it, 'text')" :rows="2" placeholder="Nội dung" :maxlength="L.itemText" />
        <template v-if="s.layout !== 'agenda'">
          <IconPicker
            v-model="it.icon"
            :image="it.image || null"
            :image-url="it.image?.asset ? assetUrl(it.image.asset) : ''"
            :allow-image="itemImages && studio"
            :label="`Biểu tượng ${itemLabel.toLowerCase()} ${i + 1}`"
            @image="emit('media', { path: `items.${i}.image`, kind: 'image', aspect: 1 })"
            @clear-image="clearItemImage(it)"
          />
          <MInput v-bind="rx(it, 'value')" placeholder="Nhãn ngắn" :error="tooLong(it.value, L.itemValue)" />
        </template>
      </div>
      <MButton v-if="s.items.length < L.items" variant="outline" @click="s.items.push(emptyItem())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm {{ itemLabel.toLowerCase() }}</MButton>
    </section>

    <!-- Bước / mốc -->
    <section v-if="has('steps')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">{{ stepLabel }} ({{ s.steps.length }}/{{ L.steps }})</h3>
      <div v-for="(st, i) in s.steps" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">{{ stepLabel }} {{ i + 1 }}</span>
          <div class="flex">
            <MButton variant="icon" aria-label="Lên" :disabled="i === 0" @click="move(s.steps, i, -1)"><template #icon><MIcon name="chevron-up" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xuống" :disabled="i === s.steps.length - 1" @click="move(s.steps, i, 1)"><template #icon><MIcon name="chevron-down" :size="16" /></template></MButton>
            <MButton variant="icon" aria-label="Xoá bước" @click="s.steps.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
          </div>
        </div>
        <MInput v-bind="rx(st, 'value')" :placeholder="s.layout === 'timeline' ? 'Mốc thời gian (Tuần 1–2, Q3/2026…)' : 'Nhãn (tuỳ chọn)'" :error="tooLong(st.value, L.itemValue)" />
        <MInput v-bind="rx(st, 'title')" placeholder="Tiêu đề" :error="tooLong(st.title, L.itemTitle)" />
        <MTextarea v-bind="rx(st, 'text')" :rows="2" placeholder="Mô tả" :maxlength="L.itemText" />
      </div>
      <MButton v-if="s.steps.length < L.steps" variant="outline" @click="s.steps.push(emptyItem())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm {{ stepLabel.toLowerCase() }}</MButton>
    </section>

    <!-- Cột so sánh -->
    <section v-if="has('columns')" class="flex flex-col gap-2">
      <h3 class="text-[14px] font-semibold">Cột so sánh ({{ s.columns.length }}/{{ L.columns }})</h3>
      <div v-for="(col, i) in s.columns" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-semibold text-[var(--mds-text-secondary)]">Cột {{ i + 1 }}</span>
          <MButton variant="icon" aria-label="Xoá cột" :disabled="s.columns.length <= 2" @click="s.columns.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
        </div>
        <MInput v-bind="rx(col, 'title')" placeholder="Tiêu đề cột" :error="tooLong(col.title, L.colTitle)" />
        <div class="grid grid-cols-2 gap-2">
          <MInput v-bind="rx(col, 'subtitle')" placeholder="Nhãn nhỏ" :error="tooLong(col.subtitle, L.colSubtitle)" />
          <MSelect v-model="col.tone" :options="TONE_OPTIONS" />
        </div>
        <MTextarea :model-value="pointsText(col)" :rows="4" placeholder="Mỗi dòng một ý" @update:model-value="(v) => setPoints(col, v)" />
      </div>
      <MButton v-if="s.columns.length < L.columns" variant="outline" @click="s.columns.push(emptyColumn())"><template #icon><MIcon name="plus" :size="16" /></template>Thêm cột</MButton>
    </section>

    <!-- Ảnh hoặc video (1 ô media) -->
    <FormField v-if="has('image')" :label="media ? 'Ảnh / video' : 'Ảnh'" group :hint="media ? 'Video hiển thị ảnh bìa 16:9; khi trình chiếu bấm vào sẽ tự phát toàn màn hình' : ''">
      <div class="flex min-w-0 flex-col gap-2">
        <MTabs v-if="media" v-model="mediaTab" :tabs="MEDIA_TABS" variant="pill" />
        <VideoPicker v-if="media && mediaTab === 'video'" :model-value="s.video" :media="media" :library="videoLibrary" :with-caption="s.layout === 'image'" @update:model-value="setVideo" />
        <ImagePicker v-else :model-value="s.image" :assets="imageAssets" :upload="upload" :with-caption="s.layout === 'image'" :studio="studio" @update:model-value="setImage" @studio="emit('media', { path: 'slot', kind: 'image' })" />
      </div>
    </FormField>
    <section v-if="has('images')" class="flex flex-col gap-3">
      <h3 class="text-[14px] font-semibold">Ảnh ({{ s.images.length }}/{{ L.images }})</h3>
      <div v-for="(im, i) in s.images" :key="i" class="rounded-lg border border-[var(--mds-border)] p-3">
        <ImagePicker :model-value="im" :assets="imageAssets" :upload="upload" with-caption :studio="studio" @update:model-value="(v) => setGalleryImage(i, v)" @studio="emit('media', { path: `images.${i}`, kind: 'image' })" />
      </div>
      <MButton v-if="s.images.length < L.images" variant="outline" @click="s.images.push({ asset: null, alt: '', caption: '', fit: 'cover' })"><template #icon><MIcon name="plus" :size="16" /></template>Thêm ô ảnh</MButton>
    </section>

    <FormField label="Ghi chú người trình bày" hint="Không hiển thị trên slide">
      <MTextarea v-model="s.notes" :rows="3" :maxlength="L.notes" />
    </FormField>
  </div>
</template>
