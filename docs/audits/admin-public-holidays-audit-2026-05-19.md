# `/admin/public-holidays` audit (2026-05-19)

**Scope:** 15th page of the admin per-page audit programme. Fifth
in Operations group. Linked from AdminNav as "Public holidays" -
"SA gazetted dates - drives 2x BCEA rate".

**File:** `src/pages/admin/public-holidays.tsx` (398 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title + Add / CSV export buttons.
2. **List** - SA gazetted + tenant-custom holidays, with delete on
   custom rows.
3. **Add dialog** - name, date, recurring flag (UI hardcoded false).

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| PHO-1 | No `@ts-nocheck`. ✓ Single `as any` on line 51 (profile) is acceptable. | none |
| PHO-4 | CSV export is inline (lines 134-160) - same blob-link pattern as elsewhere; works fine but not extracted to a helper. | P3 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| PHO-6 | No date validation. Submitting "Annual shutdown 27 Dec 2024" today persists silently with no warning. | P2 |
| PHO-7 | `is_recurring` hardcoded to false (line 344). UI doesn't expose the toggle. Annual holidays must be re-added every year - the column exists, the wage system supports it, but the form doesn't write it. | P2 |
| PHO-8 | No audit log on holiday additions / deletions. Payroll reconciliation can't trace who added "Annual shutdown" or when. | P3 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| PHO-2 | No supabase realtime sub. Concurrent admin adds a holiday - stale-data window until manual refresh. | P2 |
| PHO-5 | Delete doesn't emit `cateringms:holidays-updated` event. Wage clock-out pulls holidays at clock-out time so live shifts are fine; an open wage sheet in another tab may have cached the old rate. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| PHO-3 | ProtectedRoute [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. ✓ sales_admin / region_admin correctly excluded - holiday data is global tenant config, not per-role. | none |

---

## C. Priority fix list

**P0** (safety): none.

**P1**: none.

**P2** (data + chain reactions):
- PHO-2: Realtime sub on public_holidays
- PHO-5: Emit cateringms:holidays-updated on delete + add
- PHO-6: Date validation
- PHO-7: is_recurring UI toggle

**P3** (polish):
- PHO-4: Extract CSV helper
- PHO-8: Audit log

---

## D. First-wave PRs

| PR | Title |
|---|---|
| PHO-A | Realtime sub + event emit + date validation (PHO-2 + PHO-5 + PHO-6 batch) |
| PHO-B | is_recurring UI toggle (PHO-7, P2 - separate) |
| PHO-C | CSV helper + audit log (PHO-4 + PHO-8, P3) |
