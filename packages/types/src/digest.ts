/**
 * 资讯日报（云端扩展）— 与 packages/db 中 digest_* 表对应
 */

export type DigestSourceKind = 'rss' | 'url';

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
}

export interface DigestUserSettingsDTO {
  userId: string;
  timezone: string;
  deliveryEmail: string | null;
  keywords: string[];
  topics?: DigestTopicConfigDTO[];
  deliverHourLocal: number;
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
