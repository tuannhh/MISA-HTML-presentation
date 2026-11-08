// /api/folders — thư mục sắp xếp bài trình bày của người dùng: danh sách (phẳng, kèm số bài), tạo, đổi tên / chuyển thư mục cha,
// xoá (bài + thư mục con chuyển lên cha), chuyển nhiều bài vào thư mục. Lọc danh sách bài theo thư mục: GET /api/presentations?folder=…
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ok, pick, uuidParam } from '../lib/validate.js';

export function folderRoutes({ service }) {
  const r = Router();
  const auth = requireAuth();

  r.get('/', auth, async (req, res) => ok(res, await service.list(req.user)));

  r.post('/', auth, async (req, res) => ok(res, await service.create(req.user, pick(req.body, ['name', 'parentId']), req.ip), null, 201));

  r.post('/move-decks', auth, async (req, res) => ok(res, await service.moveDecks(req.user, pick(req.body, ['ids', 'folderId']), req.ip)));

  r.patch('/:id', auth, uuidParam('id'), async (req, res) => ok(res, await service.update(req.user, req.params.id, pick(req.body, ['name', 'parentId']), req.ip)));

  r.delete('/:id', auth, uuidParam('id'), async (req, res) => ok(res, await service.remove(req.user, req.params.id, req.ip)));

  return r;
}
