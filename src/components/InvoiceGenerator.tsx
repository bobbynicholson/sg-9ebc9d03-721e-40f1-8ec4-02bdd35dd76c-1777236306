import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invoiceService, InvoiceData } from "@/services/invoiceService";
import { Download, Mail, Loader2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InvoiceGeneratorProps {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  initialData?: Partial<InvoiceData>;
  onClose?: () => void;
}

export function InvoiceGenerator({
  orderId,
  orderNumber,
  customerEmail,
  initialData,
  onClose
}: InvoiceGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<Partial<InvoiceData>>(initialData || {});
  const { toast } = useToast();

  const handleDownload = async () => {
    try {
      setLoading(true);
      const blob = await invoiceService.generateOrderInvoice(orderId, invoiceData);
      invoiceService.downloadInvoice(blob, `invoice-${orderNumber}.pdf`);
      toast({
        title: "Success",
        description: "Invoice downloaded successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate invoice",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async () => {
    try {
      setLoading(true);
      const blob = await invoiceService.generateOrderInvoice(orderId, invoiceData);
      const success = await invoiceService.emailInvoice(
        customerEmail,
        blob,
        orderNumber,
        `Tax Invoice ${orderNumber} - Your Event`
      );

      if (success) {
        toast({
          title: "Success",
          description: "Invoice sent successfully"
        });
        setIsOpen(false);
        onClose?.();
      } else {
        throw new Error("Email failed");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send invoice",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewAndEdit = () => {
    setIsEditing(true);
    setIsOpen(true);
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Download Invoice
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={handlePreviewAndEdit}
          disabled={loading}
        >
          <Mail className="w-4 h-4 mr-2" />
          Email Invoice
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit & Send Invoice</DialogTitle>
            <DialogDescription>
              Review and edit invoice details before sending to customer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceData.invoiceNumber || `INV-${orderNumber}`}
                  onChange={(e) =>
                    setInvoiceData({ ...invoiceData, invoiceNumber: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date</Label>
                <Input
                  id="invoiceDate"
                  type="date"
                  value={invoiceData.invoiceDate || new Date().toISOString().split("T")[0]}
                  onChange={(e) =>
                    setInvoiceData({ ...invoiceData, invoiceDate: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={invoiceData.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                onChange={(e) =>
                  setInvoiceData({ ...invoiceData, dueDate: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={invoiceData.notes || ""}
                onChange={(e) =>
                  setInvoiceData({ ...invoiceData, notes: e.target.value })
                }
                placeholder="Add any additional notes or instructions"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Textarea
                id="paymentTerms"
                value={invoiceData.paymentTerms || "Payment due on event date"}
                onChange={(e) =>
                  setInvoiceData({ ...invoiceData, paymentTerms: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">
                <strong>Email to:</strong> {customerEmail}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEmail} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
