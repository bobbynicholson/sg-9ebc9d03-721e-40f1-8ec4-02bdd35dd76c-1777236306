import { useState, useEffect } from "react";
import { cmsService } from "@/services/cmsService";
import type { BlogPost } from "@/types/cms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Plus, ArrowLeft, Save, X } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function CMSBlogManagement() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    category: "",
    author: "CateringOS Team",
    tags: "",
    meta_description: "",
    read_time_minutes: 5,
    is_published: true
  });

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const data = await cmsService.getAllBlogPosts(false);
      setPosts(data);
    } catch (error) {
      console.error("Error loading posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (post: BlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      author: post.author,
      tags: post.tags?.join(", ") || "",
      meta_description: post.meta_description || "",
      read_time_minutes: post.read_time_minutes || 5,
      is_published: post.is_published
    });
  };

  const handleSave = async () => {
    try {
      const postData = {
        ...formData,
        tags: formData.tags.split(",").map(t => t.trim()).filter(Boolean)
      };

      if (editingPost) {
        await cmsService.updateBlogPost(editingPost.id, postData);
      } else {
        await cmsService.createBlogPost({
          ...postData,
          published_date: new Date().toISOString()
        });
      }

      await loadPosts();
      handleCancel();
    } catch (error) {
      console.error("Error saving post:", error);
      alert("Failed to save post");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this blog post?")) return;

    try {
      await cmsService.deleteBlogPost(id);
      await loadPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Failed to delete post");
    }
  };

  const handleCancel = () => {
    setEditingPost(null);
    setIsCreating(false);
    setFormData({
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      category: "",
      author: "CateringOS Team",
      tags: "",
      meta_description: "",
      read_time_minutes: 5,
      is_published: true
    });
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  if (editingPost || isCreating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold">
              {editingPost ? "Edit Blog Post" : "Create New Blog Post"}
            </h1>
            <Button variant="ghost" onClick={handleCancel}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>

          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      title: e.target.value,
                      slug: generateSlug(e.target.value)
                    });
                  }}
                  placeholder="Enter post title"
                />
              </div>

              <div>
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="url-friendly-slug"
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Operations, Profitability"
                />
              </div>

              <div>
                <Label htmlFor="excerpt">Excerpt</Label>
                <Textarea
                  id="excerpt"
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  placeholder="Short description of the post"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Full blog post content"
                  rows={15}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use ## for headings, **text** for bold
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="author">Author</Label>
                  <Input
                    id="author"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="read_time">Read Time (minutes)</Label>
                  <Input
                    id="read_time"
                    type="number"
                    value={formData.read_time_minutes}
                    onChange={(e) => setFormData({ ...formData, read_time_minutes: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="catering, profitability, automation"
                />
              </div>

              <div>
                <Label htmlFor="meta_description">Meta Description (SEO)</Label>
                <Textarea
                  id="meta_description"
                  value={formData.meta_description}
                  onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                  placeholder="SEO description for search engines"
                  rows={2}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="published"
                  checked={formData.is_published}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                />
                <Label htmlFor="published">Published</Label>
              </div>

              <div className="flex gap-4">
                <Button onClick={handleSave} className="flex-1">
                  <Save className="mr-2 h-4 w-4" />
                  Save Post
                </Button>
                <Button variant="outline" onClick={handleCancel} className="flex-1">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Blog Post Management</h1>
            <p className="text-gray-600">Manage your blog content and SEO settings</p>
          </div>
          <div className="flex gap-4">
            <Link href="/admin/settings">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Settings
              </Button>
            </Link>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Post
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading posts...</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {posts.map((post) => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={post.is_published ? "default" : "secondary"}>
                          {post.is_published ? "Published" : "Draft"}
                        </Badge>
                        <Badge variant="outline">{post.category}</Badge>
                      </div>
                      <CardTitle className="text-xl mb-2">{post.title}</CardTitle>
                      <CardDescription>{post.excerpt}</CardDescription>
                      <div className="mt-2 text-sm text-gray-500">
                        By {post.author} • {new Date(post.published_date).toLocaleDateString("en-ZA")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(post)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(post.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
