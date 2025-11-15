-- 清理数据库中的"主播解说"频道数据
-- 可以直接在数据库客户端执行，或通过 MySQL 命令行执行

-- 1. 查看要删除的记录（先执行这个，确认要删除的数据）
SELECT id, stream_id, channel_name, steam_id, domain 
FROM stream_mappings 
WHERE channel_name LIKE '%主播%' 
   OR channel_name LIKE '%解说%'
   OR channel_name LIKE '%commentator%'
   OR channel_name LIKE '%host%';

-- 2. 删除 stream_mappings 表中的"主播解说"记录
DELETE FROM stream_mappings 
WHERE channel_name LIKE '%主播%' 
   OR channel_name LIKE '%解说%'
   OR channel_name LIKE '%commentator%'
   OR channel_name LIKE '%host%';

-- 3. 查看 live_sources 表中的"主播解说"记录
SELECT id, match_id, name, url 
FROM live_sources 
WHERE name LIKE '%主播%' 
   OR name LIKE '%解说%'
   OR name LIKE '%commentator%'
   OR name LIKE '%host%'
LIMIT 100;

-- 4. 删除 live_sources 表中的"主播解说"记录
DELETE FROM live_sources 
WHERE name LIKE '%主播%' 
   OR name LIKE '%解说%'
   OR name LIKE '%commentator%'
   OR name LIKE '%host%';

-- 5. 查看清理后的统计
SELECT COUNT(*) as total_mappings FROM stream_mappings;
SELECT COUNT(*) as total_sources FROM live_sources;

