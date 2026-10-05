<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import MobileShell from './MobileShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import { useChangePasswordForm } from '@/composables/useAuthForms.js'
import { session, logout } from '@/lib/session.js'

const router = useRouter()
const { form, errors, submitting, formError, submit } = useChangePasswordForm()
const forced = computed(() => !!session.user?.mustChangePassword)

async function cancel() {
  if (forced.value) {
    await logout()
    router.replace('/login')
  } else router.push('/account')
}
</script>

<template>
  <MobileShell title="Đổi mật khẩu" :back="forced ? 'host' : '/account'">
    <form id="pw-form" class="flex flex-col gap-4 bg-[var(--mds-bg)] p-4" novalidate @submit.prevent="submit">
      <input type="email" :value="session.user?.email" autocomplete="username" class="hidden" readonly tabindex="-1" aria-hidden="true" />
      <FormAlert v-if="forced" tone="warning">Tài khoản đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới để tiếp tục.</FormAlert>
      <FormAlert v-if="formError">{{ formError }}</FormAlert>
      <FormField :label="forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'" required>
        <MInput v-model="form.currentPassword" type="password" autocomplete="current-password" enterkeyhint="next" :error="errors.currentPassword" />
      </FormField>
      <FormField label="Mật khẩu mới" required hint="10–128 ký tự, có cả chữ và số">
        <MInput v-model="form.newPassword" type="password" autocomplete="new-password" enterkeyhint="next" :error="errors.newPassword" />
      </FormField>
      <FormField label="Nhập lại mật khẩu mới" required>
        <MInput v-model="form.confirm" type="password" autocomplete="new-password" enterkeyhint="done" :error="errors.confirm" />
      </FormField>
      <p class="text-[13px] text-[var(--mds-text-secondary)]">Sau khi đổi, các phiên đăng nhập khác sẽ bị đăng xuất.</p>
    </form>
    <template #footer>
      <div class="flex gap-2">
        <MButton variant="outline" class="flex-1" @click="cancel">{{ forced ? 'Đăng xuất' : 'Hủy' }}</MButton>
        <MButton variant="primary" type="submit" form="pw-form" class="flex-1" :loading="submitting">Đổi mật khẩu</MButton>
      </div>
    </template>
  </MobileShell>
</template>
