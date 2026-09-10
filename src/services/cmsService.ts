/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";
import type { BlogPost, CMSPage } from "@/types/cms";

export const cmsService = {
  async getAllBlogPosts(publishedOnly: boolean = true): Promise<BlogPost[]> {
    let query = supabase
      .from("blog_posts")
      .select("*")
      .order("published_date", { ascending: false });

    if (publishedOnly) {
      query = query.eq("is_published", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching blog posts:", error);
      throw error;
    }

    return data as BlogPost[];
  },

  async getBlogPostBySlug(slug: string, publishedOnly: boolean = true): Promise<BlogPost | null> {
    // publishedOnly guards the PUBLIC renderer: without it, anyone with
    // the slug could read drafts (and ISR would cache them).
    let query = supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug);
    if (publishedOnly) {
      query = query.eq("is_published", true);
    }
    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      console.error("Error fetching blog post:", error);
      throw error;
    }

    return data as BlogPost;
  },

  async createBlogPost(post: Omit<BlogPost, "id" | "created_at">): Promise<BlogPost> {
    const { data, error } = await supabase
      .from("blog_posts")
      .insert([post])
      .select()
      .single();

    if (error) {
      console.error("Error creating blog post:", error);
      throw error;
    }

    return data as BlogPost;
  },

  async updateBlogPost(id: string, updates: Partial<BlogPost>): Promise<BlogPost> {
    const { data, error } = await supabase
      .from("blog_posts")
      .update({ ...updates, last_updated: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating blog post:", error);
      throw error;
    }

    return data as BlogPost;
  },

  async deleteBlogPost(id: string): Promise<void> {
    const { error } = await supabase
      .from("blog_posts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting blog post:", error);
      throw error;
    }
  },

  async getPageBySlug(slug: string): Promise<CMSPage | null> {
    const { data, error } = await supabase
      .from("cms_pages")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      console.error("Error fetching page:", error);
      throw error;
    }

    return data as CMSPage;
  },

  async getAllPages(publishedOnly: boolean = true): Promise<CMSPage[]> {
    let query = supabase
      .from("cms_pages")
      .select("*")
      .order("title", { ascending: true });

    if (publishedOnly) {
      query = query.eq("is_published", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching pages:", error);
      throw error;
    }

    return data as CMSPage[];
  },

  async createPage(page: Omit<CMSPage, "id" | "created_at" | "last_updated">): Promise<CMSPage> {
    const { data, error } = await supabase
      .from("cms_pages")
      .insert([page as any])
      .select()
      .single();

    if (error) {
      console.error("Error creating page:", error);
      throw error;
    }

    return data as CMSPage;
  },

  async updatePage(id: string, updates: Partial<Omit<CMSPage, "id" | "created_at">>): Promise<CMSPage> {
    const { data, error } = await supabase
      .from("cms_pages")
      .update({ ...updates, last_updated: new Date().toISOString() } as any)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating page:", error);
      throw error;
    }

    return data as CMSPage;
  },

  async deletePage(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("cms_pages")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting page:", error);
      throw error;
    }

    return true;
  }
};
