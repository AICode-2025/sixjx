-- 激活码增加发放人字段（方案A：区分激活码是谁放出去的）
ALTER TABLE activation_codes ADD COLUMN issuer TEXT DEFAULT '';
