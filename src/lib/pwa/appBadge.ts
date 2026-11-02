/** Best-effort unread badge for browsers that expose the installed-app API. */
export async function updatePwaAppBadge(unreadCount: number): Promise<void> {
  if (typeof navigator === "undefined") return;

  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  try {
    const count = Math.max(0, Math.floor(unreadCount));
    if (count > 0) {
      await badgeNavigator.setAppBadge?.(count);
    } else if (badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge();
    } else {
      await badgeNavigator.setAppBadge?.(0);
    }
  } catch {
    // Browser and operating-system badge support is optional.
  }
}
