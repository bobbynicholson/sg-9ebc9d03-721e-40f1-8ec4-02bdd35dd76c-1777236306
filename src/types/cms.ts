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

export interface Page {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  is_published: boolean;
  last_updated: string;
}

export interface CMSSettings {
  site_name: string;
  site_description: string;
  default_author: string;
  blog_categories: string[];
}
