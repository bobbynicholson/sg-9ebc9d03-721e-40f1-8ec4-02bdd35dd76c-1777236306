import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";
import { getRegionFromPath } from "@/lib/geoLocation";

const regions = [
  { code: "za", name: "South Africa", flag: "🇿🇦" },
  { code: "us", name: "United States", flag: "🇺🇸" },
  { code: "uk", name: "United Kingdom", flag: "🇬🇧" },
];

export function RegionSwitcher() {
  const router = useRouter();
  const [currentRegion, setCurrentRegion] = useState(regions[0]);

  useEffect(() => {
    const pathRegion = getRegionFromPath(router.pathname);
    const regionData = regions.find(r => r.code === pathRegion) || regions[0];
    setCurrentRegion(regionData);
  }, [router.pathname]);

  const handleRegionChange = (regionCode: "za" | "us" | "uk") => {
    let newPath = router.pathname;
    
    // Remove existing region prefix
    if (newPath.startsWith("/us")) {
      newPath = newPath.replace("/us", "");
    } else if (newPath.startsWith("/uk")) {
      newPath = newPath.replace("/uk", "");
    }

    if (newPath === "") newPath = "/";

    // Add new prefix if not ZA
    if (regionCode === "us") {
      newPath = `/us${newPath === "/" ? "" : newPath}`;
    } else if (regionCode === "uk") {
      newPath = `/uk${newPath === "/" ? "" : newPath}`;
    }
    
    router.push(newPath);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative group">
          <span className="text-2xl">{currentRegion.flag}</span>
          <span className="sr-only">Change region</span>
          <div className="absolute bottom-full mb-2 hidden group-hover:block px-2 py-1 bg-gray-800 text-white text-xs rounded-md">
            {currentRegion.name}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {regions.map((region) => (
          <DropdownMenuItem
            key={region.code}
            onSelect={() => handleRegionChange(region.code as "za" | "us" | "uk")}
            className="cursor-pointer"
          >
            <span className="text-xl mr-3">{region.flag}</span>
            <span>{region.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}