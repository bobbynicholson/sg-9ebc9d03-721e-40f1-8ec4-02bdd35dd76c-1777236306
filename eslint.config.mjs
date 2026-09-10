
import { fileURLToPath } from "url";
import { dirname } from "path";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const baseConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];

// `as any` on the payload of a Supabase write call is a recurring
// foot-gun: the runtime swallows the resulting type error, the cast
// hides any column-name / value-type drift, and (per the
// 2026-05-18 cron + enum sweep) we shipped real production bugs
// where the write was rejected by Postgres because the cast had
// masked a wrong column name or status literal. This rule flags
// every `.insert(... as any)` / `.update(... as any)` /
// `.upsert(... as any)` so the author has to justify the cast
// (eslint-disable-next-line with a reason) before merge.
//
// The two selectors below are the dominant shapes:
//   (1) supabase.from("X").insert(payload as any)
//   (2) supabase.from("X").update(payload as any).eq(...)
// where the .insert / .update is a direct child of a .from(...)
// CallExpression. This filters out unrelated `.insert` /
// `.update` methods on Set / Array / DOM that aren't Supabase.
const supabaseWriteAsAnySelector =
  "CallExpression"
    + "[callee.type='MemberExpression']"
    + "[callee.property.name=/^(insert|update|upsert)$/]"
    + "[callee.object.type='CallExpression']"
    + "[callee.object.callee.type='MemberExpression']"
    + "[callee.object.callee.property.name='from']"
    + " TSAsExpression[typeAnnotation.type='TSAnyKeyword']";

const eslintConfig = [
  ...baseConfig,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "no-restricted-syntax": [
        "warn",
        {
          selector: supabaseWriteAsAnySelector,
          message:
            "Avoid `as any` on Supabase write payloads - it hides column-name / enum-value drift "
            + "that the DB will silently reject at runtime. Either fix the type via the generated "
            + "TablesInsert/TablesUpdate, or add an eslint-disable-next-line with a one-line reason "
            + "(e.g. row-shape predates the migration that regenerates types).",
        },
      ],
    },
  },
];

export default eslintConfig;

