<script setup>
// MChart — wrapper Apache ECharts chuẩn MDS 2.0.
// LƯU Ý: project cần cài ECharts trước khi dùng: `npm i echarts`
// (đây là component duy nhất của bộ MDS phụ thuộc package ngoài Vue).
//
// Quy tắc biểu đồ MDS áp dụng sẵn (references/communication.md):
// - Thư viện dựa trên Apache ECharts; bo góc chung Pie/column/bar là 4px.
// - Màu series lấy từ bảng màu chart categorical (assets/tokens/chart-palette.css).
// - Số liệu định dạng kiểu Việt Nam: 1.234.567 (tooltip + nhãn trục).
// - Không hiệu ứng lòe loẹt: chart tĩnh, gọn, ưu tiên đọc số liệu.
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: { type: Object, required: true }, // ECharts option của người dùng — đè được mọi default
  height: { type: Number, default: 320 },   // chiều cao chart (px), rộng luôn 100% container
  loading: { type: Boolean, default: false }, // hiện loading spinner màu brand
  ariaLabel: { type: String, default: 'Biểu đồ dữ liệu' },
})
const emit = defineEmits(['resize'])

const container = ref(null)
let chart = null
let resizeObserver = null
let resizeFrame = null
let windowResizeHandler = null

// Đọc CSS variable của MDS lúc runtime; không resolve được thì dùng fallback
// (fallback copy đúng giá trị từ assets/tokens.css & assets/tokens/chart-palette.css)
function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// Bảng màu categorical chính thức của MDS — hàng Blue 1→7 trong
// assets/tokens/chart-palette.css (Palette.tokens). Ưu tiên đọc runtime để
// tự ăn theme, fallback hardcode đúng giá trị token khi biến chưa được import.
const FALLBACK_PALETTE = ['#245FDF', '#AD63E1', '#F157C0', '#FF5F96', '#FF7E6D', '#FFA54D', '#FFCC42']
function getPalette() {
  return FALLBACK_PALETTE.map((hex, i) => cssVar(`--mds-chart-blue-${i + 1}`, hex))
}

// Định dạng số kiểu Việt Nam: 1234567 → "1.234.567" (dùng cho tooltip/nhãn trục)
function formatNumberVN(value) {
  if (value == null || value === '' || isNaN(value)) return value == null ? '' : String(value)
  return Number(value).toLocaleString('vi-VN')
}

// Deep-merge: object lồng nhau merge đệ quy, array/giá trị thường thì source đè hẳn
// → option người dùng luôn thắng default MDS ở mọi cấp
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
function deepMerge(target, source) {
  const out = { ...target }
  for (const key of Object.keys(source)) {
    if (isPlainObject(out[key]) && isPlainObject(source[key])) {
      out[key] = deepMerge(out[key], source[key])
    } else {
      out[key] = source[key]
    }
  }
  return out
}

// Default chuẩn MDS cho trục: line/label màu nhạt theo token, không tick thừa
function axisDefaults(fontFamily) {
  const border = cssVar('--mds-border', '#CED1D6')          // viền nhạt (tokens.css)
  const textMuted = cssVar('--mds-text-muted', '#99A1B2')   // chữ phụ (tokens.css)
  const splitSoft = cssVar('--mds-bg-disabled', '#F2F2F4')  // đường lưới rất nhạt
  return {
    axisLine: { lineStyle: { color: border } },
    axisTick: { show: false },
    axisLabel: {
      fontFamily,
      fontSize: 12,
      color: textMuted,
      hideOverlap: true,
      formatter: (v) => (typeof v === 'number' ? formatNumberVN(v) : v),
    },
    splitLine: { lineStyle: { color: splitSoft } },
  }
}

// Áp default trục cho xAxis/yAxis người dùng truyền vào (hỗ trợ cả object lẫn array)
function mergeAxis(userAxis, defaults) {
  if (Array.isArray(userAxis)) return userAxis.map((ax) => deepMerge(defaults, ax))
  return deepMerge(defaults, userAxis || {})
}

// Bo góc 4px cho bar/pie theo quy tắc MDS — chỉ áp khi người dùng chưa tự set
function applySeriesDefaults(series) {
  const list = Array.isArray(series) ? series : [series]
  return list.map((s) => {
    if (!isPlainObject(s)) return s
    const defaults = { labelLayout: { hideOverlap: true } }
    const hasRadius = s.itemStyle && s.itemStyle.borderRadius != null
    if (!hasRadius && (s.type === 'bar' || s.type === 'pie')) defaults.itemStyle = { borderRadius: 4 }
    return deepMerge(defaults, s)
  })
}

// Ghép default MDS + option người dùng (người dùng đè được mọi default)
function buildOption(userOption) {
  const fontFamily = cssVar('--mds-font-family', "'Inter', -apple-system, 'Segoe UI', sans-serif")
  const text = cssVar('--mds-text', '#1F2229')
  const textMuted = cssVar('--mds-text-muted', '#99A1B2')

  const base = {
    color: getPalette(),
    aria: { enabled: true, description: props.ariaLabel, decal: { show: false } },
    // Font Inter 12px màu chữ phụ cho toàn bộ text mặc định của chart
    textStyle: { fontFamily, fontSize: 12, color: textMuted },
    grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
    // Tooltip nền trắng, bo 8px, shadow nhẹ, chữ 12px; số định dạng VN
    tooltip: {
      confine: true,
      backgroundColor: cssVar('--mds-bg', '#FFFFFF'),
      borderWidth: 0,
      borderRadius: 8,
      padding: [8, 12],
      textStyle: { fontFamily, fontSize: 12, color: text },
      extraCssText: 'box-shadow: 0 4px 16px rgba(31, 34, 41, 0.12);',
      valueFormatter: (v) => (typeof v === 'number' ? formatNumberVN(v) : v),
    },
    // Legend chấm tròn 8px, chữ 12px, đặt góc trên bên trái
    legend: {
      left: 0,
      top: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { fontFamily, fontSize: 12, color: text },
    },
  }

  const merged = deepMerge(base, userOption || {})
  // Vị trí legend: default là left:0/top:0 — nếu người dùng tự đặt right/bottom
  // thì phải bỏ default phía đối diện, không thì ECharts ưu tiên left/top
  // và legend bị kéo về đè lên chart
  const ul = userOption && userOption.legend
  if (ul && !Array.isArray(ul) && merged.legend) {
    if (ul.right != null && ul.left == null) delete merged.legend.left
    if (ul.bottom != null && ul.top == null) delete merged.legend.top
  }
  const axDefaults = axisDefaults(fontFamily)
  // Chỉ áp default trục khi người dùng khai báo trục (chart cartesian);
  // pie/donut không có trục thì bỏ qua
  if (userOption && userOption.xAxis != null) merged.xAxis = mergeAxis(userOption.xAxis, axDefaults)
  if (userOption && userOption.yAxis != null) merged.yAxis = mergeAxis(userOption.yAxis, axDefaults)
  if (merged.series != null) merged.series = applySeriesDefaults(merged.series)
  return merged
}

function resizeChart() {
  if (!chart || !container.value) return
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    if (!chart || !container.value) return
    chart.resize()
    const rect = container.value.getBoundingClientRect()
    emit('resize', { width: Math.round(rect.width), height: Math.round(rect.height) })
  })
}

// Bật/tắt loading của ECharts với spinner màu brand
function syncLoading() {
  if (!chart) return
  if (props.loading) {
    chart.showLoading('default', {
      text: '',
      color: cssVar('--mds-brand-600', '#245FDF'),
      maskColor: 'rgba(255, 255, 255, 0.7)',
      spinnerRadius: 10,
      lineWidth: 2,
    })
  } else {
    chart.hideLoading()
  }
}

onMounted(() => {
  // Khởi tạo chart và vẽ lần đầu với option đã merge default MDS
  chart = echarts.init(container.value)
  chart.setOption(buildOption(props.option), { notMerge: true })
  syncLoading()

  // Chart tự resize theo kích thước container (responsive)
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resizeChart)
    resizeObserver.observe(container.value)
  } else {
    // Fallback cho WKWebView/Android WebView đời cũ chưa có ResizeObserver.
    windowResizeHandler = resizeChart
    window.addEventListener('resize', windowResizeHandler)
    window.addEventListener('orientationchange', windowResizeHandler)
  }
  resizeChart()
})

// Option đổi (deep) → vẽ lại với default MDS merge sẵn; notMerge để không dính series cũ
watch(
  () => props.option,
  (opt) => {
    if (chart) chart.setOption(buildOption(opt), { notMerge: true })
  },
  { deep: true }
)

watch(() => props.loading, syncLoading)

// Đổi height qua prop → báo ECharts tính lại kích thước
watch(
  () => props.height,
  () => {
    resizeChart()
  }
)

onBeforeUnmount(() => {
  // Dọn dẹp: ngắt observer và dispose instance tránh leak
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (windowResizeHandler) {
    window.removeEventListener('resize', windowResizeHandler)
    window.removeEventListener('orientationchange', windowResizeHandler)
    windowResizeHandler = null
  }
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<template>
  <!-- Container chart: rộng 100%, cao theo prop height -->
  <div
    ref="container"
    class="mds-chart mds-mobile-clip-region w-full min-w-0 overflow-hidden"
    role="img"
    :aria-label="ariaLabel"
    :style="{ height: height + 'px' }"
  />
</template>
