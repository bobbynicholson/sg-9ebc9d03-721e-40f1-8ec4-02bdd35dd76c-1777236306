/**
 * "Email client" drawer for the Email button on leads, quotes and orders.
 *
 * Wraps the shared MessageComposer (review-before-send, direct send through
 * the platform, Gmail / Outlook / copy, WhatsApp) with a template picker:
 *   - any page-specific suggestions the caller passes (e.g. the lead's
 *     usual reply for its stage)
 *   - "We're fully booked" - registry template email_fully_booked, using
 *     the company's own edited wording when they have saved one
 *   - "Blank email"
 * Picking a template refills subject + body; the operator can edit
 * everything before sending.
 */
import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { MessageComposer, type ContextRow } from "@/components/messaging/MessageComposer";
import { resolveTemplate } from "@/services/messageTemplateService";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { COUNTRIES } from "@/lib/regionGeography";

export interface ClientEmailOption {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export interface ClientEmailDrawerProps {
  title: string;
  contextLabel: string;
  contextRows: ContextRow[];
  recipient: { name: string; email: string | null; phone?: string | null; clientId?: string | null };
  companyId: string | null;
  fromName: string;
  /** Template variables ({{first_name}}, {{event_date}} ...). */
  vars: {
    first_name: string;
    client_name: string;
    tenant_name?: string;
    event_name: string;
    event_date: string;
    guest_count?: string | number | null;
  };
  /** Page-specific templates shown first in the picker. */
  extraOptions?: ClientEmailOption[];
  /** Which option to start on (defaults to the first). */
  defaultOptionId?: string;
  /** Show the service-area response option for leads, quotes, or orders. */
  showServiceAreaOption?: boolean;
  quoteId?: string | null;
  orderId?: string | null;
  onSent?: () => void;
  onClose: () => void;
}

export function ClientEmailDrawer(props: ClientEmailDrawerProps) {
  const { companyId, fromName, vars } = props;
  const [fullyBooked, setFullyBooked] = useState<ClientEmailOption | null>(null);
  const [outsideServiceArea, setOutsideServiceArea] = useState<ClientEmailOption | null>(null);
  const [serviceAreaBase, setServiceAreaBase] = useState("");
  const [companyDisplayName, setCompanyDisplayName] = useState(vars.tenant_name || "our company");
  const [servedAreas, setServedAreas] = useState<string[]>([]);
  const [unavailableAreas, setUnavailableAreas] = useState<string[]>([]);
  const serviceAreaChoices = COUNTRIES.find((country) => country.code === "ZA")?.divisions || [];
  const fallbackFullyBooked = useMemo<ClientEmailOption>(() => {
    const companyDisplayName = vars.tenant_name || "our company";
    return {
      id: "fully_booked",
      label: "We're fully booked",
      subject: `Your enquiry for ${vars.event_date || "your date"} - ${companyDisplayName}`,
      body:
        `Hi ${vars.first_name || "there"},\n\n` +
        `Thank you so much for thinking of us for ${vars.event_name || "your event"}. Unfortunately we are fully booked on ${vars.event_date || "that date"} and can't take on another event that day.\n\n` +
        `If your date is flexible, let me know and I'll gladly check another day for you. We'd love to cater for you another time.\n\nBest,\n${fromName || "the team"}`,
    };
  }, [fromName, vars.event_date, vars.event_name, vars.first_name, vars.tenant_name]);
  const fallbackOutsideArea = (): ClientEmailOption => {
    const companyDisplayName = vars.tenant_name || "our company";
    return {
      id: "outside_service_area",
      label: "Outside our area",
      subject: `Your enquiry - ${companyDisplayName}`,
      body:
        `Hi ${vars.first_name || "there"},\n\n` +
        `Thanks for your enquiry. Unfortunately, we are currently unable to service events in your area.\n\n` +
        `If you are ever hosting a function in our service area, we would love to quote you!\n\n` +
        `If you have any questions, feel free to contact me at any time.\n\n` +
        `Thanks again ${vars.first_name || "there"} and have a fantastic day further.\n\n` +
        `Regards,\n${fromName || "the team"}\n\n${companyDisplayName}`,
    };
  };
  const fallbackOutsideServiceArea = useMemo(
    () => props.showServiceAreaOption ? fallbackOutsideArea() : null,
    [props.showServiceAreaOption, vars.first_name, vars.tenant_name, fromName],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await resolveTemplate({
        companyId,
        key: "email_fully_booked",
        ctx: {
          first_name: vars.first_name,
          client_name: vars.client_name,
          tenant_name: vars.tenant_name || fromName || "",
          company_name: vars.tenant_name || "",
          from_name: fromName || "the team",
          event_name: vars.event_name,
          event_date: vars.event_date,
          guest_count: vars.guest_count ?? "",
        },
      }).catch(() => null);
      if (!cancelled && resolved) {
        setFullyBooked({ id: "fully_booked", label: "Tell client we're full", subject: resolved.subject, body: resolved.body });
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, fromName, vars.first_name, vars.client_name, vars.tenant_name, vars.event_name, vars.event_date, vars.guest_count]);

  useEffect(() => {
    if (!props.showServiceAreaOption) {
      setOutsideServiceArea(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let settings: any = {};
        if (companyId) {
          const { data: company, error } = await (supabase as any)
            .from("companies")
            .select("company_name, dispatch_settings")
            .eq("id", companyId)
            .maybeSingle();
          if (error) throw error;
          if (typeof company?.company_name === "string" && company.company_name.trim()) {
            setCompanyDisplayName(company.company_name.trim());
          }
          settings = company?.dispatch_settings || {};
          if (typeof settings === "string") settings = JSON.parse(settings);
        }
        const serviceAreas = Array.isArray(settings.serviceAreas)
          ? settings.serviceAreas.filter((area: unknown): area is string => typeof area === "string" && !!area.trim())
          : [];
        const unavailableAreas = Array.isArray(settings.unavailableAreas)
          ? settings.unavailableAreas.filter((area: unknown): area is string => typeof area === "string" && !!area.trim())
          : [];
        if (cancelled) return;
        setServiceAreaBase(typeof settings.serviceAreaBase === "string" ? settings.serviceAreaBase : "");
        setServedAreas(serviceAreas);
        setUnavailableAreas(unavailableAreas);
      } catch (error) {
        console.warn("[client-email] service areas could not be loaded:", error);
      }
    })();
    return () => { cancelled = true; };
  }, [props.showServiceAreaOption, companyId, vars.tenant_name]);

  useEffect(() => {
    if (!props.showServiceAreaOption) return;
    const areaList = (areas: string[]) => areas.length > 1
      ? `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}`
      : areas[0];
    const serviceAreaText = servedAreas.length ? areaList(servedAreas) : "our current service area";
    const unavailableAreaText = areaList(unavailableAreas);
    let cancelled = false;
    void resolveTemplate({
      companyId,
      key: "email_lead_outside_service_area",
      ctx: {
        first_name: vars.first_name,
        client_name: vars.client_name,
        tenant_name: vars.tenant_name || companyDisplayName,
        company_name: vars.tenant_name || companyDisplayName,
        from_name: fromName || "the team",
        event_name: vars.event_name,
        event_date: vars.event_date,
        guest_count: vars.guest_count ?? "",
        service_areas: serviceAreaText,
        unavailable_areas: unavailableAreaText,
        service_area_intro: serviceAreaBase.trim()
          ? `we are a ${serviceAreaBase.trim()} based company${servedAreas.length ? ` servicing ${serviceAreaText}${servedAreas.length === 1 ? " only" : ""}` : ""}`
          : servedAreas.length
            ? `we currently service ${serviceAreaText}${servedAreas.length === 1 ? " only" : ""}`
            : "we currently operate within a limited service area",
        service_area_limit_sentence: unavailableAreas.length
          ? `as we have not managed to get to ${unavailableAreaText} yet.`
          : "and cannot yet service events outside these areas.",
        future_service_areas_sentence: unavailableAreas.length
          ? `Alternatively, we will notify you once we are up and running in ${unavailableAreaText}.\n\n`
          : "",
      },
    }).then((resolved) => {
      if (cancelled) return;
      setOutsideServiceArea(resolved
        ? { id: "outside_service_area", label: "Outside our area", subject: resolved.subject, body: resolved.body }
        : fallbackOutsideArea());
    }).catch((error) => {
      console.warn("[client-email] outside-area email could not be resolved:", error);
      if (!cancelled) setOutsideServiceArea(fallbackOutsideArea());
    });
    return () => { cancelled = true; };
  }, [props.showServiceAreaOption, companyId, fromName, vars.first_name, vars.client_name, vars.tenant_name, vars.event_name, vars.event_date, vars.guest_count, companyDisplayName, serviceAreaBase, servedAreas, unavailableAreas]);

  const options = useMemo<ClientEmailOption[]>(() => {
    const list: ClientEmailOption[] = [...(props.extraOptions || [])];
    // The named action must work while a company's customized wording loads.
    list.push(fullyBooked || fallbackFullyBooked);
    if (outsideServiceArea || fallbackOutsideServiceArea) {
      list.push(outsideServiceArea || fallbackOutsideServiceArea!);
    }
    list.push({
      id: "blank",
      label: "Write my own",
      subject: "",
      body: `Hi ${vars.first_name || "there"},\n\n\n\nBest,\n${fromName || "the team"}`,
    });
    return list;
  }, [props.extraOptions, fullyBooked, fallbackFullyBooked, outsideServiceArea, fallbackOutsideServiceArea, vars.first_name, fromName]);

  const [selected, setSelected] = useState<string>(props.defaultOptionId || "");
  useEffect(() => {
    setSelected(props.defaultOptionId || "");
  }, [props.defaultOptionId]);
  const current = options.find((o) => o.id === selected) || (selected ? null : options[0]);

  if (!current) {
    return (
      <div role="status" className="flex h-full items-center justify-center p-6 text-sm text-slate-600">
        Preparing the outside-area email…
      </div>
    );
  }

  return (
    // Re-mounting on a new template choice refills subject + body even after
    // the operator has typed (the composer stops auto-filling once edited).
    <MessageComposer
      key={current?.id || "none"}
      icon={<Mail className="w-5 h-5 text-brand-primary" />}
      title={props.title}
      subtitle="Choose a ready-made message below, change anything you like, then send."
      controls={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Start from:</span>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelected(o.id)}
                className={`rounded-full border px-3 py-1 text-xs ${current?.id === o.id ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {props.showServiceAreaOption && current.id === "outside_service_area" && (
            <div className="space-y-3 rounded-md border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-700">Choose the areas for this message. These changes only affect this draft.</p>
              <div className="space-y-1.5">
                <Label htmlFor="outside-area-base" className="text-xs">Company base</Label>
                <Input
                  id="outside-area-base"
                  value={serviceAreaBase}
                  onChange={(event) => setServiceAreaBase(event.target.value)}
                  placeholder="Cape Town"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {([
                  ["served", "Areas we serve", servedAreas, setServedAreas, unavailableAreas, setUnavailableAreas],
                  ["not-served", "Areas we do not serve yet", unavailableAreas, setUnavailableAreas, servedAreas, setServedAreas],
                ] as const).map(([key, label, selectedAreas, setSelectedAreas, otherAreas, setOtherAreas]) => (
                  <details key={key} className="rounded border border-slate-200 px-2.5 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700">
                      {label} ({selectedAreas.length} selected)
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                      {serviceAreaChoices.map((area) => (
                        <label key={`${key}-${area}`} className="flex min-w-0 items-center gap-2 text-xs text-slate-700">
                          <Checkbox
                            checked={selectedAreas.includes(area)}
                            onCheckedChange={(checked) => {
                              const isChecked = checked === true;
                              setSelectedAreas(isChecked
                                ? [...selectedAreas, area]
                                : selectedAreas.filter((value) => value !== area));
                              if (isChecked) setOtherAreas(otherAreas.filter((value) => value !== area));
                            }}
                          />
                          <span className="break-words">{area}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      }
      contextLabel={props.contextLabel}
      contextRows={props.contextRows}
      recipient={props.recipient}
      template={{ subject: current?.subject || "", body: current?.body || "" }}
      fromName={fromName}
      directEmail={companyId ? { companyId, quoteId: props.quoteId ?? null, orderId: props.orderId ?? null } : undefined}
      footerHint={'Edit “Fully booked” and “Outside our area” wording under Settings > Messages > Templates.'}
      onSent={() => props.onSent?.()}
      onClose={props.onClose}
    />
  );
}
