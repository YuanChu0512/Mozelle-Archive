import type { Metadata } from "next";
import { fallbackArticles } from "../../article-data";
import { loadManagedPublicPosts } from "../../public-posts";
import CollectionReader from "./collection-reader";

type CollectionPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { id } = await params;
  const managedPosts = await loadManagedPublicPosts();
  const candidates = managedPosts ?? fallbackArticles;
  const matched = candidates.find((item) => item.id === id || item.slug === id);
  const collection = matched?.contentType === "collection" ? matched : undefined;
  const title = collection?.title ?? "次元收藏";
  const description = collection?.summary ?? "Mozelle Journal 次元收藏记录。";
  const canonicalKey = collection?.slug ?? collection?.id ?? id;
  const canonicalUrl = `/collections/${encodeURIComponent(canonicalKey)}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: collection ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonicalUrl,
      images: collection?.coverUrl ? [{ url: collection.coverUrl, alt: collection.title }] : undefined,
    },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { id } = await params;
  return <CollectionReader collectionId={id} />;
}
