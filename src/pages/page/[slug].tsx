
import { GetServerSideProps } from "next";
import { cmsService } from "@/services/cmsService";
import type { CMSPage } from "@/types/cms";
import Head from "next/head";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

interface PageProps {
  page: CMSPage | null;
}

export default function DynamicPage({ page }: PageProps) {
  if (!page) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow flex items-center justify-center text-center p-8">
          <div>
            <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
            <p className="text-lg text-gray-600">
              The page you are looking for does not exist.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{page.meta_title || `${page.title} - CateringMS`}</title>
        <meta name="description" content={page.meta_description || ""} />
        {page.meta_keywords && <meta name="keywords" content={page.meta_keywords} />}
        {/* OpenGraph for share cards -- the header image doubles as
            the og:image so social previews look right. */}
        {(page as any).header_image_url && (
          <meta property="og:image" content={(page as any).header_image_url} />
        )}
        {(page as any).header_image_alt && (
          <meta property="og:image:alt" content={(page as any).header_image_alt} />
        )}
      </Head>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-12">
          <article className="prose lg:prose-xl mx-auto">
            {(page as any).header_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={(page as any).header_image_url}
                alt={(page as any).header_image_alt || ""}
                className="!my-0 w-full max-h-[480px] object-cover rounded-xl"
              />
            )}
            <h1>{page.title}</h1>
            <div dangerouslySetInnerHTML={{ __html: page.content }} />
          </article>
        </main>
        <Footer />
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.params || {};

  if (typeof slug !== "string") {
    return { notFound: true };
  }

  try {
    const page = await cmsService.getPageBySlug(slug);

    if (!page || !page.is_published) {
      return { notFound: true };
    }

    return {
      props: {
        page,
      },
    };
  } catch (error) {
    console.error(`Error fetching page for slug: ${slug}`, error);
    return { notFound: true };
  }
};
