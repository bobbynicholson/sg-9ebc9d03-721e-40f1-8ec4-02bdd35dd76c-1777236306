import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // White-label tenant palette. Driven by --brand-*-rgb CSS vars
        // set in BrandingContext.applyBrandingToDOM. The /<alpha-value>
        // syntax keeps Tailwind alpha modifiers working
        // (bg-brand-primary/10, text-brand-accent/80, etc.).
        "brand-primary":   "rgb(var(--brand-primary-rgb)   / <alpha-value>)",
        "brand-secondary": "rgb(var(--brand-secondary-rgb) / <alpha-value>)",
        "brand-accent":    "rgb(var(--brand-accent-rgb)    / <alpha-value>)",
        // Shared portal accent. Each portal sidebar sets
        // --portal-accent-rgb from the tenant's brand tokens. Falls back to
        // brand accent when unset so portal chrome does not collapse to a
        // green-only primary/secondary palette.
        "portal-accent":   "rgb(var(--portal-accent-rgb, var(--brand-accent-rgb)) / <alpha-value>)",
      },
      fontFamily: {
        // Marketing typography, self-hosted via next/font in _app.tsx and
        // exposed as CSS vars. Both are opt-in (use `font-display` /
        // `font-body`) so the app/dashboard default font is untouched.
        //   font-display — Fraunces (warm modern display serif, headings)
        //   font-body    — Inter (clean, neutral copy)
        // --brand-font-* is set per white-label tenant (applyBranding);
        // when unset it falls through to the next/font default var.
        display: ["var(--brand-font-display, var(--font-display))", "ui-serif", "Georgia", "Cambria", "serif"],
        body: ["var(--brand-font-body, var(--font-body))", "ui-sans-serif", "system-ui", "sans-serif"],
        // App-header heading font. Applies the tenant's chosen display
        // font ONLY when set; otherwise inherits (so non-white-label
        // admin/portal headers keep their current sans look - we don't
        // force Fraunces on every dashboard heading). Used by PortalHeader.
        "brand-display": ["var(--brand-font-display, inherit)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
