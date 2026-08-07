import type { MetadataRoute } from "next";
import { fallbackArticles } from "./article-data";
import { loadManagedPublicPosts } from "./public-posts";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const managedPosts = await loadManagedPublicPosts();
  const articles = managedPosts ?? fallbackArticles;
  return [
    {
      url: "https://www.mozelle.top/",
      changeFrequency: "weekly",
      priority: 1,
    },
    ...articles.map((article) => ({
      url: `https://www.mozelle.top/${article.contentType === "collection" ? "collections" : "articles"}/${encodeURIComponent(article.slug ?? article.id)}`,
      lastModified: article.date.replaceAll(".", "-"),
      changeFrequency: "monthly" as const,
      priority: article.contentType === "collection" ? 0.65 : 0.75,
    })),
  ];
}
