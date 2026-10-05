<script setup>
import MobileShell from './MobileShell.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import MButton from '@/components/mds/MButton.vue'
</script>

<template>
  <!-- 403 vẫn render trong shell mobile (MDS: chọn shell trước, quyền sau) -->
  <MobileShell title="Không có quyền" back="/decks">
    <div class="px-4 py-10">
      <MEmptyState type="no-result" title="Bạn không có quyền truy cập" description="Chức năng này chỉ dành cho quản trị viên.">
        <template #actions><MButton variant="primary" @click="$router.replace('/decks')">Về trang chính</MButton></template>
      </MEmptyState>
    </div>
  </MobileShell>
</template>
