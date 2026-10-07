// Truy cập bảng users. Không bao giờ trả password_hash ra khỏi tầng service.
const PUBLIC_COLS =
  'id, email, display_name, role, status, must_change_password, session_version, created_at, updated_at, last_login_at';

export function createUserRepository(pool) {
  return {
    async findByEmailWithHash(email) {
      const [rows] = await pool.execute(`SELECT ${PUBLIC_COLS}, password_hash FROM users WHERE email = ? LIMIT 1`, [email]);
      return rows[0] || null;
    },

    // Chia sẻ bài theo email: chỉ trả thông tin công khai của tài khoản đang hoạt động.
    async findActiveByEmail(email) {
      const [rows] = await pool.execute("SELECT id, email, display_name FROM users WHERE email = ? AND status = 'active' LIMIT 1", [email]);
      return rows[0] || null;
    },

    async findById(id) {
      const [rows] = await pool.execute(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ? LIMIT 1`, [id]);
      return rows[0] || null;
    },

    async findByIdWithHash(id) {
      const [rows] = await pool.execute(`SELECT ${PUBLIC_COLS}, password_hash FROM users WHERE id = ? LIMIT 1`, [id]);
      return rows[0] || null;
    },

    async create({ id, email, displayName, passwordHash, role = 'user', mustChangePassword = false }) {
      await pool.execute(
        'INSERT INTO users (id, email, display_name, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
        [id, email, displayName, passwordHash, role, mustChangePassword ? 1 : 0],
      );
    },

    async touchLogin(id) {
      await pool.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [id]);
    },

    // Đổi mật khẩu đồng thời tăng session_version → vô hiệu mọi phiên khác.
    async updatePassword(id, passwordHash, mustChangePassword) {
      await pool.execute(
        'UPDATE users SET password_hash = ?, must_change_password = ?, session_version = session_version + 1 WHERE id = ?',
        [passwordHash, mustChangePassword ? 1 : 0, id],
      );
      const [rows] = await pool.execute('SELECT session_version FROM users WHERE id = ?', [id]);
      return rows[0]?.session_version;
    },

    async list({ q, limit, offset }) {
      const where = q ? 'WHERE email LIKE ? OR display_name LIKE ?' : '';
      const params = q ? [`%${q}%`, `%${q}%`] : [];
      const [rows] = await pool.query(
        `SELECT ${PUBLIC_COLS} FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
      return { rows, total: Number(total) };
    },

    async updateAdminFields(id, { role, status }) {
      const sets = [];
      const params = [];
      if (role) {
        sets.push('role = ?');
        params.push(role);
      }
      if (status) {
        sets.push('status = ?');
        params.push(status);
        if (status === 'disabled') sets.push('session_version = session_version + 1');
      }
      if (!sets.length) return 0;
      const [res] = await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      return res.affectedRows;
    },

    async countActiveAdmins(excludeId = null) {
      const [[row]] = await pool.execute(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?",
        [excludeId || ''],
      );
      return Number(row.n);
    },
  };
}
