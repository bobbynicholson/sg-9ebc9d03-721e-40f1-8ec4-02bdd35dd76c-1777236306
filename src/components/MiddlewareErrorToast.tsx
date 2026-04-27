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

    toast({
      title: message.title,
      description: message.description,
      variant: "destructive",
      duration: 5000,
    });

    const { error: _ignored, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true },
    );
  }, [router.isReady, router.query.error]);

  return null;
}
