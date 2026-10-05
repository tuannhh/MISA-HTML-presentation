<script setup>
import { useRouter } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import MButton from '@/components/mds/MButton.vue'
import { session } from '@/lib/session.js'

const router = useRouter()
</script>

<template>
  <DesktopShell v-if="session.user">
    <div class="flex min-h-full items-center justify-center p-6">
      <MEmptyState type="no-result" title="Không tìm thấy trang" description="Đường dẫn không tồn tại hoặc đã thay đổi.">
        <template #actions><MButton variant="primary" @click="router.replace('/decks')">Về trang chính</MButton></template>
      </MEmptyState>
    </div>
  </DesktopShell>
  <div v-else class="flex min-h-screen items-center justify-center bg-[var(--mds-bg-page)] p-6">
    <MEmptyState type="no-result" title="Không tìm thấy trang" description="Đường dẫn không tồn tại hoặc đã thay đổi.">
      <template #actions><MButton variant="primary" @click="router.replace('/login')">Đăng nhập</MButton></template>
    </MEmptyState>
  </div>
</template>
