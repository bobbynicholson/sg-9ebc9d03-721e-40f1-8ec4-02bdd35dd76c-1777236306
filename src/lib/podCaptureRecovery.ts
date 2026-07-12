export const POD_PENDING_KEY = "cms-pod-pending";
export const POD_PENDING_MAX_AGE_MS = 15 * 60_000;

export interface PendingPodCapture {
  orderId: string;
  at: number;
  /** Which UI owns recovery after a camera/background round-trip. */
  flow?: "status" | "direct";
}

function browserStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readPendingPodCapture(
  storage?: Storage,
): PendingPodCapture | null {
  try {
    const value = browserStorage(storage)?.getItem(POD_PENDING_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<PendingPodCapture>;
    if (typeof parsed.orderId !== "string" || typeof parsed.at !== "number") {
      return null;
    }
    const flow = parsed.flow === "status" || parsed.flow === "direct"
      ? parsed.flow
      : undefined;
    return { orderId: parsed.orderId, at: parsed.at, ...(flow ? { flow } : {}) };
  } catch {
    return null;
  }
}

export function markPodCapturePending(
  orderId: string,
  at = Date.now(),
  storage?: Storage,
  flow: PendingPodCapture["flow"] = "direct",
): void {
  try {
    browserStorage(storage)?.setItem(POD_PENDING_KEY, JSON.stringify({ orderId, at, flow }));
  } catch {
    // Private mode / full storage: camera capture still works, just without
    // crash recovery.
  }
}

export function clearPendingPodCapture(
  orderId?: string,
  storage?: Storage,
): void {
  try {
    const target = browserStorage(storage);
    if (!target) return;
    const pending = readPendingPodCapture(target);
    if (!orderId || pending?.orderId === orderId) {
      target.removeItem(POD_PENDING_KEY);
    }
  } catch {
    // Non-critical recovery cleanup.
  }
}

export function hasFreshPendingPodCapture(
  orderId: string,
  now = Date.now(),
  storage?: Storage,
): boolean {
  const pending = readPendingPodCapture(storage);
  return Boolean(
    pending &&
    pending.orderId === orderId &&
    now >= pending.at &&
    now - pending.at <= POD_PENDING_MAX_AGE_MS,
  );
}

/**
 * Route recovery back to the dialog that owned the native camera. Legacy
 * markers are treated as Status captures because that path preserves the
 * setup-confirmation + POD + delivered cascade; direct delivery is the less
 * complete fallback and must not hijack it.
 */
export function pendingPodRecoveryFlow(
  pending: PendingPodCapture,
): "status" | "direct" {
  return pending.flow === "direct" ? "direct" : "status";
}
