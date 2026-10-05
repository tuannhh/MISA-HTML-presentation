// useFormValidation.js — helper validate form dùng chung, khớp quy tắc MDS
// (popup-form.md mục 4 "KHÔNG dùng nút Disable"): nút Lưu luôn enable, khi bấm
// mà còn lỗi thì (1) focus vào ô lỗi ĐẦU TIÊN và (2) hiện message đỏ dưới ô lỗi
// đó (dùng đúng prop `error` sẵn có của MInput/MTextarea/MSelect/MCombobox/
// MDatePicker — spec message đỏ 12px dưới control, xem ui/CONVENTIONS.md).
//
// Quy ước bắt buộc khi dùng focusField()/validate(): bọc field bằng 1 phần tử
// có `data-field="<tênTrường>"` bao quanh control, ví dụ:
//   <div data-field="name"><MInput v-model="form.name" :error="errors.name" /></div>
import { computed, reactive } from 'vue'

export const rules = {
  required:
    (message = 'Trường này không được để trống') =>
    (value) =>
      value === null || value === undefined || String(value).trim() === '' ? message : '',

  email:
    (message = 'Email không hợp lệ') =>
    (value) =>
      !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : message,

  // Số điện thoại VN: 0 hoặc +84 + đầu số di động + đủ 10 số
  phoneVN:
    (message = 'Số điện thoại không hợp lệ') =>
    (value) =>
      !value || /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/.test(String(value).replace(/[\s.-]/g, '')) ? '' : message,

  minLength:
    (min, message) =>
    (value) =>
      !value || String(value).length >= min ? '' : message || `Tối thiểu ${min} ký tự`,

  maxLength:
    (max, message) =>
    (value) =>
      !value || String(value).length <= max ? '' : message || `Tối đa ${max} ký tự`,

  min:
    (min, message) =>
    (value) =>
      value === null || value === undefined || value === '' || Number(value) >= min
        ? ''
        : message || `Giá trị tối thiểu ${min}`,

  max:
    (max, message) =>
    (value) =>
      value === null || value === undefined || value === '' || Number(value) <= max
        ? ''
        : message || `Giá trị tối đa ${max}`,
}

/**
 * schema: { tênTrường: [rule1, rule2, ...] } — mỗi rule là hàm (value) => '' | 'thông báo lỗi'
 */
export function useFormValidation(schema) {
  const errors = reactive({})

  function validateField(key, value) {
    const fieldRules = schema[key] || []
    for (const rule of fieldRules) {
      const message = rule(value)
      if (message) {
        errors[key] = message
        return message
      }
    }
    errors[key] = ''
    return ''
  }

  // values: object dữ liệu form hiện tại (thường là form reactive của cha)
  // Trả về true/false; nếu có lỗi tự focus vào ô lỗi đầu tiên (spec mục 4)
  function validate(values) {
    let firstErrorKey = null
    for (const key of Object.keys(schema)) {
      const message = validateField(key, values[key])
      if (message && !firstErrorKey) firstErrorKey = key
    }
    if (firstErrorKey) focusField(firstErrorKey)
    return !firstErrorKey
  }

  function focusField(key) {
    // requestAnimationFrame: đợi DOM cập nhật class lỗi (border đỏ) xong rồi mới focus
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-field="${key}"] input, [data-field="${key}"] textarea, [data-field="${key}"] button, [data-field="${key}"] select`
      )
      el?.focus()
    })
  }

  function clearErrors() {
    for (const key of Object.keys(errors)) errors[key] = ''
  }

  const hasErrors = computed(() => Object.values(errors).some(Boolean))

  return { errors, validate, validateField, clearErrors, hasErrors, focusField }
}
