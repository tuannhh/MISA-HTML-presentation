<script setup>
import MobileShell from './MobileShell.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import MButton from '@/components/mds/MButton.vue'
import { session } from '@/lib/session.js'
</script>

<template>
  <MobileShell title="Không tìm thấy trang" :back="session.user ? '/decks' : '/login'">
    <div class="px-4 py-10">
      <MEmptyState type="no-result" title="Không tìm thấy trang" description="Đường dẫn không tồn tại hoặc đã thay đổi.">
        <template #actions><MButton variant="primary" @click="$router.replace(session.user ? '/decks' : '/login')">Về trang chính</MButton></template>
      </MEmptyState>
    </div>
  </MobileShell>
</template>
