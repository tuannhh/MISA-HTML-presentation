<script setup>
// Chọn ảnh cho slide: dùng ảnh đã có trong bài hoặc tải ảnh mới (server chuẩn hoá sang WebP).
import { ref, computed } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MInput from '@/components/mds/MInput.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MDialog from '@/components/mds/MDialog.vue'
import { useToast } from '@/components/mds/toast.js'
import { IMAGE_ACCEPT } from '@/lib/fileKinds.js'

const props = defineProps({
  modelValue: { type: Object, default: null }, // { asset, alt, caption, fit } | null
  assets: { type: Array, default: () => [] },
  upload: { type: Function, required: true },
  withCaption: { type: Boolean, default: false },
  maxImageMb: { type: Number, default: 15 },
})
const emit = defineEmits(['update:modelValue'])
const toast = useToast()
const fileInput = ref(null)
const uploading = ref(false)
const libraryOpen = ref(false)

const current = computed(() => props.modelValue)
const url = computed(() => props.assets.find((a) => a.id === current.value?.asset)?.url || '')
const FIT = [
  { label: 'Lấp đầy khung (cắt mép)', value: 'cover' },
  { label: 'Hiện trọn ảnh', value: 'contain' },
]

function set(patch) {
  emit('update:modelValue', { asset: null, alt: '', caption: '', fit: 'cover', ...(current.value || {}), ...patch })
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (file.size > props.maxImageMb * 1048576) return toast.error(`Ảnh tối đa ${props.maxImageMb} MB`)
  uploading.value = true
  try {
    const a = await props.upload(file)
    set({ asset: a.id })
  } catch (err) {
    toast.error(err.message)
  } finally {
    uploading.value = false
  }
}

function pick(a) {
  set({ asset: a.id })
  libraryOpen.value = false
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div class="relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)]">
      <img v-if="url" :src="url" alt="" class="h-full w-full" :class="current?.fit === 'contain' ? 'object-contain' : 'object-cover'" />
      <div v-else class="flex flex-col items-center gap-1 text-[var(--mds-text-secondary)]">
        <MIcon name="photo" :size="32" />
        <span class="text-[12px]">Chưa có ảnh</span>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <MButton :loading="uploading" @click="fileInput?.click()">
        <template #icon><MIcon name="upload" :size="16" /></template>
        {{ url ? 'Thay ảnh' : 'Tải ảnh lên' }}
      </MButton>
      <MButton v-if="assets.length" variant="outline" @click="libraryOpen = true">
        <template #icon><MIcon name="folder" :size="16" /></template>
        Ảnh trong bài ({{ assets.length }})
      </MButton>
      <MButton v-if="current?.asset" variant="ghost" @click="emit('update:modelValue', null)">
        <template #icon><MIcon name="trash" :size="16" /></template>
        Bỏ ảnh
      </MButton>
    </div>
    <input ref="fileInput" type="file" :accept="IMAGE_ACCEPT" class="hidden" @change="onFile" />
    <template v-if="current?.asset">
      <MSelect :model-value="current.fit || 'cover'" :options="FIT" @update:model-value="(v) => set({ fit: v })" />
      <MInput :model-value="current.alt || ''" placeholder="Mô tả ảnh (cho người dùng trình đọc màn hình)" @update:model-value="(v) => set({ alt: v })" />
      <MInput v-if="withCaption" :model-value="current.caption || ''" placeholder="Chú thích hiển thị trên ảnh" @update:model-value="(v) => set({ caption: v })" />
    </template>

    <MDialog v-model="libraryOpen" title="Chọn ảnh trong bài trình bày" width="720px">
      <div class="relative grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        <button
          v-for="a in assets"
          :key="a.id"
          type="button"
          class="group relative aspect-video overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="a.id === current?.asset ? 'ring-2 ring-[var(--mds-brand-600)]' : 'hover:border-[var(--mds-brand-600)]'"
          :aria-label="`Chọn ảnh ${a.name || ''}`"
          @click="pick(a)"
        >
          <img :src="a.url" alt="" class="h-full w-full object-cover" loading="lazy" />
        </button>
      </div>
    </MDialog>
  </div>
</template>
