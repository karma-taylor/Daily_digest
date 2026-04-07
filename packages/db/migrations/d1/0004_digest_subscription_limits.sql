ALTER TABLE digest_subscriptions ADD COLUMN max_items_per_email INTEGER DEFAULT 20;
ALTER TABLE digest_subscriptions ADD COLUMN max_items_per_topic INTEGER DEFAULT 10;
