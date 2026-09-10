
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  published_date: string;
  last_updated: string;
  featured_image?: string;
  category: string;
  tags: string[];
  meta_title?: string;
  meta_description?: string;
  is_published: boolean;
  read_time_minutes?: number;
}

export interface CMSSettings {
  site_name: string;
  site_description: string;
  default_author: string;
  blog_categories: string[];
}

export interface CMSPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  // NOTE: cms_pages has NO meta_title column in the live DB - the page
  // <title> derives from `title`. (blog_posts does have meta_title.)
  meta_description?: string | null;
  meta_keywords?: string | null;
  /** Hero image URL displayed above the post title. */
  header_image_url?: string | null;
  /** Alt text for the hero image. Required for accessibility when
   *  header_image_url is set. */
  header_image_alt?: string | null;
  is_published: boolean;
  last_updated: string;
  created_at: string;
}
