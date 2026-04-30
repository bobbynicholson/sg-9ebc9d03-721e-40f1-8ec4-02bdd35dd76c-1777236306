/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding/clients -- the easy client-list importer.
 *
 * Sits next to the AI importer at /admin/onboarding/import. The AI
 * version handles arbitrary spreadsheets with column mapping; this
 * one is dead simple: drop a file (or paste rows) with the four
 * columns we care about (Name, Surname, Email, Phone), preview, and
 * import. No AI required, instant feedback.
 *
 * Designed for new tenants on day one of onboarding -- the team
 * usually has a contact list in Gmail / Excel / a printed sheet,
 * and just wants the names + numbers into the system before they
 * start quoting.
 */
import { useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import {
  Upload, ArrowLeft, FileSpreadsheet, ClipboardPaste, CheckCircle2,
  AlertTriangle, Trash2, Loader2, Users,
} from "lucide-react";

type RawRow = { name?: string; surname?: string; email?: string; phone?: string; notes?: string };

interface PreviewRow extends RawRow {
  /** Local UI-only id for keys + row removal. */
  _key: string;
  /** Derived issues so the operator can see at a glance which rows are
   *  going to be rejected when they hit Import. */
  issues: string[];
}

function looksLikeEmail(v: string) {
  return /^\S+@\S+\.\S+$/.test(v.trim().toLowerCase());
}
function looksLikePhone(v: string) {
  // Loose check -- the API does the real normalisation. We just want
  // to flag rows that are clearly missing digits.
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 7;
}
function rowIssues(r: RawRow): string[] {
  const out: string[] = [];
  const fullName = [(r.name || "").trim(), (r.surname || "").trim()].filter(Boolean).join(" ").trim();
  if (!fullName) out.push("Name is missing");
  if (!r.email || !looksLikeEmail(r.email)) out.push("Email is missing or invalid");
  if (!r.phone || !looksLikePhone(r.phone)) out.push("Phone is missing");
  return out;
}

/**
 * Detect which input column maps to name / surname / email / phone.
 * Forgiving on common header spellings.
 */
function pickHeaderMap(headers: string[]): {
  name: number; surname: number; email: number; phone: number; notes: number;
} {
  const idx = (candidates: string[]) => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().trim();
      if (candidates.includes(h)) return i;
    }
    return -1;
  };
  return {
    name:    idx(["name", "first name", "firstname", "first_name", "given name"]),
    surname: idx(["surname", "last name", "lastname", "last_name", "family name", "family_name"]),
    email:   idx(["email", "e-mail", "e_mail", "mail", "email address", "email_address"]),
    phone:   idx(["phone", "tel", "telephone", "cell", "cellphone", "mobile", "phone number", "tel number", "cell number"]),
    notes:   idx(["notes", "note", "comments", "memo"]),
  };
}

/** Split a single header row + body into RawRow[]. */
function rowsFromTable(headers: string[], rows: string[][]): RawRow[] {
  const map = pickHeaderMap(headers);
  // Fallback: if no headers match (the user pasted bare data), treat
  // the first column as Name, second as Surname, third as Email,
  // fourth as Phone.
  const usePositional =
    map.name === -1 && map.surname === -1 && map.email === -1 && map.phone === -1;

  return rows
    .filter((r) => r.some((cell) => String(cell || "").trim() !== ""))
    .map((r) => {
      if (usePositional) {
        return {
          name: r[0] || "",
          surname: r[1] || "",
          email: r[2] || "",
          phone: r[3] || "",
          notes: r[4] || "",
        };
      }
      return {
        name:    map.name    >= 0 ? r[map.name]    : "",
        surname: map.surname >= 0 ? r[map.surname] : "",
        email:   map.email   >= 0 ? r[map.email]   : "",
        phone:   map.phone   >= 0 ? r[map.phone]   : "",
        notes:   map.notes   >= 0 ? r[map.notes]   : "",
      };
    });
}

/**
 * Parse a CSV string. Handles quoted fields with commas inside, but
 * we keep this small + dependency-free. Pasted data from Excel /
 * Numbers / Sheets typically arrives as TSV (tabs); we also handle
 * that.
 */
function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const trimmed = text.trim();
  if (!trimmed) return { headers: [], rows: [] };

  // Detect tab or comma. Tabs win when the first line has any.
  const firstLine = trimmed.split(/\r?\n/, 1)[0] || "";
  const delim = firstLine.includes("\t") ? "\t" : ",";

  const lines: string[][] = [];
  let inQuotes = false;
  let cur = "";
  let row: string[] = [];

  const pushCell = () => { row.push(cur); cur = ""; };
  const pushRow = () => { lines.push(row); row = []; };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (trimmed[i + 1] === "\"") { cur += "\""; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === "\"") inQuotes = true;
      else if (ch === delim) pushCell();
      else if (ch === "\n") { pushCell(); pushRow(); }
      else if (ch === "\r") { /* skip */ }
      else cur += ch;
    }
  }
  pushCell();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) pushRow();

  if (lines.length === 0) return { headers: [], rows: [] };
  const [headers, ...rest] = lines;
  return { headers: headers.map((h) => h.trim()), rows: rest };
}

function ProtectedClientImport() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ClientImportPage />
    </ProtectedRoute>
  );
}
export default ProtectedClientImport;

function ClientImportPage() {
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [pasted, setPasted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | {
    imported: number; skipped: number; rejected: number; total: number;
  }>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ingest = (raw: RawRow[]) => {
    const stamped: PreviewRow[] = raw.map((r, i) => ({
      ...r,
      _key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      issues: rowIssues(r),
    }));
    setRows((prev) => [...prev, ...stamped]);
    setResult(null);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        const text = await file.text();
        const { headers, rows: body } = parseDelimited(text);
        ingest(rowsFromTable(headers, body));
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX: any = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error("Spreadsheet has no sheets");
        const sheet = wb.Sheets[sheetName];
        const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (data.length === 0) throw new Error("Sheet is empty");
        const [headers, ...body] = data;
        ingest(rowsFromTable(headers.map(String), body.map((r) => r.map(String))));
      } else {
        throw new Error("Unsupported file type. Use CSV, TSV or XLSX.");
      }
    } catch (e: any) {
      toast({ title: "Couldn't read that file", description: e?.message || "", variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onPaste = () => {
    if (!pasted.trim()) {
      toast({ title: "Nothing to paste", description: "Drop your spreadsheet rows in the box first." });
      return;
    }
    const { headers, rows: body } = parseDelimited(pasted);
    ingest(rowsFromTable(headers, body));
    setPasted("");
  };

  const editCell = (key: string, field: keyof RawRow, val: string) => {
    setRows((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      const next = { ...r, [field]: val };
      next.issues = rowIssues(next);
      return next;
    }));
  };
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r._key !== key));
  const clearAll = () => { setRows([]); setResult(null); };

  const counts = useMemo(() => {
    const ok = rows.filter((r) => r.issues.length === 0).length;
    const bad = rows.length - ok;
    return { ok, bad };
  }, [rows]);

  const submit = async () => {
    if (rows.length === 0) return;
    const valid = rows.filter((r) => r.issues.length === 0);
    if (valid.length === 0) {
      toast({ title: "Nothing to import", description: "Every row has an issue. Fix the highlighted cells first." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch("/api/onboarding/clients/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: valid.map((v) => ({
            name: v.name, surname: v.surname, email: v.email, phone: v.phone, notes: v.notes,
          })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Upload failed");
      setResult({
        imported: j.imported, skipped: j.skipped, rejected: j.rejected, total: j.total,
      });
      toast({
        title: `${j.imported} client${j.imported === 1 ? "" : "s"} imported`,
        description: j.skipped
          ? `${j.skipped} already on file, skipped.`
          : "All clean, straight in.",
      });
      setRows([]);
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Easy client list import, CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 lg:py-10 max-w-screen-2xl mx-auto">
          <Link
            href={withSlug("/admin/onboarding")}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back to onboarding
          </Link>

          <div className="flex items-start gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
                Bring your client list across
              </h1>
              <p className="text-sm text-slate-600 mt-0.5 max-w-2xl">
                Drop a spreadsheet or paste rows from Excel / Sheets. We only need <strong>Name</strong>,
                <strong> Surname</strong>, <strong>Email</strong> and <strong>Phone</strong>.
                Existing clients with the same email are skipped automatically.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* File drop */}
            <Card className="border-2 border-dashed border-emerald-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-semibold text-slate-900">Upload a file</h2>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  CSV, TSV or XLSX. First row should be headers (Name, Surname, Email, Phone), or
                  just paste data with no headers, we'll guess column order.
                </p>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.xls,.xlsx,.txt"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <a
                    href="data:text/csv;charset=utf-8,Name,Surname,Email,Phone%0AJohn,Doe,john%40example.co.za,0823334444%0AJane,Smith,jane%40example.co.za,%2B27834445555"
                    download="client-list-template.csv"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                  >
                    <Upload className="w-3 h-3" /> Download a template
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Paste */}
            <Card className="border-2 border-dashed border-slate-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardPaste className="w-5 h-5 text-slate-500" />
                  <h2 className="font-semibold text-slate-900">Or paste from a spreadsheet</h2>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Select cells in Excel / Sheets / Numbers and paste them below. Tab- or
                  comma-separated, with or without a header row.
                </p>
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Name	Surname	Email	Phone&#10;John	Doe	john@example.co.za	082 333 4444"
                  rows={5}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
                />
                <Button
                  onClick={onPaste}
                  variant="outline"
                  className="mt-2 w-full"
                >
                  <ClipboardPaste className="w-4 h-4 mr-2" />
                  Add pasted rows
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Preview + import */}
          {rows.length > 0 && (
            <Card className="border-0 shadow-md mb-6">
              <CardContent className="p-4 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">Preview ({rows.length} rows)</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="text-emerald-700 font-medium">{counts.ok}</span> ready to import,
                      {" "}<span className="text-rose-700 font-medium">{counts.bad}</span> need a fix.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={clearAll} disabled={submitting}>
                      <Trash2 className="w-4 h-4 mr-1.5" /> Clear all
                    </Button>
                    <Button
                      onClick={submit}
                      disabled={submitting || counts.ok === 0}
                      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90"
                    >
                      {submitting
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                        : <><Upload className="w-4 h-4 mr-2" /> Import {counts.ok} client{counts.ok === 1 ? "" : "s"}</>
                      }
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 pr-3 w-8">#</th>
                        <th className="text-left py-2 px-2">Name</th>
                        <th className="text-left py-2 px-2">Surname</th>
                        <th className="text-left py-2 px-2">Email</th>
                        <th className="text-left py-2 px-2">Phone</th>
                        <th className="text-left py-2 px-2">Notes</th>
                        <th className="text-left py-2 px-2 w-20">Status</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const ok = r.issues.length === 0;
                        return (
                          <tr key={r._key} className={`border-b border-slate-100 ${ok ? "" : "bg-rose-50/50"}`}>
                            <td className="py-1.5 pr-3 text-slate-400 text-xs">{i + 1}</td>
                            <td className="py-1.5 px-1">
                              <Input
                                value={r.name || ""}
                                onChange={(e) => editCell(r._key, "name", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <Input
                                value={r.surname || ""}
                                onChange={(e) => editCell(r._key, "surname", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <Input
                                value={r.email || ""}
                                onChange={(e) => editCell(r._key, "email", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <Input
                                value={r.phone || ""}
                                onChange={(e) => editCell(r._key, "phone", e.target.value)}
                                className="h-8 text-sm"
                              />
                            </td>
                            <td className="py-1.5 px-1">
                              <Input
                                value={r.notes || ""}
                                onChange={(e) => editCell(r._key, "notes", e.target.value)}
                                placeholder="(optional)"
                                className="h-8 text-sm"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              {ok ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                                </Badge>
                              ) : (
                                <Badge
                                  className="bg-rose-100 text-rose-700 border-rose-200 border"
                                  title={r.issues.join(" · ")}
                                >
                                  <AlertTriangle className="w-3 h-3 mr-1" /> Fix
                                </Badge>
                              )}
                            </td>
                            <td className="py-1.5 px-1 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(r._key)}
                                className="text-slate-400 hover:text-rose-600"
                                title="Remove this row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result summary */}
          {result && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div className="text-sm">
                    <p className="font-medium text-emerald-900">
                      Imported {result.imported} of {result.total}.
                    </p>
                    <p className="text-xs text-emerald-700">
                      {result.skipped > 0 && <>Skipped {result.skipped} already on file. </>}
                      {result.rejected > 0 && <>Rejected {result.rejected} with missing fields.</>}
                    </p>
                  </div>
                </div>
                <Link href={withSlug("/admin/clients")}>
                  <Button variant="outline" className="border-emerald-300 bg-white">
                    Open client list
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
