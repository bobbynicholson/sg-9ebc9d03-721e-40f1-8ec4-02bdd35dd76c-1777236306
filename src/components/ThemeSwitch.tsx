"use client";

import * as React from "react";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Dark mode is temporarily disabled — the existing theme didn't have proper
 * dark colour tokens applied to most pages, so toggling it broke the layout.
 * Render a passive icon with a "coming soon" tooltip until we ship a proper
 * dark theme pass.
 */
export function ThemeSwitch() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled
            className="w-9 h-9 cursor-not-allowed opacity-60"
            aria-label="Theme switching"
          >
            <Moon className="h-5 w-5 text-slate-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Dark mode coming soon</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
