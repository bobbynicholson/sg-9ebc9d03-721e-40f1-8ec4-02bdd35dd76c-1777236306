"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      // Dark mode UI isn't fully styled yet — pin everyone to light until we
      // do a proper dark theme pass. The ThemeSwitch button in the navs is
      // also disabled with a "coming soon" tooltip.
      enableSystem={false}
      forcedTheme="light"
      disableTransitionOnChange={true}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}