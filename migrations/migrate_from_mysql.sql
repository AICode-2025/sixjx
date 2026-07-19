-- ========================================
-- MySQL → D1 数据迁移脚本
-- 用法: 在 VPS 上导出 MySQL 数据后，
--       转换为 SQLite 兼容格式后再导入 D1
-- ========================================

-- 1. VPS 上导出 MySQL 数据
-- mysqldump -u 1688vip_xyz -p'cME5k5Jiw1h72kYs' 1688vip_xyz activation_codes --no-create-info --compatible=ansi --skip-extended-insert > activation_codes.sql
-- mysqldump -u 1688vip_xyz -p'cME5k5Jiw1h72kYs' 1688vip_xyz sync_reports --no-create-info --compatible=ansi --skip-extended-insert > sync_reports.sql

-- 2. 手动替换:
--    ` → (去掉)
--    '0000-00-00 00:00:00' → NULL
--    \' → ''
--    去掉 MySQL 特有语法

-- 3. 将清洗后的 SQL 合并到此文件，执行:
-- npx wrangler d1 execute admin-znjx-db --file=./migrations/migrate_from_mysql.sql

-- ========================================
-- 示例数据（实际使用时替换为 VPS 导出的数据）
-- ========================================

-- 管理员账户 (密码: 123456，实际导入时使用 bcrypt hash)
-- INSERT INTO users (username, password, role) VALUES ('admin', '$2b$10$...', 'super_admin');

-- 激活码
-- INSERT INTO activation_codes (id, code, device_id, device_name, status, activated_at, created_at)
-- VALUES (1, 'ABCDEFGHIJKLMNOP', NULL, NULL, 'unactivated', NULL, '2026-01-01 00:00:00');

-- 同步报表
-- INSERT INTO sync_reports (activation_code, period_no, lottery_id, total_bet, total_payout, total_profit, report_data, synced_at)
-- VALUES ('ABCDEFGHIJKLMNOP', '2026001', 1, 1000, 500, 500, '{}', '2026-01-01 00:00:00');
