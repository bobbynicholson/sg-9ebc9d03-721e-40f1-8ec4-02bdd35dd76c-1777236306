import Image from "next/image";
import { CATERINGMS_ICON_REVISION } from "@/lib/pwa/metadata";

export function CateringMark({ className = "" }: { className?: string }) {
  return (
    <Image
      src={`/icons/cateringms-mark-128-${CATERINGMS_ICON_REVISION}.png`}
      alt=""
      aria-hidden="true"
      width={128}
      height={128}
      unoptimized
      className={className}
    />
  );
}
