<script setup>
import MobileShell from './MobileShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import { useRegisterForm } from '@/composables/useAuthForms.js'
import { session } from '@/lib/session.js'

const { form, errors, submitting, formError, submit } = useRegisterForm()
const domains = (session.config.allowedEmailDomains || []).map((d) => '@' + d).join(', ')
</script>

<template>
  <MobileShell title="Đăng ký" back="/login">
    <div class="bg-[var(--mds-bg)] p-4">
      <FormAlert v-if="!session.config.selfRegistration" tone="info">Hệ thống không mở đăng ký tự do. Liên hệ quản trị viên để được cấp tài khoản.</FormAlert>
      <form v-else id="register-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <p v-if="domains" class="text-[13px] text-[var(--mds-text-secondary)]">Dùng email công ty ({{ domains }}).</p>
        <FormAlert v-if="formError">{{ formError }}</FormAlert>
        <FormField label="Họ và tên" required>
          <MInput v-model="form.displayName" autocomplete="name" enterkeyhint="next" :error="errors.displayName" />
        </FormField>
        <FormField label="Email" required>
          <MInput v-model="form.email" type="email" inputmode="email" autocomplete="email" enterkeyhint="next" :error="errors.email" />
        </FormField>
        <FormField label="Mật khẩu" required hint="10–128 ký tự, có cả chữ và số">
          <MInput v-model="form.password" type="password" autocomplete="new-password" enterkeyhint="next" :error="errors.password" />
        </FormField>
        <FormField label="Nhập lại mật khẩu" required>
          <MInput v-model="form.confirm" type="password" autocomplete="new-password" enterkeyhint="done" :error="errors.confirm" />
        </FormField>
      </form>
    </div>
    <template v-if="session.config.selfRegistration" #footer>
      <div class="flex gap-2">
        <MButton variant="outline" class="flex-1" @click="$router.push('/login')">Hủy</MButton>
        <MButton variant="primary" type="submit" form="register-form" class="flex-1" :loading="submitting">Tạo tài khoản</MButton>
      </div>
    </template>
  </MobileShell>
</template>
