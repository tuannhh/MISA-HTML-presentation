// Thao tác trên 1 bài trình bày theo quyền: chủ sở hữu có đủ thao tác; bài công khai của người khác chỉ xem/nhân bản/tải.
export function deckMenuItems(d) {
  const ready = d.status === 'ready';
  if (!d.isOwner) {
    return [
      { key: 'view', label: 'Trình chiếu', icon: 'eye' },
      { key: 'duplicate', label: 'Nhân bản về bài của tôi', icon: 'copy' },
      { key: 'd1', divider: true },
      { key: 'export-html', label: 'Tải HTML (có chuyển động)', icon: 'file-export' },
      { key: 'export-pdf', label: 'Tải PDF', icon: 'download' },
    ];
  }
  const items = [];
  if (ready) {
    items.push(
      { key: 'edit', label: 'Chỉnh sửa', icon: 'pencil' },
      { key: 'view', label: 'Trình chiếu', icon: 'eye' },
      d.visibility === 'public'
        ? { key: 'private', label: 'Chuyển về riêng tư', icon: 'lock' }
        : { key: 'public', label: 'Công khai cho mọi người', icon: 'share' },
      { key: 'duplicate', label: 'Nhân bản', icon: 'copy' },
      { key: 'd1', divider: true },
      { key: 'export-html', label: 'Tải HTML (có chuyển động)', icon: 'file-export' },
      { key: 'export-pdf', label: 'Tải PDF', icon: 'download' },
      { key: 'd2', divider: true },
    );
  }
  items.push({ key: 'remove', label: 'Xóa', icon: 'trash', danger: true });
  return items;
}

// Đích khi bấm vào bài: chủ sở hữu → trình soạn thảo (kể cả đang tạo/lỗi để xem tiến trình); người khác → trình chiếu.
export const deckTarget = (d) => (d.isOwner ? `/p/${d.id}/edit` : `/p/${d.id}/view`);

export const VISIBILITY_LABEL = { private: 'Riêng tư', public: 'Công khai' };
