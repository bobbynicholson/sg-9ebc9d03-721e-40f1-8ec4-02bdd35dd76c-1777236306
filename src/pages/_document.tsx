import { Html, Head, Main, NextScript } from "next/document";
import { BRANDING_BOOT_SCRIPT, BRANDING_BOOT_STYLE } from "@/lib/branding/bootScript";

const PWA_START_SCRIPT = `(function(){try{var standalone=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||(navigator.standalone===true);if(standalone){var root=document.documentElement;root.classList.add("cms-pwa-starting");window.setTimeout(function(){root.classList.remove("cms-pwa-starting");},8000);}}catch(e){}})();`;

// The standalone launch cover is in the server HTML, before React and auth
// hydrate. Read this device's last signed-in company branding synchronously
// so a company user's PWA never paints the CateringMS placeholder first.
const PWA_BRAND_SCRIPT = `(function(){try{
var root=document.documentElement,parts=location.pathname.split("/").filter(Boolean),entries=["admin","team-portal","client-portal","account","subscription","order"],globals=["admin","auth","api","_next","super-admin","blog","uk","us","eu","page","pay","c","contact","pricing","features","terms","privacy","security","support","demo","company-signup"],slug="";
if(parts.length>1&&globals.indexOf(parts[0])<0&&entries.indexOf(parts[1])>=0)slug=parts[0];
var snapshot=null,company=null,brand=null;
try{snapshot=JSON.parse(localStorage.getItem("cms-auth-snapshot-v1")||"null");company=snapshot&&snapshot.company||null;}catch(e){}
function readKey(key){try{return JSON.parse(localStorage.getItem(key)||"null");}catch(e){return null;}}
function fromCompany(c){if(!c)return null;return{id:c.id,slug:c.slug||c.company_slug||null,companyName:c.companyName||c.company_name||null,logoUrl:c.logoUrl||c.logo_url||null,primaryColor:c.primaryColor||c.primary_color||null};}
if(slug){
for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);if(!key||key.indexOf("cms.branding.")!==0)continue;var row=readKey(key);if(row&&row.slug===slug){brand=row;break;}}
if(!brand&&company&&(company.slug===slug||(snapshot.user&&snapshot.user.company_slug===slug)))brand=fromCompany(company);
}else if(company){brand=readKey("cms.branding."+company.id)||fromCompany(company);}
if(!brand)return;
var name=brand.companyName||brand.company_name||"",logo=brand.logoUrl||brand.logo_url||"",accent=brand.primaryColor||brand.primary_color||"";
var title=document.getElementById("cms-pwa-launch-name"),image=document.getElementById("cms-pwa-launch-logo"),fallback=document.getElementById("cms-pwa-launch-monogram");
if(title&&name)title.textContent=name;
if(accent&&/^#[\\da-f]{6}$/i.test(accent))root.style.setProperty("--brand-primary",accent);
if(image&&logo){image.src=logo;image.style.display="block";if(fallback)fallback.style.display="none";}
else if(fallback&&name){fallback.textContent=name.trim().split(/\\s+/).slice(0,2).map(function(part){return part.charAt(0);}).join("").toUpperCase();fallback.style.display="flex";if(image)image.style.display="none";}
}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="shortcut icon" href="/favicon.ico?v=20261118-2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/cateringms-favicon-16.png?v=20261118-2" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/cateringms-favicon-32.png?v=20261118-2" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
        {/* Paint the company's saved colours before the first frame so tenant
            pages never flash the default palette (see bootScript.ts). */}
        <style dangerouslySetInnerHTML={{ __html: BRANDING_BOOT_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: PWA_START_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: BRANDING_BOOT_SCRIPT }} />
        {/* PwaMetadata owns the company install manifest and app name. Keep the
            website favicon here so it stays the same on every route. */}
      </Head>
      <body>
        <div id="cms-pwa-launch-screen" role="status" aria-live="polite">
          <div className="cms-pwa-launch-content">
            <div className="cms-pwa-launch-mark">
              <img id="cms-pwa-launch-logo" src="/icons/cateringms-192.png" width="76" height="76" alt="" style={{ display: "none" }} />
              <span id="cms-pwa-launch-monogram" aria-hidden="true" style={{ display: "flex" }}>C</span>
            </div>
            <p id="cms-pwa-launch-name">Opening your workspace</p>
            <span>Getting things ready</span>
            <i aria-hidden="true" />
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: PWA_BRAND_SCRIPT }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
