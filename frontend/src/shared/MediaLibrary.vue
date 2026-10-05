<script setup>
// Hộp chọn media đã có trong bài (ảnh hoặc video). Video hiển thị bằng ảnh bìa + biểu tượng phát.
import { computed } from 'vue'
import MDialog from '@/components/mds/MDialog.vue'
import MIcon from '@/components/mds/MIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Chọn ảnh trong bài trình bày' },
  // items: [{ key, url, label, video? }]
  items: { type: Array, default: () => [] },
  selected: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'pick'])
const list = computed(() => props.items)
function pick(it) {
  emit('pick', it)
  emit('update:modelValue', false)
}
</script>

<template>
  <MDialog :model-value="modelValue" :title="title" width="720px" @update:model-value="(v) => emit('update:modelValue', v)">
    <p v-if="!list.length" class="py-6 text-center text-[13px] text-[var(--mds-text-secondary)]">Chưa có mục nào.</p>
    <div v-else class="relative grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
      <button
        v-for="it in list"
        :key="it.key"
        type="button"
        class="group relative aspect-video overflow-hidden rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg-page)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
        :class="it.key === selected ? 'ring-2 ring-[var(--mds-brand-600)]' : 'hover:border-[var(--mds-brand-600)]'"
        :aria-label="`Chọn ${it.label || (it.video ? 'video' : 'ảnh')}`"
        @click="pick(it)"
      >
        <img v-if="it.url" :src="it.url" alt="" class="h-full w-full object-cover" loading="lazy" />
        <span v-else class="grid h-full w-full place-items-center text-[var(--mds-text-secondary)]"><MIcon :name="it.video ? 'video' : 'photo'" :size="28" /></span>
        <span v-if="it.video" class="absolute inset-0 grid place-items-center">
          <span class="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white"><MIcon name="player-play" :size="20" /></span>
        </span>
        <span v-if="it.label" class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-left text-[11px] text-white">{{ it.label }}</span>
      </button>
    </div>
  </MDialog>
</template>
