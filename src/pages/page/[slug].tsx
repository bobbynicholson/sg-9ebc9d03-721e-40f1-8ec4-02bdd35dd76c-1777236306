import { GetStaticPaths, GetStaticProps } from "next";
import { cmsService } from "@/services/cmsService";
import type { Page } from "@/types/cms";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

interface PageProps {
  page: Page;
}

export default function CMSPageView({ page }: PageProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": page.title,
    "description": page.meta_description || page.title,
    "url": `https://cateringms.com/page/${page.slug}`,
    "datePublished": page.created_at,
    "dateModified": page.last_updated,
    "inLanguage": "en-ZA",
    "author": {
      "@type": "Organization",
      "name": "CateringMS"
    },
    "publisher": {
      "@type": "Organization",
      "name": "CateringMS",
      "description": "A product of Skylight Digital",
      "url": "https://cateringms.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://cateringms.com/logo.png"
      },
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "17 Swalle Street",
        "addressLocality": "Golden Acre",
        "addressCountry": "ZA"
      },
      "telephone": "+27836525755"
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://cateringms.com/page/${page.slug}`
    },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://cateringms.com"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": page.title,
          "item": `https://cateringms.com/page/${page.slug}`
        }
      ]
    }
  };

  return (
    <>
      <Head>
        <title>{page.meta_title || page.title}</title>
        <meta
          name="description"
          content={page.meta_description || page.title}
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://cateringms.com/page/${page.slug}`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </Head>

      <Header />

      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
        {/* Page Content */}
        <main className="max-w-4xl mx-auto px-4 py-12">
          <article className="bg-white rounded-2xl shadow-lg border border-orange-100 overflow-hidden">
            {/* Page Header */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-8 py-12 text-white">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                {page.title}
              </h1>
              
              <div className="flex items-center gap-4 text-orange-100">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">
                    Updated {new Date(page.last_updated).toLocaleDateString("en-ZA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric"
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Page Body */}
            <div className="px-8 py-12">
              <div 
                className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-orange-600 hover:prose-a:text-orange-700 prose-strong:text-gray-900 prose-ul:text-gray-700 prose-ol:text-gray-700"
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
            </div>
          </article>

          {/* Back to Home CTA */}
          <div className="mt-12 text-center">
            <Link href="/">
              <Button size="lg" className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700">
                <ArrowLeft className="mr-2 h-5 w-5" />
                Return to Homepage
              </Button>
            </Link>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  // By returning an empty paths array and setting fallback to 'blocking',
  // we tell Next.js to generate pages on-demand instead of at build time.
  // This is crucial for preventing memory issues with a large number of CMS pages.
  return {
    paths: [],
    fallback: "blocking"
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  try {
    const slug = params?.slug as string;
    const page = await cmsService.getPageBySlug(slug);

    if (!page || !page.is_published) {
      return {
        notFound: true
      };
    }

    return {
      props: {
        page
      },
      revalidate: 3600 // Re-generate the page in the background every hour
    };
  } catch (error) {
    console.error("Error fetching page:", error);
    return {
      notFound: true
    };
  }
};
