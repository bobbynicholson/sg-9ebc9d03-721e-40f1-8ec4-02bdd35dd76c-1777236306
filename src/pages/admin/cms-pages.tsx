import { useState, useEffect } from "react";
import { cmsService } from "@/services/cmsService";
import type { CMSPage } from "@/types/cms";
import type { Page } from "@/types/cms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Plus, ArrowLeft, Save, X, FileText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function CMSPageManagement() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    slug: "",
    title: "",
    content: "",
    meta_title: "",
    meta_description: "",
    is_published: true
  });

  useEffect(() => {
    loadPages();
  }, []);

  const loadPages = async () => {
    try {
      setLoading(true);
      const data = await cmsService.getAllPages(false);
      setPages(data);
    } catch (error) {
      console.error("Error loading pages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (page: Page) => {
    setEditingPage(page);
    setFormData({
      slug: page.slug,
      title: page.title,
      content: page.content,
      meta_title: page.meta_title || "",
      meta_description: page.meta_description || "",
      is_published: page.is_published
    });
  };

  const handleSave = async () => {
    try {
      if (editingPage) {
        await cmsService.updatePage(editingPage.id, formData);
      } else {
        await cmsService.createPage(formData);
      }

      await loadPages();
      handleCancel();
    } catch (error) {
      console.error("Error saving page:", error);
      alert("Failed to save page");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this page?")) return;

    try {
      await cmsService.deletePage(id);
      await loadPages();
    } catch (error) {
      console.error("Error deleting page:", error);
      alert("Failed to delete page");
    }
  };

  const handleCancel = () => {
    setEditingPage(null);
    setIsCreating(false);
    setFormData({
      slug: "",
      title: "",
      content: "",
      meta_title: "",
      meta_description: "",
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

  if (editingPage || isCreating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold">
              {editingPage ? "Edit Page" : "Create New Page"}
            </h1>
            <Button variant="ghost" onClick={handleCancel}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>

          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <Label htmlFor="title">Page Title</Label>
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
                  placeholder="Enter page title"
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
                <p className="text-xs text-gray-500 mt-1">
                  Page will be available at: /page/{formData.slug}
                </p>
              </div>

              <div>
                <Label htmlFor="content">Page Content</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Page content (supports basic HTML)"
                  rows={20}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can use HTML tags for formatting
                </p>
              </div>

              <div>
                <Label htmlFor="meta_title">Meta Title (SEO)</Label>
                <Input
                  id="meta_title"
                  value={formData.meta_title}
                  onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
                  placeholder="SEO title for search engines"
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
                  Save Page
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
            <h1 className="text-4xl font-bold mb-2">Page Management</h1>
            <p className="text-gray-600">Manage static pages and their content</p>
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
              New Page
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading pages...</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {pages.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold mb-2">No pages yet</h3>
                  <p className="text-gray-600 mb-4">
                    Create your first page to get started
                  </p>
                  <Button onClick={() => setIsCreating(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Page
                  </Button>
                </CardContent>
              </Card>
            ) : (
              pages.map((page) => (
                <Card key={page.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={page.is_published ? "default" : "secondary"}>
                            {page.is_published ? "Published" : "Draft"}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            /page/{page.slug}
                          </span>
                        </div>
                        <CardTitle className="text-xl mb-2">{page.title}</CardTitle>
                        <CardDescription className="line-clamp-2">
                          {page.content.substring(0, 150)}...
                        </CardDescription>
                        <div className="mt-2 text-sm text-gray-500">
                          Last updated: {new Date(page.last_updated).toLocaleDateString("en-ZA")}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(page)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(page.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
