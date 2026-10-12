<script setup>
// Thông tin liên hệ của trang "Liên hệ" / "Ưu đãi" (slide.contact — shared/deck/contact.js): số điện thoại + kênh nhắn/gọi
// (Zalo, Viber, Telegram, iMessage), email, địa chỉ, website, lời kêu gọi, mã QR (tải ảnh lên hoặc tạo từ link).
// Sửa trực tiếp vào bản nháp; server kiểm lại khi lưu (specService.cleanContact). Dùng chung desktop + mobile.
import { computed, ref } from 'vue'
import MInput from '@/components/mds/MInput.vue'
import MTextarea from '@/components/mds/MTextarea.vue'
import MButton from '@/components/mds/MButton.vue'
import MIcon from '@/components/mds/MIcon.vue'
import MTabs from '@/components/mds/MTabs.vue'
import FormField from './FormField.vue'
import ImagePicker from './ImagePicker.vue'
import { PHONE_CHANNELS, CHANNEL_LABELS, CONTACT_LIMITS as CL, CTA_SUGGESTIONS, validPhone, validEmail, webHref } from '@shared/deck/contact.js'
import { brandSvg } from '@shared/deck/brands.js'
import { qrSvg } from '@shared/deck/qr.js'
import { plainText, repaintRich, safeHref } from '@shared/deck/rich.js'

const props = defineProps({
  contact: { type: Object, required: true },
  assets: { type: Array, default: () => [] },
  upload: { type: Function, required: true },
  studio: { type: Boolean, default: false },
  // Trang Ưu đãi: mã QR chiếm nửa trang — nhắc người dùng.
  offer: { type: Boolean, default: false },
})
const emit = defineEmits(['media'])

const c = computed(() => props.contact)
const imageAssets = computed(() => props.assets.filter((a) => !a.kind || a.kind === 'image'))

// Chữ có định dạng (lời kêu gọi, chú thích QR): form hiển thị chữ thường, phần không đổi giữ định dạng.
const rx = (obj, key) => ({
  modelValue: plainText(obj?.[key] ?? ''),
  'onUpdate:modelValue': (v) => {
    obj[key] = repaintRich(obj[key], v)
  },
})
const tooLong = (v, max) => (String(v || '').length > max ? `Tối đa ${max} ký tự` : '')

/* ---- số điện thoại ---- */
const phoneError = (ph) => {
  const v = String(ph.number || '').trim()
  if (!v) return ''
  return validPhone(v) ? '' : 'Số điện thoại chưa đúng (vd. 0912 345 678, +84 912 345 678, 1900 8677)'
}
function toggleChannel(ph, ch) {
  const cur = new Set(ph.channels || [])
  if (cur.has(ch)) cur.delete(ch)
  else cur.add(ch)
  // Giữ ít nhất 1 kênh (mặc định Gọi điện).
  ph.channels = PHONE_CHANNELS.filter((x) => cur.has(x))
  if (!ph.channels.length) ph.channels = ['call']
}
const addPhone = () => c.value.phones.push({ number: '', label: '', channels: ['call', 'zalo'] })

/* ---- email / địa chỉ ---- */
const emailError = (v) => (String(v || '').trim() && !validEmail(v) ? 'Email chưa đúng định dạng (vd. sales@misa.com.vn)' : '')
function setAt(key, i, v) {
  c.value[key].splice(i, 1, v)
}
const websiteError = computed(() => (String(c.value.website || '').trim() && !webHref(c.value.website) ? 'Địa chỉ website chưa đúng (vd. amis.misa.vn)' : ''))

/* ---- mã QR ---- */
const qrTab = ref(c.value.qr?.asset || !c.value.qr?.link ? 'image' : 'link')
const QR_TABS = [
  { key: 'image', label: 'Tải ảnh QR' },
  { key: 'link', label: 'Tạo từ link' },
]
function ensureQr() {
  if (!c.value.qr) c.value.qr = { asset: null, link: '', caption: '' }
  return c.value.qr
}
const qrImage = computed(() => (c.value.qr?.asset ? { asset: c.value.qr.asset, alt: '', caption: '', fit: 'contain' } : null))
function setQrImage(v) {
  ensureQr().asset = v?.asset || null
}
// Link người dùng gõ tắt (zalo.me/…) → https://… để tạo mã.
const qrHref = computed(() => {
  const raw = String(c.value.qr?.link || '').trim()
  if (!raw) return ''
  return safeHref(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`) || ''
})
const qrLinkError = computed(() => (String(c.value.qr?.link || '').trim() && !qrHref.value ? 'Link chưa đúng (vd. https://zalo.me/0912345678)' : ''))
// Mã xem trước: SVG chỉ gồm toạ độ do qr.js sinh (nhãn đã escape) — an toàn khi chèn.
const qrPreview = computed(() => (qrHref.value ? qrSvg(qrHref.value, 'Mã QR xem trước') : ''))
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" aria-label="Thông tin liên hệ">
    <h3 class="text-[14px] font-semibold">Thông tin liên hệ</h3>

    <!-- Số điện thoại -->
    <div class="flex flex-col gap-2">
      <span class="text-[13px] font-semibold">Số điện thoại ({{ c.phones.length }}/{{ CL.phones }})</span>
      <div v-for="(ph, i) in c.phones" :key="i" class="flex flex-col gap-2 rounded-lg border border-[var(--mds-border)] p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--mds-text-secondary)]"><MIcon name="phone" :size="16" />Số {{ i + 1 }}</span>
          <MButton variant="icon" aria-label="Xoá số điện thoại" @click="c.phones.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
        </div>
        <MInput v-model="ph.number" type="tel" placeholder="0912 345 678" :error="phoneError(ph) || tooLong(ph.number, CL.phone)" />
        <MInput v-model="ph.label" placeholder="Nhãn (tuỳ chọn): Hotline, Tư vấn bán hàng…" :error="tooLong(ph.label, CL.phoneLabel)" />
        <div role="group" :aria-label="`Kênh liên hệ của số ${i + 1}`" class="flex flex-wrap gap-1.5">
          <button
            v-for="ch in PHONE_CHANNELS"
            :key="ch"
            type="button"
            :aria-pressed="(ph.channels || []).includes(ch)"
            class="ct-chan inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[12px] leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--mds-brand-600)]"
            :class="(ph.channels || []).includes(ch) ? 'border-[var(--mds-brand-600)] bg-[var(--mds-brand-50)] font-semibold text-[var(--mds-brand-700)]' : 'border-[var(--mds-border)] text-[var(--mds-text-secondary)] hover:border-[var(--mds-brand-600)]'"
            @click="toggleChannel(ph, ch)"
          >
            <!-- logo kênh: SVG tĩnh trong mã nguồn (shared/deck/brands.js), không chứa dữ liệu người dùng -->
            <span class="ct-chan-ico" aria-hidden="true" v-html="brandSvg(ch, '')" />
            {{ CHANNEL_LABELS[ch] }}
          </button>
        </div>
      </div>
      <MButton v-if="c.phones.length < CL.phones" variant="outline" class="self-start" @click="addPhone"><template #icon><MIcon name="plus" :size="16" /></template>Thêm số điện thoại</MButton>
    </div>

    <!-- Email -->
    <FormField label="Email" group>
      <div class="flex min-w-0 flex-col gap-2">
        <div v-for="(e, i) in c.emails" :key="i" class="flex items-start gap-1">
          <div class="min-w-0 flex-1"><MInput :model-value="e" type="email" placeholder="sales@misa.com.vn" :error="emailError(e) || tooLong(e, CL.email)" @update:model-value="(v) => setAt('emails', i, v)" /></div>
          <MButton variant="icon" aria-label="Xoá email" @click="c.emails.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
        </div>
        <MButton v-if="c.emails.length < CL.emails" variant="outline" class="self-start" @click="c.emails.push('')"><template #icon><MIcon name="mail" :size="16" /></template>Thêm email</MButton>
      </div>
    </FormField>

    <!-- Địa chỉ -->
    <FormField label="Địa chỉ" group hint="Khi trình chiếu, bấm vào địa chỉ để mở bản đồ">
      <div class="flex min-w-0 flex-col gap-2">
        <div v-for="(a, i) in c.addresses" :key="i" class="flex items-start gap-1">
          <div class="min-w-0 flex-1"><MTextarea :model-value="a" :rows="2" :maxlength="CL.address" placeholder="Tầng 9, Tòa nhà Technosoft, Duy Tân, Cầu Giấy, Hà Nội" @update:model-value="(v) => setAt('addresses', i, v)" /></div>
          <MButton variant="icon" aria-label="Xoá địa chỉ" @click="c.addresses.splice(i, 1)"><template #icon><MIcon name="trash" :size="16" /></template></MButton>
        </div>
        <MButton v-if="c.addresses.length < CL.addresses" variant="outline" class="self-start" @click="c.addresses.push('')"><template #icon><MIcon name="map-pin" :size="16" /></template>Thêm địa chỉ</MButton>
      </div>
    </FormField>

    <FormField label="Website">
      <MInput v-model="c.website" placeholder="amis.misa.vn" :error="websiteError || tooLong(c.website, CL.website)" />
    </FormField>

    <!-- Lời kêu gọi -->
    <FormField label="Lời kêu gọi (CTA)" group hint="Hiển thị nổi bật trên trang">
      <div class="flex min-w-0 flex-col gap-2">
        <MInput v-bind="rx(c, 'cta')" placeholder="Liên hệ để được tư vấn miễn phí" :error="tooLong(plainText(c.cta), CL.cta)" />
        <div class="flex flex-wrap gap-1.5" aria-label="Gợi ý lời kêu gọi">
          <button
            v-for="t in CTA_SUGGESTIONS"
            :key="t"
            type="button"
            class="rounded-full border border-[var(--mds-border)] px-3 py-1 text-[12px] leading-5 hover:border-[var(--mds-brand-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--mds-brand-600)]"
            @click="c.cta = t"
          >
            {{ t }}
          </button>
        </div>
      </div>
    </FormField>

    <!-- Mã QR -->
    <FormField label="Mã QR" group :hint="offer ? 'Mã QR hiển thị lớn, chiếm nửa trang để dễ quét' : 'Mã QR hiển thị lớn bên phải trang để dễ quét'">
      <div class="flex min-w-0 flex-col gap-2">
        <MTabs v-model="qrTab" :tabs="QR_TABS" variant="pill" />
        <ImagePicker v-if="qrTab === 'image'" :model-value="qrImage" :assets="imageAssets" :upload="upload" :studio="studio" @update:model-value="setQrImage" @studio="emit('media', { path: 'contact.qr', kind: 'image', aspect: 1 })" />
        <template v-else>
          <MInput :model-value="c.qr?.link || ''" placeholder="https://zalo.me/0912345678" :error="qrLinkError || tooLong(c.qr?.link, CL.qrLink)" @update:model-value="(v) => (ensureQr().link = v)" />
          <p v-if="c.qr?.asset" class="text-[12px] text-[var(--mds-text-secondary)]">Trang đang dùng ảnh QR tải lên — xoá ảnh ở thẻ “Tải ảnh QR” để dùng mã tạo từ link.</p>
          <!-- mã QR do qr.js sinh (chỉ toạ độ số) -->
          <div v-if="qrPreview" class="ct-qr-prev self-start rounded-lg border border-[var(--mds-border)] bg-white p-2" v-html="qrPreview" />
        </template>
        <MInput :model-value="plainText(c.qr?.caption || '')" placeholder="Chú thích dưới mã: Quét để nhận báo giá" :error="tooLong(plainText(c.qr?.caption), CL.qrCaption)" @update:model-value="(v) => (ensureQr().caption = repaintRich(c.qr?.caption || '', v))" />
      </div>
    </FormField>
  </section>
</template>

<style scoped>
.ct-chan-ico { display: inline-block; width: 22px; height: 22px; }
.ct-chan-ico :deep(svg) { display: block; width: 100%; height: 100%; }
.ct-chan-ico :deep(svg *) { transform-box: view-box; transform-origin: 0 0; }
.ct-qr-prev { width: 160px; height: 160px; }
.ct-qr-prev :deep(svg) { display: block; width: 100%; height: 100%; }
</style>
