#!/usr/bin/env bash
# Khôi phục DB + tệp từ 1 bản sao lưu của backup.sh (Gate DevOps — docs/RUNBOOK.md §Khôi phục). GHI ĐÈ dữ liệu hiện tại của stack.
#   scripts/ops/restore.sh /srv/backup/misa-presentation/20261012T090000Z --yes
# Các bước: kiểm SHA256 → dừng app → nạp DB (bảng có trong bản sao được thay thế) → xoá phiên đăng nhập (mọi người đăng nhập lại)
# → thay thư mục tệp private → bật app → chờ healthy → verify-storage.js (DB ↔ tệp). In thời gian từng bước (đo RTO).
# Git Bash (Windows) tự đổi đường dẫn kiểu /data trong tham số — tắt để chạy giống Linux.
export MSYS_NO_PATHCONV=1
set -euo pipefail
DIR=${1:?Cách dùng: scripts/ops/restore.sh <thư mục bản sao lưu> --yes}
[ "${2:-}" = "--yes" ] || { echo "Khôi phục sẽ GHI ĐÈ dữ liệu hiện tại của project ${PROJECT:-misa-presentation}. Chạy lại kèm --yes để xác nhận." >&2; exit 2; }
PROJECT=${PROJECT:-misa-presentation}
# shellcheck disable=SC2086
compose() { docker compose -p "$PROJECT" ${COMPOSE_FILES:-} "$@"; }
t0=$(date +%s)
step() { echo "[$(( $(date +%s) - t0 ))s] $*"; }

step "kiểm checksum"
(cd "$DIR" && sha256sum -c SHA256SUMS)

step "dừng app (MySQL vẫn chạy)"
compose stop app

step "nạp DB"
gunzip -c "$DIR/db.sql.gz" | compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" 2>/dev/null'
compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "DELETE FROM sessions" 2>/dev/null'

step "thay thư mục tệp private"
compose run --rm --no-deps -T --entrypoint sh app -c 'rm -rf /data/storage/private.restoring && mkdir -p /data/storage/private.restoring && tar -C /data/storage/private.restoring -xzf - && rm -rf /data/storage/private && mv /data/storage/private.restoring/private /data/storage/private && rm -rf /data/storage/private.restoring' < "$DIR/storage.tgz"

step "bật app"
compose start app
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q app)")" = healthy ] && break
  sleep 2
done

step "kiểm toàn vẹn DB ↔ tệp"
compose exec -T app node scripts/verify-storage.js
step "XONG — RTO đo được: $(( $(date +%s) - t0 )) giây"
