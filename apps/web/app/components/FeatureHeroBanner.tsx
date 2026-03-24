'use client';

import Image from 'next/image';
import { Button } from '@hamhome/ui';
import { Download, Github } from 'lucide-react';
import { GITHUB_RELEASE_URL, openRecommendedDownload } from '@/app/lib/download';

interface FeatureHeroBannerProps {
  isEn: boolean;
  isDark: boolean;
}

const GITHUB_REPO_URL = 'https://github.com/bingoYB/ham_home';
const DARK_PREVIEW_IMAGE_URL = 'https://i.imgur.com/tBKx7CM.png';
const LIGHT_PREVIEW_IMAGE_URL = 'https://i.imgur.com/rPFA4EL.png';

export function FeatureHeroBanner({ isEn, isDark }: FeatureHeroBannerProps) {
  const previewImageUrl = isDark ? DARK_PREVIEW_IMAGE_URL : LIGHT_PREVIEW_IMAGE_URL;

  const texts = {
    brand: 'HamHome',
    title: isEn ? 'AI-Powered Bookmark Workspace' : 'AI 驱动的书签管理器',
    desc: isEn
      ? 'Conversational search, smart categorization, sidebar management, and one-click import/export with local-first privacy.'
      : '支持 AI 对话搜索、智能分类、侧边栏管理、浏览器书签一键导入导出，并坚持本地优先的隐私保护。',
    downloadButton: isEn ? 'Install & Download' : '下载安装',
    githubButton: 'GitHub',
  };

  return (
    <section className="mb-10">
      <div className="relative overflow-hidden rounded-[32px] bg-transparent px-6 py-10 sm:px-10 sm:py-12 lg:px-14">
        <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="max-w-xl">
            <div className="flex items-center gap-3 sm:gap-4">
              <Image
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon/128.png`}
                alt="HamHome Logo"
                width={56}
                height={56}
                className="h-11 w-11 shrink-0 rounded-xl shadow-sm sm:h-14 sm:w-14"
              />
              <p className="text-5xl font-black tracking-tight text-[#ff5b24]">{texts.brand}</p>
            </div>
            <h2 className="mt-4 text-3xl font-bold leading-tight text-foreground sm:text-5xl">
              {texts.title}
            </h2>
            <p className="mt-5 text-lg text-muted-foreground sm:text-2xl">{texts.desc}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2 bg-[#ff7a32] text-white hover:bg-[#ff6b1c]">
                <a
                  href={GITHUB_RELEASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    openRecommendedDownload();
                  }}
                >
                  <Download className="h-4 w-4" />
                  {texts.downloadButton}
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="gap-2 border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                  {texts.githubButton}
                </a>
              </Button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[420px]">
            <img
              src={previewImageUrl}
              alt={isEn ? 'HamHome extension preview' : 'HamHome 插件功能预览'}
              className="w-full rounded-2xl shadow-lg"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
