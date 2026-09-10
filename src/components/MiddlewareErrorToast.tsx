import { useEffect } from "react";
import { useRouter } from "next/router";
import { useToast } from "@/hooks/use-toast";

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  unauthorized: {
    title: "Access denied",
    description: "Your role does not have permission to view that page.",
  },
  tenant_mismatch: {
    title: "Wrong company",
    description: "That URL belongs to a different company on the platform.",
  },
  tenant_check_failed: {
    title: "Could not verify access",
    description: "We could not confirm your company membership. Please try again.",
  },
  no_company: {
    title: "No company linked",
    description: "Your account is not linked to a company yet. Contact support.",
  },
};

export function MiddlewareErrorToast() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!router.isReady) return;
    const errorCode = typeof router.query.error === "string" ? router.query.error : null;
    if (!errorCode) return;

    const message = ERROR_MESSAGES[errorCode];
    if (!message) return;

    // Wave 45 follow-up: middleware now passes the rejected path
    // as ?error_path=... so the operator can see WHICH page their
    // role was denied from. Falls back to the generic description
    // when missing.
    const errorPath = typeof router.query.error_path === "string" ? router.query.error_path : null;
    const description = errorPath
      ? `${message.description} (route: ${errorPath})`
      : message.description;

    toast({
      title: message.title,
      description,
      variant: "destructive",
      duration: 7000,
    });
    // Also log to console so it's recoverable after the toast vanishes.
    // eslint-disable-next-line no-console
    console.warn(`[MiddlewareErrorToast] ${message.title}: ${description}`);

    const { error: _ignored, error_path: _alsoIgnored, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true },
    );
  }, [router.isReady, router.query.error]);

  return null;
}
