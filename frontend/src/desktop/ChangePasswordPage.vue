<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AuthLayout from './AuthLayout.vue'
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
  } else router.back()
}
</script>

<template>
  <AuthLayout title="Đổi mật khẩu" :subtitle="forced ? 'Tài khoản đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới để tiếp tục.' : 'Sau khi đổi, các phiên đăng nhập khác sẽ bị đăng xuất.'">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <input type="email" :value="session.user?.email" autocomplete="username" class="hidden" readonly tabindex="-1" aria-hidden="true" />
      <FormAlert v-if="formError">{{ formError }}</FormAlert>
      <FormField :label="forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'" required>
        <MInput v-model="form.currentPassword" type="password" autocomplete="current-password" :error="errors.currentPassword" />
      </FormField>
      <FormField label="Mật khẩu mới" required hint="10–128 ký tự, có cả chữ và số">
        <MInput v-model="form.newPassword" type="password" autocomplete="new-password" :error="errors.newPassword" />
      </FormField>
      <FormField label="Nhập lại mật khẩu mới" required>
        <MInput v-model="form.confirm" type="password" autocomplete="new-password" :error="errors.confirm" />
      </FormField>
      <div class="flex justify-end gap-2 pt-2">
        <MButton variant="outline" @click="cancel">{{ forced ? 'Đăng xuất' : 'Hủy' }}</MButton>
        <MButton variant="primary" type="submit" :loading="submitting">Đổi mật khẩu</MButton>
      </div>
    </form>
  </AuthLayout>
</template>
