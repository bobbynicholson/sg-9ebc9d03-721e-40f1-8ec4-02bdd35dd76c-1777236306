/**
 * Inline script for _document <head>: paints the tenant's saved colours
 * before the first frame, so a company page never flashes the CateringMS
 * default palette while the app loads.
 *
 * On a tenant app path (/<slug>/admin|team-portal|client-portal|account|
 * subscription|order/...):
 *   - a palette cached on this device for that slug (cms.branding.<id>,
 *     written by TenantBrandingApplier) is applied to <html> at once;
 *   - with nothing cached (first visit on this device) the page stays
 *     blank (html[data-brand-pending]) until TenantBrandingApplier paints
 *     the real palette, at most BRAND_PENDING_MAX_MS, instead of showing
 *     the default colours first.
 * Every other path is left alone (marketing and global pages keep the
 * default theme).
 *
 * Plain ES5 with no imports: it runs before any bundle. The CSS variables
 * it sets must match applyBrandingToDOM; brandingBootScript.test.ts runs
 * both on the same row and compares the result.
 */
export const BRAND_PENDING_ATTR = "data-brand-pending";
export const BRAND_PENDING_MAX_MS = 10000;

const TENANT_ENTRY_POINTS = ["admin", "team-portal", "client-portal", "account", "subscription", "order"];
// Mirrors GLOBAL_ROOTS in src/lib/tenantRoute.ts.
const GLOBAL_ROOTS = [
  "admin", "auth", "api", "_next", "super-admin", "blog", "uk", "us", "eu", "page", "pay", "c",
  "contact", "pricing", "features", "terms", "privacy", "security", "support", "demo", "company-signup",
];

export const BRANDING_BOOT_SCRIPT = `(function(){try{
var entry=${JSON.stringify(TENANT_ENTRY_POINTS)},globalRoots=${JSON.stringify(GLOBAL_ROOTS)};
var parts=location.pathname.split("/").filter(Boolean);
if(parts.length<2||globalRoots.indexOf(parts[0])>=0||entry.indexOf(parts[1])<0)return;
var slug=parts[0],row=null,i,k,r;
for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(!k||k.indexOf("cms.branding.")!==0)continue;
try{r=JSON.parse(localStorage.getItem(k));if(r&&r.slug===slug){row=r;break;}}catch(e){}}
var root=document.documentElement;
if(!row){root.setAttribute("${BRAND_PENDING_ATTR}","");setTimeout(function(){root.removeAttribute("${BRAND_PENDING_ATTR}");},${BRAND_PENDING_MAX_MS});return;}
function rgb(h){if(!h)return null;h=String(h).trim().replace(/^#/,"");if(h.length===3)h=h.split("").map(function(c){return c+c;}).join("");
if(!/^[0-9a-fA-F]{6}$/.test(h))return null;return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function trip(h){var x=rgb(h);return x?x.join(" "):null;}
function hsl(h){var x=rgb(h);if(!x)return null;var r=x[0]/255,g=x[1]/255,b=x[2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),H=0,S=0,L=(mx+mn)/2,d=mx-mn;
if(d!==0){S=d/(1-Math.abs(2*L-1));if(mx===r)H=((g-b)/d)%6;else if(mx===g)H=(b-r)/d+2;else H=(r-g)/d+4;H*=60;if(H<0)H+=360;}
return Math.round(H)+" "+Math.round(S*100)+"% "+Math.round(L*100)+"%";}
function fg(h){var x=rgb(h);if(!x)return"0 0% 100%";var c=x.map(function(v){v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]>0.55?"222.2 47.4% 11.2%":"0 0% 100%";}
var p=row.primaryColor||"#d97706",s=row.secondaryColor||"#ea580c",a=row.accentColor||"#f59e0b",st=root.style;
st.setProperty("--brand-primary",p);st.setProperty("--brand-secondary",s);st.setProperty("--brand-accent",a);
st.setProperty("--brand-primary-rgb",trip(p)||"37 99 235");st.setProperty("--brand-secondary-rgb",trip(s)||"124 58 237");st.setProperty("--brand-accent-rgb",trip(a)||"245 158 11");
st.setProperty("--primary",hsl(p)||"37 92% 50%");st.setProperty("--primary-foreground",fg(p));st.setProperty("--ring",hsl(p)||"37 92% 50%");
st.setProperty("--sidebar-primary",hsl(p)||"37 92% 50%");st.setProperty("--sidebar-primary-foreground",fg(p));st.setProperty("--sidebar-ring",hsl(a)||hsl(p)||"37 92% 50%");
}catch(e){}})();`;

/** Keeps a not-yet-branded tenant page blank rather than default-coloured. */
export const BRANDING_BOOT_STYLE = `html[${BRAND_PENDING_ATTR}] body{visibility:hidden}`;

/** Called once the real palette is on the page (or defaults are intended). */
export function clearBrandPending(): void {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute(BRAND_PENDING_ATTR);
}
