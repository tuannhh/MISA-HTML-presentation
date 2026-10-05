<script setup>
// Logo trên slide: tải lên (PNG/JPG/WebP/SVG), vị trí (6 ô), kích thước, trang hiển thị, tách nền (theo màu nền hoặc AI).
// Tách nền chạy trên máy chủ, tạo bản logo trong suốt riêng (cutout) — bật/tắt không làm mất logo gốc.
import { computed, ref } from 'vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MSelect from '@/components/mds/MSelect.vue'
import MRadioGroup from '@/components/mds/MRadioGroup.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import MediaLibrary from './MediaLibrary.vue'
import { useToast } from '@/components/mds/toast.js'
import { LOGO_ACCEPT } from '@/composables/useMedia.js'
import { LOGO_POSITIONS, LOGO_SHOW, LOGO_SIZE, CUTOUT_MODES, previewColors } from '@/lib/design.js'

const props = defineProps({
  modelValue: { type: Object, default: null }, // { asset, cutout, removeBg, position, size, showOn } | null
  media: { type: Object, required: true },
  theme: { type: String, default: 'midnight' },
  palette: { type: Object, default: null },
  name: { type: String, default: 'deck-logo' },
})
const emit = defineEmits(['update:modelValue'])
const toast = useToast()
const fileInput = ref(null)
const uploading = ref(false)
const cutting = ref(false)
const mode = ref('auto')
const note = ref('')
const libraryOpen = ref(false)

const lg = computed(() => props.modelValue)
const colors = computed(() => previewColors(props.theme, props.palette))
const shownId = computed(() => (lg.value ? (lg.value.removeBg && lg.value.cutout ? lg.value.cutout : lg.value.asset) : null))
const shownUrl = computed(() => (shownId.value ? props.media.assetUrl(shownId.value) : ''))
const logos = computed(() => props.media.ofKind('logo').map((a) => ({ key: a.id, url: a.url, label: a.name || '' })))

function set(patch) {
  emit('update:modelValue', { asset: null, cutout: null, removeBg: false, position: 'tr', size: LOGO_SIZE.def, showOn: 'all', ...(lg.value || {}), ...patch })
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  uploading.value = true
  note.value = ''
  try {
    const a = await props.media.uploadLogo(file)
    set({ asset: a.id, cutout: null, removeBg: false })
  } catch (err) {
    toast.error(err.message)
  } finally {
    uploading.value = false
  }
}

async function runCutout() {
  if (!lg.value?.asset) return
  cutting.value = true
  note.value = ''
  try {
    const res = await props.media.cutoutLogo(lg.value.asset, mode.value)
    note.value = res.note || (res.method === 'ai' ? 'Đã tách nền bằng AI' : 'Đã tách nền theo màu nền')
    set({ cutout: res.asset.id === lg.value.asset ? null : res.asset.id, removeBg: res.asset.id !== lg.value.asset })
  } catch (err) {
    toast.error(err.message)
    set({ removeBg: false })
  } finally {
    cutting.value = false
  }
}

function onRemoveBg(on) {
  if (!on) return set({ removeBg: false })
  if (lg.value?.cutout) return set({ removeBg: true })
  runCutout()
}

function pickLogo(it) {
  set({ asset: it.key, cutout: null, removeBg: false })
  note.value = ''
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <!-- Xem trước logo trên nền slide (đúng màu nền của tông đang chọn) -->
    <div v-if="lg?.asset" class="grid grid-cols-2 gap-2">
      <div class="relative grid h-[88px] place-items-center overflow-hidden rounded-lg border border-[var(--mds-border)] p-3" :style="{ background: colors.bg }">
        <img v-if="shownUrl" :src="shownUrl" alt="Logo trên nền slide" class="max-h-full max-w-full object-contain" />
        <div v-if="cutting" class="absolute inset-0 grid place-items-center bg-black/40"><MSpinner :size="24" /></div>
      </div>
      <div class="relative grid h-[88px] place-items-center overflow-hidden rounded-lg border border-[var(--mds-border)] p-3" :style="{ background: colors.tone === 'light' ? '#0B1220' : '#FFFFFF' }">
        <img v-if="shownUrl" :src="shownUrl" alt="Logo trên nền tương phản" class="max-h-full max-w-full object-contain" />
      </div>
    </div>
    <div v-else class="grid h-[88px] place-items-center rounded-lg border border-dashed border-[var(--mds-border)] bg-[var(--mds-bg-page)] text-[12px] text-[var(--mds-text-secondary)]">
      Chưa có logo — PNG, JPG, WebP hoặc SVG
    </div>

    <div class="flex flex-wrap gap-2">
      <MButton :loading="uploading" @click="fileInput?.click()">
        <template #icon><MIcon name="upload" :size="16" /></template>
        {{ lg?.asset ? 'Thay logo' : 'Tải logo lên' }}
      </MButton>
      <MButton v-if="logos.length" variant="outline" @click="libraryOpen = true">
        <template #icon><MIcon name="folder" :size="16" /></template>
        Logo đã tải ({{ logos.length }})
      </MButton>
      <MButton v-if="lg?.asset" variant="ghost" @click="emit('update:modelValue', null)">
        <template #icon><MIcon name="trash" :size="16" /></template>
        Bỏ logo
      </MButton>
    </div>
    <input ref="fileInput" type="file" :accept="LOGO_ACCEPT" class="hidden" @change="onFile" />

    <template v-if="lg?.asset">
      <!-- Tách nền -->
      <div class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <MSwitch :model-value="!!lg.removeBg" :disabled="cutting" label="Tách nền logo" @update:model-value="onRemoveBg" />
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1"><MSelect v-model="mode" :options="CUTOUT_MODES" aria-label="Cách tách nền" /></div>
          <MButton variant="outline" :loading="cutting" @click="runCutout">
            <template #icon><MIcon name="scissors" :size="16" /></template>
            {{ lg.cutout ? 'Tách lại' : 'Tách nền' }}
          </MButton>
        </div>
        <p class="text-[12px] leading-4 text-[var(--mds-text-secondary)]">{{ note || 'Logo nền trắng/1 màu: tách theo màu (nhanh, biên sắc). Logo trên ảnh chụp/nền nhiều màu: chọn AI.' }}</p>
      </div>

      <!-- Vị trí: lưới 3×2 tương ứng góc slide -->
      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-[13px] font-medium">Vị trí</legend>
        <div role="radiogroup" aria-label="Vị trí logo" class="grid aspect-[16/7] w-full max-w-[280px] grid-cols-3 grid-rows-2 gap-1 rounded-lg border border-[var(--mds-border)] p-1" :style="{ background: colors.bg }">
          <label
            v-for="p in LOGO_POSITIONS"
            :key="p.value"
            class="flex cursor-pointer rounded-[4px] p-1.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--mds-brand-600)]"
            :class="[
              p.value[0] === 't' ? 'items-start' : 'items-end',
              p.value[1] === 'l' ? 'justify-start' : p.value[1] === 'c' ? 'justify-center' : 'justify-end',
              lg.position === p.value ? 'bg-white/25 ring-2 ring-[var(--mds-brand-600)]' : 'hover:bg-white/10',
            ]"
            :title="p.label"
          >
            <input type="radio" class="sr-only" :name="`${name}-pos`" :value="p.value" :checked="lg.position === p.value" :aria-label="p.label" @change="set({ position: p.value })" />
            <span class="block h-2.5 w-6 rounded-[2px]" :style="{ background: lg.position === p.value ? colors.a : colors.ink, opacity: lg.position === p.value ? 1 : 0.35 }" aria-hidden="true" />
          </label>
        </div>
      </fieldset>

      <!-- Kích thước -->
      <div class="flex flex-col gap-1">
        <label :for="`${name}-size`" class="flex items-center justify-between text-[13px] font-medium">
          <span>Kích thước</span>
          <span class="tabular-nums text-[12px] font-normal text-[var(--mds-text-secondary)]">{{ Math.round((lg.size / 1440) * 100) }}% chiều cao slide</span>
        </label>
        <input
          :id="`${name}-size`"
          type="range"
          :min="LOGO_SIZE.min"
          :max="LOGO_SIZE.max"
          step="2"
          :value="lg.size"
          class="w-full accent-[var(--mds-brand-600)]"
          @input="(e) => set({ size: Number(e.target.value) })"
        />
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-[13px] font-medium">Hiển thị trên</span>
        <MRadioGroup :model-value="lg.showOn" :options="LOGO_SHOW" :name="`${name}-show`" @update:model-value="(v) => set({ showOn: v })" />
      </div>
    </template>

    <MediaLibrary v-model="libraryOpen" title="Chọn logo đã tải" :items="logos" :selected="lg?.asset || ''" @pick="pickLogo" />
  </div>
</template>
