import { GetStaticProps, GetStaticPaths } from "next";
import Head from "next/head";
import Image from "next/image";
import { ParsedUrlQuery } from "querystring";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircleQuestion, Lightbulb, User, Calendar } from "lucide-react";
import blogPosts from "@/lib/blog.json";
import Link from "next/link";

interface Post {
  slug: string;
  title: string;
  author: string;
  date: string;
  image: string;
  content: ContentBlock[];
}

interface ContentBlock {
  type: "paragraph" | "heading" | "qa" | "solution";
  text?: string;
  level?: number;
  question?: string;
  answer?: string;
  heading?: string;
  cta?: {
    text: string;
    link: string;
  };
}

interface PostProps {
  post: Post;
}

interface Params extends ParsedUrlQuery {
  slug: string;
}

const PostPage = ({ post }: PostProps) => {
  if (!post) {
    return <div>Post not found</div>;
  }

  const renderContentBlock = (block: ContentBlock, index: number) => {
    switch (block.type) {
      case "heading":
        const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
        return <HeadingTag key={index} className="text-2xl md:text-3xl font-bold mt-8 mb-4 text-gray-800">{block.text}</HeadingTag>;
      case "paragraph":
        return <p key={index} className="text-lg text-gray-700 leading-relaxed mb-6">{block.text}</p>;
      case "qa":
        return (
          <Card key={index} className="mb-6 bg-amber-50 border-amber-200">
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="p-3 bg-amber-500 rounded-full">
                <MessageCircleQuestion className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl text-amber-900">The Problem</CardTitle>
                <p className="font-semibold text-gray-800 mt-2">{block.question}</p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700">{block.answer}</p>
            </CardContent>
          </Card>
        );
      case "solution":
        return (
          <Card key={index} className="mb-6 bg-green-50 border-green-200">
            <CardHeader className="flex flex-row items-start gap-4 space-y-0">
              <div className="p-3 bg-green-500 rounded-full">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl text-green-900">The Solution: {block.heading}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">{block.text}</p>
              {block.cta && (
                <Link href={block.cta.link}>
                  <Button className="mt-2 bg-green-600 hover:bg-green-700">
                    {block.cta.text} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "image": post.image,
    "author": {
      "@type": "Organization",
      "name": "CateringMS"
    },
    "datePublished": post.date,
    "description": post.content.find(block => block.type === 'paragraph')?.text || post.title
  };

  return (
    <>
      <Head>
        <title>{post.title} | CateringMS Blog</title>
        <meta name="description" content={post.content.find(block => block.type === 'paragraph')?.text || post.title} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Head>
      <Header />
      <main className="bg-gray-50 py-12 md:py-20">
        <div className="container max-w-4xl mx-auto px-4">
          <article>
            <header className="mb-8">
              <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">{post.title}</h1>
              <div className="flex items-center text-gray-500 text-sm">
                <div className="flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  <span>{post.author}</span>
                </div>
                <span className="mx-2">|</span>
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>{new Date(post.date).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>
              <div className="mt-4">
                  <Badge>Catering Business</Badge>
                  <Badge className="ml-2">Management</Badge>
                  <Badge className="ml-2">Automation</Badge>
              </div>
            </header>
            
            <div className="relative w-full h-64 md:h-96 rounded-2xl overflow-hidden mb-8 shadow-lg">
              <Image src={post.image} alt={post.title} layout="fill" objectFit="cover" />
            </div>

            <div className="prose prose-lg max-w-none">
              {post.content.map(renderContentBlock)}
            </div>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
};

export const getStaticPaths: GetStaticPaths<Params> = async () => {
  const posts = blogPosts as Post[];
  const paths = posts.map((post) => ({
    params: { slug: post.slug },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<PostProps, Params> = async ({ params }) => {
  const posts = blogPosts as Post[];
  const post = posts.find((p) => p.slug === params!.slug);

  if (!post) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      post,
    },
  };
};

export default PostPage;
