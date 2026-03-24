export type BrowserType = 'chrome' | 'edge' | 'firefox' | 'other';

export type DownloadChannelId = 'chrome' | 'edge' | 'firefox' | 'offline';

export interface DownloadChannel {
  id: DownloadChannelId;
  label: { en: string; zh: string };
  url: string | null;
  published: boolean;
}

export const GITHUB_RELEASE_URL = 'https://github.com/bingoYB/ham_home/releases';

const DOWNLOAD_CHANNELS: DownloadChannel[] = [
  {
    id: 'chrome',
    label: { en: 'Chrome Web Store', zh: 'Chrome 商店' },
    url: null,
    published: false,
  },
  {
    id: 'edge',
    label: { en: 'Edge Add-ons', zh: 'Edge 扩展商店' },
    url: 'https://microsoftedge.microsoft.com/addons/detail/hamhome-smart-bookmark-/nmbdgbicgagmokdmohgngcbhkaicfnpi',
    published: true,
  },
  {
    id: 'firefox',
    label: { en: 'Firefox Add-ons', zh: 'Firefox 扩展商店' },
    url: 'https://addons.mozilla.org/zh-CN/firefox/addon/hamhome-%E6%99%BA%E8%83%BD%E4%B9%A6%E7%AD%BE%E5%8A%A9%E6%89%8B/',
    published: true,
  },
  {
    id: 'offline',
    label: { en: 'Offline Package', zh: '离线安装包' },
    url: GITHUB_RELEASE_URL,
    published: true,
  },
];

export function detectBrowser(): BrowserType {
  if (typeof navigator === 'undefined') {
    return 'chrome';
  }

  const ua = navigator.userAgent;
  if (ua.includes('Edg')) return 'edge';
  if (ua.includes('Firefox')) return 'firefox';
  if (ua.includes('Chrome')) return 'chrome';
  return 'other';
}

export function getDownloadChannels(): DownloadChannel[] {
  return DOWNLOAD_CHANNELS;
}

export function getRecommendedDownloadChannel(
  channels: DownloadChannel[] = DOWNLOAD_CHANNELS,
  browser: BrowserType = detectBrowser()
): DownloadChannel {
  return channels.find((channel) => channel.id === browser) ?? channels[0];
}

export function resolveDownloadUrl(channel: DownloadChannel): string {
  return channel.published && channel.url ? channel.url : GITHUB_RELEASE_URL;
}

export function getRecommendedDownloadUrl(channels: DownloadChannel[] = DOWNLOAD_CHANNELS): string {
  const channel = getRecommendedDownloadChannel(channels);
  return resolveDownloadUrl(channel);
}

export function openDownloadUrl(url: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openRecommendedDownload(channels: DownloadChannel[] = DOWNLOAD_CHANNELS): void {
  openDownloadUrl(getRecommendedDownloadUrl(channels));
}
