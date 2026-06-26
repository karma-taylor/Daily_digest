/**
 * 璧勮鏃ユ姤锛堜簯绔墿灞曪級鈥?涓?packages/db 涓?digest_* 琛ㄥ搴?
 */

export type DigestSourceKind = 'rss' | 'url' | 'youtube_channel' | 'x_profile';

export type DigestRunStatus = 'pending' | 'running' | 'done' | 'failed';

export interface DigestSourceDTO {
  id: string;
  userId: string;
  kind: DigestSourceKind;
  url: string;
  title: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigestTopicConfigDTO {
  label: string;
  keywords: string[];
  maxItems?: number;
  watchlist?: DigestWatchTargetDTO[];
}

export interface DigestWatchTargetSourceDTO {
  kind: DigestSourceKind;
  url: string;
}

export interface DigestWatchTargetDTO {
  name: string;
  entityType: 'person' | 'organization';
  aliases: string[];
  sources: DigestWatchTargetSourceDTO[];
}

export interface DigestUserSettingsDTO {
  userId: string;
  timezone: string;
  deliveryEmail: string | null;
  keywords: string[];
  topics?: DigestTopicConfigDTO[];
  deliverHourLocal: number;
  /** 鍘嗗彶瀛楁锛沇orker 瀹氭椂浠诲姟宸蹭笉鍐嶅洜涓浗澶ч檰鑺傚亣鏃ュ仠鍙戙€?*/
  quietOnHolidays: boolean;
  mqttTopicSuffix: string | null;
  updatedAt: Date;
}

export interface DigestRunDTO {
  id: string;
  userId: string;
  status: DigestRunStatus;
  summaryHtml: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface DigestSubscriptionDTO {
  id: string;
  ownerUserId: string;
  email: string;
  timezone: string;
  deliverTimeLocal: string;
  topics: DigestTopicConfigDTO[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
