import { ErrorPageView } from "@/components/ErrorPageView";

export default function Custom404() {
  return (
    <ErrorPageView
      statusCode={404}
      title="Page not found"
      message="The page you opened does not exist or the link has expired. Go home or use the app navigation to continue."
    />
  );
}
