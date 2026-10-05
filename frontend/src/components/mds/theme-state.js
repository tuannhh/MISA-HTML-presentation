// theme-state.js — state dùng chung cho theme/mode/density/sidebar toàn playground.
// Singleton module-scope: mọi trang import cùng 1 ref nên tự động đồng bộ +
// lưu localStorage, khớp hành vi "mọi trang dùng chung" mô tả trong
// references/patterns/header-bar.md và references/patterns/sidebar.md.
import { ref, watch } from 'vue'

const hasStorage = typeof localStorage !== 'undefined'
function readStorage(key, fallback) {
  if (!hasStorage) return fallback
  const v = localStorage.getItem(key)
  return v === null ? fallback : v
}
function writeStorage(key, value) {
  if (hasStorage) localStorage.setItem(key, value)
}

/* ── 11 theme màu (10 chính thức + Gradient) ───────────────────── */
export const THEME_LIST = [
  { id: 'blue', label: 'Xanh dương (mặc định)', main: '#245FDF' },
  { id: 'indigo', label: 'Chàm', main: '#4155F5' },
  { id: 'cyan', label: 'Xanh lơ', main: '#00A2CF' },
  { id: 'teal', label: 'Xanh ngọc', main: '#0E9384' },
  { id: 'green', label: 'Xanh lá', main: '#0E9A62' },
  { id: 'orange', label: 'Cam', main: '#EA580C' },
  { id: 'red', label: 'Đỏ', main: '#C34266' },
  { id: 'pink', label: 'Hồng', main: '#C64691' },
  { id: 'purple', label: 'Tím', main: '#744EC7' },
  { id: 'blue-gray', label: 'Xanh xám', main: '#4E5BA6' },
  { id: 'gradient', label: 'Gradient', main: '#245FDF', gradient: 'linear-gradient(90deg, #245FDF 0%, #0FBF79 100%)' },
]

const THEME_KEY = 'mds-theme'
export const currentTheme = ref(readStorage(THEME_KEY, 'blue'))
export function applyTheme(id) {
  currentTheme.value = id
  if (id === 'blue') document.documentElement.removeAttribute('data-mds-theme')
  else document.documentElement.setAttribute('data-mds-theme', id)
  writeStorage(THEME_KEY, id)
}
// Áp giá trị đã lưu ngay khi module được import (App.vue import module này ở main.js)
if (currentTheme.value !== 'blue') document.documentElement.setAttribute('data-mds-theme', currentTheme.value)

/* ── Chế độ header: 'brand' (màu) | 'light' (sáng) ─────────────── */
const MODE_KEY = 'mds-header-mode'
export const currentHeaderMode = ref(readStorage(MODE_KEY, 'brand'))
export function applyHeaderMode(mode) {
  currentHeaderMode.value = mode
  writeStorage(MODE_KEY, mode)
}

/* ── Mật độ hiển thị: 'compact' | 'medium' (mặc định) | 'comfortable' ── */
export const DENSITY_LIST = [
  { id: 'compact', label: 'Compact', height: 28, description: 'Thu gọn — hiển thị nhiều dữ liệu hơn' },
  { id: 'medium', label: 'Trung bình', height: 36, description: 'Mặc định — phù hợp đa số màn hình' },
  { id: 'comfortable', label: 'Rộng', height: 40, description: 'Rộng rãi — dễ thao tác trên màn to' },
]
const DENSITY_KEY = 'mds-density'
export const currentDensity = ref(readStorage(DENSITY_KEY, 'medium'))
export function applyDensity(id) {
  currentDensity.value = id
  if (id === 'medium') document.documentElement.removeAttribute('data-density')
  else document.documentElement.setAttribute('data-density', id)
  writeStorage(DENSITY_KEY, id)
}
if (currentDensity.value !== 'medium') document.documentElement.setAttribute('data-density', currentDensity.value)

/* ── Hình nền (wallpaper) + hiệu ứng kính (glass) ───────────────
   Bật wallpaper (khác 'none') tự động kéo theo hiệu ứng kính — không có
   toggle riêng, khớp header-bar.md mục 3 "Hình nền": card/table chuyển
   nền bán trong suốt + backdrop-blur, header/sidebar/dialog vẫn solid. ── */
export const WALLPAPER_LIST = [
  { id: 'none', label: 'Không có', css: null },
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(135deg, #a5c0ff 0%, #d6b8f5 45%, #ffd6ec 100%)' },
  { id: 'ocean', label: 'Đại dương', css: 'linear-gradient(135deg, #8fd3f4 0%, #84fab0 100%)' },
  { id: 'sunset', label: 'Hoàng hôn', css: 'linear-gradient(135deg, #ffafbd 0%, #ffc3a0 100%)' },
  { id: 'mesh', label: 'Mesh đêm', css: 'radial-gradient(at 20% 20%, #667eea 0, transparent 55%), radial-gradient(at 80% 0%, #43cbff 0, transparent 55%), radial-gradient(at 80% 90%, #9708cc 0, transparent 55%), linear-gradient(#0f1b3d, #0f1b3d)' },
]
const WALLPAPER_KEY = 'mds-wallpaper'
export const currentWallpaper = ref(readStorage(WALLPAPER_KEY, 'none'))
export function applyWallpaper(id) {
  currentWallpaper.value = id
  const item = WALLPAPER_LIST.find((w) => w.id === id)
  if (!item || !item.css) {
    document.documentElement.removeAttribute('data-mds-wallpaper')
    document.documentElement.removeAttribute('data-mds-glass')
    document.documentElement.style.removeProperty('--mds-wallpaper-image')
  } else {
    document.documentElement.setAttribute('data-mds-wallpaper', id)
    document.documentElement.setAttribute('data-mds-glass', 'true')
    document.documentElement.style.setProperty('--mds-wallpaper-image', item.css)
  }
  writeStorage(WALLPAPER_KEY, id)
}
if (currentWallpaper.value !== 'none') applyWallpaper(currentWallpaper.value)

/* ── Sidebar collapsed — singleton dùng chung mọi trang ────────── */
const SIDEBAR_KEY = 'mds-sidebar-expanded'
const storedExpanded = readStorage(SIDEBAR_KEY, null)
export const sidebarCollapsed = ref(storedExpanded === null ? false : storedExpanded !== 'true')
watch(sidebarCollapsed, (collapsed) => writeStorage(SIDEBAR_KEY, String(!collapsed)))
