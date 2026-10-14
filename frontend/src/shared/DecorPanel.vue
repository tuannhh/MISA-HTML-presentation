<script setup>
// Hoạ tiết trang trí + vị trí chữ của 1 trang (tinh chỉnh tay, không qua AI — shared/deck/layers.js).
// Bật/tắt từng hoạ tiết; "Áp cho mọi trang" gửi danh sách đang tắt lên trang cha; đặt lại vị trí + cỡ các ô chữ đã chỉnh.
// Xoá/thay hoạ tiết bằng ảnh, hình khối: bấm thẳng vào hoạ tiết trên khung xem trước.
import { computed } from 'vue'
import MSwitch from '@/components/mds/MSwitch.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import FormField from './FormField.vue'
import { DECORS, decorsFor } from '@shared/deck/layers.js'
import { setDecorHidden } from '@/lib/editPaths.js'

const props = defineProps({
  slide: { type: Object, required: true },
})
const emit = defineEmits(['decor-all'])

const keys = computed(() => decorsFor(props.slide.layout))
const hidden = computed(() => new Set(props.slide.hide || []))
const anyHidden = computed(() => keys.value.some((k) => hidden.value.has(k)))
const moved = computed(() => Object.keys(props.slide.moves || {}).length)
const pickable = computed(() => keys.value.some((k) => DECORS[k].pick))

function toggle(k, on) {
  setDecorHidden(props.slide, k, !on)
}
function showAll() {
  delete props.slide.hide
}
function resetMoves() {
  delete props.slide.moves
}
</script>

<template>
  <FormField label="Hoạ tiết, vị trí & cỡ chữ" group :hint="pickable ? 'Bấm vào hoạ tiết trên khung xem trước để xoá hoặc thay bằng ảnh, hình khối' : ''">
    <div class="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
      <div v-for="k in keys" :key="k" class="flex min-h-[32px] items-center">
        <MSwitch :model-value="!hidden.has(k)" :label="DECORS[k].label" @update:model-value="(v) => toggle(k, v)" />
      </div>
      <div class="flex flex-wrap gap-1.5 border-t border-[var(--mds-border)] pt-2">
        <MButton variant="ghost" :disabled="!anyHidden" @click="showAll"><template #icon><MIcon name="refresh" :size="16" /></template>Hiện lại tất cả</MButton>
        <MButton variant="ghost" @click="emit('decor-all', [...hidden])"><template #icon><MIcon name="copy" :size="16" /></template>Áp cho mọi trang</MButton>
      </div>
      <div v-if="slide.layout !== 'free'" class="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--mds-border)] pt-2">
        <span class="flex items-center gap-1.5 text-[12px] text-[var(--mds-text-secondary)]">
          <MIcon name="arrows-move" :size="16" />
          {{ moved ? `${moved} ô chữ đã chỉnh vị trí / cỡ chữ / giãn dòng / độ rộng khung` : 'Bấm vào chữ trên khung: tay nắm bên trái để dời, mép phải để kéo rộng khung; ô Cỡ (pt) và Giãn dòng trên thanh định dạng' }}
        </span>
        <MButton v-if="moved" variant="ghost" @click="resetMoves"><template #icon><MIcon name="refresh" :size="16" /></template>Đặt lại vị trí, cỡ chữ & khung</MButton>
      </div>
    </div>
  </FormField>
</template>
