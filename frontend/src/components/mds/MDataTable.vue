<script setup>
import { computed, reactive, ref, useSlots } from 'vue'
import MCheckbox from './MCheckbox.vue'
import MSpinner from './MSpinner.vue'
import MEmptyState from './MEmptyState.vue'
import MIcon from './MIcon.vue'
import MCollapseExpandPanel from './MCollapseExpandPanel.vue'

const props = defineProps({
  // Cột: { key, label, width? (số px hoặc 'auto'), align? 'left'|'right'|'center', sortable? }
  // Theo chuẩn MISA: văn bản/số cố định ký tự căn trái, số tiền/số liệu so sánh căn PHẢI
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  // Hiện cột checkbox đầu tiên để chọn dòng
  selectable: { type: Boolean, default: false },
  // Overlay spinner đè lên bảng khi đang tải dữ liệu
  loading: { type: Boolean, default: false },
  // Phân trang kiểu prev/next KHÔNG đánh số trang (spec MDS mục Paging:
  // SaaS dữ liệu lớn dùng tìm kiếm/lọc thay vì nhảy trang theo số)
  page: { type: Number, default: 1 },
  hasNext: { type: Boolean, default: false },
  pageSize: { type: Number, default: 20 },
  pageSizeOptions: { type: Array, default: () => [20, 50, 100] },
  // Tổng số bản ghi thật (tùy chọn) — có giá trị này mới tính được range "1 - 20"
  // và bật được nút "về đầu/về cuối" (spec data-table.md mục 13 TablePaging)
  total: { type: Number, default: null },
  // v-model:selected — mảng rowKey của các dòng đang được chọn
  selected: { type: Array, default: () => [] },
  // v-model:kpiCollapsed — thu/mở hàng KPI (slot #kpi) bằng CollapseExpandPanel
  kpiCollapsed: { type: Boolean, default: false },
  // [MISA Presentation] ẩn công cụ toolbar chưa có chức năng: 'refresh' | 'export' | 'columns' | 'filter'
  hideTools: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'update:selected',
  'update:page',
  'update:pageSize',
  'update:kpiCollapsed',
  'row-click',
  'sort',
  'refresh',
  'export',
  'column-settings',
  'filter-click',
  'column-resize',
])

const slots = useSlots()

/* ── Chọn dòng bằng checkbox ─────────────────────────────── */

const pageKeys = computed(() => props.rows.map((r) => r[props.rowKey]))

const isSelected = (key) => props.selected.includes(key)

// Checkbox header: check hết trang / indeterminate khi chọn một phần (spec MDS)
const allChecked = computed(
  () => pageKeys.value.length > 0 && pageKeys.value.every((k) => props.selected.includes(k))
)
const isIndeterminate = computed(
  () => !allChecked.value && pageKeys.value.some((k) => props.selected.includes(k))
)

// Check header = chọn cả trang hiện tại, uncheck = bỏ chọn cả trang
// (vẫn giữ các dòng đã chọn ở trang khác — spec cho phép gom chọn nhiều trang)
function toggleAll() {
  if (allChecked.value) {
    emit(
      'update:selected',
      props.selected.filter((k) => !pageKeys.value.includes(k))
    )
  } else {
    emit('update:selected', [...new Set([...props.selected, ...pageKeys.value])])
  }
}

function toggleRow(key) {
  emit(
    'update:selected',
    isSelected(key) ? props.selected.filter((k) => k !== key) : [...props.selected, key]
  )
}

function clearSelected() {
  emit('update:selected', [])
}

/* ── Sort phía server: xoay vòng asc → desc → none ───────── */

const sortState = ref({ key: null, direction: null })

function cycleSort(col) {
  if (!col.sortable) return
  let direction
  if (sortState.value.key !== col.key) direction = 'asc'
  else if (sortState.value.direction === 'asc') direction = 'desc'
  else direction = null // desc → none: bỏ sắp xếp
  sortState.value = { key: direction ? col.key : null, direction }
  // Component KHÔNG tự sort — cha nhận event và sort phía server
  emit('sort', { key: col.key, direction })
}

/* ── Layout cột + resize (spec MDS mục 8/13: kéo mép phải header, min 60px) ── */

const alignClass = (col) =>
  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'

// Override width cục bộ khi user tự kéo resize — không đổi prop columns của cha,
// chỉ emit 'column-resize' để cha tự lưu lại nếu muốn (localStorage, API...)
const widthOverrides = reactive({})

const colWidth = (col) => {
  const w = widthOverrides[col.key] ?? col.width
  return typeof w === 'number' ? `${w}px` : 'auto'
}

const hasRowActions = computed(() => !!slots['row-actions'])

// min-width bảng theo tổng độ rộng cột để scroll ngang khi màn hẹp
const minTableWidth = computed(() => {
  const cols = props.columns.reduce((sum, c) => {
    const w = widthOverrides[c.key] ?? c.width
    return sum + (typeof w === 'number' ? w : 120)
  }, 0)
  return cols + (props.selectable ? 40 : 0) + (hasRowActions.value ? 140 : 0)
})

const totalCols = computed(
  () => props.columns.length + (props.selectable ? 1 : 0) + (hasRowActions.value ? 1 : 0)
)

const MIN_COL_WIDTH = 60
let resizing = null

function startResize(col, event) {
  if (typeof (widthOverrides[col.key] ?? col.width) !== 'number') return
  resizing = { key: col.key, startX: event.clientX, startWidth: widthOverrides[col.key] ?? col.width }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize)
}
function onResizeMove(event) {
  if (!resizing) return
  const next = Math.max(MIN_COL_WIDTH, resizing.startWidth + (event.clientX - resizing.startX))
  widthOverrides[resizing.key] = next
}
function stopResize() {
  if (!resizing) return
  emit('column-resize', { key: resizing.key, width: widthOverrides[resizing.key] })
  resizing = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
}

/* ── Phân trang ──────────────────────────────────────────── */

const lastPage = computed(() => (props.total != null ? Math.max(1, Math.ceil(props.total / props.pageSize)) : null))

const rangeText = computed(() => {
  if (props.total == null) return null
  if (props.total === 0) return '0 - 0'
  const from = (props.page - 1) * props.pageSize + 1
  const to = Math.min(props.page * props.pageSize, props.total)
  return `${from} - ${to}`
})

function goFirst() {
  if (props.page > 1) emit('update:page', 1)
}
function goPrev() {
  if (props.page > 1) emit('update:page', props.page - 1)
}
function goNext() {
  if (props.hasNext) emit('update:page', props.page + 1)
}
function goLast() {
  if (lastPage.value != null && props.page < lastPage.value) emit('update:page', lastPage.value)
}
// Đổi số dòng/trang thì quay về trang 1 (tránh rơi vào trang không tồn tại)
function changePageSize(e) {
  emit('update:pageSize', Number(e.target.value))
  emit('update:page', 1)
}
</script>

<template>
  <div
    class="mds-card relative flex flex-col overflow-hidden rounded-lg bg-[var(--mds-bg)] shadow-[var(--mds-shadow-card)]"
  >
    <!-- Hàng KPI (tùy chọn qua slot #kpi) — thu/mở bằng CollapseExpandPanel căn giữa
         (spec data-table.md mục 13 "Khối bảng trong màn hình Danh sách") -->
    <div v-if="slots.kpi" class="border-b border-[var(--mds-border-light,var(--mds-border))]">
      <div v-show="!kpiCollapsed" class="px-4 pt-3">
        <slot name="kpi" />
      </div>
      <div class="flex justify-center py-1">
        <MCollapseExpandPanel
          side="bottom"
          :collapsed="kpiCollapsed"
          @update:collapsed="emit('update:kpiCollapsed', $event)"
        />
      </div>
    </div>

    <!-- Table toolbar (TableHeader) — trái: tìm kiếm/lọc phụ; phải: 4 icon cố định
         Làm mới/Xuất file/Thiết lập cột/Bộ lọc + vạch dọc + cụm nút chính
         (spec data-table.md mục 13). Bulk action bar đè lên khi chọn ≥1 dòng. -->
    <div
      v-if="slots['toolbar-search'] || slots['toolbar-actions']"
      class="relative flex min-h-[56px] flex-wrap items-center justify-between gap-3 border-b border-[var(--mds-border-light,var(--mds-border))] px-4 py-3"
    >
      <div class="flex flex-1 flex-wrap items-center gap-2">
        <slot name="toolbar-search" />
      </div>

      <!-- Bulk action bar: đè lên phần phải toolbar khi có ≥1 dòng được chọn (spec MDS 6.1) -->
      <div
        v-if="selected.length > 0"
        class="absolute inset-y-0 right-0 z-20 flex items-center gap-3 bg-[var(--mds-bg)] px-4"
      >
        <span class="text-[13px] font-medium leading-[18px] text-[var(--mds-text)]">
          Đã chọn {{ selected.length }}
        </span>
        <button
          type="button"
          class="text-[13px] font-medium leading-[18px] text-[var(--mds-brand-600)] hover:text-[var(--mds-brand-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          @click="clearSelected"
        >
          Bỏ chọn
        </button>
        <div class="flex items-center gap-2">
          <slot name="bulk-actions" :selected="selected" />
        </div>
      </div>

      <div v-else class="flex items-center gap-1">
        <button
          v-if="!hideTools.includes('refresh')"
          type="button"
          title="Làm mới"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          @click="emit('refresh')"
        >
          <MIcon name="refresh" :size="16" />
        </button>
        <button
          v-if="!hideTools.includes('export')"
          type="button"
          title="Xuất file"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          @click="emit('export')"
        >
          <MIcon name="file-export" :size="16" />
        </button>
        <button
          v-if="!hideTools.includes('columns')"
          type="button"
          title="Thiết lập cột"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          @click="emit('column-settings')"
        >
          <MIcon name="settings" :size="16" />
        </button>
        <button
          v-if="!hideTools.includes('filter')"
          type="button"
          title="Bộ lọc"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          @click="emit('filter-click')"
        >
          <MIcon name="filter" :size="16" />
        </button>
        <span v-if="slots['toolbar-actions']" class="mx-1 h-5 w-px shrink-0 bg-[var(--mds-border)]" />
        <slot name="toolbar-actions" />
      </div>
    </div>

    <!-- Vùng bảng: scroll dọc + ngang, header sticky -->
    <div class="relative min-h-0 flex-1 overflow-auto">
      <table
        class="w-full table-fixed border-collapse text-[13px] leading-[18px] text-[var(--mds-text)]"
        :style="{ minWidth: minTableWidth + 'px' }"
      >
        <colgroup>
          <col v-if="selectable" style="width: 40px" />
          <col v-for="col in columns" :key="col.key" :style="{ width: colWidth(col) }" />
          <col v-if="hasRowActions" style="width: 140px" />
        </colgroup>

        <!-- Header sticky top-0 khi scroll dọc trong bảng; nền neutral-200, vạch dọc liền
             giữa các cột header (spec data-table.md mục 13 — khác vạch chấm ở body) -->
        <thead>
          <tr class="h-10">
            <th
              v-if="selectable"
              class="sticky top-0 z-10 border-b border-t border-[var(--mds-border)] bg-[var(--mds-neutral-200)] px-3"
            >
              <MCheckbox
                :model-value="allChecked"
                :indeterminate="isIndeterminate"
                @update:model-value="toggleAll"
              />
            </th>
            <th
              v-for="col in columns"
              :key="col.key"
              class="group/th relative sticky top-0 z-10 border-b border-t border-r border-[var(--mds-border)] bg-[var(--mds-neutral-200)] px-3 text-[12px] font-semibold text-[var(--mds-text-muted)] last:border-r-0"
              :class="[alignClass(col), col.sortable ? 'cursor-pointer select-none' : '']"
              :aria-sort="
                sortState.key === col.key
                  ? sortState.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              "
              @click="cycleSort(col)"
            >
              <span
                class="inline-flex items-center gap-1"
                :class="col.align === 'right' ? 'flex-row-reverse' : ''"
              >
                <!-- Cột đang ghim: icon Pin đầu tiêu đề (spec MDS mục 8) -->
                <MIcon v-if="col.pinned" name="map-pin" :size="12" class="text-[var(--mds-text-muted)]" />
                {{ col.label }}
                <!-- Icon sort: mũi tên lên (asc) / xuống (desc); chưa sort thì chỉ hiện mờ khi hover header -->
                <MIcon
                  v-if="col.sortable"
                  :name="sortState.key === col.key && sortState.direction === 'desc' ? 'arrow-down' : 'arrow-up'"
                  :size="16"
                  :class="
                    sortState.key === col.key
                      ? 'text-[var(--mds-brand-600)]'
                      : 'opacity-0 group-hover/th:opacity-100 text-[var(--mds-icon-neutral)]'
                  "
                />
              </span>
              <!-- Resize hotspot: kéo mép phải header để đổi width (min 60px, spec mục 13) -->
              <div
                v-if="typeof (widthOverrides[col.key] ?? col.width) === 'number'"
                class="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
                @mousedown.stop.prevent="startResize(col, $event)"
                @click.stop
              >
                <div class="mx-auto h-full w-px bg-transparent group-hover/th:bg-[var(--mds-brand-600)]" />
              </div>
            </th>
            <!-- Cột thao tác dòng: sticky mép phải, không sort/resize (spec mục 13) -->
            <th
              v-if="hasRowActions"
              class="sticky top-0 right-0 z-10 border-b border-t border-l border-[var(--mds-border)] bg-[var(--mds-neutral-200)] px-3"
            />
          </tr>
        </thead>

        <tbody>
          <!-- Empty state: rows rỗng và không loading (spec MDS Empty) -->
          <tr v-if="rows.length === 0 && !loading">
            <td :colspan="totalCols" class="p-0">
              <slot name="empty">
                <MEmptyState
                  type="no-result"
                  title="Không tìm thấy kết quả"
                  description="Thử thay đổi từ khóa hoặc điều kiện lọc"
                />
              </slot>
            </td>
          </tr>

          <!-- Dòng dữ liệu: cao theo density, hover nền nhạt, click mở chi tiết (row-click) -->
          <tr
            v-for="row in rows"
            :key="row[rowKey]"
            class="group h-[var(--mds-dt-row-height,40px)] cursor-pointer border-b border-[var(--mds-border-light,var(--mds-border))] transition-colors last:border-b-0 hover:bg-[var(--mds-bg-hover-soft)]"
            :class="isSelected(row[rowKey]) ? 'bg-[var(--mds-brand-50)]' : ''"
            @click="emit('row-click', row)"
          >
            <!-- Cột checkbox: click KHÔNG trigger row-click (stop) -->
            <td v-if="selectable" class="px-3" @click.stop>
              <MCheckbox
                :model-value="isSelected(row[rowKey])"
                @update:model-value="toggleRow(row[rowKey])"
              />
            </td>
            <!-- Cell trong row ngăn nhau bằng vạch chấm (dotted) — khác header (liền),
                 spec data-table.md mục 13 -->
            <td
              v-for="col in columns"
              :key="col.key"
              class="truncate border-r border-dotted border-[var(--mds-border-light,var(--mds-border))] px-3 last:border-r-0"
              :class="alignClass(col)"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                {{ row[col.key] }}
              </slot>
            </td>
            <!-- Cột thao tác dòng: sticky mép phải, chỉ hiện khi hover/chọn dòng, nền phủ kín
                 để che nội dung cuộn ngang bên dưới (spec data-table.md mục 13) -->
            <td
              v-if="hasRowActions"
              class="sticky right-0 border-l border-[var(--mds-border-light,var(--mds-border))] bg-[var(--mds-bg)] px-2 transition-colors group-hover:bg-gradient-to-r group-hover:from-transparent group-hover:to-[var(--mds-brand-50)]"
              :class="isSelected(row[rowKey]) ? 'bg-[var(--mds-brand-50)]' : ''"
              @click.stop
            >
              <div class="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <slot name="row-actions" :row="row" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Overlay loading đè lên bảng -->
    <div v-if="loading" class="absolute inset-0 z-30 flex items-center justify-center">
      <div class="absolute inset-0 bg-[var(--mds-bg)] opacity-60"></div>
      <MSpinner :size="28" class="relative text-[var(--mds-brand-600)]" />
    </div>

    <!-- Footer phân trang: prev/next KHÔNG đánh số trang (spec MDS mục 9), thêm
         nút về đầu/về cuối + range khi biết total (spec data-table.md mục 13 TablePaging) -->
    <div
      class="flex h-12 shrink-0 items-center justify-between gap-4 border-t border-[var(--mds-border)] bg-[var(--mds-bg)] px-4 text-[13px] leading-[18px] text-[var(--mds-text)]"
    >
      <div class="text-[var(--mds-text-muted)]">
        <slot name="footer-info" :count="rows.length">
          <template v-if="total != null">Tổng số: <span class="font-semibold text-[var(--mds-text)]">{{ total }}</span></template>
          <template v-else>Tổng số bản ghi hiển thị: {{ rows.length }}</template>
        </slot>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="rangeText" class="mr-1 text-[var(--mds-text)]">
          <span class="text-[var(--mds-text-muted)]">Số dòng/trang</span>
        </span>
        <!-- Chọn số dòng/trang -->
        <select
          class="h-8 w-[72px] cursor-pointer rounded-lg border border-[var(--mds-border)] bg-[var(--mds-bg)] px-2 text-[13px] leading-[18px] text-[var(--mds-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :value="pageSize"
          aria-label="Số dòng mỗi trang"
          @change="changePageSize"
        >
          <option v-for="opt in pageSizeOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>

        <span v-if="rangeText" class="font-semibold text-[var(--mds-text)]">{{ rangeText }}</span>

        <!-- Về đầu: chỉ hiện khi biết total (mới tính được có phải trang 1 hay chưa mà không cần) -->
        <button
          v-if="lastPage != null"
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="
            page <= 1
              ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)]'
              : 'bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]'
          "
          :disabled="page <= 1"
          aria-label="Về trang đầu"
          @click="goFirst"
        >
          <MIcon name="chevrons-left" :size="16" />
        </button>

        <!-- Prev: disabled khi đang ở trang 1 -->
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="
            page <= 1
              ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)]'
              : 'bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]'
          "
          :disabled="page <= 1"
          aria-label="Trang trước"
          @click="goPrev"
        >
          <MIcon name="chevron-left" :size="16" />
        </button>

        <!-- Next: disabled khi không còn trang sau (!hasNext) -->
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="
            !hasNext
              ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)]'
              : 'bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]'
          "
          :disabled="!hasNext"
          aria-label="Trang sau"
          @click="goNext"
        >
          <MIcon name="chevron-right" :size="16" />
        </button>

        <!-- Về cuối: chỉ hiện khi biết total -->
        <button
          v-if="lastPage != null"
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mds-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mds-brand-600)]"
          :class="
            page >= lastPage
              ? 'cursor-not-allowed bg-[var(--mds-bg-disabled)] text-[var(--mds-text-placeholder)]'
              : 'bg-[var(--mds-bg)] text-[var(--mds-icon-neutral)] hover:bg-[var(--mds-bg-hover-soft)]'
          "
          :disabled="page >= lastPage"
          aria-label="Về trang cuối"
          @click="goLast"
        >
          <MIcon name="chevrons-right" :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
