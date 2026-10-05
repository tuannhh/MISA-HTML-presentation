-- MISA Presentation — lược đồ baseline ĐẦY ĐỦ MỚI NHẤT (MySQL 8.0+).
-- Idempotent: chạy lại nhiều lần không lỗi. Mọi thay đổi sau này: thêm 1 file vào changelogs/
-- ĐỒNG THỜI cập nhật file này. Ứng dụng KHÔNG tự chạy file này lúc khởi động (chỉ kiểm tra bảng).
-- Docker: container MySQL tự áp file này ở lần khởi tạo volume đầu tiên (docker-entrypoint-initdb.d).

CREATE DATABASE IF NOT EXISTS misa_presentation
  DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE misa_presentation;

-- Mỗi người dùng là 1 tenant độc lập: tenant_id ở các bảng nghiệp vụ = users.id.
CREATE TABLE IF NOT EXISTS users (
  id                   CHAR(36)      NOT NULL,
  email                VARCHAR(190)  NOT NULL,
  display_name         VARCHAR(120)  NOT NULL,
  password_hash        VARCHAR(100)  NOT NULL,
  role                 ENUM('user','admin') NOT NULL DEFAULT 'user',
  status               ENUM('active','disabled') NOT NULL DEFAULT 'active',
  must_change_password TINYINT(1)    NOT NULL DEFAULT 0,
  -- Tăng mỗi lần đổi mật khẩu/khoá tài khoản → mọi phiên cũ mang version thấp hơn bị vô hiệu.
  session_version      INT UNSIGNED  NOT NULL DEFAULT 1,
  created_at           DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at        DATETIME(3)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS presentations (
  id                CHAR(36)      NOT NULL,
  tenant_id         CHAR(36)      NOT NULL,
  title             VARCHAR(200)  NOT NULL,
  ratio             ENUM('16:9','4:3','2:1','3:1') NOT NULL DEFAULT '16:9',
  visibility        ENUM('private','public') NOT NULL DEFAULT 'private',
  -- outlining: AI đang lập dàn ý · outline: chờ người dùng duyệt dàn ý · generating: AI đang dựng bài.
  status            ENUM('outlining','outline','generating','ready','failed') NOT NULL DEFAULT 'generating',
  source_kind       ENUM('file','url','text','copy') NOT NULL,
  source_label      VARCHAR(300)  NULL,
  instructions      VARCHAR(2000) NULL,
  -- Đặc tả bài trình bày (JSON) — nguồn sự thật duy nhất để render HTML/PDF.
  spec              JSON          NULL,
  -- Dàn ý (bước 1 của AI): nội dung từng trang + media + thiết kế, người dùng duyệt rồi mới dựng bài.
  outline           JSON          NULL,
  outline_version   INT UNSIGNED  NOT NULL DEFAULT 0,
  -- Khoá lạc quan: mỗi lần lưu tăng 1, lưu với version cũ → 409.
  spec_version      INT UNSIGNED  NOT NULL DEFAULT 0,
  slide_count       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  thumbnail_asset_id CHAR(36)     NULL,
  error_message     VARCHAR(500)  NULL,
  created_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  published_at      DATETIME(3)   NULL,
  PRIMARY KEY (id),
  KEY ix_presentations_tenant_updated (tenant_id, updated_at),
  KEY ix_presentations_public (visibility, status, published_at),
  CONSTRAINT fk_presentations_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS assets (
  id               CHAR(36)      NOT NULL,
  tenant_id        CHAR(36)      NOT NULL,
  presentation_id  CHAR(36)      NOT NULL,
  -- image: ảnh trong slide · thumbnail: ảnh bìa bài · video: video tải lên · logo: logo (gốc + bản tách nền) · poster: ảnh bìa video/YouTube
  kind             ENUM('image','thumbnail','video','logo','poster') NOT NULL DEFAULT 'image',
  mime             VARCHAR(80)   NOT NULL,
  bytes            INT UNSIGNED  NOT NULL,
  width            SMALLINT UNSIGNED NULL,
  height           SMALLINT UNSIGNED NULL,
  -- Đường dẫn tương đối bên trong thư mục private của tenant, do server tự sinh (không lấy tên client).
  storage_key      VARCHAR(255)  NOT NULL,
  original_name    VARCHAR(255)  NULL,
  created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_assets_tenant (tenant_id),
  KEY ix_assets_presentation (presentation_id, kind),
  CONSTRAINT fk_assets_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_assets_presentation FOREIGN KEY (presentation_id) REFERENCES presentations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Phiên đăng nhập lưu phía server (express-session + store tự viết src/repositories/sessionStore.js).
CREATE TABLE IF NOT EXISTS sessions (
  session_id  VARCHAR(128) NOT NULL,
  expires     BIGINT UNSIGNED NOT NULL,
  data        MEDIUMTEXT   NOT NULL,
  PRIMARY KEY (session_id),
  KEY ix_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Nhật ký kiểm toán: ai làm gì, khi nào. Không có API sửa/xoá.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id     CHAR(36)      NULL,
  action       VARCHAR(64)   NOT NULL,
  target_type  VARCHAR(32)   NULL,
  target_id    VARCHAR(64)   NULL,
  result       ENUM('success','failure') NOT NULL,
  ip           VARCHAR(64)   NULL,
  meta         JSON          NULL,
  created_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_actor (actor_id, created_at),
  KEY ix_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS schema_changelog (
  name        VARCHAR(190) NOT NULL,
  applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO schema_changelog (name) VALUES ('schema.sql@2026-10-05-baseline');
-- Baseline đã gồm các changelog sau (cài mới không cần chạy lại):
INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261005_170000.sql');
