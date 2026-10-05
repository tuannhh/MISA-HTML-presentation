<script setup>
// Chọn composition theo bề mặt (host/container) — không theo user-agent, không theo vai trò.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MToast from '@/components/mds/MToast.vue';
import { surface } from '@/lib/surface.js';

const route = useRoute();
const page = computed(() => route.meta?.[surface.value] || null);
</script>

<template>
  <RouterView v-slot="{ route: r }">
    <component :is="page" v-if="page" :key="`${surface}:${r.path}`" />
  </RouterView>
  <MToast />
</template>
