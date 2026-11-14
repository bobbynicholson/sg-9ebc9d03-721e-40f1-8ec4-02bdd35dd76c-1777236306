export const DEVICE_PUSH_CHANGED_EVENT = "cms:device-push-subscription-changed";

export function applicationServerKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function subscriptionUsesApplicationServerKey(subscription: PushSubscription, value: string): boolean {
  const currentKey = subscription.options.applicationServerKey;
  // Some browsers do not expose the key on an existing subscription. Keep
  // that subscription intact when the browser cannot provide a comparison.
  if (!currentKey) return true;
  const currentBytes = new Uint8Array(currentKey);
  const expectedBytes = applicationServerKey(value);
  return currentBytes.length === expectedBytes.length
    && currentBytes.every((byte, index) => byte === expectedBytes[index]);
}

export function announceDevicePushChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DEVICE_PUSH_CHANGED_EVENT));
  }
}
