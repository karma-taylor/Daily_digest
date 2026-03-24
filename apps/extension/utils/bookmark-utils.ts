/**
 * 书签相关工具函数
 */
import type { LocalCategory } from '@/types';

/**
 * 获取分类全路径（用 > 连接）
 */
export function getCategoryPath(
  categoryId: string | null,
  categories: LocalCategory[],
  uncategorizedLabel: string
): string {
  if (!categoryId) return uncategorizedLabel;

  const path: string[] = [];
  let currentId: string | null = categoryId;

  while (currentId) {
    const cat = categories.find((c) => c.id === currentId);
    if (!cat) break;
    path.unshift(cat.name);
    currentId = cat.parentId;
  }

  return path.length > 0 ? path.join(' > ') : uncategorizedLabel;
}

/**
 * 格式化日期显示
 */
export function formatDate(
  timestamp: number,
  language: string,
  todayLabel: string,
  yesterdayLabel: string
): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return todayLabel;
  if (days === 1) return yesterdayLabel;
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

/**
 * 分类颜色常量
 */
export const CATEGORY_COLOR = 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';

/**
 * 获取安全的 favicon URL，避免加载失败导致前端控制台出现 404/网络错误。
 * 在 Chromium 扩展中，可以利用 _favicon API 自动获取并由浏览器处理加载失败（回退为默认图标）。
 */
export async function getSafeFaviconUrl(url: string, fallbackFavicon?: string | null): Promise<string | null> {
  // 如果是 base64 数据，直接返回，绝对不会导致网络报错
  if (fallbackFavicon && fallbackFavicon.startsWith('data:image')) {
    return fallbackFavicon;
  }

  // content ui 里跳过 _favicon API
  const isContentUI = typeof window !== 'undefined' && !window.location.protocol.startsWith('chrome-extension');

  // 检查是否在支持 _favicon API 的扩展环境中运行
  if (!isContentUI && typeof chrome !== 'undefined' && chrome.runtime?.id) {
    try {
      // Firefox 不支持 Chrome 的这个内部 API
      const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
      if (!isFirefox) {
        const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
        faviconUrl.searchParams.set('pageUrl', url);
        faviconUrl.searchParams.set('size', '32');
        
        const targetUrl = faviconUrl.toString();
        
        // _favicon API 之后增加一步： fetch 下url , 查看是否能正常访问，不行再返回 fallbackFavicon
        try {
          const res = await fetch(targetUrl);
          if (res.ok) {
            return targetUrl;
          }
        } catch (err) {
          // fetch 失败（例如网络错误），忽略并走后续 fallback
        }
      }
    } catch {
      // 忽略可能的解析错误
    }
  }

  return fallbackFavicon || null;
}
