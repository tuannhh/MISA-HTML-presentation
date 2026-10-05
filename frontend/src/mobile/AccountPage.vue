<script setup>
import { useRouter } from 'vue-router'
import MobileShell from './MobileShell.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTag from '@/components/mds/MTag.vue'
import { session, logout, isAdmin } from '@/lib/session.js'
import { ROLE_LABEL } from '@/composables/useAdminUsers.js'

const router = useRouter()
async function onLogout() {
  await logout()
  router.replace('/login')
}
</script>

<template>
  <MobileShell title="Tài khoản" nav="account">
    <section class="flex items-center gap-3 bg-[var(--mds-bg)] p-4">
      <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--mds-brand-100)] text-[16px] font-semibold text-[var(--mds-brand-700)]" aria-hidden="true">
        {{ (session.user?.displayName || '?').split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-[16px] font-semibold leading-6">{{ session.user?.displayName }}</p>
        <p class="truncate text-[14px] leading-5 text-[var(--mds-text-secondary)]">{{ session.user?.email }}</p>
      </div>
      <MTag :color="session.user?.role === 'admin' ? 'brand' : 'neutral'" size="sm">{{ ROLE_LABEL[session.user?.role] }}</MTag>
    </section>

    <ul class="mt-2 bg-[var(--mds-bg)]">
      <li>
        <RouterLink to="/change-password" class="flex min-h-14 items-center gap-3 border-b border-[var(--mds-border-light)] px-4 active:bg-[var(--mds-bg-hover-soft)]">
          <MIcon name="lock" :size="24" class="text-[var(--mds-icon-neutral)]" /><span class="flex-1 text-[16px]">Đổi mật khẩu</span><MIcon name="chevron-right" :size="20" class="text-[var(--mds-icon-neutral)]" />
        </RouterLink>
      </li>
      <li v-if="isAdmin()">
        <RouterLink to="/admin/users" class="flex min-h-14 items-center gap-3 border-b border-[var(--mds-border-light)] px-4 active:bg-[var(--mds-bg-hover-soft)]">
          <MIcon name="users" :size="24" class="text-[var(--mds-icon-neutral)]" /><span class="flex-1 text-[16px]">Quản trị người dùng</span><MIcon name="chevron-right" :size="20" class="text-[var(--mds-icon-neutral)]" />
        </RouterLink>
      </li>
      <li>
        <button type="button" class="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[var(--mds-danger)] active:bg-[var(--mds-bg-hover-soft)]" @click="onLogout">
          <MIcon name="logout" :size="24" /><span class="flex-1 text-[16px]">Đăng xuất</span>
        </button>
      </li>
    </ul>
    <p class="px-4 py-4 text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">Bài riêng tư chỉ bạn xem được — kể cả quản trị viên cũng không xem được.</p>
  </MobileShell>
</template>
