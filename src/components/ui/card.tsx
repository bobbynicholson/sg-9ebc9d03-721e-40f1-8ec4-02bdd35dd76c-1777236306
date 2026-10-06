import * as React from "react"

import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

type Disclosure = { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; bodyId: string; label: string }
const CardDisclosure = React.createContext<Disclosure | null>(null)
type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Explicit opt-in for secondary sections. Primary lists and alerts stay visible. */
  collapsible?: boolean
  defaultOpen?: boolean
  collapseLabel?: string
}

const Card = React.forwardRef<
  HTMLDivElement,
  CardProps
>(({ className, collapsible = false, defaultOpen = false, collapseLabel = "section", children, ...props }, ref) => {
  const [open, setOpen] = React.useState(defaultOpen)
  const generatedId = React.useId()
  const body = React.Children.toArray(children).find(child => React.isValidElement(child) && child.type === CardContent)
  const bodyId = React.isValidElement<React.HTMLAttributes<HTMLDivElement>>(body) && body.props.id || generatedId
  React.useEffect(() => {
    if (!collapsible) return
    const root = document.getElementById(bodyId)?.closest('[data-collapsible]')
    const reveal = () => setOpen(true)
    const revealHash = () => {
      let hash = window.location.hash.slice(1)
      try { hash = decodeURIComponent(hash) } catch { /* Keep malformed hashes inert. */ }
      const target = hash && document.getElementById(hash)
      if (target && root?.contains(target)) reveal()
    }
    root?.addEventListener('ui:expand-section', reveal)
    window.addEventListener('hashchange', revealHash)
    revealHash()
    return () => {
      root?.removeEventListener('ui:expand-section', reveal)
      window.removeEventListener('hashchange', revealHash)
    }
  }, [bodyId, collapsible])
  return (
  <CardDisclosure.Provider value={collapsible ? { open, setOpen, bodyId, label: collapseLabel } : null}>
  <div
    ref={ref}
    className={cn(
      // Matched to the redesigned PortalCard so older admin pages using
      // shadcn cards share the same desk-panel treatment instead of
      // drifting back into generic rounded white boxes.
      "rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.08)] dark:border-slate-800",
      // A closed section should not stretch to its grid neighbour's height.
      collapsible && !open && "self-start",
      className
    )}
    {...props}
    data-collapsible={collapsible || undefined}
    data-state={collapsible ? (open ? "open" : "closed") : undefined}
  >{children}</div>
  </CardDisclosure.Provider>
  )
})
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const disclosure = React.useContext(CardDisclosure)
  return (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 border-b border-slate-200 p-5 dark:border-slate-800", className,
      disclosure && "flex-row items-start gap-3 space-y-0")}
    {...props}
  >
    {disclosure ? <>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
      <button type="button" aria-expanded={disclosure.open} aria-controls={disclosure.bodyId}
        aria-label={`${disclosure.open ? "Collapse" : "Expand"} ${disclosure.label}`}
        onClick={() => disclosure.setOpen(value => !value)}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
        <span className="hidden sm:inline">{disclosure.open ? "Collapse" : "Expand"}</span>
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", disclosure.open && "rotate-180")} />
      </button>
    </> : children}
  </div>
  )
})
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="heading"
    aria-level={2}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, onInvalidCapture, ...props }, ref) => {
  const disclosure = React.useContext(CardDisclosure)
  return <div ref={ref} className={cn("p-5", className)} {...props}
    id={props.id || disclosure?.bodyId}
    hidden={props.hidden || (disclosure ? !disclosure.open : false)}
    style={disclosure && !disclosure.open ? { ...style, display: "none" } : style}
    onInvalidCapture={event => {
      onInvalidCapture?.(event)
      if (disclosure && !disclosure.open) {
        event.preventDefault()
        disclosure.setOpen(true)
        const input = event.target as HTMLInputElement
        window.requestAnimationFrame(() => { input.focus(); input.reportValidity?.() })
      }
    }} />
})
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => {
  const disclosure = React.useContext(CardDisclosure)
  return (
  <div
    ref={ref}
    className={cn("flex items-center border-t border-slate-200 p-5 dark:border-slate-800", className)}
    {...props}
    hidden={props.hidden || (disclosure ? !disclosure.open : false)}
    style={disclosure && !disclosure.open ? { ...style, display: "none" } : style}
  />
  )
})
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
