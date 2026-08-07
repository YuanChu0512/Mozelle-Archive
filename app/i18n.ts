import type {
  Article,
  ArticleGalleryItem,
  ArticleSource,
  ArticleTranslation,
  Filter,
} from "./article-data";

export type Language = "zh" | "en";

type EnglishFallback = Required<Pick<ArticleTranslation, "title" | "summary" | "tags" | "content">> &
  Pick<ArticleTranslation, "gallery" | "sources">;

export const categoryLabels: Record<Language, Record<Filter, string>> = {
  zh: {
    全部: "全部",
    电子: "电子",
    超频: "超频",
    硬件: "硬件",
    游戏与次元: "游戏与次元",
  },
  en: {
    全部: "All",
    电子: "Electronics",
    超频: "Overclocking",
    硬件: "Hardware",
    游戏与次元: "Games & ACG",
  },
};

export const homeCopy = {
  zh: {
    nav: ["首页", "技术文章", "超频笔记", "次元收藏", "关于"],
    openMenu: "打开导航",
    closeMenu: "关闭导航",
    mainNav: "主导航",
    admin: "管理后台",
    adminLabel: "打开管理后台",
    searchLabel: "搜索站内内容",
    searchTitle: "搜索 Mozelle Archive",
    searchPlaceholder: "搜索文章、实验记录与收藏",
    searchHint: "输入关键词开始搜索",
    searchEmpty: "没有找到匹配内容",
    searchClose: "关闭搜索",
    searchArticle: "文章",
    searchLab: "实验记录",
    searchCollection: "收藏",
    languageLabel: "切换到英文",
    themeDayLabel: "切换到 Mon3tr 黑夜主题",
    themeNightLabel: "切换到伊蕾娜白昼主题",
    heroDay: ["把沿途风景收进纸页，", "让日常也有回声。"],
    heroNight: ["等夜色安静下来，", "写下未成形的念头。"],
    bio: "电子专业学生，记录硬件、超频、游戏、Cosplay 与二次元世界。",
    heroBioSuffix: "把拆解问题的过程，写成可以反复查阅的记录。",
    enterBlog: "进入博客",
    labAction: "查看实验记录",
    interestsLabel: "兴趣领域",
    latest: "最新文章",
    latestLabel: (title: string) => `阅读最新文章：${title}`,
    scrollLabel: "向下浏览文章",
    articlesTitle: "技术文章",
    articlesIntro: "从原理出发，也保留每一次调试中真正有用的细节。",
    filterLabel: "文章分类筛选",
    read: "阅读",
    labTitle: "实验与超频笔记",
    labIntro: "不只展示结果，也记录失败参数、判断过程和下一步。",
    collectionTitle: "次元收藏",
    collectionIntro: "角色、游戏与 Cosplay，是技术之外同样认真保存的世界。",
    aboutTitle: "你好，我是 Mozelle。",
    aboutBody: "这个博客不是一份完成的说明书，而是一张持续生长的地图：保存走过的弯路，也标记下一次想抵达的地方。",
    continueReading: "继续阅读",
    tagline: "把所见、所想与所爱，收进一页页未完的档案。",
    backToTop: "返回顶部",
    labNotes: [
      ["内存超频", "频率、主次时序、训练与稳定性测试记录"],
      ["板级分析", "PMIC、DrMOS、MOSFET 与供电路径拆解"],
      ["显示制造", "切割、研磨、清洗、检查与设备参数笔记"],
    ],
    collections: [
      ["魔女之旅", "灰发、旅行与故事。白昼主题的灵感原点。"],
      ["Mon3tr", "源石、生体机械与锋利的绿色能量。"],
      ["Cosplay 记录", "造型、布光、拍摄与每一次角色表达。"],
      ["游戏档案", "喜欢的世界、机制，以及值得留下的瞬间。"],
    ],
  },
  en: {
    nav: ["Home", "Articles", "Lab Notes", "Collections", "About"],
    openMenu: "Open navigation",
    closeMenu: "Close navigation",
    mainNav: "Main navigation",
    admin: "Admin",
    adminLabel: "Open admin control panel",
    searchLabel: "Search this archive",
    searchTitle: "Search Mozelle Archive",
    searchPlaceholder: "Search articles, lab notes, and collections",
    searchHint: "Type a keyword to begin",
    searchEmpty: "No matching entries",
    searchClose: "Close search",
    searchArticle: "Article",
    searchLab: "Lab Note",
    searchCollection: "Collection",
    languageLabel: "Switch to Chinese",
    themeDayLabel: "Switch to the Mon3tr night theme",
    themeNightLabel: "Switch to the Elaina daylight theme",
    heroDay: ["I gather the scenes along the way into pages,", "so ordinary days may leave an echo."],
    heroNight: ["When the night settles into silence,", "I write down the thoughts still taking shape."],
    bio: "An electronics student documenting hardware, overclocking, games, cosplay, and ACG culture.",
    heroBioSuffix: "I turn the process of taking problems apart into notes worth revisiting.",
    enterBlog: "Enter the Archive",
    labAction: "View Lab Notes",
    interestsLabel: "Fields of interest",
    latest: "Latest Article",
    latestLabel: (title: string) => `Read the latest article: ${title}`,
    scrollLabel: "Scroll down to browse articles",
    articlesTitle: "Technical Articles",
    articlesIntro: "Starting from first principles while preserving the details that matter in real debugging.",
    filterLabel: "Filter articles by category",
    read: "Read",
    labTitle: "Experiments & Overclocking",
    labIntro: "Not just the result, but failed settings, diagnosis, and the next move.",
    collectionTitle: "Cross-Dimensional Archive",
    collectionIntro: "Characters, games, and cosplay—the worlds I preserve with the same care as technology.",
    aboutTitle: "Hello, I’m Mozelle.",
    aboutBody: "This blog is not a finished manual. It is a map that keeps growing: preserving the detours behind me and marking where I want to go next.",
    continueReading: "Continue Reading",
    tagline: "An unfinished archive of what I see, think, and love.",
    backToTop: "Back to Top",
    labNotes: [
      ["Memory Overclocking", "Frequency, timings, memory training, and stability test logs"],
      ["Board-Level Analysis", "PMIC, DrMOS, MOSFET, and power-path breakdowns"],
      ["Display Manufacturing", "Cutting, grinding, cleaning, inspection, and equipment notes"],
    ],
    collections: [
      ["Wandering Witch", "Silver hair, journeys, and stories—the origin of the daylight theme."],
      ["Mon3tr", "Originium, biomechanics, and razor-sharp green energy."],
      ["Cosplay Records", "Styling, lighting, photography, and every new interpretation of a character."],
      ["Game Archive", "The worlds, systems, and moments worth preserving."],
    ],
  },
} as const;

export const articleCopy = {
  zh: {
    homeLabel: "返回 Mozelle Archive 首页",
    back: "返回文章列表",
    backShort: "返回",
    themeLabel: "切换日间与夜间主题",
    languageLabel: "切换到英文",
    loading: "正在载入文章",
    missing: "没有找到这篇文章",
    missingBody: "文章可能尚未发布，或者地址已经发生变化。",
    other: "阅读其他文章",
    sources: "公开资料",
    evidence: "图像记录",
  },
  en: {
    homeLabel: "Return to the Mozelle Archive homepage",
    back: "Back to Articles",
    backShort: "Back",
    themeLabel: "Switch between day and night themes",
    languageLabel: "Switch to Chinese",
    loading: "Loading the article",
    missing: "Article not found",
    missingBody: "The article may not be published yet, or its address may have changed.",
    other: "Explore More Articles",
    sources: "Public References",
    evidence: "Visual Record",
  },
} as const;

const englishArticles: Record<string, EnglishFallback> = {};

function nonEmptyText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? value : undefined;
}

function nonEmptyTextList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function mergeGalleryTranslation(
  current: ArticleGalleryItem[] | undefined,
  live: ArticleGalleryItem[] | undefined,
  fallback: ArticleGalleryItem[] | undefined,
): ArticleGalleryItem[] | undefined {
  if (!current) return undefined;
  const liveBySrc = new Map((live ?? []).map((item) => [item.src, item]));
  const fallbackBySrc = new Map((fallback ?? []).map((item) => [item.src, item]));
  return current.map((item) => {
    const liveItem = liveBySrc.get(item.src);
    const fallbackItem = fallbackBySrc.get(item.src);
    return {
      ...item,
      alt:
        nonEmptyText(liveItem?.alt) ??
        nonEmptyText(fallbackItem?.alt) ??
        item.alt,
      caption:
        nonEmptyText(liveItem?.caption) ??
        nonEmptyText(fallbackItem?.caption) ??
        item.caption,
    };
  });
}

function mergeSourceTranslation(
  current: ArticleSource[] | undefined,
  live: ArticleSource[] | undefined,
  fallback: ArticleSource[] | undefined,
): ArticleSource[] | undefined {
  if (!current) {
    const translatedSources = live ?? fallback;
    return translatedSources?.map((item) => ({ ...item }));
  }
  const liveByHref = new Map((live ?? []).map((item) => [item.href, item]));
  const fallbackByHref = new Map((fallback ?? []).map((item) => [item.href, item]));
  return current.map((item) => ({
    ...item,
    label:
      nonEmptyText(liveByHref.get(item.href)?.label) ??
      nonEmptyText(fallbackByHref.get(item.href)?.label) ??
      item.label,
  }));
}

function markdownToContent(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export type EnglishEditorTranslation = {
  title: string;
  summary: string;
  tags: string[];
  contentMarkdown: string;
  gallery: ArticleGalleryItem[];
  sources: ArticleSource[];
};

export function getEnglishEditorTranslation(slug: string): EnglishEditorTranslation {
  const translation = englishArticles[slug];
  if (!translation) {
    return {
      title: "",
      summary: "",
      tags: [],
      contentMarkdown: "",
      gallery: [],
      sources: [],
    };
  }
  return {
    title: translation.title,
    summary: translation.summary,
    tags: [...translation.tags],
    contentMarkdown: translation.content.join("\n\n"),
    gallery: (translation.gallery ?? []).map((item) => ({ ...item })),
    sources: (translation.sources ?? []).map((item) => ({ ...item })),
  };
}

export function localizeArticle(article: Article, language: Language): Article {
  if (language === "zh") return article;

  const key = article.slug ?? article.id;
  const live = article.translations?.en;
  const fallback = englishArticles[key];
  if (!live && !fallback) return article;

  const liveMarkdown = nonEmptyText(live?.contentMarkdown);
  const liveContent = nonEmptyTextList(live?.content);
  const fallbackContent = nonEmptyTextList(fallback?.content);
  const usesLiveContent = Boolean(liveMarkdown || liveContent);
  const usesFallbackContent = !usesLiveContent && Boolean(fallbackContent);
  const selectedContent = liveMarkdown
    ? liveContent ?? markdownToContent(liveMarkdown)
    : liveContent ?? fallbackContent ?? article.content;
  const selectedContentHtml = usesLiveContent
    ? nonEmptyText(live?.contentHtml)
    : usesFallbackContent
      ? undefined
      : article.contentHtml;

  return {
    ...article,
    title: nonEmptyText(live?.title) ?? nonEmptyText(fallback?.title) ?? article.title,
    summary: nonEmptyText(live?.summary) ?? nonEmptyText(fallback?.summary) ?? article.summary,
    tags: nonEmptyTextList(live?.tags) ?? nonEmptyTextList(fallback?.tags) ?? article.tags,
    content: selectedContent,
    contentMarkdown: usesLiveContent
      ? liveMarkdown
      : usesFallbackContent
        ? undefined
        : article.contentMarkdown,
    contentHtml: selectedContentHtml,
    gallery: mergeGalleryTranslation(article.gallery, live?.gallery, fallback?.gallery),
    sources: mergeSourceTranslation(article.sources, live?.sources, fallback?.sources),
  };
}
