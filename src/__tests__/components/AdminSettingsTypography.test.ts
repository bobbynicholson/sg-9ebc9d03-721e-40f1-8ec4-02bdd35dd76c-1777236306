import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";

test("settings typography preserves readable mobile text and touch controls", () => {
  const stylesheet = postcss.parse(readFileSync(path.join(process.cwd(), "src/styles/adminSettings.module.css"), "utf8"));
  const mobile = stylesheet.nodes.find((node) => node.type === "atrule" && node.name === "media" && node.params === "(max-width: 639px)");
  expect(mobile).toBeDefined();

  const rules: Record<string, Record<string, string>> = {};
  if (mobile?.type === "atrule") {
    mobile.walkRules((rule) => {
      rules[rule.selector] = {};
      rule.walkDecls((declaration) => { rules[rule.selector][declaration.prop] = declaration.value; });
    });
  }
  const bodyRule = Object.entries(rules).find(([selector]) => selector.includes(":global(.text-sm)"));
  const inputRule = Object.entries(rules).find(([selector]) => selector.includes('input:not([type="checkbox"])'));
  const disclosureRule = Object.entries(rules).find(([selector]) => selector.includes("button[aria-expanded]"));
  const compactTextRule = Object.entries(rules).find(([selector]) => selector.includes('text-[10px]'));
  expect(bodyRule?.[1]["font-size"]).toBe("0.9375rem");
  expect(inputRule?.[1]).toMatchObject({ "min-height": "44px", "font-size": "max(1rem, 16px)" });
  expect(disclosureRule?.[1]).toMatchObject({ "min-width": "44px", "min-height": "44px" });
  expect(compactTextRule?.[1]).toMatchObject({ "font-size": "0.875rem", "line-height": "1.25rem" });
});

test("email settings opts into the responsive settings typography and compact header actions", () => {
  const source = readFileSync(path.join(process.cwd(), "src/pages/admin/email-settings.tsx"), "utf8");

  expect(source).toContain("settingsStyles.page");
  expect(source).toContain("compactActions");
  expect(source).toContain("PortalHeaderIconAction");
  expect(source).toContain('className="h-10 w-full max-w-[280px]');
  expect(source).toContain("Bulk campaigns are coming later");
  expect(source).not.toContain("Save Mailchimp link");
  expect(source).not.toMatch(/text-\[(10|11)px\]/);
});
