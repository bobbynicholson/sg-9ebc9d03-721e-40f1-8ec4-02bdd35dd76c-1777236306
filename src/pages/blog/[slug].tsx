import { GetStaticPaths, GetStaticProps } from "next";
import { BlogPost } from "@/components/blog/BlogPost";
import { cmsService } from "@/services/cmsService";

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
  const posts = await cmsService.getAllBlogPosts();
  
  const paths = posts.map((post: any) => ({
    params: { slug: post.slug },
  }));

  return {
    paths,
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = params?.slug as string;
  const post = await cmsService.getBlogPostBySlug(slug);

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
