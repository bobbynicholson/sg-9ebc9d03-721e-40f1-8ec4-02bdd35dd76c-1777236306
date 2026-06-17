import { ErrorPageView } from "@/components/ErrorPageView";

/**
 * Static 500 page. Next serves this (pre-rendered) for production server-side
 * 500s, which is more reliable than rendering _error at crash time.
 */
export default function Custom500() {
  return <ErrorPageView statusCode={500} />;
}
