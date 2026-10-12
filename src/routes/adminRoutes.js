// /api/admin — quản lý tài khoản (chỉ admin). Admin KHÔNG có quyền xem bài trình bày private của tenant khác.
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { ok, pick, paging, uuidParam } from '../lib/validate.js';

export function adminRoutes({ auth, publications }) {
  const r = Router();
  r.use(requireAuth(), requireAdmin);

  r.get('/users', async (req, res) => {
    const { page, pageSize } = paging(req.query);
    const { rows, total } = await auth.adminList({ q: req.query.q, page, pageSize });
    ok(res, rows, { page, pageSize, total, hasNext: page * pageSize < total });
  });

  r.post('/users', async (req, res) => ok(res, await auth.adminCreate(req.user, pick(req.body, ['email', 'displayName', 'role']), req.ip), null, 201));

  r.patch('/users/:id', uuidParam('id'), async (req, res) => ok(res, await auth.adminUpdate(req.user, req.params.id, pick(req.body, ['role', 'status']), req.ip)));

  r.post('/users/:id/reset-password', uuidParam('id'), async (req, res) => ok(res, await auth.adminResetPassword(req.user, req.params.id, req.ip)));

  // Trang đang xuất bản công khai (chỉ dữ liệu vốn đã công khai) + gỡ khi vi phạm.
  r.get('/publications', async (req, res) => {
    const { page, pageSize } = paging(req.query);
    const { rows, total } = await publications.adminList({ q: req.query.q, page, pageSize });
    ok(res, rows, { page, pageSize, total, hasNext: page * pageSize < total });
  });

  r.delete('/publications/:presentationId', uuidParam('presentationId'), async (req, res) => {
    await publications.adminUnpublish(req.user, req.params.presentationId, req.ip);
    res.status(204).end();
  });

  return r;
}
