"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { fallbackArticles } from "../article-data";
import ImageLightbox, { type LightboxImage } from "../image-lightbox";
import { getEnglishEditorTranslation, localizeArticle } from "../i18n";
import { previewMediaUrl } from "../media-utils";
import { MarkdownPreview } from "./markdown-preview";
import "./admin.css";

type AdminTheme = "day" | "night";
type Section = "dashboard" | "analytics" | "posts" | "editor" | "media" | "settings";
type PostStatus = "draft" | "published" | "scheduled";
type ContentType = "article" | "lab" | "collection";

type AdminGalleryItem = {
  src: string;
  alt: string;
  caption: string;
};

type AdminSource = {
  label: string;
  href: string;
};

type AdminTranslation = {
  title: string;
  summary: string;
  tags: string[];
  contentMarkdown: string;
  gallery: AdminGalleryItem[];
  sources: AdminSource[];
};

type AdminTranslations = {
  en: AdminTranslation;
};

type AdminPost = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  tags: string[];
  code: string;
  readTime: string;
  contentMarkdown: string;
  coverUrl: string | null;
  contentType: ContentType;
  gallery: AdminGalleryItem[];
  translations: AdminTranslations;
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
};

type MediaAsset = {
  id: string;
  url: string;
  filename: string;
  alt: string;
  size: number;
  createdAt: string;
  builtIn?: boolean;
};

type SessionPayload = {
  authenticated: boolean;
  passwordEnabled?: boolean;
  loginUrl?: string;
  user?: { login: string; avatarUrl?: string | null };
};

type SiteSettings = {
  siteTitle: string;
  tagline: string;
  bio: string;
  defaultCategory: string;
  defaultAuthor: string;
};

type AnalyticsPayload = {
  retentionDays: number;
  summary: {
    totalViews: number;
    uniqueVisitors: number;
    todayViews: number;
    todayVisitors: number;
    weekViews: number;
  };
  daily: Array<{ date: string; views: number; visitors: number }>;
  topPages: Array<{ path: string; views: number; visitors: number }>;
  recent: Array<{ ip: string; location: string; path: string; visitedAt: string }>;
};

const defaultSettings: SiteSettings = {
  siteTitle: "Mozelle Archive",
  tagline: "把所见、所想与所爱，收进一页页未完的档案。",
  bio: "电子专业学生，记录硬件、超频、游戏、Cosplay 与二次元世界。",
  defaultCategory: "电子",
  defaultAuthor: "Mozelle",
};

const emptyAnalytics: AnalyticsPayload = {
  retentionDays: 90,
  summary: {
    totalViews: 0,
    uniqueVisitors: 0,
    todayViews: 0,
    todayVisitors: 0,
    weekViews: 0,
  },
  daily: [],
  topPages: [],
  recent: [],
};

const builtInAssets: MediaAsset[] = [
  { id: "builtin-ddr5-96gb", url: "/articles/ddr5-96gb-8400.jpg", filename: "ddr5-96gb-8400.jpg", alt: "96GB DDR5-8400 稳定性测试记录", size: 1_203_094, createdAt: "2026-05-27T12:00:00.000Z", builtIn: true },
  { id: "builtin-5090-laptop", url: "/articles/rtx5090-laptop-timespy.jpg", filename: "rtx5090-laptop-timespy.jpg", alt: "RTX 5090 Laptop Time Spy 结果", size: 477_623, createdAt: "2025-08-16T12:00:00.000Z", builtIn: true },
  { id: "builtin-5090-tse-result", url: "/articles/rtx5090-tse-result.png", filename: "rtx5090-tse-result.png", alt: "RTX 5090 Time Spy Extreme 有效结果", size: 1_154_164, createdAt: "2026-01-20T12:00:00.000Z", builtIn: true },
  { id: "builtin-5090-tse-rank", url: "/articles/rtx5090-tse-rank.jpg", filename: "rtx5090-tse-rank.jpg", alt: "Time Spy Extreme 提交当日排行榜", size: 921_101, createdAt: "2026-01-20T12:00:00.000Z", builtIn: true },
  { id: "builtin-5090-tse-details", url: "/articles/rtx5090-tse-details.png", filename: "rtx5090-tse-details.png", alt: "RTX 5090 跑分硬件与频率详情", size: 173_458, createdAt: "2026-01-20T12:00:00.000Z", builtIn: true },
  { id: "builtin-sparkle-full", url: "/articles/sparkle-cosplay-full.jpg", filename: "sparkle-cosplay-full.jpg", alt: "花火 Cosplay 全身造型记录", size: 2_619_791, createdAt: "2026-07-18T09:30:00.000Z", builtIn: true },
  { id: "builtin-sparkle-close", url: "/articles/sparkle-cosplay-close.jpg", filename: "sparkle-cosplay-close.jpg", alt: "花火 Cosplay 妆面与假发近景", size: 829_348, createdAt: "2026-07-18T09:30:00.000Z", builtIn: true },
];

const demoPosts: AdminPost[] = [
  {
    id: "demo-ddr5",
    title: "DDR5 超频：从电压、时序到稳定性",
    slug: "ddr5-stability",
    summary: "把 VDD、VDDQ、VPP 与内存控制器电压放进同一张逻辑图。",
    category: "超频",
    tags: ["DDR5", "电压", "时序"],
    code: "OC / 001",
    readTime: "12 min",
    contentMarkdown:
      "## 从变量控制开始\n\n内存超频不是单纯提高频率，而是在信号完整性、颗粒特性与内存控制器能力之间寻找平衡。\n\n> 每轮只改变少量参数，并记录温度、错误位置与测试环境。\n\n- 先确定目标频率\n- 再处理主次时序\n- 最后验证冷启动与日常负载",
    coverUrl: null,
    contentType: "article",
    gallery: [],
    translations: {
      en: {
        title: "DDR5 overclocking: voltage, timings, and stability",
        summary: "Put VDD, VDDQ, VPP, and memory-controller voltage into one testable model.",
        tags: ["DDR5", "Voltage", "Timings"],
        contentMarkdown: "## Start with variable control\n\nMemory overclocking is a balance between signal integrity, IC characteristics, and the memory controller.\n\n> Change only a few parameters per round, then record temperature, error location, and the test environment.",
        gallery: [],
        sources: [],
      },
    },
    status: "published",
    publishedAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-13T03:20:00.000Z",
  },
  {
    id: "demo-pmic",
    title: "主板与 PMIC：DDR5 电压究竟从哪里来",
    slug: "pmic-rails",
    summary: "沿着供电路径拆解主板输入、DIMM PMIC 与颗粒端电压。",
    category: "电子",
    tags: ["PMIC", "供电", "主板"],
    code: "EE / 014",
    readTime: "8 min",
    contentMarkdown: "## 供电路径\n\nDDR5 将主要电源管理功能移到内存模组上。",
    coverUrl: null,
    contentType: "article",
    gallery: [],
    translations: {
      en: {
        title: "Motherboards and PMICs: where DDR5 voltages come from",
        summary: "Trace the power path from the motherboard input through the DIMM PMIC to the memory ICs.",
        tags: ["PMIC", "Power delivery", "Motherboard"],
        contentMarkdown: "## Power path\n\nDDR5 moves key power-management functions onto the memory module.",
        gallery: [],
        sources: [],
      },
    },
    status: "draft",
    publishedAt: null,
    updatedAt: "2026-07-12T10:08:00.000Z",
  },
  {
    id: "demo-cos",
    title: "花火 Cosplay 影像收藏",
    slug: "sparkle-cosplay-collection",
    summary: "以完整造型与近景细节组成的角色影像收藏。",
    category: "游戏与次元",
    tags: ["Cosplay", "布光"],
    code: "ACG / 007",
    readTime: "",
    contentMarkdown: "",
    coverUrl: null,
    contentType: "collection",
    gallery: [],
    translations: {
      en: {
        title: "Sparkle cosplay image collection",
        summary: "A character image collection built from full-look and close-up detail studies.",
        tags: ["Cosplay", "Lighting"],
        contentMarkdown: "",
        gallery: [],
        sources: [],
      },
    },
    status: "scheduled",
    publishedAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-13T01:32:00.000Z",
  },
];

const contentTypeLabels: Record<ContentType, string> = {
  article: "技术文章",
  lab: "实验与超频笔记",
  collection: "次元收藏",
};

const contentTypeShortLabels: Record<ContentType, string> = {
  article: "文章",
  lab: "实验",
  collection: "收藏",
};

const isContentType = (value: unknown): value is ContentType =>
  value === "article" || value === "lab" || value === "collection";

function normalizeGallery(value: unknown): AdminGalleryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as { src?: unknown; alt?: unknown; caption?: unknown };
    if (typeof source.src !== "string" || !source.src.trim()) return [];
    return [{
      src: source.src,
      alt: typeof source.alt === "string" ? source.alt : "",
      caption: typeof source.caption === "string" ? source.caption : "",
    }];
  });
}

function normalizeSources(value: unknown): AdminSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as { label?: unknown; href?: unknown };
    if (typeof source.href !== "string" || !source.href.trim()) return [];
    return [{
      label: typeof source.label === "string" ? source.label : source.href,
      href: source.href,
    }];
  });
}

function emptyEnglishTranslation(): AdminTranslation {
  return {
    title: "",
    summary: "",
    tags: [],
    contentMarkdown: "",
    gallery: [],
    sources: [],
  };
}

function normalizeTranslation(value: unknown): AdminTranslation {
  if (!value || typeof value !== "object") return emptyEnglishTranslation();
  const source = value as {
    title?: unknown;
    summary?: unknown;
    tags?: unknown;
    contentMarkdown?: unknown;
    gallery?: unknown;
    sources?: unknown;
  };
  return {
    title: typeof source.title === "string" ? source.title : "",
    summary: typeof source.summary === "string" ? source.summary : "",
    tags: Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
      : [],
    contentMarkdown:
      typeof source.contentMarkdown === "string" ? source.contentMarkdown : "",
    gallery: normalizeGallery(source.gallery),
    sources: normalizeSources(source.sources),
  };
}

function hasEnglishDraft(value: AdminTranslation): boolean {
  return Boolean(
    value.title.trim() ||
      value.summary.trim() ||
      value.tags.length ||
      value.contentMarkdown.trim() ||
      value.gallery.some((item) => item.alt.trim() || item.caption.trim()) ||
      value.sources.length,
  );
}

function alignEnglishGallery(
  primaryGallery: AdminGalleryItem[],
  englishGallery: AdminGalleryItem[],
  fallbackGallery: AdminGalleryItem[] = [],
): AdminGalleryItem[] {
  const metadataBySource = new Map(
    englishGallery.map((item) => [item.src, item] as const),
  );
  const fallbackBySource = new Map(
    fallbackGallery.map((item) => [item.src, item] as const),
  );
  return primaryGallery.map((item) => {
    const english = metadataBySource.get(item.src);
    const fallback = fallbackBySource.get(item.src);
    return {
      src: item.src,
      alt: english?.alt.trim() ? english.alt : fallback?.alt ?? "",
      caption: english?.caption.trim() ? english.caption : fallback?.caption ?? "",
    };
  });
}

function getSeededEnglishTranslation(slug: string): AdminTranslation {
  const editorSeed = getEnglishEditorTranslation(slug);
  const fallbackArticle = fallbackArticles.find(
    (article) => (article.slug ?? article.id) === slug,
  );
  const localizedFallback = fallbackArticle
    ? localizeArticle(fallbackArticle, "en")
    : undefined;
  const seeded = normalizeTranslation({
    ...editorSeed,
    sources: localizedFallback?.sources ?? [],
  });
  return seeded;
}

function normalizeAdminPost(post: AdminPost): AdminPost {
  const gallery = normalizeGallery(post.gallery);
  const translations = (post as AdminPost & {
    translations?: { en?: unknown };
  }).translations;
  const rawEnglish = translations?.en;
  const storedEnglish = normalizeTranslation(translations?.en);
  const seededEnglish = post.slug
    ? getSeededEnglishTranslation(post.slug)
    : emptyEnglishTranslation();
  const hasStoredSources = Boolean(
    rawEnglish &&
      typeof rawEnglish === "object" &&
      Object.hasOwn(rawEnglish, "sources"),
  );
  const mergedSources = hasStoredSources
    ? storedEnglish.sources
    : seededEnglish.sources;
  const english: AdminTranslation = {
    title: storedEnglish.title.trim() ? storedEnglish.title : seededEnglish.title,
    summary: storedEnglish.summary.trim() ? storedEnglish.summary : seededEnglish.summary,
    tags: storedEnglish.tags.length ? storedEnglish.tags : seededEnglish.tags,
    contentMarkdown: storedEnglish.contentMarkdown.trim()
      ? storedEnglish.contentMarkdown
      : seededEnglish.contentMarkdown,
    gallery: alignEnglishGallery(
      gallery,
      storedEnglish.gallery,
      seededEnglish.gallery,
    ),
    sources: mergedSources,
  };

  return {
    ...post,
    contentType: isContentType(post.contentType) ? post.contentType : "article",
    gallery,
    contentMarkdown: typeof post.contentMarkdown === "string" ? post.contentMarkdown : "",
    translations: {
      en: {
        ...english,
        gallery: alignEnglishGallery(gallery, english.gallery),
      },
    },
  };
}

const emptyPost = (contentType: ContentType = "article"): AdminPost => ({
  id: "",
  title: "",
  slug: "",
  summary: "",
  category: contentType === "collection" ? "游戏与次元" : contentType === "lab" ? "超频" : "电子",
  tags: [],
  code: contentType === "collection" ? "ACG / NEW" : contentType === "lab" ? "LAB / NEW" : "EE / NEW",
  readTime: contentType === "collection" ? "" : "8 min",
  contentMarkdown:
    contentType === "collection"
      ? ""
      : contentType === "lab"
        ? "# 新实验笔记\n\n## 目标与环境\n\n记录硬件、固件、环境温度与变量。\n\n## 方法与结果\n\n保留可复核的数据与截图。\n\n## 限制与复盘\n\n说明结论适用范围。"
        : "# 新技术文章\n\n## 问题\n\n从这里开始记录。\n\n## 原理与证据\n\n补充可核查的依据。\n\n## 结论与边界\n\n说明结论的适用条件。",
  coverUrl: null,
  contentType,
  gallery: [],
  translations: { en: emptyEnglishTranslation() },
  status: "draft",
  publishedAt: null,
  updatedAt: new Date().toISOString(),
});

const navItems: Array<{ id: Section; label: string; index: string }> = [
  { id: "dashboard", label: "控制台", index: "01" },
  { id: "analytics", label: "访问统计", index: "02" },
  { id: "posts", label: "内容管理", index: "03" },
  { id: "editor", label: "内容编辑", index: "04" },
  { id: "media", label: "媒体库", index: "05" },
  { id: "settings", label: "站点设置", index: "06" },
];

function formatDate(value: string | null): string {
  if (!value) return "尚未发布";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatVisitDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function statusText(status: PostStatus): string {
  return status === "published" ? "已发布" : status === "scheduled" ? "定时" : "草稿";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminPage() {
  const [theme, setTheme] = useState<AdminTheme>("night");
  const [section, setSection] = useState<Section>("dashboard");
  const [posts, setPosts] = useState<AdminPost[]>(demoPosts);
  const [draft, setDraft] = useState<AdminPost>(demoPosts[0]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [session, setSession] = useState<"loading" | "guest" | "authenticated">(
    "loading",
  );
  const [sessionUser, setSessionUser] = useState<SessionPayload["user"]>();
  const [loginUrl, setLoginUrl] = useState<string>();
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [analytics, setAnalytics] = useState<AnalyticsPayload>(emptyAnalytics);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [editorLocale, setEditorLocale] = useState<"zh" | "en">("zh");
  const [contentTypeFilter, setContentTypeFilter] = useState<"all" | ContentType>("all");
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const response = await fetch("/api/admin/analytics", {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Analytics unavailable");
      setAnalytics((await response.json()) as AnalyticsPayload);
    } catch {
      setAnalyticsError("访问统计暂时无法读取，请稍后重试。");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("mozelle-admin-theme");
    if (savedTheme === "day" || savedTheme === "night") {
      queueMicrotask(() => setTheme(savedTheme));
    }

    fetch("/api/auth/session", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("API unavailable");
        return (await response.json()) as SessionPayload;
      })
      .then((payload) => {
        setLoginUrl(payload.loginUrl);
        if (!payload.authenticated) {
          setSession("guest");
          return;
        }
        setSessionUser(payload.user);
        setSession("authenticated");
      })
      .catch(() => setSession("guest"));
  }, []);

  useEffect(() => {
    if (session !== "authenticated") return;
    Promise.all([
      fetch("/api/admin/posts").then((response) => response.json()),
      fetch("/api/admin/media").then((response) => response.json()),
      fetch("/api/admin/settings").then((response) => response.json()),
    ])
      .then(([postPayload, mediaPayload, settingsPayload]) => {
        const nextPosts = Array.isArray(postPayload.posts)
          ? (postPayload.posts as AdminPost[]).map(normalizeAdminPost)
          : [];
        setPosts(nextPosts);
        setDraft(nextPosts[0] ?? emptyPost());
        const uploadedAssets = Array.isArray(mediaPayload.assets)
          ? mediaPayload.assets as MediaAsset[]
          : [];
        const builtInUrls = new Set(builtInAssets.map((asset) => asset.url));
        setAssets([
          ...builtInAssets,
          ...uploadedAssets.filter((asset) => !builtInUrls.has(asset.url)),
        ]);
        if (settingsPayload.settings) {
          setSettings((current) => ({ ...current, ...settingsPayload.settings }));
        }
      })
      .catch(() => setNotice("后台数据暂时无法读取，请检查 VPS API 服务。"));
  }, [session]);

  useEffect(() => {
    if (session !== "authenticated" || section !== "analytics") return;
    queueMicrotask(() => void loadAnalytics());
    const timer = window.setInterval(() => void loadAnalytics(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadAnalytics, section, session]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(
    () => ({
      total: posts.length,
      published: posts.filter((post) => post.status === "published").length,
      drafts: posts.filter((post) => post.status === "draft").length,
      scheduled: posts.filter((post) => post.status === "scheduled").length,
      articles: posts.filter((post) => post.contentType === "article").length,
      labs: posts.filter((post) => post.contentType === "lab").length,
      collections: posts.filter((post) => post.contentType === "collection").length,
    }),
    [posts],
  );

  const filteredPosts = useMemo(
    () => posts.filter((post) => contentTypeFilter === "all" || post.contentType === contentTypeFilter),
    [contentTypeFilter, posts],
  );

  const peakTraffic = useMemo(
    () => Math.max(1, ...analytics.daily.map((item) => item.views)),
    [analytics.daily],
  );

  const editorCopy = editorLocale === "zh"
    ? {
        title: draft.title,
        summary: draft.summary,
        tags: draft.tags,
        contentMarkdown: draft.contentMarkdown,
      }
    : draft.translations.en;

  const localizedGallery = editorLocale === "zh"
    ? draft.gallery
    : alignEnglishGallery(draft.gallery, draft.translations.en.gallery);

  const changeTheme = () => {
    const next = theme === "night" ? "day" : "night";
    setTheme(next);
    window.localStorage.setItem("mozelle-admin-theme", next);
  };

  const editPost = (post: AdminPost) => {
    setDraft(post);
    setSection("editor");
    setPreviewMode("edit");
  };

  const createPost = (contentType: ContentType = "article") => {
    const next = emptyPost(contentType);
    setDraft({
      ...next,
      category: contentType === "article" ? settings.defaultCategory : next.category,
    });
    setSection("editor");
    setPreviewMode("edit");
  };

  const updateDraft = <K extends keyof AdminPost>(key: K, value: AdminPost[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateLocalizedText = (
    key: "title" | "summary" | "contentMarkdown",
    value: string,
  ) => {
    if (editorLocale === "zh") {
      setDraft((current) => ({ ...current, [key]: value }));
      return;
    }
    setDraft((current) => ({
      ...current,
      translations: {
        ...current.translations,
        en: { ...current.translations.en, [key]: value },
      },
    }));
  };

  const updateLocalizedTags = (tags: string[]) => {
    if (editorLocale === "zh") {
      updateDraft("tags", tags);
      return;
    }
    setDraft((current) => ({
      ...current,
      translations: {
        ...current.translations,
        en: { ...current.translations.en, tags },
      },
    }));
  };

  const appendLocalizedMarkdown = (value: string) => {
    updateLocalizedText("contentMarkdown", `${editorCopy.contentMarkdown}${value}`);
  };

  const changeDraftContentType = (contentType: ContentType) => {
    setDraft((current) => {
      if (current.contentType === contentType) return current;
      const template = emptyPost(contentType);
      const currentTemplate = emptyPost(current.contentType);
      const isUntouchedNewContent =
        !current.id &&
        !current.title.trim() &&
        !current.slug.trim() &&
        !current.summary.trim() &&
        current.tags.length === 0 &&
        current.gallery.length === 0 &&
        !current.coverUrl &&
        current.category === currentTemplate.category &&
        current.code === currentTemplate.code &&
        current.readTime === currentTemplate.readTime &&
        current.contentMarkdown === currentTemplate.contentMarkdown &&
        !hasEnglishDraft(current.translations.en);
      return {
        ...current,
        contentType,
        category: isUntouchedNewContent ? template.category : current.category,
        code: isUntouchedNewContent ? template.code : current.code,
        readTime:
          contentType === "collection"
            ? ""
            : current.readTime || template.readTime,
        contentMarkdown: isUntouchedNewContent
          ? template.contentMarkdown
          : current.contentMarkdown,
      };
    });
  };

  const persistPost = async (status: PostStatus) => {
    const title = draft.title.trim();
    const slug = slugify(draft.slug || draft.title);
    if (!title || !slug) {
      setNotice("请填写内容标题和链接地址。");
      return;
    }
    const next: AdminPost = {
      ...draft,
      title,
      slug,
      status,
      publishedAt:
        status === "published"
          ? draft.status === "published" && draft.publishedAt
            ? draft.publishedAt
            : new Date().toISOString()
          : status === "scheduled"
            ? draft.publishedAt
            : draft.publishedAt,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const { translations: _ignoredTranslations, ...automaticTranslationPost } = next;
      void _ignoredTranslations;
      const response = await fetch(
        next.id ? `/api/admin/posts/${encodeURIComponent(next.id)}` : "/api/admin/posts",
        {
          method: next.id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...automaticTranslationPost, autoTranslate: true }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        post?: AdminPost;
        message?: string;
        translation?: { status?: "generated" | "preserved" };
      } | null;
      if (!response.ok || !payload?.post) {
        throw new Error(payload?.message || "保存失败，请稍后重试。");
      }
      const savedPost = normalizeAdminPost(payload.post);
      setDraft(savedPost);
      setPosts((current) => [savedPost, ...current.filter((post) => post.id !== savedPost.id)]);
      const action = status === "published" ? "内容已发布" : status === "scheduled" ? "已设置定时发布" : "草稿已保存";
      const translation = payload.translation?.status === "preserved"
        ? "英文版保持同步。"
        : "英文版已自动生成。";
      setNotice(`${action}，${translation}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (post: AdminPost) => {
    if (!window.confirm(`确定删除内容《${post.title}》吗？此操作不可撤销。`)) return;
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(post.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("删除失败");
      setPosts((current) => current.filter((item) => item.id !== post.id));
      setNotice("内容已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除失败。");
    }
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setNotice("请选择图片文件。");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice("图片不能超过 10 MB。");
      return;
    }

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("alt", file.name.replace(/\.[^.]+$/, ""));
      const response = await fetch("/api/admin/media", { method: "POST", body });
      if (!response.ok) throw new Error((await response.text()) || "上传失败");
      const { asset } = (await response.json()) as { asset: MediaAsset };
      setAssets((current) => [asset, ...current]);
      setNotice("图片上传成功。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片上传失败。");
    }
  };

  const insertImage = (asset: MediaAsset) => {
    updateLocalizedText(
      "contentMarkdown",
      `${editorCopy.contentMarkdown.trimEnd()}\n\n![${asset.alt || asset.filename}](${asset.url})\n`,
    );
    setSection("editor");
    setNotice(`图片 Markdown 已插入${editorLocale === "zh" ? "中文" : "英文"}正文末尾。`);
  };

  const setAsCover = (asset: MediaAsset) => {
    updateDraft("coverUrl", asset.url);
    setSection("editor");
    setNotice("已将图片设为当前内容的主视觉。");
  };

  const addToGallery = (asset: MediaAsset) => {
    if (draft.gallery.some((item) => item.src === asset.url)) {
      setNotice("这张图片已经在当前图库中。");
      return;
    }
    setDraft((current) => {
      const gallery = [
        ...current.gallery,
        { src: asset.url, alt: asset.alt || asset.filename, caption: "" },
      ];
      return {
        ...current,
        gallery,
        translations: {
          ...current.translations,
          en: {
            ...current.translations.en,
            gallery: alignEnglishGallery(gallery, current.translations.en.gallery),
          },
        },
      };
    });
    setSection("editor");
    setNotice("图片已加入当前内容的图库。");
  };

  const updateGalleryItem = (
    index: number,
    key: "alt" | "caption",
    value: string,
  ) => {
    setDraft((current) => {
      if (editorLocale === "zh") {
        const gallery = current.gallery.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [key]: value } : item,
        );
        return {
          ...current,
          gallery,
          translations: {
            ...current.translations,
            en: {
              ...current.translations.en,
              gallery: alignEnglishGallery(gallery, current.translations.en.gallery),
            },
          },
        };
      }

      const source = current.gallery[index]?.src;
      if (!source) return current;
      const gallery = alignEnglishGallery(
        current.gallery,
        current.translations.en.gallery,
      ).map((item) => item.src === source ? { ...item, [key]: value } : item);
      return {
        ...current,
        translations: {
          ...current.translations,
          en: { ...current.translations.en, gallery },
        },
      };
    });
  };

  const moveGalleryItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.gallery.length) return;
    setDraft((current) => {
      const gallery = [...current.gallery];
      [gallery[index], gallery[nextIndex]] = [gallery[nextIndex], gallery[index]];
      return {
        ...current,
        gallery,
        translations: {
          ...current.translations,
          en: {
            ...current.translations.en,
            gallery: alignEnglishGallery(gallery, current.translations.en.gallery),
          },
        },
      };
    });
  };

  const removeGalleryItem = (index: number) => {
    setDraft((current) => {
      const gallery = current.gallery.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        gallery,
        translations: {
          ...current.translations,
          en: {
            ...current.translations.en,
            gallery: alignEnglishGallery(gallery, current.translations.en.gallery),
          },
        },
      };
    });
  };

  const previewAsset = (asset: MediaAsset) => {
    const images = assets.map((item) => ({
      src: item.url,
      alt: item.alt || item.filename,
      caption: item.filename,
    }));
    setLightbox({
      images,
      index: Math.max(0, assets.findIndex((item) => item.id === asset.id)),
    });
  };

  const previewGallery = (index: number) => {
    setLightbox({
      images: localizedGallery.map((item) => ({
        src: item.src,
        alt: item.alt,
        caption: item.caption,
      })),
      index,
    });
  };

  const previewCover = () => {
    if (!draft.coverUrl) return;
    setLightbox({
      images: [{ src: draft.coverUrl, alt: draft.title || "主视觉预览" }],
      index: 0,
    });
  };

  const deleteAsset = async (asset: MediaAsset) => {
    if (asset.builtIn) {
      setNotice("内置资料图会随站点版本保留，不能从后台删除。");
      return;
    }
    if (!window.confirm(`确定删除图片“${asset.filename}”吗？`)) return;
    try {
      const response = await fetch(`/api/admin/media/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || "图片删除失败。");
      }
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setNotice("图片已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图片删除失败。");
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error("站点设置保存失败。");
      setNotice("站点设置已保存。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "站点设置保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const authenticateWithPassword = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (authenticating || !password) return;

    setAuthenticating(true);
    setAuthError("");
    try {
      let response: Response | undefined;
      try {
        response = await fetch("/api/auth/password", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ password }),
        });
      } catch {
        response = undefined;
      }

      if (response?.ok) {
        const payload = (await response.json()) as SessionPayload;
        setSessionUser(payload.user ?? { login: "Mozelle" });
        setPassword("");
        setSession("authenticated");
        return;
      }

      if (response) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setAuthError(payload?.message || "验证失败，请稍后重试。");
        return;
      }
      setAuthError("后台 API 尚未连接，请检查 VPS 服务是否已经启动。");
    } finally {
      setAuthenticating(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin");
  };

  if (session === "loading") {
    return (
      <main className="admin-loading">
        <span className="loading-glyph">MZ</span>
        <p>正在连接控制终端…</p>
      </main>
    );
  }

  if (session === "guest") {
    return (
      <main className="admin-login">
        <section>
          <span className="login-kicker">MOZELLE / CONTROL ACCESS</span>
          <div className="login-mark"><i /></div>
          <h1>进入博客控制后台</h1>
          <p>输入管理员密码后进入内容、图片与站点设置终端。</p>
          <form className="admin-password-form" onSubmit={authenticateWithPassword}>
            <label htmlFor="admin-password">ADMIN PASSWORD</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="输入后台密码"
              maxLength={128}
              autoFocus
            />
            {authError && <span className="admin-auth-error" role="alert">{authError}</span>}
            <button type="submit" disabled={authenticating || !password}>
              {authenticating ? "正在验证…" : "验证并进入"}
              <span>→</span>
            </button>
          </form>
          {loginUrl && (
            <a className="github-fallback" href={loginUrl}>
              使用 GitHub 管理员账号 <span>↗</span>
            </a>
          )}
          <small>VPS 会在服务端验证密码；连续输错 5 次将锁定 10 分钟。</small>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-app" data-admin-theme={theme}>
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/">
          <span className="admin-brand-mark"><i /></span>
          <span><strong>MOZELLE</strong><small>{"// CONTROL"}</small></span>
        </Link>
        <nav aria-label="后台导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "is-active" : ""}
              onClick={() => setSection(item.id)}
            >
              <span>{item.index}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="admin-profile">
          <span className="profile-avatar">
            {sessionUser?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sessionUser.avatarUrl} alt="" />
            ) : (
              "M"
            )}
          </span>
          <span><strong>{sessionUser?.login ?? "Mozelle"}</strong><small>ADMIN / ONLINE</small></span>
          <button type="button" onClick={logout} aria-label="退出后台">↪</button>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <span>MOZELLE ARCHIVE</span>
            <strong>{navItems.find((item) => item.id === section)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <a href="/" target="_blank">查看博客 ↗</a>
            <button type="button" className="theme-control" onClick={changeTheme} aria-label="切换后台主题">
              <span>{theme === "night" ? "M3" : "EI"}</span>
              <i />
            </button>
          </div>
        </header>

        <div className="admin-content">
          {section === "dashboard" && (
            <section className="dashboard-view">
              <div className="view-heading">
                <div><span>01 / OVERVIEW</span><h1>欢迎回来，Mozelle。</h1></div>
                <button type="button" className="primary-action" onClick={() => createPost()}>＋ 新建内容</button>
              </div>
              <div className="stat-grid">
                {[
                  ["全部内容", counts.total, "TOTAL"],
                  ["技术文章", counts.articles, "ARTICLE"],
                  ["实验笔记", counts.labs, "LAB"],
                  ["次元收藏", counts.collections, "COLLECT"],
                ].map(([label, value, meta]) => (
                  <article key={label}>
                    <span>{meta}</span><strong>{String(value).padStart(2, "0")}</strong><p>{label}</p><i />
                  </article>
                ))}
              </div>
              <div className="dashboard-columns">
                <section className="panel recent-panel">
                  <div className="panel-heading"><div><span>RECENT FILES</span><h2>最近内容</h2></div><button onClick={() => setSection("posts")}>查看全部 →</button></div>
                  <div className="compact-post-list">
                    {posts.slice(0, 4).map((post) => (
                      <button key={post.id} onClick={() => editPost(post)}>
                        <span className={`status-dot status-${post.status}`} />
                        <span><strong>{post.title}</strong><small>{contentTypeShortLabels[post.contentType]} · {post.category} · {formatDate(post.updatedAt)}</small></span>
                        <em>{statusText(post.status)}</em><i>↗</i>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel quick-panel">
                  <div className="panel-heading"><div><span>QUICK ACCESS</span><h2>快捷操作</h2></div></div>
                  <button onClick={() => createPost("article")}><span>✦</span><strong>新建技术文章</strong><small>原理、证据与结论</small></button>
                  <button onClick={() => createPost("lab")}><span>⌁</span><strong>新建实验笔记</strong><small>环境、方法与复盘</small></button>
                  <button onClick={() => createPost("collection")}><span>◇</span><strong>新建次元收藏</strong><small>以图片与图注为主</small></button>
                  <button onClick={() => fileInput.current?.click()}><span>◇</span><strong>上传新图片</strong><small>添加到媒体库</small></button>
                  <button onClick={() => setSection("settings")}><span>⌁</span><strong>修改站点信息</strong><small>标题、介绍和默认分类</small></button>
                </section>
              </div>
            </section>
          )}

          {section === "analytics" && (
            <section className="analytics-view">
              <div className="view-heading">
                <div>
                  <span>02 / TRAFFIC</span>
                  <h1>访问统计</h1>
                  <p>浏览人数以独立 IP 统计；IP 后显示其访问地址与最近访问时间。</p>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  disabled={analyticsLoading}
                  onClick={() => void loadAnalytics()}
                >
                  {analyticsLoading ? "读取中…" : "刷新数据"}
                </button>
              </div>

              <div className="stat-grid analytics-stat-grid">
                {[
                  ["累计浏览量", analytics.summary.totalViews, "PAGE VIEWS"],
                  ["独立访客 IP", analytics.summary.uniqueVisitors, "VISITORS"],
                  ["今日浏览 / 人数", `${analytics.summary.todayViews} / ${analytics.summary.todayVisitors}`, "TODAY"],
                  ["近 7 天浏览", analytics.summary.weekViews, "7 DAYS"],
                ].map(([label, value, meta]) => (
                  <article key={label}>
                    <span>{meta}</span>
                    <strong>{typeof value === "number" ? value.toLocaleString("zh-CN") : value}</strong>
                    <p>{label}</p>
                    <i />
                  </article>
                ))}
              </div>

              {analyticsError && <p className="analytics-error">{analyticsError}</p>}

              <section className="panel analytics-traffic-panel">
                <div className="panel-heading">
                  <div><span>14 DAY SIGNAL</span><h2>访问趋势</h2></div>
                  <small>柱形为浏览量，亮点为独立 IP</small>
                </div>
                <div className="analytics-chart" aria-label="最近十四天访问趋势">
                  {analytics.daily.map((item) => (
                    <div className="analytics-day" key={item.date} title={`${item.date}：${item.views} 次浏览，${item.visitors} 个 IP`}>
                      <div className="analytics-bar">
                        <i style={{ height: `${Math.max(3, (item.views / peakTraffic) * 100)}%` }} />
                        <b style={{ bottom: `${Math.max(3, (item.visitors / peakTraffic) * 100)}%` }} />
                      </div>
                      <strong>{item.views}</strong>
                      <span>{item.date.slice(5)}</span>
                    </div>
                  ))}
                  {!analytics.daily.length && <p className="analytics-empty">尚无访问数据</p>}
                </div>
              </section>

              <div className="analytics-columns">
                <section className="panel analytics-recent-panel">
                  <div className="panel-heading">
                    <div><span>RECENT VISITORS</span><h2>最近访问 IP 与所在地区</h2></div>
                    <small>最近 100 条</small>
                  </div>
                  <div className="analytics-visit-head" aria-hidden="true">
                    <span>IP</span><span>所在地区</span><span>访问页面</span><span>时间</span>
                  </div>
                  <div className="analytics-visit-list">
                    {analytics.recent.map((visit, index) => (
                      <article key={`${visit.ip}-${visit.path}-${visit.visitedAt}-${index}`}>
                        <code>{visit.ip}</code>
                        <span className="analytics-location">{visit.location}</span>
                        <a href={visit.path} target="_blank" rel="noreferrer">{visit.path}</a>
                        <time>{formatVisitDate(visit.visitedAt)}</time>
                      </article>
                    ))}
                    {!analytics.recent.length && <p className="analytics-empty">尚未记录到前台访问</p>}
                  </div>
                </section>

                <section className="panel analytics-pages-panel">
                  <div className="panel-heading">
                    <div><span>TOP ROUTES / 30 DAYS</span><h2>热门访问地址</h2></div>
                  </div>
                  <div className="analytics-page-list">
                    {analytics.topPages.map((page, index) => (
                      <article key={page.path}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div><a href={page.path} target="_blank" rel="noreferrer">{page.path}</a><small>{page.visitors} 个独立 IP</small></div>
                        <strong>{page.views}</strong>
                      </article>
                    ))}
                    {!analytics.topPages.length && <p className="analytics-empty">暂无热门地址数据</p>}
                  </div>
                </section>
              </div>

              <p className="analytics-retention">
                仅统计前台页面；后台、API、静态资源和常见机器人不会计入。访问记录保留 {analytics.retentionDays} 天。
              </p>
            </section>
          )}

          {section === "posts" && (
            <section className="posts-view">
              <div className="view-heading">
                <div><span>03 / CONTENT</span><h1>内容管理</h1><p>统一管理技术文章、实验笔记、次元收藏与发布计划。</p></div>
                <div className="content-list-actions">
                  <label className="content-type-filter">
                    <span className="sr-only">筛选内容类型</span>
                    <select
                      value={contentTypeFilter}
                      onChange={(event) => setContentTypeFilter(event.target.value as "all" | ContentType)}
                    >
                      <option value="all">全部类型</option>
                      <option value="article">技术文章</option>
                      <option value="lab">实验与超频笔记</option>
                      <option value="collection">次元收藏</option>
                    </select>
                  </label>
                  <button type="button" className="primary-action" onClick={() => createPost()}>＋ 新建内容</button>
                </div>
              </div>
              <div className="post-table panel">
                <div className="post-table-head"><span>内容</span><span>类型 / 分类</span><span>状态</span><span>更新时间</span><span>操作</span></div>
                {filteredPosts.map((post) => (
                  <article key={post.id}>
                    <div><strong>{post.title}</strong><small>/{post.slug}</small></div>
                    <span className="content-type-cell"><em data-content-type={post.contentType}>{contentTypeShortLabels[post.contentType]}</em>{post.category}</span>
                    <span className={`status-pill status-${post.status}`}>{statusText(post.status)}</span>
                    <time>{formatDate(post.updatedAt)}</time>
                    <div className="row-actions"><button onClick={() => editPost(post)}>编辑</button><button onClick={() => deletePost(post)}>删除</button></div>
                  </article>
                ))}
                {!filteredPosts.length && (
                  <div className="empty-content-list">当前筛选条件下还没有内容。</div>
                )}
              </div>
            </section>
          )}

          {section === "editor" && (
            <section className="editor-view">
              <div className="editor-heading">
                <div><span>04 / EDITOR</span><h1>{draft.id ? "编辑" : "新建"}{contentTypeLabels[draft.contentType]}</h1><p>{saving ? "正在保存…" : `上次更新：${formatDate(draft.updatedAt)}`}</p></div>
                <div><button type="button" onClick={() => persistPost("draft")}>保存草稿</button><button type="button" className="primary-action" onClick={() => persistPost("published")}>发布内容</button></div>
              </div>
              <div className="content-type-selector" aria-label="内容类型">
                {(Object.keys(contentTypeLabels) as ContentType[]).map((contentType) => (
                  <button
                    key={contentType}
                    type="button"
                    className={draft.contentType === contentType ? "is-active" : ""}
                    onClick={() => changeDraftContentType(contentType)}
                  >
                    <span>{contentTypeShortLabels[contentType]}</span>
                    <strong>{contentTypeLabels[contentType]}</strong>
                  </button>
                ))}
              </div>
              <div className="editor-language-tabs" role="tablist" aria-label="编辑语言">
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorLocale === "zh"}
                  className={editorLocale === "zh" ? "is-active" : ""}
                  onClick={() => setEditorLocale("zh")}
                >
                  <span>ZH</span>
                  <strong>中文</strong>
                </button>
                <p>保存中文后，系统会自动生成英文标题、摘要、标签、正文与图片说明，无需单独维护英文版本。</p>
              </div>
              <div className="editor-layout">
                <section className="editor-main panel">
                  <label className="title-field">
                    <span>{editorLocale === "zh" ? "内容标题" : "English title"}</span>
                    <input
                      value={editorCopy.title}
                      onChange={(event) => updateLocalizedText("title", event.target.value)}
                      placeholder={editorLocale === "zh" ? `输入${contentTypeLabels[draft.contentType]}标题` : "Enter an English title"}
                      lang={editorLocale === "zh" ? "zh-CN" : "en"}
                    />
                  </label>
                  {draft.contentType === "collection" && (
                    <div className="collection-editor-note">
                      <strong>{editorLocale === "zh" ? "收藏以图库为主体" : "The gallery is the primary collection content"}</strong>
                      <p>{editorLocale === "zh" ? "正文可以留空；请在右侧维护主视觉、图片顺序、替代文字和图注。" : "English body copy is optional. Add translated alt text and captions for every image on the right."}</p>
                    </div>
                  )}
                  <div className="editor-toolbar">
                    <button type="button" onClick={() => appendLocalizedMarkdown(editorLocale === "zh" ? "\n## 小标题\n" : "\n## Section heading\n")}>H2</button>
                    <button type="button" onClick={() => appendLocalizedMarkdown(editorLocale === "zh" ? " **重点内容**" : " **Key point**")}>B</button>
                    <button type="button" onClick={() => appendLocalizedMarkdown(editorLocale === "zh" ? "\n> 引用内容\n" : "\n> Quotation\n")}>❞</button>
                    <button type="button" onClick={() => appendLocalizedMarkdown(editorLocale === "zh" ? "\n\`\`\`\n代码\n\`\`\`\n" : "\n\`\`\`\ncode\n\`\`\`\n")}>&lt;/&gt;</button>
                    <button type="button" onClick={() => setSection("media")}>图片 ◇</button>
                    <div className="mobile-preview-tabs"><button className={previewMode === "edit" ? "is-active" : ""} onClick={() => setPreviewMode("edit")}>编辑</button><button className={previewMode === "preview" ? "is-active" : ""} onClick={() => setPreviewMode("preview")}>预览</button></div>
                  </div>
                  <div className="editor-split" data-mobile-mode={previewMode}>
                    <textarea
                      aria-label={draft.contentType === "collection" ? `${editorLocale === "zh" ? "中文" : "英文"}收藏说明（可选）` : `${editorLocale === "zh" ? "中文" : "英文"} Markdown 正文`}
                      value={editorCopy.contentMarkdown}
                      onChange={(event) => updateLocalizedText("contentMarkdown", event.target.value)}
                      spellCheck={editorLocale === "en"}
                      lang={editorLocale === "zh" ? "zh-CN" : "en"}
                      placeholder={draft.contentType === "collection" ? (editorLocale === "zh" ? "可选：补充拍摄主题、角色或策展说明。" : "Optional: add notes about the character, shoot, or curation.") : undefined}
                    />
                    <MarkdownPreview markdown={editorCopy.contentMarkdown} />
                  </div>
                </section>
                <aside className="editor-meta panel">
                  <h2>发布设置 <small>语言共用</small></h2>
                  <label><span>内容链接 · SHARED</span><input value={draft.slug} onChange={(event) => updateDraft("slug", slugify(event.target.value))} onBlur={() => !draft.slug && updateDraft("slug", slugify(draft.title))} placeholder="content-slug" /></label>
                  <label>
                    <span>{editorLocale === "zh" ? "摘要" : "English summary"}</span>
                    <textarea
                      value={editorCopy.summary}
                      onChange={(event) => updateLocalizedText("summary", event.target.value)}
                      rows={4}
                      lang={editorLocale === "zh" ? "zh-CN" : "en"}
                    />
                  </label>
                  <div className="two-fields"><label><span>分类</span><select value={draft.category} onChange={(event) => updateDraft("category", event.target.value)}><option>电子</option><option>超频</option><option>硬件</option><option>游戏与次元</option></select></label><label><span>阅读时间</span><input value={draft.readTime} onChange={(event) => updateDraft("readTime", event.target.value)} /></label></div>
                  <label>
                    <span>{editorLocale === "zh" ? "标签（用逗号分隔）" : "English tags (comma separated)"}</span>
                    <input
                      value={editorCopy.tags.join(", ")}
                      onChange={(event) => updateLocalizedTags(event.target.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))}
                      lang={editorLocale === "zh" ? "zh-CN" : "en"}
                    />
                  </label>
                  <label><span>内容编号</span><input value={draft.code} onChange={(event) => updateDraft("code", event.target.value)} /></label>
                  <label><span>定时发布时间</span><input type="datetime-local" value={toDateTimeLocal(draft.publishedAt)} onChange={(event) => updateDraft("publishedAt", event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>
                  <button type="button" className="schedule-action" onClick={() => persistPost("scheduled")}>加入发布队列</button>
                  <div className="cover-control">
                    <span>{draft.contentType === "collection" ? "收藏主视觉" : "内容封面"}</span>
                    {draft.coverUrl ? (
                      <>
                        <button type="button" className="admin-image-preview" onClick={previewCover} aria-label="预览主视觉">
                          {/* Dynamic uploads intentionally bypass image optimization. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previewMediaUrl(draft.coverUrl)} alt="主视觉预览" />
                          <span>预览原图</span>
                        </button>
                        <div><button type="button" onClick={() => setSection("media")}>更换封面</button><button type="button" onClick={() => updateDraft("coverUrl", null)}>移除</button></div>
                      </>
                    ) : (
                      <button type="button" onClick={() => setSection("media")}>＋ 从媒体库选择</button>
                    )}
                  </div>
                  <div className="gallery-control">
                    <div className="gallery-control-heading">
                      <span>内容图库</span>
                      <small>{draft.gallery.length} 张</small>
                    </div>
                    {draft.gallery.length ? (
                      <div className="gallery-editor-list">
                        {localizedGallery.map((item, index) => (
                          <article key={`${item.src}-${index}`}>
                            <button type="button" className="gallery-preview-button" onClick={() => previewGallery(index)} aria-label={`预览第 ${index + 1} 张图片`}>
                              {/* Dynamic uploads intentionally bypass image optimization. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={previewMediaUrl(item.src)} alt={item.alt} />
                              <span>{String(index + 1).padStart(2, "0")}</span>
                            </button>
                            <div>
                              <label><span>{editorLocale === "zh" ? "替代文字" : "English alt text"}</span><input value={item.alt} onChange={(event) => updateGalleryItem(index, "alt", event.target.value)} placeholder={editorLocale === "zh" ? "描述画面内容" : "Describe the image in English"} lang={editorLocale === "zh" ? "zh-CN" : "en"} /></label>
                              <label><span>{editorLocale === "zh" ? "图注" : "English caption"}</span><input value={item.caption} onChange={(event) => updateGalleryItem(index, "caption", event.target.value)} placeholder={editorLocale === "zh" ? "可选：拍摄、参数或说明" : "Optional English caption"} lang={editorLocale === "zh" ? "zh-CN" : "en"} /></label>
                              {editorLocale === "zh" ? (
                                <div className="gallery-order-actions">
                                  <button type="button" disabled={index === 0} onClick={() => moveGalleryItem(index, -1)} aria-label="向前移动">↑</button>
                                  <button type="button" disabled={index === draft.gallery.length - 1} onClick={() => moveGalleryItem(index, 1)} aria-label="向后移动">↓</button>
                                  <button type="button" className="danger-action" onClick={() => removeGalleryItem(index)}>移除</button>
                                </div>
                              ) : (
                                <p className="gallery-language-lock">顺序与增删跟随中文主图库</p>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="gallery-empty">还没有图片。前往媒体库，使用“加入图库”。</p>
                    )}
                    {editorLocale === "zh" ? (
                      <button type="button" className="gallery-add-action" onClick={() => setSection("media")}>＋ 从媒体库加入图片</button>
                    ) : (
                      <button type="button" className="gallery-add-action" onClick={() => setEditorLocale("zh")}>切换到中文页签管理图片顺序</button>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          )}

          {section === "media" && (
            <section className="media-view">
              <div className="view-heading"><div><span>05 / ASSETS</span><h1>媒体库</h1><p>预览原图，或将图片插入正文、设为主视觉、加入当前内容图库。</p></div><button className="primary-action" onClick={() => fileInput.current?.click()}>↑ 上传图片</button></div>
              <div className="upload-dropzone" onClick={() => fileInput.current?.click()}><span>◇</span><strong>点击选择图片</strong><p>支持 JPEG、PNG、WebP 和 GIF，单张不超过 10 MB<br />上传时自动清除可识别的 EXIF、定位与文本元数据</p></div>
              {assets.length ? (
                <div className="media-grid">
                  {assets.map((asset) => (
                    <article key={asset.id}>
                      <button type="button" className="media-preview-button" onClick={() => previewAsset(asset)} aria-label={`预览 ${asset.filename}`}>
                        {/* Dynamic uploads intentionally bypass image optimization. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewMediaUrl(asset.url)} alt={asset.alt} />
                        <span>预览原图</span>
                      </button>
                      <strong>{asset.filename}</strong>
                      <small>{Math.max(1, Math.round(asset.size / 1024))} KB</small>
                      <div className="media-actions">
                        <button onClick={() => previewAsset(asset)}>预览</button>
                        <button onClick={() => insertImage(asset)}>插入正文</button>
                        <button onClick={() => setAsCover(asset)}>设为主视觉</button>
                        <button onClick={() => addToGallery(asset)}>加入图库</button>
                        {asset.builtIn ? (
                          <span className="built-in-asset-label">内置资料图</span>
                        ) : (
                          <button className="danger-action" onClick={() => deleteAsset(asset)}>删除</button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <div className="empty-media"><span>NO ASSETS</span><p>媒体库还是空的，上传第一张内容图片吧。</p></div>}
            </section>
          )}

          {section === "settings" && (
            <section className="settings-view">
              <div className="view-heading"><div><span>06 / CONFIG</span><h1>站点设置</h1><p>接入 VPS API 后，这些内容会保存到 PostgreSQL。</p></div><button className="primary-action" disabled={saving} onClick={saveSettings}>{saving ? "保存中…" : "保存设置"}</button></div>
              <div className="settings-grid"><section className="panel"><h2>基本信息</h2><label><span>网站名称</span><input value={settings.siteTitle} onChange={(event) => setSettings((current) => ({ ...current, siteTitle: event.target.value }))} /></label><label><span>网站副标题</span><input value={settings.tagline} onChange={(event) => setSettings((current) => ({ ...current, tagline: event.target.value }))} /></label><label><span>个人介绍</span><textarea rows={5} value={settings.bio} onChange={(event) => setSettings((current) => ({ ...current, bio: event.target.value }))} /></label></section><section className="panel"><h2>发布偏好</h2><label><span>默认分类</span><select value={settings.defaultCategory} onChange={(event) => setSettings((current) => ({ ...current, defaultCategory: event.target.value }))}><option>电子</option><option>超频</option><option>硬件</option><option>游戏与次元</option></select></label><label><span>默认作者</span><input value={settings.defaultAuthor} onChange={(event) => setSettings((current) => ({ ...current, defaultAuthor: event.target.value }))} /></label><div className="settings-note"><strong>修订记录已启用</strong><p>每次更新文章前，服务端会自动保留旧版本，最多可由接口读取最近 30 个版本。</p></div><div className="settings-note"><strong>图片安全检查已启用</strong><p>上传时会核验文件头，仅允许 JPEG、PNG、WebP 和 GIF。</p></div></section></div>
            </section>
          )}
        </div>
      </section>

      <input ref={fileInput} className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.currentTarget.value = ""; }} />
      <ImageLightbox
        images={lightbox?.images ?? []}
        activeIndex={lightbox?.index ?? null}
        onClose={() => setLightbox(null)}
        onChange={(index) => setLightbox((current) => current ? { ...current, index } : current)}
      />
      {notice && <div className="admin-toast" role="status">{notice}</div>}
    </main>
  );
}
