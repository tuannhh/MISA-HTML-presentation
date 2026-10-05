<script setup>
import { useRouter } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import MEmptyState from '@/components/mds/MEmptyState.vue'
import MButton from '@/components/mds/MButton.vue'

const router = useRouter()
</script>

<template>
  <DesktopShell>
    <div class="flex min-h-full items-center justify-center p-6">
      <MEmptyState type="no-result" title="Bạn không có quyền truy cập" description="Chức năng này chỉ dành cho quản trị viên. Liên hệ quản trị viên nếu bạn cần quyền.">
        <template #actions><MButton variant="primary" @click="router.replace('/decks')">Về trang chính</MButton></template>
      </MEmptyState>
    </div>
  </DesktopShell>
</template>
