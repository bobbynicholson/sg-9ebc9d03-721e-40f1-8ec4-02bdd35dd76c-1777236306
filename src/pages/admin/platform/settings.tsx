/**
 * Platform Settings - super_admin tunables for the whole SaaS.
 *
 * Currently surfaces:
 *   - import_row_cap - max rows accepted per Excel/CSV import.
 *     200 by default; lifting it lets a tenant onboard a larger
 *     legacy database in one go without splitting files.
 *
 * Stored in the existing app_config key/value table. Adding a new
 * tunable: append to KNOWN_KEYS below; the page renders a card for
 * each entry and the API accepts arbitrary keys (for ones not yet
 * documented here).
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Save, Settings, AlertCircle, Check, RefreshCw } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";

interface KnownKey {
  key: string;
  label: string;
  description: string;
  type: "number" | "text" | "url";
  unit?: string;
  example: string;
}

const KNOWN_KEYS: KnownKey[] = [
  {
    key: "import_row_cap",
    label: "Import row cap",
    description:
      "Maximum number of rows accepted per Excel / CSV import (clients, leads, onboarding wizard). Stops a tenant uploading thousands of new customers in one shot. Onboarding a real legacy database, bump it temporarily, then revert.",
    type: "number",
    unit: "rows",
    example: "200",
  },
  {
    key: "public_origin",
    label: "Public origin URL",
    description:
      "Base URL emails and webhooks point at. Change this if you migrate domains.",
    type: "url",
    example: "https://cateringms.com",
  },
];

interface ConfigRow {
  key: string;
  value: string;
}

export default function PlatformSettingsPage() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/platform/app-config");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Could not load");
      setRows((j.entries || []) as ConfigRow[]);
    } catch (e: any) {
      setError(e?.message || "Could not load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const valueFor = (key: string): string => {
    if (edits[key] != null) return edits[key];
    const row = rows.find((r) => r.key === key);
    return row?.value || "";
  };

  const dirty = (key: string): boolean => {
    if (edits[key] == null) return false;
    const row = rows.find((r) => r.key === key);
    return (row?.value || "") !== edits[key];
  };

  const save = async (key: string) => {
    const value = edits[key];
    if (value == null) return;
    setSaving(key);
    setError(null);
    try {
      const r = await fetch("/api/platform/app-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2500);
      // Drop the local edit so dirty() returns false post-save
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await load();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(null);
    }
  };

  // Surface every known key + any extra keys that exist in the DB
  // but aren't in KNOWN_KEYS yet (so super_admin can still see them).
  const knownKeySet = new Set(KNOWN_KEYS.map((k) => k.key));
  const unknownRows = rows.filter((r) => !knownKeySet.has(r.key));

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80 pt-20 lg:pt-0">
      <PlatformNav />
      <NoIndexMeta />
      <Head>
        <title>Platform settings - CateringMS</title>
      </Head>

      <div className="px-4 py-6 sm:py-8 max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-7 h-7 text-amber-600" />
            Platform Settings
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Tunables for the SaaS itself. Changes apply immediately to every tenant.
          </p>
        </div>

        {error && (
          <Alert className="border-rose-200 bg-rose-50">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <AlertDescription className="text-rose-800">{error}</AlertDescription>
          </Alert>
        )}

        {loading && !rows.length ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading settings...
            </CardContent>
          </Card>
        ) : (
          <>
            {KNOWN_KEYS.map((k) => (
              <Card key={k.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{k.label}</CardTitle>
                  <CardDescription className="text-xs">{k.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1">
                      <Label htmlFor={k.key} className="text-xs uppercase tracking-wide text-slate-500">
                        Current value
                      </Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          id={k.key}
                          type={k.type === "number" ? "number" : "text"}
                          value={valueFor(k.key)}
                          placeholder={k.example}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [k.key]: e.target.value }))
                          }
                          className="font-mono text-sm"
                        />
                        {k.unit && <span className="text-sm text-slate-500">{k.unit}</span>}
                      </div>
                    </div>
                    <Button
                      onClick={() => save(k.key)}
                      disabled={!dirty(k.key) || saving === k.key}
                      className="gap-2"
                    >
                      {saving === k.key ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : savedKey === k.key ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {saving === k.key ? "Saving..." : savedKey === k.key ? "Saved" : "Save"}
                    </Button>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400">
                    app_config.{k.key}
                  </p>
                </CardContent>
              </Card>
            ))}

            {unknownRows.length > 0 && (
              <Card className="border-slate-200 bg-slate-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Other config keys</CardTitle>
                  <CardDescription className="text-xs">
                    Rows in app_config that aren't yet documented in this UI. Edit with care. Some are read at boot.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {unknownRows.map((r) => (
                    <div key={r.key} className="flex items-end gap-3">
                      <div className="flex-1">
                        <Label htmlFor={`u-${r.key}`} className="text-xs font-mono text-slate-600">
                          {r.key}
                        </Label>
                        <Input
                          id={`u-${r.key}`}
                          value={valueFor(r.key)}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [r.key]: e.target.value }))
                          }
                          className="font-mono text-sm mt-1"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => save(r.key)}
                        disabled={!dirty(r.key) || saving === r.key}
                      >
                        Save
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
