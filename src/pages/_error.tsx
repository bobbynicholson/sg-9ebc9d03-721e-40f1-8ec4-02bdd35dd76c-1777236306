import type { NextPageContext } from "next";
import { ErrorPageView } from "@/components/ErrorPageView";
import { captureException } from "@/lib/observability";

interface ErrorProps {
  statusCode?: number;
}

/**
 * Catch-all error page (server-render errors + client errors Next routes here).
 * Complements AppErrorBoundary (which catches in-tree client render crashes):
 * this covers getServerSideProps/getInitialProps throws and other framework-
 * level errors so the user never sees an unbranded default error screen.
 */
function ErrorPage({ statusCode }: ErrorProps) {
  return <ErrorPageView statusCode={statusCode} />;
}

ErrorPage.getInitialProps = (ctx: NextPageContext): ErrorProps => {
  const { res, err } = ctx;
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  if (err) {
    try {
      captureException(err, { tags: { boundary: "_error", route: ctx.pathname }, extra: { statusCode } });
    } catch {
      /* never let the reporter throw inside the error page */
    }
  }
  return { statusCode };
};

export default ErrorPage;
