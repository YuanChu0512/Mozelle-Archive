import type { Metadata } from "next";
import { fallbackArticles } from "../../article-data";
import { loadManagedPublicPosts } from "../../public-posts";
import ArticleReader from "./article-reader";

type ArticlePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { id } = await params;
  const managedPosts = await loadManagedPublicPosts();
  const candidates = managedPosts ?? fallbackArticles;
  const matched = candidates.find((item) => item.id === id || item.slug === id);
  const article = matched?.contentType === "collection" ? undefined : matched;
  const title = article?.title ?? "文章阅读";
  const description = article?.summary ?? "Mozelle Archive 独立文章页面。";
  const canonicalKey = article?.slug ?? article?.id ?? id;
  const canonicalUrl = `/articles/${encodeURIComponent(canonicalKey)}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: article ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonicalUrl,
      images: article?.coverUrl ? [{ url: article.coverUrl, alt: article.title }] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { id } = await params;
  return <ArticleReader articleId={id} />;
}
