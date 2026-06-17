import type { NextApiRequest, NextApiResponse } from "next";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { emailService } from "@/services/emailService";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


/**
 * API Route for sending emails
 * This endpoint handles email sending server-side to protect API keys and manage email content.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      companyId, to, subject, template, body, variables, orderId, quoteId,
      // Optional second quoteId for two-quote emails (e.g. on-site +
      // off-site options sent together). When set alongside
      // attachQuotePdf=true a second PDF is rendered and attached.
      quoteId2,
      emailType, bypassQuarantine,
      // Optional, server-rendered Quote PDF attachment. When the
      // caller sets attachQuotePdf=true the route hydrates the
      // QuotePdfData from the quotes + companies tables (using the
      // SSR client so RLS still scopes correctly) and renders a
      // Buffer that gets handed to emailService.sendEmail. Older
      // quote-recipient clients expect the document inline so they
      // can save / forward without clicking through.
      attachQuotePdf,
      // Optional, server-rendered Invoice PDF attachment. Symmetric
      // to attachQuotePdf - caller passes attachInvoicePdf=true and
      // an invoiceId. Route hydrates the InvoicePdfData from the
      // invoices + orders + clients + companies tables (SSR client +
      // RLS) and renders a Buffer that gets handed to emailService.
      // Render failure is non-blocking; email still goes out.
      attachInvoicePdf,
      invoiceId,
      // Optional, pre-rendered attachments. content is base64 over
      // the wire; emailService converts back to Buffer for nodemailer.
      attachments: attachmentsRaw,
    } = req.body;

    if (!companyId || !to) {
      return res.status(400).json({
        error: "Missing required fields: companyId and to are required.",
        error_code: "missing_fields",
      });
    }

    // SECURITY: caller must be authenticated and belong to the company they're
    // sending email "from". Without this, anyone with the endpoint URL could
    // pump messages through another tenant's configured Resend/SMTP credentials.
    // companyWelcome is the one exception - it's invoked by the public signup
    // flow before the user has a session.
    if (emailType !== "companyWelcome") {
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { data: profile, error: profileErr } = await ssr
        .from("profiles")
        .select("company_id, role, active_role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) {
        console.error("[send-email] profiles fetch failed:", profileErr);
      }
      const callerRole = (profile as any)?.active_role || (profile as any)?.role;
      if (callerRole !== "super_admin" && (profile as any)?.company_id !== companyId) {
        return res.status(403).json({ error: "Cannot send email for another company" });
      }

      // Negative gates - two ways a send can be refused:
      //
      //   (1) blocked_contacts: the contact was deleted with the
      //       "block from future comms" toggle on. Permanent unless
      //       the row is removed from blocked_contacts.
      //
      //   (2) comms_paused_until: the recipient lives on a lead or
      //       client row that came from a bulk import and the owner
      //       hasn't reviewed + green-lit the batch yet. Stops naive
      //       "welcome email" blasts from going out to historical
      //       data on day one of a new tenant.
      //
      // Both checks run for every recipient. Either one triggers a
      // 409 response so the caller can surface the reason in the UI.
      const recipients = Array.isArray(to) ? to : [to];
      const recipientLower = recipients
        .filter((r): r is string => typeof r === "string" && !!r)
        .map((r) => r.toLowerCase().trim());

      if (recipientLower.length > 0) {
        const { data: blocks, error: blocksErr } = await ssr
          .from("blocked_contacts")
          .select("email_lower, reason")
          .eq("company_id", companyId)
          .in("email_lower", recipientLower);
        if (blocksErr) {
          console.error("[send-email] blocked_contacts fetch failed:", blocksErr);
        }
        if (blocks && blocks.length > 0) {
          const firstBlocked = blocks.map((b) => b.email_lower).filter(Boolean)[0] as string | undefined;
          return res.status(409).json({
            success: false,
            error: `${firstBlocked || "Recipient"} is on your blocked-contacts list. Unblock them in Contacts.`,
            error_code: "blocked_recipient",
            fix_link: "/admin/contacts",
            blocked: blocks.map((b) => b.email_lower).filter(Boolean) as string[],
            reason: blocks[0]?.reason ?? null,
          });
        }

        // Quarantine guard. is_comms_paused_for_email looks across
        // leads + clients for any row matching this address whose
        // comms_paused_until is still in the future. Importantly we
        // run it per recipient so one paused email in a multi-recipient
        // send blocks the whole call - safer default than partial
        // delivery.
        //
        // bypassQuarantine carve-out: legal / critical comms (refund
        // receipts, cancellation notices, postponement confirmations)
        // must reach the client even when their record is in import
        // quarantine. Block list above still applies in either mode.
        // The server-side emailService already supports this; we now
        // forward it through this API endpoint so browser-initiated
        // critical comms aren't silently 409'd.
        if (!bypassQuarantine) {
          for (const recip of recipientLower) {
            const { data: paused } = await ssr.rpc("is_comms_paused_for_email", {
              p_company_id: companyId,
              p_email: recip,
            });
            if (paused === true) {
              return res.status(409).json({
                success: false,
                error: `Comms to ${recip} are paused (bulk-import quarantine). Review the import to unblock.`,
                error_code: "quarantined_recipient",
                fix_link: "/admin/contacts",
                quarantined: recip,
              });
            }
          }
        }
      }
    }

    let result: { success: boolean; error?: string; error_code?: string; fix_link?: string; context?: any } = { success: false };

    // Handle specific email types with server-side templates
    if (emailType === 'companyWelcome' && variables) {
      const { companyName, ownerName } = variables;
      const welcomeSubject = `Welcome to CateringMS, ${companyName}!`;
      const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/login`;
      
      const welcomeBody = `
        <h1>Welcome, ${ownerName}!</h1>
        <p>Your company, <strong>${companyName}</strong>, is now set up on the CateringMS platform.</p>
        <p>You can now log in to your account to start managing your catering business.</p>
        <a href="${loginUrl}" style="background-color: #4f46e5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Log In to Your Dashboard
        </a>
        <p>If you have any questions, feel free to contact our support team.</p>
        <br>
        <p>Best regards,</p>
        <p>The CateringMS Team</p>
      `;

      // Wave 24: signup flow has no user session yet, so the
      // emailService internal anon-supabase fallback fails RLS on
      // email_provider_settings and the welcome mail silently no-ops.
      // Pass service-role here.
      result = await emailService.sendEmailDetailed({
        companyId,
        to,
        subject: welcomeSubject,
        body: welcomeBody,
        _client: getServiceSupabase(),
      } as any);

    } else {
      // Handle generic email requests
      if (!subject) {
        return res.status(400).json({ error: "Missing required field: subject is required for generic emails." });
      }

      // Normalise wire-format attachments (base64 strings) back into
      // Buffers for the email provider. Caller may also pass raw
      // strings - we leave those alone.
      const attachments: any[] = [];
      if (Array.isArray(attachmentsRaw)) {
        for (const a of attachmentsRaw) {
          if (!a || !a.filename || !a.content) continue;
          attachments.push({
            filename: String(a.filename),
            content: typeof a.content === "string"
              ? Buffer.from(a.content, "base64")
              : a.content,
            ...(a.contentType ? { contentType: String(a.contentType) } : {}),
          });
        }
      }

      // Server-side Quote PDF render. Kept inside the route (rather
      // than the browser) because @react-pdf/renderer relies on
      // Node-only streams. The fetch caller in quoteService just
      // sets attachQuotePdf=true and we do the rest.
      if (attachQuotePdf && quoteId) {
        try {
          const ssr = createPagesServerClient({ req, res });
          const { data: q } = await ssr
            .from("quotes")
            .select(`
              id, quote_number, quote_name, client_name, event_date, event_time, setup_time, guest_count,
              venue_address, menu_items, equipment_items, notes, terms_and_conditions,
              subtotal, tax_amount, discount_amount, total, total_amount, status,
              delivery_fee, delivery_distance_km, delivery_rate_per_km,
              valid_until, accepted_at, updated_at,
              company:company_id (
                company_name, legal_name, logo_url, email, phone, website,
                address_line1, address_line2, city,
                primary_color, vat_registered, vat_number, vat_rate,
                registration_number, tax_number, currency,
                updated_at
              )
            `)
            .eq("id", quoteId)
            .is("deleted_at", null)
            .maybeSingle();

          if (q) {
            const { renderQuotePdf, sanitiseFilename } = await import("@/services/pdf");
            const pdfBuffer = await renderQuotePdf(
              {
                quote_number: (q as any).quote_number,
                quote_name: (q as any).quote_name,
                client_name: (q as any).client_name,
                event_date: (q as any).event_date,
                event_time: (q as any).event_time,
                setup_time: (q as any).setup_time,
                guest_count: (q as any).guest_count,
                venue_address: (q as any).venue_address,
                menu_items: (q as any).menu_items,
                equipment_items: (q as any).equipment_items,
                subtotal: (q as any).subtotal,
                delivery_fee: (q as any).delivery_fee,
                delivery_distance_km: (q as any).delivery_distance_km,
                delivery_rate_per_km: (q as any).delivery_rate_per_km,
                discount_amount: (q as any).discount_amount,
                tax_amount: (q as any).tax_amount,
                total: Number((q as any).total ?? (q as any).total_amount ?? 0),
                valid_until: (q as any).valid_until,
                terms_and_conditions: (q as any).terms_and_conditions,
                notes: (q as any).notes,
                status: (q as any).status,
                accepted_at: (q as any).accepted_at,
                company: (q as any).company || {},
              },
              {
                cacheKey: {
                  quoteId,
                  quoteUpdatedAt: (q as any).updated_at ?? null,
                  companyUpdatedAt: (q as any).company?.updated_at ?? null,
                },
              },
            );
            const filename = `Quote-${sanitiseFilename((q as any).quote_number || quoteId)}.pdf`;
            attachments.push({
              filename,
              content: pdfBuffer,
              contentType: "application/pdf",
            });
          } else {
            console.warn(`[send-email] attachQuotePdf=true but quote ${quoteId} not readable`);
          }
        } catch (pdfErr: any) {
          // PDF render failure must not block the email send. The
          // recipient still gets the link to the public quote page;
          // ops sees the warning and can investigate the
          // @react-pdf/renderer install / data shape.
          console.warn("[send-email] quote PDF render failed (non-blocking):", pdfErr?.message || pdfErr);
        }
      }

      // Second quote PDF - rendered when the operator bundles two
      // quotes into one email (e.g. on-site vs off-site options).
      // Symmetric to the first block; failure is non-blocking.
      if (attachQuotePdf && quoteId2) {
        try {
          const ssr = createPagesServerClient({ req, res });
          const { data: q2 } = await ssr
            .from("quotes")
            .select(`
              id, quote_number, quote_name, client_name, event_date, event_time, setup_time, guest_count,
              venue_address, menu_items, equipment_items, notes, terms_and_conditions,
              subtotal, tax_amount, discount_amount, total, total_amount, status,
              delivery_fee, delivery_distance_km, delivery_rate_per_km,
              valid_until, accepted_at, updated_at,
              company:company_id (
                company_name, legal_name, logo_url, email, phone, website,
                address_line1, address_line2, city,
                primary_color, vat_registered, vat_number, vat_rate,
                registration_number, tax_number, currency,
                updated_at
              )
            `)
            .eq("id", quoteId2)
            .is("deleted_at", null)
            .maybeSingle();

          if (q2) {
            const { renderQuotePdf, sanitiseFilename } = await import("@/services/pdf");
            const pdfBuffer2 = await renderQuotePdf(
              {
                quote_number: (q2 as any).quote_number,
                quote_name: (q2 as any).quote_name,
                client_name: (q2 as any).client_name,
                event_date: (q2 as any).event_date,
                event_time: (q2 as any).event_time,
                setup_time: (q2 as any).setup_time,
                guest_count: (q2 as any).guest_count,
                venue_address: (q2 as any).venue_address,
                menu_items: (q2 as any).menu_items,
                equipment_items: (q2 as any).equipment_items,
                subtotal: (q2 as any).subtotal,
                delivery_fee: (q2 as any).delivery_fee,
                delivery_distance_km: (q2 as any).delivery_distance_km,
                delivery_rate_per_km: (q2 as any).delivery_rate_per_km,
                discount_amount: (q2 as any).discount_amount,
                tax_amount: (q2 as any).tax_amount,
                total: Number((q2 as any).total ?? (q2 as any).total_amount ?? 0),
                valid_until: (q2 as any).valid_until,
                terms_and_conditions: (q2 as any).terms_and_conditions,
                notes: (q2 as any).notes,
                status: (q2 as any).status,
                accepted_at: (q2 as any).accepted_at,
                company: (q2 as any).company || {},
              },
              {
                cacheKey: {
                  quoteId: quoteId2,
                  quoteUpdatedAt: (q2 as any).updated_at ?? null,
                  companyUpdatedAt: (q2 as any).company?.updated_at ?? null,
                },
              },
            );
            const filename2 = `Quote-${sanitiseFilename((q2 as any).quote_number || quoteId2)}.pdf`;
            attachments.push({
              filename: filename2,
              content: pdfBuffer2,
              contentType: "application/pdf",
            });
          } else {
            console.warn(`[send-email] attachQuotePdf quoteId2=true but quote ${quoteId2} not readable`);
          }
        } catch (pdfErr: any) {
          console.warn("[send-email] second quote PDF render failed (non-blocking):", pdfErr?.message || pdfErr);
        }
      }

      // Server-side Invoice PDF render. Mirrors attachQuotePdf above:
      // caller flips attachInvoicePdf=true + provides invoiceId, route
      // hydrates the InvoicePdfData via SSR client (RLS-scoped) and
      // attaches Invoice-{invoice_number}.pdf. Render failure stays
      // non-blocking so the recipient still gets the email body +
      // payment link even if the PDF pipeline trips.
      if (attachInvoicePdf && invoiceId) {
        try {
          const ssr = createPagesServerClient({ req, res });
          const { data: inv, error: invErr } = await ssr
            .from("invoices")
            .select(`
              id, invoice_number, invoice_date, due_date, status,
              subtotal, tax_amount, total_amount, amount_paid, balance_due,
              notes, invoice_data, updated_at,
              client:client_id (
                client_name, email, phone,
                billing_address_line1, billing_address_line2,
                billing_city, billing_postal_code
              ),
              order:order_id (
                id, order_number, event_name, event_date, discount_amount, updated_at
              ),
              company:company_id (
                company_name, legal_name, logo_url, email, phone,
                address_line1, address_line2, city, state_province,
                postal_code, country, primary_color,
                vat_registered, vat_number, vat_rate,
                registration_number, tax_number,
                currency,
                updated_at
              )
            `)
            .eq("id", invoiceId)
            .is("deleted_at", null)
            .maybeSingle();
          if (invErr) {
            console.error("[send-email] invoices fetch failed:", invErr);
          }

          if (inv) {
            const invAny = inv as any;
            const client = invAny.client || {};
            const order = invAny.order || {};
            const company = invAny.company || {};
            const stashed = invAny.invoice_data || {};

            // InvoiceDocument expects a single client.address string.
            // Flatten the billing_* columns here so the document layer
            // stays decoupled from the client schema.
            const clientAddress = [
              client.billing_address_line1,
              client.billing_address_line2,
              client.billing_city,
              client.billing_postal_code,
            ]
              .filter(Boolean)
              .join(", ") || null;

            const { renderInvoicePdf, sanitiseFilename } = await import("@/services/pdf");
            const pdfBuffer = await renderInvoicePdf(
              {
                invoice_number: invAny.invoice_number,
                invoice_date: invAny.invoice_date,
                due_date: invAny.due_date,
                status: invAny.status,
                client: {
                  name: client.client_name || stashed.clientName || "",
                  email: client.email || null,
                  phone: client.phone || null,
                  address: clientAddress,
                },
                order_number: order.order_number || stashed.orderNumber || null,
                event_name: order.event_name || null,
                event_date: order.event_date || null,
                line_items: Array.isArray(stashed.items)
                  ? stashed.items.map((it: any) => ({
                      name: it?.description || "Item",
                      description: null,
                      quantity: it?.quantity ?? null,
                      unit_price: it?.unitPrice ?? null,
                      total: it?.total ?? null,
                    }))
                  : [],
                subtotal: invAny.subtotal,
                tax_amount: invAny.tax_amount,
                // Phase 15 #8: discount comes from the linked order
                // since invoices.discount_amount doesn't exist on
                // the schema. The order owns the concession; the
                // invoice surfaces it on the printed PDF.
                discount_amount: order.discount_amount ?? null,
                total_amount: Number(invAny.total_amount ?? 0),
                amount_paid: invAny.amount_paid,
                balance_due: invAny.balance_due,
                // Phase 9 #2: tenant currency feeds the InvoiceDocument
                // money formatter. Falls back to ZAR when company.currency
                // is null so existing tenants render unchanged.
                currency: company.currency || null,
                notes: invAny.notes || stashed.notes || null,
                payment_terms: stashed.paymentTerms || company.payment_terms || null,
                company: {
                  company_name: company.company_name,
                  legal_name: company.legal_name,
                  logo_url: company.logo_url,
                  email: company.email,
                  phone: company.phone,
                  address_line1: company.address_line1,
                  address_line2: company.address_line2,
                  city: company.city,
                  state_province: company.state_province,
                  postal_code: company.postal_code,
                  country: company.country,
                  primary_color: company.primary_color,
                  vat_registered: company.vat_registered,
                  vat_number: company.vat_number,
                  vat_rate: company.vat_rate,
                  registration_number: company.registration_number,
                  tax_number: company.tax_number,
                },
              },
              {
                cacheKey: {
                  invoiceId,
                  invoiceUpdatedAt: invAny.updated_at ?? null,
                  orderUpdatedAt: order.updated_at ?? null,
                  companyUpdatedAt: company.updated_at ?? null,
                },
              },
            );
            const filename = `Invoice-${sanitiseFilename(invAny.invoice_number || invoiceId)}.pdf`;
            attachments.push({
              filename,
              content: pdfBuffer,
              contentType: "application/pdf",
            });
          } else {
            console.warn(`[send-email] attachInvoicePdf=true but invoice ${invoiceId} not readable`);
          }
        } catch (pdfErr: any) {
          console.warn("[send-email] invoice PDF render failed (non-blocking):", pdfErr?.message || pdfErr);
        }
      }

      // Wave 24: pass service-role so getEmailConfig reads
      // email_provider_settings under RLS. The auth gate above has
      // already validated the caller can act for this companyId.
      result = await emailService.sendEmailDetailed({
        companyId,
        to,
        subject,
        template,
        body,
        variables,
        orderId,
        quoteId,
        ...(attachments.length > 0 ? { attachments } : {}),
        _client: getServiceSupabase(),
      } as any);
    }

    if (result?.success) {
      return res.status(200).json({
        success: true,
        message: "Email processed successfully",
      });
    } else {
      // Forward the structured diagnosis to the client. error_code is
      // the contract the UI maps to a "Fix this" link. Fall back to a
      // generic message if the service didn't supply one.
      return res.status(500).json({
        success: false,
        error: result?.error || "Failed to send email",
        error_code: result?.error_code || "unknown",
        ...(result?.fix_link ? { fix_link: result.fix_link } : {}),
        ...(result?.context ? { context: result.context } : {}),
      });
    }
  } catch (error) {
    console.error("Email API error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? dbErrorMessage(error) : "Unknown error",
      error_code: "unknown",
    });
  }
}

export default withApiLogging(handler);
