/**
 * HamHome 鏁版嵁搴?Schema (Drizzle ORM + SQLite)
 */
import { 
  sqliteTable, 
  text, 
  integer, 
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============ 鐢ㄦ埛琛?============
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  avatar: text('avatar'),
  aiProvider: text('ai_provider'),
  aiApiKey: text('ai_api_key'),
  aiBaseUrl: text('ai_base_url'),
  aiModel: text('ai_model'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ 涔︾琛?============
export const bookmarks = sqliteTable('bookmarks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  content: text('content'),
  favicon: text('favicon'),
  collectionId: text('collection_id').references(() => collections.id, { onDelete: 'set null' }),
  snapshotKey: text('snapshot_key'),
  waybackUrl: text('wayback_url'),
  vectorId: text('vector_id'),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('bookmarks_user_id_idx').on(table.userId),
  urlIdx: index('bookmarks_url_idx').on(table.url),
  collectionIdIdx: index('bookmarks_collection_id_idx').on(table.collectionId),
  userUrlUnique: uniqueIndex('bookmarks_user_url_unique').on(table.userId, table.url),
}));

// ============ 鍒嗙被琛?============
export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  parentId: text('parent_id').references((): AnySQLiteColumn => collections.id, { onDelete: 'cascade' }),
  order: integer('order').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('collections_user_id_idx').on(table.userId),
}));

// ============ 鏍囩琛?============
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('tags_user_id_idx').on(table.userId),
  userNameUnique: uniqueIndex('tags_user_name_unique').on(table.userId, table.name),
}));

// ============ 涔︾-鏍囩鍏宠仈琛?============
export const bookmarksTags = sqliteTable('bookmarks_tags', {
  bookmarkId: text('bookmark_id').notNull().references(() => bookmarks.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: uniqueIndex('bookmarks_tags_pk').on(table.bookmarkId, table.tagId),
}));

// ============ Relations ============
export const usersRelations = relations(users, ({ many }) => ({
  bookmarks: many(bookmarks),
  collections: many(collections),
  tags: many(tags),
}));

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  collection: one(collections, {
    fields: [bookmarks.collectionId],
    references: [collections.id],
  }),
  bookmarksTags: many(bookmarksTags),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
  parent: one(collections, {
    fields: [collections.parentId],
    references: [collections.id],
    relationName: 'parentChild',
  }),
  children: many(collections, { relationName: 'parentChild' }),
  bookmarks: many(bookmarks),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  bookmarksTags: many(bookmarksTags),
}));

export const bookmarksTagsRelations = relations(bookmarksTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarksTags.bookmarkId],
    references: [bookmarks.id],
  }),
  tag: one(tags, {
    fields: [bookmarksTags.tagId],
    references: [tags.id],
  }),
}));

// ============ 璧勮鏃ユ姤锛氭暟鎹簮锛圧SS / 鎸囧畾 URL锛?===========
export const digestSources = sqliteTable('digest_sources', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** rss | url */
  kind: text('kind').notNull(),
  url: text('url').notNull(),
  title: text('title'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('digest_sources_user_id_idx').on(table.userId),
}));

// ============ 璧勮鏃ユ姤锛氱敤鎴锋姇閫掍笌涓€у寲 ============
export const digestUserSettings = sqliteTable('digest_user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  deliveryEmail: text('delivery_email'),
  /** JSON 鏁扮粍锛氬叧娉ㄥ叧閿瘝 */
  keywordsJson: text('keywords_json'),
  /** topics_json: [{ label, keywords[], maxItems? }] */
  topicsJson: text('topics_json'),
  /** 鏈湴灏忔椂 0-23锛屽湪璇ュ皬鏃跺墠瀹屾垚澶勭悊 */
  deliverHourLocal: integer('deliver_hour_local').default(8),
  quietOnHolidays: integer('quiet_on_holidays', { mode: 'boolean' }).default(false),
  /** 鍙€夛細MQTT 璁惧/涓婚鏍囪瘑锛岀敱澶栭儴 Broker 娑堣垂 */
  mqttTopicSuffix: text('mqtt_topic_suffix'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ 璧勮鏃ユ姤锛氫竴娆＄敓鎴愪换鍔★紙鎶撳彇鈫掓憳瑕佲啋鎶曢€掞級============
export const digestRuns = sqliteTable('digest_runs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** pending | running | done | failed */
  status: text('status').notNull().default('pending'),
  summaryHtml: text('summary_html'),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('digest_runs_user_id_idx').on(table.userId),
  statusIdx: index('digest_runs_status_idx').on(table.status),
}));

export const digestSourcesRelations = relations(digestSources, ({ one }) => ({
  user: one(users, {
    fields: [digestSources.userId],
    references: [users.id],
  }),
}));

export const digestUserSettingsRelations = relations(digestUserSettings, ({ one }) => ({
  user: one(users, {
    fields: [digestUserSettings.userId],
    references: [users.id],
  }),
}));

export const digestRunsRelations = relations(digestRuns, ({ one }) => ({
  user: one(users, {
    fields: [digestRuns.userId],
    references: [users.id],
  }),
}));



// ============ 资讯日报：订阅（邮箱 + 时区 + 本地时间 + 主题）============
export const digestSubscriptions = sqliteTable('digest_subscriptions', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  /** HH:mm */
  deliverTimeLocal: text('deliver_time_local').notNull(),
  /** topics_json: [{ label, keywords[], maxItems? }] */
  topicsJson: text('topics_json').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(false),
  /** 单封邮件总条数上限 */
  maxItemsPerEmail: integer('max_items_per_email').default(20),
  /** 单主题条数上限 */
  maxItemsPerTopic: integer('max_items_per_topic').default(10),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  ownerEnabledIdx: index('digest_subscriptions_owner_enabled_idx').on(table.ownerUserId, table.enabled),
  enabledIdx: index('digest_subscriptions_enabled_idx').on(table.enabled),
}));

export const digestSubscriptionsRelations = relations(digestSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [digestSubscriptions.ownerUserId],
    references: [users.id],
  }),
}));

