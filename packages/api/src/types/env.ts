/**
 * Cloudflare Workers 环境变量类型定义
 */
export interface Env {
  /** 启用资讯日报与现有 Drizzle 表需绑定 D1 */
  DB?: D1Database;
  /** 资讯日报异步流水线 */
  DIGEST_QUEUE?: Queue;

  ENVIRONMENT: 'development' | 'production';

  /** OpenAI 兼容 API，如 https://api.openai.com/v1 或 https://api.deepseek.com/v1 */
  LLM_API_BASE?: string;
  /** wrangler secret put LLM_API_KEY */
  LLM_API_KEY?: string;
  LLM_MODEL?: string;

  /** Resend：secret put RESEND_API_KEY；RESEND_FROM 放在 wrangler [vars]（已验证域或测试发件人） */
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;

  /** MQTT：HTTPS 桥接地址（自建转发到 Broker） */
  MQTT_NOTIFY_URL?: string;
  MQTT_NOTIFY_SECRET?: string;
}

