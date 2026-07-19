-- 管理员用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'super_admin',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 激活码表
CREATE TABLE IF NOT EXISTS activation_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  device_id TEXT,
  device_name TEXT,
  status TEXT DEFAULT 'unactivated',
  activated_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activation_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_status ON activation_codes(status);

-- 同步报表表
CREATE TABLE IF NOT EXISTS sync_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activation_code TEXT NOT NULL,
  period_no TEXT NOT NULL,
  lottery_id INTEGER DEFAULT 1,
  total_bet REAL DEFAULT 0,
  total_payout REAL DEFAULT 0,
  total_profit REAL DEFAULT 0,
  report_data TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_period ON sync_reports(period_no);
CREATE INDEX IF NOT EXISTS idx_sync_code ON sync_reports(activation_code);
CREATE INDEX IF NOT EXISTS idx_sync_synced_at ON sync_reports(synced_at);

-- 同步报表明细表（按号码纬度）
CREATE TABLE IF NOT EXISTS sync_report_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  lottery_type TEXT,
  period_no TEXT NOT NULL,
  bet_number TEXT,
  play_type TEXT,
  total_amount REAL DEFAULT 0,
  total_payout REAL DEFAULT 0,
  total_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_item_period ON sync_report_items(period_no);
CREATE INDEX IF NOT EXISTS idx_item_lottery ON sync_report_items(lottery_type);
CREATE INDEX IF NOT EXISTS idx_item_number ON sync_report_items(bet_number);
CREATE INDEX IF NOT EXISTS idx_item_report ON sync_report_items(report_id);

-- 系统配置表
CREATE TABLE IF NOT EXISTS api_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL
);

-- 插入默认管理员
INSERT OR IGNORE INTO users (username, password, role) VALUES
  ('admin', '123456', 'super_admin');
