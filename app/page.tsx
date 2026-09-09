import { fallbackArticles } from "./article-data";
import { loadManagedPublicPosts, toCatalogArticle } from "./public-posts";
import { localizeArticle } from "./i18n";
import Home from "./terminal-home";

export default async function Page() {
  const managed = await loadManagedPublicPosts();
  const initialArticles = managed ?? fallbackArticles.map((article) => {
    const english = localizeArticle(article, "en");
    return toCatalogArticle({ ...article, translations: { en: {
      title: english.title, summary: english.summary, tags: english.tags,
    } } });
  });
  return <Home initialArticles={initialArticles} managed={managed !== null} />;
}
