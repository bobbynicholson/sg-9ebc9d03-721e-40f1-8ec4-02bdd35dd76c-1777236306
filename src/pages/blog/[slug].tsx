import { GetStaticProps, GetStaticPaths } from "next";
import Head from "next/head";
import Image from "next/image";
import { ParsedUrlQuery } from "querystring";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircleQuestion, Lightbulb, User, Calendar, Clock } from "lucide-react";
import blogPosts from "@/lib/blog.json";
import Link from "next/link";

interface Post {
  slug: string;
  title: string;
  author: string;
  date: string;
  image: string;
  imageCredit?: {
    photographer: string;
    photographerUrl: string;
    photoUrl: string;
    license: string;
    licenseUrl: string;
  };
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
  relatedPosts: Post[];
}

interface Params extends ParsedUrlQuery {
  slug: string;
}

const PostPage = ({ post, relatedPosts }: PostProps) => {
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

            {post.imageCredit && (
              <div className="text-sm text-slate-600 mb-8 pb-6 border-b border-slate-200">
                <p>
                  Photo by{" "}
                  <a 
                    href={post.imageCredit.photographerUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 font-medium underline"
                  >
                    {post.imageCredit.photographer}
                  </a>
                  {" "}on{" "}
                  <a 
                    href={post.imageCredit.photoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 font-medium underline"
                  >
                    Unsplash
                  </a>
                  {" "}({" "}
                  <a 
                    href={post.imageCredit.licenseUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 font-medium underline"
                  >
                    {post.imageCredit.license}
                  </a>
                  {" "})
                </p>
              </div>
            )}

            <div className="prose prose-lg max-w-none">
              {post.content.map(renderContentBlock)}
            </div>

            {/* Related Posts Section */}
            {relatedPosts.length > 0 && (
              <div className="mt-16 pt-12 border-t-2 border-gray-200">
                <h2 className="text-3xl font-bold text-gray-900 mb-8">Related Articles</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {relatedPosts.map((relatedPost) => (
                    <Link key={relatedPost.slug} href={`/blog/${relatedPost.slug}`}>
                      <Card className="h-full hover:shadow-xl transition-all duration-300 cursor-pointer group">
                        <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
                          <Image 
                            src={relatedPost.image} 
                            alt={relatedPost.title} 
                            layout="fill" 
                            objectFit="cover"
                            className="group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <CardHeader>
                          <CardTitle className="text-lg line-clamp-2 group-hover:text-purple-600 transition-colors">
                            {relatedPost.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center text-sm text-gray-500 mb-3">
                            <Calendar className="w-4 h-4 mr-2" />
                            <span>{new Date(relatedPost.date).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-3">
                            {relatedPost.content.find(block => block.type === 'paragraph')?.text || ''}
                          </p>
                          <div className="mt-4 flex items-center text-purple-600 font-medium text-sm group-hover:text-purple-800">
                            Read More <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
};

export const getStaticPaths: GetStaticPaths<Params> = async () => {
  // We'll let ISR handle generating pages on demand.
  // This avoids building all pages at once and causing memory issues.
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<PostProps, Params> = async ({ params }) => {
  const posts = blogPosts as Post[];
  const post = posts.find((p) => p.slug === params!.slug);

  if (!post) {
    return {
      notFound: true,
    };
  }

  // Get related posts (exclude current post, limit to 3)
  const relatedPosts = posts
    .filter((p) => p.slug !== post.slug)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  return {
    props: {
      post,
      relatedPosts,
    },
    revalidate: 3600, // Re-generate the page in the background every hour
  };
};

export default PostPage;
