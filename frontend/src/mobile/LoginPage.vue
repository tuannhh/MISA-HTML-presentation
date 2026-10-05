<script setup>
import MobileShell from './MobileShell.vue'
import FormField from '@/shared/FormField.vue'
import FormAlert from '@/shared/FormAlert.vue'
import MInput from '@/components/mds/MInput.vue'
import MButton from '@/components/mds/MButton.vue'
import { useLoginForm } from '@/composables/useAuthForms.js'
import { session } from '@/lib/session.js'

const { form, errors, submitting, formError, submit } = useLoginForm()
</script>

<template>
  <MobileShell title="Đăng nhập">
    <form id="login-form" class="flex flex-col gap-4 bg-[var(--mds-bg)] p-4" novalidate @submit.prevent="submit">
      <div class="flex items-center gap-3 py-2">
        <img src="/favicon.svg" alt="" class="h-10 w-10" />
        <div class="min-w-0">
          <p class="truncate text-[16px] font-semibold leading-6">MISA Presentation</p>
          <p class="text-[13px] leading-[18px] text-[var(--mds-text-secondary)]">Bài trình bày có chuyển động, tạo bằng AI</p>
        </div>
      </div>
      <FormAlert v-if="formError">{{ formError }}</FormAlert>
      <FormField label="Email" required>
        <MInput v-model="form.email" type="email" inputmode="email" autocomplete="username" enterkeyhint="next" placeholder="ten@misa.com.vn" :error="errors.email" />
      </FormField>
      <FormField label="Mật khẩu" required>
        <MInput v-model="form.password" type="password" autocomplete="current-password" enterkeyhint="go" :error="errors.password" />
      </FormField>
      <MButton variant="primary" type="submit" class="w-full" :loading="submitting">Đăng nhập</MButton>
      <p v-if="session.config.selfRegistration" class="text-center text-[14px] text-[var(--mds-text-secondary)]">
        Chưa có tài khoản?
        <RouterLink :to="{ path: '/register', query: $route.query }" class="inline-flex min-h-12 items-center font-medium text-[var(--mds-brand-600)]">Đăng ký</RouterLink>
      </p>
      <p v-else class="text-center text-[14px] text-[var(--mds-text-secondary)]">Liên hệ quản trị viên để được cấp tài khoản.</p>
    </form>
  </MobileShell>
</template>
