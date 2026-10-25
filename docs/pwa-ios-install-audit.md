# iOS PWA installation audit — 25 October 2026

## What the evidence establishes

The user reports that the in-page Share button shows Copy, Reading List,
Open in Chrome and Search Google. The implementation calls `navigator.share`.
That shares a URL; it does not invoke Safari's Add to Home Screen action.
This is the confirmed reason that the in-page button did not install the app.

Previous claims that the absence of a service worker explains a missing
Add to Home Screen option on iOS were incorrect. WebKit documents that
Safari can add websites without a service worker. On iOS 26, any website
can open as a Home Screen web app. The operating system still requires
the browser-menu action and user confirmation.

The exact reason for an absent action in the physical iPhone's own Safari
menu is not established. Browser/app identity and iOS version were requested.
Webpage tests cannot inspect or automate that native menu.

## Verified website defects and changes

- Removed the generic Web Share API from the installation path. The guide
  uses Safari's actual Share symbol and accounts for Compact, Top and Bottom
  toolbar layouts, with a browser selector and an expandable toolbar example.
- Removed the unverified "CateringMS added" confirmation. Only an actual
  standalone window or a native installation response changes app state.
- Clipboard rejection now reveals a selectable public installation URL.
  Links contain no sign-in, booking or callback tokens.
- Live tenant login HTML lacked a manifest and served the platform Apple
  icon. Install metadata is now server rendered on tenant login and public
  installation pages, with one owner for each head element.
- The live company logo was 220×208 but the manifest declared it as both
  192×192 and 512×512. Same-origin icon endpoints now render actual square
  180, 192 and 512 PNGs, preserving the whole logo on a white background.
  Downloads are restricted to saved branding, public HTTPS addresses,
  validated DNS/IPs, bounded response sizes and image pixel limits.
- The old launch URL `/auth/login?company=...` was ignored by login routing.
  Company apps now launch at `/{company_slug}/login`; identity remains stable.
- A dismissed desktop prompt previously skipped installation-event listeners.
  The sidebar can now reuse the captured native event after dismissal.
- Cancelling a drag resets the slider without invoking installation.

## Validation

29 regression checks passed for manifest responses, company isolation,
PNG dimensions, browser guidance, clipboard errors, iPad desktop detection,
native prompt reuse and standalone state.

Network checks against the running application confirmed server-rendered
company metadata, manifest MIME, tenant launch URL and a decoded 512×512 icon.
Browser checks passed in WebKit with an iPhone viewport, Android Chromium,
and desktop Chromium, with no horizontal overflow or page errors.
Android/desktop prompt responses were simulated; the native iOS Share menu
and physical Home Screen installation were not exercised.

An existing CI failure is separate: payment migration sources contain invalid
text (`DECLAREhttps://...` and a file containing `but`) and disagree with the
committed combined migration bundle. This audit applies no database changes.

## References

- [Apple: Turn a website into an app](https://support.apple.com/guide/iphone/iphea86e5236/ios)
- [WebKit: Every site can be a web app on iOS 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [WebKit: Home Screen web apps and third-party browser requirements](https://webkit.org/blog/13878/)
- [MDN: Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
