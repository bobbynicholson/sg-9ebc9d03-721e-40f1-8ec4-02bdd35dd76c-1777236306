# Social Media Integration Guide for CateringMS

## 🎯 Overview

Allow your catering clients to display their social media feeds directly in their admin portal, so **their clients** can see their latest posts, reviews, and updates without leaving the CateringMS platform.

---

## 🔧 Implementation Options

### Option 1: **Embed Widgets (Easiest - Recommended for Phase 1)**

**Pros:**
- No API keys required
- Works immediately
- No rate limits
- Free for all platforms

**Cons:**
- Less customizable styling
- May include platform branding

**Platforms Supported:**
- Instagram
- Facebook
- Twitter/X
- LinkedIn
- TikTok
- YouTube

---

## 📱 Platform-Specific Integration Instructions

### **Instagram Feed Integration**

#### **Method 1: Instagram Embed Widget (Recommended)**

**Step 1:** Create Instagram embed code
```html
<!-- Paste this in your portal settings -->
<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/yourusername/" data-instgrm-version="14">
</blockquote>
<script async src="//www.instagram.com/embed.js"></script>
```

**Step 2:** Caterer adds their Instagram handle in CateringMS settings
- Go to **Admin Settings** → **Social Media**
- Enter Instagram username
- System auto-generates embed code
- Feed displays in client portal

**Method 2: EmbedSocial / Juicer (Third-Party)**
- Sign up at embedsocial.com or juicer.io
- Connect Instagram account
- Get embed code
- Paste in CateringMS social media settings

**Cost:** Free tier available, paid plans from $9/month

---

### **Facebook Page Integration**

**Step 1:** Get Facebook Page Plugin code
1. Visit: https://developers.facebook.com/docs/plugins/page-plugin
2. Enter your Facebook Page URL
3. Customize width, height, and features
4. Copy generated code

**Step 2:** Add to CateringMS
```html
<!-- Example embed code -->
<iframe src="https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Fyourpage&tabs=timeline&width=340&height=500" 
width="340" height="500" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true">
</iframe>
```

**Settings in CateringMS:**
- **Admin Settings** → **Social Media** → **Facebook**
- Paste Facebook Page URL
- System generates embed automatically

---

### **Twitter/X Feed Integration**

**Step 1:** Get Twitter Timeline Embed
1. Visit: https://publish.twitter.com/
2. Enter Twitter profile URL
3. Choose "Embedded Timeline"
4. Customize appearance
5. Copy code

**Step 2:** Add to Portal
```html
<a class="twitter-timeline" data-height="500" href="https://twitter.com/yourusername">
Tweets by yourusername
</a>
<script async src="https://platform.twitter.com/widgets.js"></script>
```

---

### **LinkedIn Company Page**

**Method:** LinkedIn doesn't offer free embeds, so we use third-party solutions:

**Recommended:** Use RSS-to-Widget service
1. Get LinkedIn company page RSS feed
2. Use Feedwind.com or RSS.app
3. Generate embed code
4. Add to CateringMS

**Alternative:** Screenshot latest posts and link to full LinkedIn page

---

### **TikTok Feed**

**Step 1:** Get TikTok embed codes
1. Go to your TikTok profile
2. Click "..." on any video
3. Select "Embed"
4. Copy embed code

**Step 2:** Display multiple TikToks
```html
<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@username/video/123456">
</blockquote>
<script async src="https://www.tiktok.com/embed.js"></script>
```

---

### **YouTube Channel Feed**

**Step 1:** Get YouTube channel ID
- Format: `UC1234567890abcdefg`

**Step 2:** Use YouTube Player API
```html
<iframe width="100%" height="315" 
src="https://www.youtube.com/embed/?listType=user_uploads&list=CHANNEL_ID" 
frameborder="0" allowfullscreen>
</iframe>
```

---

## 🎨 Implementation in CateringMS

### **Database Schema**

```sql
-- Add to profiles table
ALTER TABLE profiles ADD COLUMN social_media_settings JSONB DEFAULT '{
  "instagram": {
    "enabled": false,
    "username": "",
    "display_in_client_portal": false
  },
  "facebook": {
    "enabled": false,
    "page_url": "",
    "display_in_client_portal": false
  },
  "twitter": {
    "enabled": false,
    "username": "",
    "display_in_client_portal": false
  },
  "linkedin": {
    "enabled": false,
    "company_url": "",
    "display_in_client_portal": false
  },
  "tiktok": {
    "enabled": false,
    "username": "",
    "display_in_client_portal": false
  },
  "youtube": {
    "enabled": false,
    "channel_id": "",
    "display_in_client_portal": false
  }
}'::jsonb;
```

---

### **Admin Settings UI Component**

**Location:** `src/pages/admin/settings.tsx`

**New Tab: "Social Media Integration"**

```typescript
<Card>
  <CardHeader>
    <CardTitle>Social Media Integration</CardTitle>
    <CardDescription>
      Display your social media feeds in your client portal to showcase your work
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-6">
    
    {/* Instagram */}
    <div className="space-y-3 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-lg font-semibold flex items-center gap-2">
          <InstagramIcon className="w-5 h-5" />
          Instagram Feed
        </Label>
        <Switch 
          checked={settings.instagram.enabled}
          onCheckedChange={(checked) => updateSetting('instagram', 'enabled', checked)}
        />
      </div>
      {settings.instagram.enabled && (
        <>
          <Input
            placeholder="Enter Instagram username (without @)"
            value={settings.instagram.username}
            onChange={(e) => updateSetting('instagram', 'username', e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Checkbox 
              checked={settings.instagram.display_in_client_portal}
              onCheckedChange={(checked) => updateSetting('instagram', 'display_in_client_portal', checked)}
            />
            <Label className="text-sm">Display in client portal</Label>
          </div>
          {settings.instagram.username && (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription>
                Preview: https://instagram.com/{settings.instagram.username}
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>

    {/* Facebook */}
    <div className="space-y-3 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <Label className="text-lg font-semibold flex items-center gap-2">
          <FacebookIcon className="w-5 h-5" />
          Facebook Page
        </Label>
        <Switch 
          checked={settings.facebook.enabled}
          onCheckedChange={(checked) => updateSetting('facebook', 'enabled', checked)}
        />
      </div>
      {settings.facebook.enabled && (
        <>
          <Input
            placeholder="Enter Facebook Page URL"
            value={settings.facebook.page_url}
            onChange={(e) => updateSetting('facebook', 'page_url', e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Checkbox 
              checked={settings.facebook.display_in_client_portal}
              onCheckedChange={(checked) => updateSetting('facebook', 'display_in_client_portal', checked)}
            />
            <Label className="text-sm">Display in client portal</Label>
          </div>
        </>
      )}
    </div>

    {/* Similar sections for Twitter, LinkedIn, TikTok, YouTube */}
    
    <Button className="w-full" onClick={saveSocialMediaSettings}>
      Save Social Media Settings
    </Button>
  </CardContent>
</Card>
```

---

### **Client Portal Display Component**

**Location:** `src/components/SocialMediaFeed.tsx`

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SocialMediaFeedProps {
  settings: {
    instagram?: { enabled: boolean; username: string; display_in_client_portal: boolean };
    facebook?: { enabled: boolean; page_url: string; display_in_client_portal: boolean };
    // ... other platforms
  };
}

export function SocialMediaFeed({ settings }: SocialMediaFeedProps) {
  const activePlatforms = Object.entries(settings)
    .filter(([_, config]) => config.enabled && config.display_in_client_portal);

  if (activePlatforms.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Follow Our Journey</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={activePlatforms[0][0]}>
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${activePlatforms.length}, 1fr)` }}>
            {activePlatforms.map(([platform]) => (
              <TabsTrigger key={platform} value={platform} className="capitalize">
                {platform}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Instagram Feed */}
          {settings.instagram?.enabled && settings.instagram.display_in_client_portal && (
            <TabsContent value="instagram">
              <div 
                dangerouslySetInnerHTML={{
                  __html: `
                    <blockquote class="instagram-media" 
                      data-instgrm-permalink="https://www.instagram.com/${settings.instagram.username}/"
                      data-instgrm-version="14" 
                      style="max-width:540px; margin: auto;">
                    </blockquote>
                    <script async src="//www.instagram.com/embed.js"></script>
                  `
                }}
              />
            </TabsContent>
          )}

          {/* Facebook Feed */}
          {settings.facebook?.enabled && settings.facebook.display_in_client_portal && (
            <TabsContent value="facebook">
              <iframe 
                src={`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(settings.facebook.page_url)}&tabs=timeline&width=500&height=600`}
                width="100%" 
                height="600" 
                style={{ border: 'none', overflow: 'hidden' }}
                scrolling="no" 
                frameBorder="0"
                allowFullScreen={true}
              />
            </TabsContent>
          )}

          {/* Similar for other platforms */}
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

---

### **Add to Client Portal Page**

**Location:** `src/pages/client-portal.tsx`

```typescript
import { SocialMediaFeed } from "@/components/SocialMediaFeed";

export default function ClientPortalPage() {
  const [socialSettings, setSocialSettings] = useState({});

  useEffect(() => {
    // Fetch caterer's social media settings
    const fetchSocialSettings = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('social_media_settings')
        .eq('id', catererId)
        .single();
      
      setSocialSettings(data?.social_media_settings || {});
    };
    
    fetchSocialSettings();
  }, [catererId]);

  return (
    <div>
      {/* Existing client portal content */}
      
      {/* Social Media Feed Section */}
      <SocialMediaFeed settings={socialSettings} />
    </div>
  );
}
```

---

## 🚀 Implementation Roadmap

### **Phase 1: Basic Embeds (Week 1-2)**
- ✅ Database schema update
- ✅ Admin settings UI for social media
- ✅ Instagram embed integration
- ✅ Facebook page plugin
- ✅ Display in client portal

### **Phase 2: Advanced Features (Week 3-4)**
- ⚡ Twitter/X feed integration
- ⚡ YouTube channel integration
- ⚡ TikTok video embeds
- ⚡ Auto-refresh feeds every 24 hours

### **Phase 3: Premium Features (Future)**
- 🔮 Custom styling to match brand colors
- 🔮 Post scheduling from within CateringMS
- 🔮 Analytics on client engagement with social posts
- 🔮 Social media management dashboard

---

## 🎨 Design Guidelines

**Feed Display Best Practices:**
- Maximum 3-4 latest posts visible
- Responsive design (mobile-friendly)
- Lazy loading for performance
- Fallback if feed fails to load

**Placement Options:**
- Sidebar widget on client portal dashboard
- Dedicated "Social Media" tab
- Bottom of order confirmation pages
- Footer of client portal

---

## 📊 Analytics & Tracking

**Metrics to Track:**
1. Number of caterers with social feeds enabled
2. Client engagement with social feeds (views, clicks)
3. Most popular platform (Instagram vs Facebook vs others)
4. Conversion: Do clients who view social feeds book more?

**Implementation:**
```typescript
// Track social media feed views
const trackSocialFeedView = async (platform: string) => {
  await supabase
    .from('social_media_analytics')
    .insert({
      caterer_id: catererId,
      platform: platform,
      event_type: 'view',
      timestamp: new Date().toISOString()
    });
};
```

---

## 🛠️ Troubleshooting Guide

### **Issue: Instagram embed not loading**
**Solution:** 
- Ensure Instagram username is correct (no @ symbol)
- Check account is public (private accounts won't embed)
- Verify `embed.js` script is loading

### **Issue: Facebook page plugin shows error**
**Solution:**
- Verify Facebook Page URL is correct
- Ensure page is published (not in draft mode)
- Check page privacy settings allow embedding

### **Issue: Feeds load slowly**
**Solution:**
- Implement lazy loading
- Cache embed codes
- Consider static screenshots with "View Live Feed" link

---

## 🔐 Privacy & Compliance

**Important Considerations:**
1. **Client Data Protection:** Social feeds should only display caterer's public posts
2. **GDPR Compliance:** Clearly state in T&Cs that social media embeds are from third-party platforms
3. **Cookie Consent:** Inform users that social media embeds may set cookies
4. **Terms of Service:** Comply with each platform's embed policies

**Required Disclaimer:**
```
"Social media feeds are provided by third-party platforms and subject to their 
respective Terms of Service and Privacy Policies. CateringMS does not control 
the content displayed in these feeds."
```

---

## 💡 Future Enhancements

1. **Unified Social Media Dashboard**
   - Post to all platforms from one place
   - Schedule posts in advance
   - Respond to comments/DMs

2. **User-Generated Content**
   - Clients can upload photos of events
   - Caterer can approve and share to social media
   - Automatic tagging and watermarking

3. **Social Proof Integration**
   - Display Google Reviews alongside social feeds
   - Aggregate ratings from multiple platforms
   - Showcase client testimonials

4. **AI-Powered Content Suggestions**
   - Analyze successful posts
   - Suggest optimal posting times
   - Generate captions for event photos

---

## ✅ Quick Start Checklist for Caterers

### **Getting Started (5 minutes)**
- [ ] Go to Admin Settings → Social Media
- [ ] Enable Instagram feed
- [ ] Enter your Instagram username
- [ ] Check "Display in client portal"
- [ ] Save settings
- [ ] Test by viewing your client portal

### **Optimization (15 minutes)**
- [ ] Add Facebook page
- [ ] Connect YouTube channel (if you have one)
- [ ] Customize which platforms display where
- [ ] Test on mobile devices
- [ ] Inform clients about new social feed feature

---

## 📞 Support Resources

**Need Help?**
- **Video Tutorial:** [Link to step-by-step video guide]
- **Live Chat:** Available in CateringMS admin panel
- **Email Support:** support@cateringms.com
- **Knowledge Base:** help.cateringms.com/social-media

---

**This feature is designed to be zero-friction for caterers. If they have a social media presence, they can display it in 2 minutes. If they don't, the feature is completely hidden from their portal.**