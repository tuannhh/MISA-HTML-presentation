// Store phiên cho express-session lưu trong MySQL (thay express-mysql-session vì gói đó ghim mysql2 có lỗ hổng).
import session from 'express-session';
import { logger } from '../lib/logger.js';

export class MySqlSessionStore extends session.Store {
  constructor(pool, { cleanupIntervalMs = 15 * 60 * 1000 } = {}) {
    super();
    this.pool = pool;
    this.timer = setInterval(() => this.clearExpired().catch((err) => logger.warn('session_cleanup_failed', { err })), cleanupIntervalMs);
    this.timer.unref();
  }

  expiresOf(sess) {
    const exp = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
    return Math.floor(exp / 1000);
  }

  get(sid, cb) {
    this.pool
      .execute('SELECT data, expires FROM sessions WHERE session_id = ? LIMIT 1', [sid])
      .then(([rows]) => {
        const row = rows[0];
        if (!row || Number(row.expires) * 1000 < Date.now()) return cb(null, null);
        return cb(null, JSON.parse(row.data));
      })
      .catch(cb);
  }

  set(sid, sess, cb = () => {}) {
    this.pool
      .execute(
        'INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)',
        [sid, this.expiresOf(sess), JSON.stringify(sess)],
      )
      .then(() => cb(null))
      .catch(cb);
  }

  touch(sid, sess, cb = () => {}) {
    this.pool
      .execute('UPDATE sessions SET expires = ? WHERE session_id = ?', [this.expiresOf(sess), sid])
      .then(() => cb(null))
      .catch(cb);
  }

  destroy(sid, cb = () => {}) {
    this.pool
      .execute('DELETE FROM sessions WHERE session_id = ?', [sid])
      .then(() => cb(null))
      .catch(cb);
  }

  async clearExpired() {
    await this.pool.execute('DELETE FROM sessions WHERE expires < ?', [Math.floor(Date.now() / 1000)]);
  }

  close() {
    clearInterval(this.timer);
  }
}
