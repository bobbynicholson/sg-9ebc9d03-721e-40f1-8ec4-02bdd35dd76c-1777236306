import { useEffect, useState } from "react";

type Browser = "chrome" | "edge" | "safari" | "other";

export function BrowserInstallGuide({ appName }: { appName: string }) {
  const [browser, setBrowser] = useState<Browser>("chrome");
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setAndroid(/Android/.test(ua));
    setBrowser(/Edg\//.test(ua) ? "edge" : /Chrome\//.test(ua) ? "chrome" : /Macintosh.*Version\/.*Safari/.test(ua) ? "safari" : "other");
  }, []);

  if (android) return <p className="text-sm leading-6 text-slate-700">Open your browser&apos;s menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm Install. Some versions place this under <strong>Install and create shortcut</strong>.</p>;

  return <div className="space-y-3 text-sm leading-6 text-slate-700">
    <label className="block font-medium text-slate-900">Desktop browser
      <select value={browser} onChange={event => setBrowser(event.target.value as Browser)} className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-normal">
        <option value="chrome">Google Chrome</option>
        <option value="edge">Microsoft Edge</option>
        <option value="safari">Safari on Mac</option>
        <option value="other">Another browser</option>
      </select>
    </label>
    {browser === "chrome" && <>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Open Chrome&apos;s three-dot menu, then <strong>Cast, save, and share → Install page as app</strong>. You may also see an install icon in the address bar.</li>
        <li>Confirm <strong>Install</strong>. {appName} opens in its own app window.</li>
        <li>For a desktop shortcut, type <strong>chrome://apps</strong> in Chrome&apos;s address bar, right-click {appName}, then choose <strong>Create shortcut</strong> and select Desktop.</li>
      </ol>
    </>}
    {browser === "edge" && <ol className="list-decimal space-y-2 pl-5">
      <li>Open <strong>Settings and more → More tools → Apps → Install this site as an app</strong>. Some Edge versions show Apps directly in the menu.</li>
      <li>Confirm <strong>Install</strong>. {appName} opens in its own app window.</li>
      <li>Type <strong>edge://apps</strong> in Edge&apos;s address bar, open the app&apos;s <strong>Details</strong>, then choose <strong>Create Desktop shortcut</strong>, <strong>Pin to Start</strong> or <strong>Pin to taskbar</strong>.</li>
    </ol>}
    {browser === "safari" && <ol className="list-decimal space-y-2 pl-5">
      <li>On <strong>macOS Sonoma 14 or later</strong>, open this page in Safari.</li>
      <li>Choose <strong>File → Add to Dock</strong>, or use Safari&apos;s <strong>Share → Add to Dock</strong>.</li>
      <li>Confirm <strong>Add</strong>. Open {appName} from the Dock or Applications.</li>
    </ol>}
    {browser === "other" && <p>Open this installation page in Chrome or Edge on your computer, or Safari on a supported Mac. Select that browser above to see its installation steps.</p>}
    <p className="text-sm text-slate-600">The installed app uses your company name and logo. Your browser manages the final installation and shortcut permissions.</p>
  </div>;
}
