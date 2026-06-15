import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, Calendar, User, ArrowLeft, 
  ChevronRight, BookOpen, Share2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

interface BlogPostProps {
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishedDate: string;
  category: string;
  tags?: string[];
  coverImage?: string;
}

// Category-based theming
const CATEGORY_THEMES = {
  "Catering Tips": {
    gradient: "from-blue-500 to-cyan-500",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    accent: "text-blue-600",
    button: "bg-blue-600 hover:bg-blue-700",
  },
  "Business Growth": {
    gradient: "from-purple-500 to-pink-500",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    accent: "text-purple-600",
    button: "bg-purple-600 hover:bg-purple-700",
  },
  "Event Planning": {
    gradient: "from-emerald-500 to-teal-500",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    accent: "text-emerald-600",
    button: "bg-emerald-600 hover:bg-emerald-700",
  },
  "Recipes": {
    gradient: "from-orange-500 to-red-500",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    accent: "text-orange-600",
    button: "bg-orange-600 hover:bg-orange-700",
  },
  "Industry News": {
    gradient: "from-slate-500 to-gray-600",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    accent: "text-slate-600",
    button: "bg-slate-600 hover:bg-slate-700",
  },
  "General": {
    gradient: "from-indigo-500 to-blue-500",
    badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
    accent: "text-indigo-600",
    button: "bg-indigo-600 hover:bg-indigo-700",
  },
};

export function BlogPost({ 
  title, 
  excerpt, 
  content, 
  author, 
  publishedDate, 
  category,
  tags = [],
  coverImage 
}: BlogPostProps) {
  const router = useRouter();
  const [readingProgress, setReadingProgress] = useState(0);
  const [activeSection, setActiveSection] = useState<string>("");
  const [tableOfContents, setTableOfContents] = useState<Array<{ id: string; title: string; level: number }>>([]);

  const theme = CATEGORY_THEMES[category as keyof typeof CATEGORY_THEMES] || CATEGORY_THEMES.General;

  // Calculate reading time (average 200 words per minute)
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);

  // Extract headings for Table of Contents
  useEffect(() => {
    const headings = content.match(/^#{2,3}\s+(.+)$/gm) || [];
    const toc = headings.map((heading, index) => {
      const level = heading.match(/^#+/)?.[0].length || 2;
      const title = heading.replace(/^#+\s+/, "");
      const id = `section-${index}`;
      return { id, title, level };
    });
    setTableOfContents(toc);
  }, [content]);

  // Track scroll progress
  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight - windowHeight;
      const scrolled = window.scrollY;
      const progress = (scrolled / documentHeight) * 100;
      setReadingProgress(Math.min(progress, 100));

      // Update active section
      const sections = tableOfContents.map(item => document.getElementById(item.id));
      const currentSection = sections.find(section => {
        if (!section) return false;
        const rect = section.getBoundingClientRect();
        return rect.top <= 100 && rect.bottom >= 100;
      });
      if (currentSection) {
        setActiveSection(currentSection.id);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [tableOfContents]);

  // Scroll to section
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: "smooth",
      });
    }
  };

  // Render markdown content with IDs for headings
  const renderContent = () => {
    let sectionIndex = 0;
    const lines = content.split("\n");
    
    return lines.map((line, index) => {
      // Handle headings
      if (line.match(/^#{2,3}\s+/)) {
        const level = line.match(/^#+/)?.[0].length || 2;
        const text = line.replace(/^#+\s+/, "");
        const id = `section-${sectionIndex}`;
        sectionIndex++;

        if (level === 2) {
          return (
            <h2 key={index} id={id} className={cn("text-3xl font-bold mt-12 mb-4", theme.accent)}>
              {text}
            </h2>
          );
        } else if (level === 3) {
          return (
            <h3 key={index} id={id} className="text-2xl font-semibold mt-8 mb-3 text-slate-800">
              {text}
            </h3>
          );
        }
      }

      // Handle paragraphs
      if (line.trim() && !line.startsWith("#")) {
        // Check for internal links pattern: [[Page Name|/path]]
        const linkPattern = /\[\[([^\|]+)\|([^\]]+)\]\]/g;
        if (linkPattern.test(line)) {
          const parts = line.split(linkPattern);
          return (
            <p key={index} className="text-lg leading-relaxed text-slate-700 mb-4">
              {parts.map((part, i) => {
                if (i % 3 === 1) {
                  // Link text
                  const path = parts[i + 1];
                  return (
                    <a
                      key={i}
                      href={path}
                      className={cn(`font-semibold underline transition-[text-decoration-color,color] duration-200 ${EASE} hover:no-underline`, theme.accent)}
                    >
                      {part}
                    </a>
                  );
                } else if (i % 3 === 0) {
                  return <span key={i}>{part}</span>;
                }
                return null;
              })}
            </p>
          );
        }

        return <p key={index} className="text-lg leading-relaxed text-slate-700 mb-4">{line}</p>;
      }

      // Handle lists
      if (line.startsWith("- ")) {
        return (
          <li key={index} className="text-lg leading-relaxed text-slate-700 ml-6 mb-2">
            {line.replace(/^-\s+/, "")}
          </li>
        );
      }

      return <br key={index} />;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-slate-200 z-50">
        <div
          className={cn("h-full bg-gradient-to-r transition-[width] duration-150 ease-out", theme.gradient)}
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Hero Section */}
      <div className={cn("bg-gradient-to-r py-20", theme.gradient)}>
        <Reveal className="max-w-4xl mx-auto px-6">
          <Button
            variant="ghost"
            onClick={() => router.push("/blog")}
            className="text-white hover:text-white hover:bg-white/20 mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Blog
          </Button>

          <Badge className={cn("mb-4", theme.badge)}>
            {category}
          </Badge>

          <h1 className="text-5xl font-bold text-white mb-6 leading-tight">
            {title}
          </h1>

          <p className="text-xl text-white/90 mb-8">
            {excerpt}
          </p>

          <div className="flex flex-wrap items-center gap-6 text-white/80">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>{author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{new Date(publishedDate).toLocaleDateString("en-US", { 
                year: "numeric", 
                month: "long", 
                day: "numeric" 
              })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{readingTime} min read</span>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Table of Contents - Sticky */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24 p-6">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-900">Table of Contents</h3>
              </div>
              <nav className="space-y-2">
                {tableOfContents.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className={cn(
                      `block w-full rounded-lg px-3 py-2 text-left text-sm transition-[background-color,color] duration-200 ${EASE} ${btnPress}`,
                      item.level === 3 && "pl-6 text-slate-600",
                      activeSection === item.id
                        ? cn("font-semibold", theme.accent, theme.badge)
                        : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {activeSection === item.id && (
                      <ChevronRight className="inline w-4 h-4 mr-1" />
                    )}
                    {item.title}
                  </button>
                ))}
              </nav>

              {/* Reading Progress */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                  <span>Reading Progress</span>
                  <span className="font-semibold">{Math.round(readingProgress)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={cn("h-2 rounded-full bg-gradient-to-r transition-[width] duration-150 ease-out", theme.gradient)}
                    style={{ width: `${readingProgress}%` }}
                  />
                </div>
              </div>

              {/* Share */}
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => navigator.clipboard.writeText(window.location.href)}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share Article
              </Button>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card className="p-8 lg:p-12">
              <article className="prose prose-lg max-w-none">
                {renderContent()}
              </article>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="mt-12 pt-8 border-t">
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Articles CTA */}
              <Reveal className={cn("mt-12 p-8 rounded-xl bg-gradient-to-r text-white", theme.gradient)}>
                <h3 className="text-2xl font-bold mb-4">Ready to Grow Your Catering Business?</h3>
                <p className="text-white/90 mb-6">
                  Explore our platform features and see how we can help you scale.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button
                    onClick={() => router.push("/features")}
                    className="bg-white text-slate-900 hover:bg-slate-100"
                  >
                    Explore Features
                  </Button>
                  <Button
                    onClick={() => router.push("/pricing")}
                    variant="outline"
                    className="border-white text-white hover:bg-white/20"
                  >
                    View Pricing
                  </Button>
                </div>
              </Reveal>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}