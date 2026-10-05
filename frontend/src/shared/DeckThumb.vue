<script setup>
// Ảnh thu nhỏ trang bìa theo đúng tỷ lệ khung; chưa có ảnh/đang tạo → khung giữ chỗ.
import MIcon from '@/components/mds/MIcon.vue'
import MSpinner from '@/components/mds/MSpinner.vue'
import { ratioCss } from '@/lib/format.js'

defineProps({
  deck: { type: Object, required: true },
})
</script>

<template>
  <div class="relative w-full overflow-hidden rounded-lg bg-[#0A1530]" :style="{ aspectRatio: ratioCss(deck.ratio) }">
    <img v-if="deck.thumbnailUrl" :src="deck.thumbnailUrl" :alt="`Trang bìa ${deck.title}`" class="h-full w-full object-cover" loading="lazy" />
    <div v-else class="flex h-full w-full flex-col items-center justify-center gap-2 text-[12px] text-[#C8D3EC]">
      <MSpinner v-if="['outlining', 'generating'].includes(deck.status)" :size="20" />
      <MIcon v-else :name="deck.status === 'failed' ? 'alert-circle' : deck.status === 'outline' ? 'list' : 'photo'" :size="24" />
      <span>{{ { outlining: 'AI đang lập dàn ý…', outline: 'Chờ bạn duyệt dàn ý', generating: 'AI đang dựng bài…', failed: 'Tạo thất bại' }[deck.status] || 'Đang dựng ảnh bìa…' }}</span>
    </div>
  </div>
</template>
