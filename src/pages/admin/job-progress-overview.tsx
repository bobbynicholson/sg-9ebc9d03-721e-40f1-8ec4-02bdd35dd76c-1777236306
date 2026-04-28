import { useEffect } from "react";
import { useRouter } from "next/router";

export default function JobProgressOverviewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/orders");
  }, [router]);
  return null;
}
