<script setup>
import { useRouter } from 'vue-router'
import DesktopShell from './DesktopShell.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import { session, logout } from '@/lib/session.js'
import { formatDateTime } from '@/lib/format.js'
import { ROLE_LABEL } from '@/composables/useAdminUsers.js'

const router = useRouter()
async function onLogout() {
  await logout()
  router.replace('/login')
}
</script>

<template>
  <DesktopShell active="account">
    <div class="mx-auto flex max-w-[720px] flex-col gap-4 p-6">
      <h1 class="text-[20px] font-semibold leading-7">Tài khoản</h1>
      <section class="rounded-lg bg-[var(--mds-bg)] p-6 shadow-[var(--mds-shadow-card)]">
        <dl class="grid grid-cols-[160px_1fr] gap-x-4 gap-y-3 text-[14px] leading-5">
          <dt class="text-[var(--mds-text-secondary)]">Họ và tên</dt>
          <dd class="font-medium">{{ session.user?.displayName }}</dd>
          <dt class="text-[var(--mds-text-secondary)]">Email</dt>
          <dd>{{ session.user?.email }}</dd>
          <dt class="text-[var(--mds-text-secondary)]">Vai trò</dt>
          <dd><MTag :color="session.user?.role === 'admin' ? 'brand' : 'neutral'" size="sm">{{ ROLE_LABEL[session.user?.role] }}</MTag></dd>
          <dt class="text-[var(--mds-text-secondary)]">Đăng nhập gần nhất</dt>
          <dd>{{ formatDateTime(session.user?.lastLoginAt) || '—' }}</dd>
        </dl>
        <p class="mt-4 text-[13px] text-[var(--mds-text-secondary)]">Mỗi tài khoản là một không gian riêng: bài riêng tư chỉ bạn xem được — kể cả quản trị viên cũng không xem được.</p>
        <div class="mt-6 flex justify-end gap-2 border-t border-[var(--mds-border)] pt-4">
          <MButton variant="outline" @click="onLogout"><template #icon><MIcon name="logout" :size="16" /></template>Đăng xuất</MButton>
          <MButton variant="primary" @click="router.push('/change-password')"><template #icon><MIcon name="lock" :size="16" /></template>Đổi mật khẩu</MButton>
        </div>
      </section>
    </div>
  </DesktopShell>
</template>
