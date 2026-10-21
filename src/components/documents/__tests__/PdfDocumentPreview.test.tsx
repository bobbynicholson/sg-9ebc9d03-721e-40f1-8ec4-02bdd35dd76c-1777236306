import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PdfDocumentPreview } from "../PdfDocumentPreview";

const response = (type = "application/pdf") => ({
  ok: true,
  headers: new Headers({ "content-type": type }),
  blob: async () => new Blob(["%PDF-fixture"], { type }),
});

describe("PDF page preview", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    URL.createObjectURL = jest.fn(() => "blob:preview");
    URL.revokeObjectURL = jest.fn();
  });

  it("loads the download bytes without a browser cache and releases the URL on close", async () => {
    (fetch as jest.Mock).mockResolvedValue(response());
    const { unmount } = render(<PdfDocumentPreview src="/api/invoice/pdf" label="INV-42" />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing PDF preview");
    const frame = await screen.findByTitle("INV-42 PDF preview");
    expect(frame).toHaveAttribute("src", "blob:preview#view=FitH");
    expect(fetch).toHaveBeenCalledWith("/api/invoice/pdf", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
    expect(screen.getByRole("link", { name: "Open PDF in new tab" })).toHaveAttribute("href", "blob:preview");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("discards an old invoice response after the selected invoice changes", async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    (fetch as jest.Mock)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response());
    const { rerender } = render(<PdfDocumentPreview src="/api/old/pdf" label="Old invoice" />);
    rerender(<PdfDocumentPreview src="/api/new/pdf" label="New invoice" />);
    await screen.findByTitle("New invoice PDF preview");
    await act(async () => { resolveOld(response()); });
    expect(screen.queryByTitle("Old invoice PDF preview")).not.toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect((fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("offers retry for a non-PDF response", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(response("application/json")).mockResolvedValueOnce(response());
    render(<PdfDocumentPreview src="/api/invoice/pdf" label="Invoice" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not load");
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    await screen.findByTitle("Invoice PDF preview");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refreshes after an invoice or payment changes", async () => {
    (fetch as jest.Mock).mockResolvedValue(response());
    const { rerender } = render(<PdfDocumentPreview src="/api/invoice/pdf" label="Invoice" revision="unpaid" />);
    await screen.findByTitle("Invoice PDF preview");
    rerender(<PdfDocumentPreview src="/api/invoice/pdf" label="Invoice" revision="paid" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    await screen.findByTitle("Invoice PDF preview");
  });

  it("does not request a PDF without a download link", () => {
    render(<PdfDocumentPreview label="Invoice" />);
    expect(screen.getByText(/once this invoice has a download link/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
