import { render, screen } from "@testing-library/react";
import { Save } from "lucide-react";
import { PortalHeader } from "@/components/portal/ui";
import { PortalHeaderIconAction } from "@/components/portal/PortalHeaderIconAction";

jest.mock("next/router", () => ({ useRouter: () => ({ pathname: "/admin/company-profile" }) }));

test("compact header actions keep their accessible names and do not alter other headers", () => {
  const action = <PortalHeaderIconAction icon={Save} label="Save profile" />;
  const { rerender } = render(<PortalHeader variant="hero" compactActions title="Company profile" subtitle="Company details" actions={action} />);
  const button = screen.getByRole("button", { name: "Save profile" });
  expect(button).toHaveAttribute("title", "Save profile");
  expect(button).toHaveClass("bg-transparent");
  expect(button.querySelector('[data-icon="Save"]')).toBeInTheDocument();
  expect(button.parentElement).toHaveClass("absolute", "right-0", "top-0", "flex", "w-auto");
  expect(screen.getByRole("heading", { name: "Company profile" })).toHaveClass("pr-24");

  rerender(<PortalHeader variant="hero" title="Company profile" actions={action} />);
  expect(screen.getByRole("button", { name: "Save profile" }).parentElement).not.toHaveClass("absolute");
  expect(screen.getByRole("heading", { name: "Company profile" })).not.toHaveClass("pr-24");
});
