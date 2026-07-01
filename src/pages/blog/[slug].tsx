import { GetStaticPaths, GetStaticProps } from "next";
import { BlogPost } from "@/components/blog/BlogPost";
import { cmsService } from "@/services/cmsService";
import staticPosts from "@/lib/blog.json";

interface BlogPostPageProps {
  post: {
    title: string;
    excerpt: string;
    content: string;
    author: string;
    published_date: string;
    category: string;
    tags: string[];
    cover_image?: string;
  };
}

export default function BlogPostPage({ post }: BlogPostPageProps) {
  return (
    <BlogPost
      title={post.title}
      excerpt={post.excerpt}
      content={post.content}
      author={post.author}
      publishedDate={post.published_date}
      category={post.category}
      tags={post.tags}
      coverImage={post.cover_image}
    />
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  // Return empty paths to defer generation to request time. 
  // This prevents Out Of Memory (OOM) errors during Vercel builds for large amounts of CMS content.
  return {
    paths: [],
    fallback: "blocking",
  };
};

// The marketing site launched with 15 posts baked into src/lib/blog.json
// (which is what /blog lists), while CMS-authored posts live in the
// blog_posts table. Serve the DB post when one exists, otherwise fall
// back to the static post so index links never 404.
interface StaticBlock {
  type: string;
  text?: string;
  level?: number;
  question?: string;
  answer?: string;
  heading?: string;
}

function staticPostToProps(slug: string) {
  const post = (staticPosts as Array<{ slug: string; title: string; author: string; date: string; image?: string; content: StaticBlock[] }>)
    .find((p) => p.slug === slug);
  if (!post) return null;

  const md: string[] = [];
  for (const b of post.content) {
    if (b.type === "heading" && b.text) md.push(`${"#".repeat(Math.min(Math.max(b.level || 2, 2), 3))} ${b.text}`);
    else if (b.type === "paragraph" && b.text) md.push(b.text);
    else if (b.type === "qa" && b.question) md.push(`**${b.question}**`, b.answer || "");
    else if (b.type === "solution") md.push(`## ${b.heading || "The Solution"}`, b.text || "");
  }
  const firstParagraph = post.content.find((b) => b.type === "paragraph")?.text || post.title;

  return {
    title: post.title,
    excerpt: firstParagraph.length > 160 ? `${firstParagraph.slice(0, 157)}...` : firstParagraph,
    content: md.filter(Boolean).join("\n\n"),
    author: post.author,
    published_date: post.date,
    category: "Business Strategy",
    tags: [],
    cover_image: post.image || null,
  };
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = params?.slug as string;

  let post = null;
  try {
    post = await cmsService.getBlogPostBySlug(slug);
  } catch {
    // DB unavailable at request time - the static fallback below still serves.
  }
  if (!post) post = staticPostToProps(slug) as any;

  if (!post) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      post,
    },
    revalidate: 60, // Revalidate every 60 seconds
  };
};
