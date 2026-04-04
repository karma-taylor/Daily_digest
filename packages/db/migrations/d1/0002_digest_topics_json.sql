-- 用户日报：多主题分桶（伊朗局势 / AI 等），JSON 存于 topics_json
ALTER TABLE digest_user_settings ADD COLUMN topics_json TEXT;
