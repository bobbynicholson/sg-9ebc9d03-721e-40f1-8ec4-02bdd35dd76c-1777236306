import { useEffect, useState } from "react";
import { Check, Copy, Share, Ellipsis, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { iosBrowserHint, isInstalledApp } from "@/lib/pwa/environment";

export function IosInstallGuide({ appName, installPath }: { appName: string; installPath: string }) {
  const [browser, setBrowser] = useState<"safari" | "chrome" | "other">("safari");
  const [installLink, setInstallLink] = useState(installPath);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [toolbarExample, setToolbarExample] = useState(false);
  const [verification, setVerification] = useState("");

  useEffect(() => {
    setBrowser(iosBrowserHint());
    // Copy a public, stable install URL, never a token-bearing booking/auth URL.
    setInstallLink(new URL(installPath, window.location.origin).href);
  }, [installPath]);

  async function copyInstallLink() {
    setCopied(false); setCopyFailed(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(installLink);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  }

  return <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
    <label className="block font-medium text-slate-900">Where is this page open?
      <select className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-normal" value={browser}
        onChange={event => { setBrowser(event.target.value as typeof browser); setVerification(""); }}>
        <option value="safari">Safari app</option>
        <option value="chrome">Chrome app</option>
        <option value="other">Inside another app / another browser</option>
      </select>
    </label>
    {browser === "safari" ? <>
      <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-slate-900">
        <li><strong className="font-semibold text-slate-900">Open Safari&apos;s page menu.</strong> Tap <Ellipsis className="inline h-5 w-5 align-text-bottom" aria-label="More" /> in the browser toolbar, then Share. With a top or bottom tab layout, tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share: square with upward arrow" /> directly.</li>
        <li><strong className="font-semibold text-slate-900">Scroll down the actions.</strong> Choose Add to Home Screen. If it is hidden, scroll to Edit Actions and add it there.</li>
        <li><strong className="font-semibold text-slate-900">Confirm Add.</strong> Leave Open as Web App on if shown, then tap Add. Open {appName} from the new Home Screen icon.</li>
      </ol>
      <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal bg-white" aria-expanded={toolbarExample} onClick={() => setToolbarExample(value => !value)}>
        {toolbarExample ? "Hide Safari toolbar example" : "Show Safari toolbar example"}
      </Button>
      {toolbarExample && <div className="rounded-lg bg-slate-100 p-3">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-slate-900" role="img" aria-label="Safari toolbar example: web address, More, and Share icon">
          <span className="min-w-0 truncate text-sm">cateringms.com</span><Ellipsis className="h-5 w-5 shrink-0" /><Share className="h-5 w-5 shrink-0" />
        </div>
        <p className="mt-2 text-sm text-slate-600">Illustration only. Tap these controls in Safari&apos;s own toolbar, outside this webpage. Their position varies with your tab layout.</p>
      </div>}
    </> : <p className="rounded-lg bg-amber-50 p-3 text-amber-950">Copy the installation link below. Open the Safari app from your iPhone Home Screen, paste the link in its address bar, then follow the Safari steps. Opening another tab here may keep you inside the same app.</p>}
    <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal bg-white" onClick={() => void copyInstallLink()}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Installation link copied" : "Copy installation link for Safari"}
    </Button>
    {copyFailed && <div role="alert">
      <label className="block text-sm font-medium text-slate-900">Copy this link manually
        <Input readOnly value={installLink} onFocus={event => event.target.select()} className="mt-1 min-h-11 text-base" />
      </label>
      <p className="mt-1 text-sm text-slate-600">Clipboard access is unavailable. Touch and hold the link to copy it, then paste it into Safari.</p>
    </div>}
    <p role="status" className="sr-only">{copied ? "Installation link copied. Open Safari and paste it into the address bar." : ""}</p>
    <details className="border-t border-slate-200 pt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium text-slate-900">Still no Add to Home Screen?</summary>
      <div className="mt-2 space-y-3">
        <p>If you only see Copy, Reading List, Open in Chrome or Search Google, close that sheet and use Safari&apos;s own page menu. The webpage&apos;s Share button opens a different set of actions.</p>
        <p>Try the same Safari menu on apple.com. If Add to Home Screen is missing there too, the problem is with the browser or iPhone rather than this company page.</p>
        <Button type="button" variant="outline" className="min-h-11 w-full whitespace-normal bg-white" onClick={() => setVerification(isInstalledApp() ? "This page is running as a Home Screen app." : "This page is running in a browser. Open the new Home Screen icon to check the installed app. Safari does not report icons installed from another window.")}>Check this window</Button>
        {verification && <p role="status">{verification}</p>}
        <a href="https://support.apple.com/guide/iphone/iphea86e5236/ios" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-primary underline underline-offset-4">Apple&apos;s illustrated instructions<ExternalLink className="h-4 w-4" /></a>
      </div>
    </details>
    <p className="text-sm text-slate-600">Safari controls the final Add action. The buttons on this page guide you; they cannot create a Home Screen icon themselves.</p>
  </div>;
}
