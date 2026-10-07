import { deckPath } from './deckPath.js';

// Quyền của người đang xem trên 1 bài: 'owner' | 'editor' (được mời sửa) | 'viewer' (được mời xem hoặc bài công khai).
export const deckAccess = (d) => d.access || (d.isOwner ? 'owner' : 'viewer');

const EXPORTS = [
  { key: 'export-html', label: 'Tải HTML (có chuyển động)', icon: 'file-export' },
  { key: 'export-pdf', label: 'Tải PDF', icon: 'download' },
];

// Thao tác trên 1 bài theo quyền: chủ bài có đủ thao tác (kể cả chia sẻ, xoá); người được mời sửa thêm "Chỉnh sửa";
// người chỉ xem: trình chiếu, nhân bản, tải xuống.
export function deckMenuItems(d) {
  const ready = d.status === 'ready';
  const access = deckAccess(d);
  if (access !== 'owner') {
    return [
      ...(access === 'editor' ? [{ key: 'edit', label: 'Chỉnh sửa', icon: 'pencil' }] : []),
      { key: 'view', label: 'Trình chiếu', icon: 'eye' },
      { key: 'duplicate', label: 'Nhân bản về bài của tôi', icon: 'copy' },
      { key: 'd1', divider: true },
      ...EXPORTS,
    ];
  }
  const items = [];
  if (d.status === 'outline') items.push({ key: 'edit', label: 'Duyệt dàn ý', icon: 'pencil' }, { key: 'd0', divider: true });
  if (ready) {
    items.push(
      { key: 'edit', label: 'Chỉnh sửa', icon: 'pencil' },
      { key: 'view', label: 'Trình chiếu', icon: 'eye' },
      { key: 'share', label: 'Chia sẻ…', icon: 'user-plus' },
      { key: 'duplicate', label: 'Nhân bản', icon: 'copy' },
      { key: 'd1', divider: true },
      ...EXPORTS,
      { key: 'd2', divider: true },
    );
  }
  items.push({ key: 'remove', label: 'Xóa', icon: 'trash', danger: true });
  return items;
}

// Đích khi bấm vào bài: chủ bài → bước duyệt dàn ý (đang lập/chờ duyệt/đang dựng) hoặc trình soạn thảo;
// người được mời sửa → trình soạn thảo; người chỉ xem → trình chiếu.
const OUTLINE_STATUSES = ['outlining', 'outline', 'generating'];
export function deckTarget(d) {
  const access = deckAccess(d);
  if (access === 'viewer') return deckPath(d, 'view');
  if (access === 'editor') return deckPath(d, 'edit');
  return deckPath(d, OUTLINE_STATUSES.includes(d.status) ? 'outline' : 'edit');
}

// Mục điều hướng tương ứng khi mở 1 bài: của tôi / được chia sẻ với tôi / thư viện công khai.
export const deckNav = (d) => (!d ? 'mine' : deckAccess(d) === 'owner' ? 'mine' : d.shareRole ? 'shared' : 'public');
export const NAV_ROUTE = { mine: '/decks', shared: '/shared', public: '/public' };

export const VISIBILITY_LABEL = { private: 'Riêng tư', public: 'Công khai' };
export const SHARE_ROLE_LABEL = { viewer: 'Chỉ xem', editor: 'Chỉnh sửa' };
