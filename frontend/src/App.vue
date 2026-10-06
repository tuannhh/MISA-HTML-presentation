<script setup>
// Chọn composition theo bề mặt (host/container) — không theo user-agent, không theo vai trò.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MToast from '@/components/mds/MToast.vue';
import VideoOverlay from '@/shared/VideoOverlay.vue';
import { surface } from '@/lib/surface.js';

const route = useRoute();
const page = computed(() => route.meta?.[surface.value] || null);
// Trang bài trình bày định danh theo mã (không theo tên bài trên đường dẫn) → đổi tên bài cập nhật URL không dựng lại trang.
const pageKey = (r) => (r.params.code ? `${r.matched[0]?.path}|${r.params.code}` : r.path);
</script>

<template>
  <RouterView v-slot="{ route: r }">
    <component :is="page" v-if="page" :key="`${surface}:${pageKey(r)}`" />
  </RouterView>
  <MToast />
  <VideoOverlay />
</template>
