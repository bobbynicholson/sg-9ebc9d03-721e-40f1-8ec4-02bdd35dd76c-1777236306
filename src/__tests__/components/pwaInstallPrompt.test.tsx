import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PWAInstallPrompt } from "@/components/driver/PWAInstallPrompt";
import { IosInstallGuide } from "@/components/pwa/IosInstallGuide";

jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
const ua = (value: string) => Object.defineProperty(navigator, "userAgent", { configurable: true, value });
beforeEach(() => {
  localStorage.clear();
  ua("Mozilla/5.0 iPhone Version/18.0 Mobile Safari/604.1");
  Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn().mockResolvedValue(undefined) } });
});

test("iOS shows actionable guidance without calling the generic Web Share API or faking installation", () => {
  const share = jest.fn(); Object.defineProperty(navigator, "share", { configurable: true, value: share });
  render(<PWAInstallPrompt appName="Company A" companySlug="company-a" inline />);
  fireEvent.click(screen.getByRole("button", { name: "Show Safari toolbar example" }));
  expect(screen.getByRole("img", { name: /Safari toolbar example/ })).toBeVisible();
  expect(share).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /added.*Home Screen/i })).not.toBeInTheDocument();
});
test("copying uses the stable public install link and confirms only successful copy", async () => {
  render(<IosInstallGuide appName="Company A" installPath="/auth/install?company=company-a" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy installation link for Safari" }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("http://localhost/auth/install?company=company-a"));
  expect(await screen.findByRole("button", { name: "Installation link copied" })).toBeVisible();
});
test("blocked clipboard offers a selectable link instead of silently doing nothing", async () => {
  (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error("denied"));
  render(<IosInstallGuide appName="Company A" installPath="/auth/install?company=company-a" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy installation link for Safari" }));
  expect(await screen.findByRole("textbox", { name: "Copy this link manually" })).toHaveValue("http://localhost/auth/install?company=company-a");
  expect(screen.queryByRole("button", { name: "Installation link copied" })).not.toBeInTheDocument();
});
test("users can correct browser detection and get an explicit Safari handoff", () => {
  render(<IosInstallGuide appName="Company A" installPath="/auth/install?company=company-a" />);
  fireEvent.change(screen.getByRole("combobox", { name: "Where is this page open?" }), { target: { value: "other" } });
  expect(screen.getByText(/Opening another tab here may keep you inside the same app/)).toBeVisible();
});
test("an iPad desktop user agent gets the iOS guide", () => {
  ua("Mozilla/5.0 Macintosh Version/18.0 Safari/605.1");
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
  render(<PWAInstallPrompt inline />);
  expect(screen.getByRole("combobox", { name: "Where is this page open?" })).toBeVisible();
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 0 });
});
test("a dismissed desktop banner still captures the native prompt for a sidebar request", async () => {
  ua("Mozilla/5.0 Windows Chrome/130");
  localStorage.setItem("cateringmsPwaInstallDismissedAt:v2", String(Date.now()));
  const prompt = jest.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  render(<PWAInstallPrompt appName="Company A" />);
  fireEvent(window, event);
  expect(screen.queryByText("Install Company A")).not.toBeInTheDocument();
  fireEvent(window, new Event("cms:pwa-install-request"));
  fireEvent.click(screen.getByRole("button", { name: /Install Company A; slide right or tap/ }));
  await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
});
test("only actual standalone mode confirms iOS installation", () => {
  Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  render(<PWAInstallPrompt appName="Company A" inline />);
  expect(screen.getByRole("status")).toHaveTextContent("Company A is installed or running as an app");
});
