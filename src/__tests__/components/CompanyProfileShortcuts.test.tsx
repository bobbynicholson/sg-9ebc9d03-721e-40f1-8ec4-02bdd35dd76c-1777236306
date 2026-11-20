import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CompanyProfileShortcuts, COMPANY_PROFILE_SECTIONS } from "@/components/admin/CompanyProfileShortcuts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { revealSection } from "@/lib/ui/revealSection";

describe("company profile shortcuts", () => {
  beforeEach(() => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
  });

  afterEach(() => jest.restoreAllMocks());

  it("opens and focuses every labelled section without closing the others", async () => {
    render(
      <>
        <CompanyProfileShortcuts onSelect={(id) => revealSection(document.getElementById(id), true)} />
        {COMPANY_PROFILE_SECTIONS.map(({ id, label }) => (
          <Card key={id} id={id} tabIndex={-1} collapsible collapseLabel={label}>
            <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
            <CardContent>{label} settings</CardContent>
          </Card>
        ))}
      </>,
    );

    const navigation = screen.getByRole("navigation", { name: "Company profile sections" });
    const trigger = within(navigation).getByRole("button", { name: "Jump to company profile section" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(1);
    expect(trigger.querySelector('[data-icon="List"]')).toBeInTheDocument();
    for (const { id, label } of COMPANY_PROFILE_SECTIONS) {
      fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
      const menu = await screen.findByRole("menu");
      expect(within(menu).getAllByRole("menuitem")).toHaveLength(COMPANY_PROFILE_SECTIONS.length);
      fireEvent.click(within(menu).getByRole("menuitem", { name: label }));
      await waitFor(() => {
        expect(document.getElementById(id)).toHaveAttribute("data-state", "open");
        expect(document.getElementById(id)).toHaveFocus();
      });
      expect(screen.getByText(`${label} settings`)).toBeVisible();
    }
    expect(document.getElementById("section-identity")).toHaveAttribute("data-state", "open");
  });

  it("restores focus to the icon when the menu is dismissed", async () => {
    const onSelect = jest.fn();
    render(<CompanyProfileShortcuts onSelect={onSelect} />);

    const trigger = screen.getByRole("button", { name: "Jump to company profile section" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onSelect).not.toHaveBeenCalled();
  });
});
