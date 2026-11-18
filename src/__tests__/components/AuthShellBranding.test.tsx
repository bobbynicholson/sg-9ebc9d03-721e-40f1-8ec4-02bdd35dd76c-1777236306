import { render } from "@testing-library/react";
import { AuthShell } from "@/components/auth/AuthShell";

test("tenant sign-in keeps the tenant's own logo", () => {
  const { container } = render(
    <AuthShell brandName="Acme Catering" brandLogoUrl="https://example.com/acme.png">
      Sign in
    </AuthShell>,
  );
  const logos = Array.from(container.querySelectorAll('img[alt="Acme Catering"]'));
  expect(logos).toHaveLength(2);
  expect(logos.every(logo => logo.getAttribute("src") === "https://example.com/acme.png")).toBe(true);
  expect(container.querySelector('img[src*="cateringms-mark"]')).toBeNull();
});

test("a tenant without a logo does not show the platform mark", () => {
  const { container } = render(<AuthShell brandName="Acme Catering">Sign in</AuthShell>);
  expect(container.querySelector('img[src*="cateringms-mark"]')).toBeNull();
});
