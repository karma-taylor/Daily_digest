/**
 * HamHome 数据库 Schema (Drizzle ORM + SQLite)
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

// ============ 用户表 ============
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

// ============ 书签表 ============
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

// ============ 分类表 ============
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

// ============ 标签表 ============
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('tags_user_id_idx').on(table.userId),
  userNameUnique: uniqueIndex('tags_user_name_unique').on(table.userId, table.name),
}));

// ============ 书签-标签关联表 ============
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

// ============ 资讯日报：数据源（RSS / 指定 URL）============
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

// ============ 资讯日报：用户投递与个性化 ============
export const digestUserSettings = sqliteTable('digest_user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  deliveryEmail: text('delivery_email'),
  /** JSON 数组：关注关键词 */
  keywordsJson: text('keywords_json'),
  /** 本地小时 0-23，在该小时前完成处理 */
  deliverHourLocal: integer('deliver_hour_local').default(8),
  quietOnHolidays: integer('quiet_on_holidays', { mode: 'boolean' }).default(false),
  /** 可选：MQTT 设备/主题标识，由外部 Broker 消费 */
  mqttTopicSuffix: text('mqtt_topic_suffix'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ 资讯日报：一次生成任务（抓取→摘要→投递）============
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

