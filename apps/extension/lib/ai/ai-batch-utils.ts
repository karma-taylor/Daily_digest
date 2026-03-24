import { aiClient } from './client';
import { bookmarkStorage } from '@/lib/storage/bookmark-storage';
import { parseCategoryPath } from '@/components/common/CategoryTree';
import type { LocalCategory } from '@/types';

// 获取页面内容用于 AI 分析
export const fetchPageContentForAI = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000), // 10秒超时
    });
    if (!response.ok) return '';
    const html = await response.text();
    // 简单提取文本内容
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // 移除 script 和 style
    doc.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
    const text = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return text.slice(0, 5000); // 限制长度
  } catch {
    return '';
  }
};

// 匹配分类（精确 + 模糊，优先叶子节点）
export const matchCategoryByName = (
  categoryName: string,
  categories: LocalCategory[]
): { matched: boolean; categoryId: string | null } => {
  const searchName = categoryName.toLowerCase();
  
  // 判断是否为叶子节点（没有子分类）
  const parentIds = new Set(categories.map(c => c.parentId).filter(Boolean));
  const isLeaf = (c: LocalCategory) => !parentIds.has(c.id);
  
  // 精确匹配 - 优先叶子节点
  const exactMatches = categories.filter(c => c.name.toLowerCase() === searchName);
  if (exactMatches.length > 0) {
    const leafMatch = exactMatches.find(isLeaf);
    return { matched: true, categoryId: (leafMatch || exactMatches[0]).id };
  }

  // 模糊匹配 - 优先叶子节点
  const fuzzyMatches = categories.filter(
    c => c.name.toLowerCase().includes(searchName) || searchName.includes(c.name.toLowerCase())
  );
  if (fuzzyMatches.length > 0) {
    const leafMatch = fuzzyMatches.find(isLeaf);
    return { matched: true, categoryId: (leafMatch || fuzzyMatches[0]).id };
  }

  return { matched: false, categoryId: null };
};

// 创建 AI 推荐的分类（支持层级路径如 "技术 > 前端"）
export const createAIRecommendedCategory = async (
  categoryPath: string,
  currentCategories: LocalCategory[]
): Promise<{ categoryId: string | null; newCategories: LocalCategory[] }> => {
  try {
    const parts = parseCategoryPath(categoryPath);
    if (parts.length === 0) {
      return { categoryId: null, newCategories: [] };
    }

    let allCategories = [...currentCategories];
    let parentId: string | null = null;
    let finalCategory: LocalCategory | null = null;
    const newCategories: LocalCategory[] = [];

    // 逐层查找或创建分类
    for (const partName of parts) {
      const trimmedName = partName.trim();
      if (!trimmedName) continue;

      // 在当前层级查找是否已存在
      const existing = allCategories.find(
        c => c.name.toLowerCase() === trimmedName.toLowerCase() && c.parentId === parentId
      );

      if (existing) {
        parentId = existing.id;
        finalCategory = existing;
        continue;
      }

      // 创建新分类（并发导入时可能有竞态，失败后尝试回读）
      try {
        const newCat = await bookmarkStorage.createCategory(trimmedName, parentId);
        newCategories.push(newCat);
        parentId = newCat.id;
        finalCategory = newCat;
        allCategories = [...allCategories, newCat];
      } catch {
        const latestCategories = await bookmarkStorage.getCategories();
        const fallback = latestCategories.find(
          c => c.name.toLowerCase() === trimmedName.toLowerCase() && c.parentId === parentId
        );

        if (!fallback) {
          throw new Error(`Failed to create or resolve category: ${trimmedName}`);
        }

        parentId = fallback.id;
        finalCategory = fallback;
        allCategories = latestCategories;
      }
    }

    return {
      categoryId: finalCategory?.id || null,
      newCategories,
    };
  } catch (err) {
    console.error('[AI Batch Utils] Failed to create category:', err);
    return { categoryId: null, newCategories: [] };
  }
};

// AI 分析书签
export const analyzeBookmarkWithAI = async (
  url: string,
  title: string,
  currentCategories: LocalCategory[],
  existingTags: string[] = [],
  shouldFetchPageContent = false
): Promise<{ 
  description: string; 
  categoryId: string | null; 
  tags: string[]; 
  newCategories: LocalCategory[];
}> => {
  try {
    await aiClient.loadConfig();
    if (!aiClient.isConfigured()) {
      return { description: '', categoryId: null, tags: [], newCategories: [] };
    }

    // 构建页面内容
    let content = '';
    if (shouldFetchPageContent) {
      content = await fetchPageContentForAI(url);
    }

    const { hostname } = new URL(url);

    const result = await aiClient.analyzeComplete({
      pageContent: {
        url,
        title,
        content,
        textContent: content,
        excerpt: '',
        metadata: {},
        isReaderable: !!content,
        favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
      },
      userCategories: currentCategories,
      existingTags,
    });

    // 匹配或创建分类
    let categoryId: string | null = null;
    let newCategories: LocalCategory[] = [];
    
    if (result.category) {
      // 先尝试匹配现有分类
      const matchResult = matchCategoryByName(result.category, currentCategories);
      if (matchResult.matched) {
        categoryId = matchResult.categoryId;
      } else {
        // 如果没有匹配到，创建新分类
        const createResult = await createAIRecommendedCategory(result.category, currentCategories);
        categoryId = createResult.categoryId;
        newCategories = createResult.newCategories;
      }
    }

    return {
      description: result.summary || '',
      categoryId,
      tags: result.tags || [],
      newCategories,
    };
  } catch (err) {
    console.error('[AI Batch Utils] AI analysis failed:', err);
    return { description: '', categoryId: null, tags: [], newCategories: [] };
  }
};
