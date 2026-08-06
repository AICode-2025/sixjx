-- 安全加固
-- 1) 激活码增加服务端签发设备令牌列（配合 /api/activation/register 返回的 device_token）
ALTER TABLE activation_codes ADD COLUMN device_token TEXT;

-- 2) 同步报表幂等：同一激活码+彩种+期号只保留一条主报表（澳门/香港同号期互不干扰）
--    先清理历史重复（保留最早一条），再建唯一索引
DELETE FROM sync_reports
WHERE id NOT IN (
  SELECT MIN(id) FROM sync_reports GROUP BY activation_code, period_no, lottery_id
);
-- 旧唯一键 (activation_code, period_no) 升级为含彩种的三元组，先删旧索引再建新索引
DROP INDEX IF EXISTS idx_sync_reports_code_period;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_reports_code_period_lottery
  ON sync_reports(activation_code, period_no, lottery_id);