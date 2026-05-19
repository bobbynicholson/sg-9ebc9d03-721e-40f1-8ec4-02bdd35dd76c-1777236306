# `/admin/quotes` (Quotes pipeline) audit (2026-05-19)

**Scope:** Seventh page of the admin per-page audit programme. Third
page of the Pipeline group. Linked from AdminNav as "Quotes"
(Pipeline group); routes to `/admin/quotes`.

**Files:**
- `src/pages/admin/quotes/index.tsx` (2,939 lines) - quote list / pipeline
- `src/pages/admin/quotes/new.tsx` (2,472 lines) - quote builder
- `src/pages/admin/quotes/[id].tsx` (1,165 lines) - quote detail

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Quote list** (index) - pipeline view with KPI strip
   (action_needed / in_play / stale / won / expired / lost); status
   buckets; drill to detail.
2. **Quote builder** (new) - client + event details, per-line
   pricing (per_person / per_portion / flat), surge / discount /
   flat adjustments, auto-save drafts, allergen gate on send, lead
   linkage.
3. **Quote detail** ([id]) - draft mode editable; sent+ modes
   read-only summary + change-request panel; Mark sent / Convert
   to order CTAs.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| QTS-1 | `new.tsx` is 2,472 lines with no extracted subcomponents. PricingEditor, EquipmentSection, AllergenGate, kitchen-capacity suggestion all inline. | P2 |
| QTS-2 | `as any` count: new=31, index=90, [id]=53 (174 total). All three files already have `@ts-nocheck` removed (✓) but lean heavily on unsafe casts. | P2 |
| QTS-3 | index.tsx has 14 useMemo + 16 useState in main component. Tight coupling. | P3 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| QTS-4 | Quote total is recomputed client-side from line items (new.tsx ~940-980) and also read from quotes.total (index.tsx ~199, 230, 543-549). No server-side reconciliation that saved total matches menu_items[] after update. | P2 |
| QTS-5 | Quote status pipeline derived from status + sent_at / viewed_at / accepted_at stamps via `deriveQuoteIntelligence` (index.tsx ~462+). Index already has supabase realtime subs on quotes (~823-840, ~856-879), but `new.tsx` and `[id].tsx` don't emit `cateringms:quote-updated` after persist - so other open pages relying on the event (calendar, dashboard) miss the signal. | P1 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| QTS-6 | `new.tsx` doesn't emit a `cateringms:quote-updated` event after createQuote / updateQuote. The realtime sub on the index page catches it via supabase channel, but cross-page listeners (calendar, contacts) miss it. | P2 |
| QTS-7 | Quote accepted on public portal -> no event fired to `/admin/leads` or `/admin/contacts` to flip lead status to "won". Same gap as LDS-11. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| QTS-8 | **Inconsistent ProtectedRoute**: `new.tsx` wraps in ProtectedRoute(SUPER_ADMIN / COMPANY_ADMIN / ADMIN). `index.tsx` and `[id].tsx` have NO ProtectedRoute import or wrapper at all - relying only on middleware. Same omission as LO-2: defense-in-depth missing. sales_admin should also be admitted (their primary surface). | **P1** |
| QTS-9 | Accepted quotes show "Convert to order" but don't visually lock pricing edits on the detail page. The autosave guard (~new.tsx 1353) blocks the write, but the UI doesn't reflect "locked" state. | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| QTS-10 | No bulk "send chase emails to stale quotes". Same pattern as LDS-6. | P2 |
| QTS-11 | `valid_until` captured + shown but no expiry warnings, no dashboard widget, no email reminder. Quotes silently expire. | P3 |
| QTS-12 | duplicateQuote exists in service but no UI on the detail page. Repeat clients re-enter every line. | P3 |
| QTS-13 | Phone numbers rendered as plain text. No tap-to-call. Same pattern as LDS-8 / CTS-8. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| QTS-14 | `quoteService.getQuotes(companyId)` returns ALL quotes with no limit / filter. Index page fuzzy-searches the whole array client-side. Same pattern as LDS-3 / CTS-4. | **P1** |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical + role coverage):
- QTS-8: ProtectedRoute wrappers on index + [id], admit sales_admin
- QTS-14: Server-side pagination + filter on getQuotes
- QTS-5: Emit cateringms:quote-updated from new.tsx + [id].tsx after persist

**P2** (data integrity + chain reactions):
- QTS-1: Extract PricingEditor / EquipmentSection / AllergenGate
- QTS-2: Replace `as any` casts where the supabase types do narrow correctly
- QTS-4: Server-side total reconciliation
- QTS-6 / QTS-7: Cross-page event emits
- QTS-9: Visual lock on edit controls for non-draft quotes
- QTS-10: Bulk chase-email

**P3** (polish):
- QTS-11 / QTS-12 / QTS-13: Expiry warnings, duplicate UI, tel: links

---

## D. First-wave PRs

| PR | Title |
|---|---|
| QTS-A | ProtectedRoute wrappers + sales_admin (QTS-8, P1) |
| QTS-B | Emit cateringms:quote-updated from new + [id] (QTS-5 + QTS-6, P1) |
| QTS-C | Server-side pagination + filter (QTS-14, P1 - separate, bigger) |
| QTS-D | Visual lock + tel: links (QTS-9 + QTS-13, P2/P3 batch) |
| QTS-E | Bulk chase + duplicate UI (QTS-10 + QTS-12, P2/P3 batch) |

This push ships QTS-A. QTS-B through QTS-E land in subsequent PRs.
