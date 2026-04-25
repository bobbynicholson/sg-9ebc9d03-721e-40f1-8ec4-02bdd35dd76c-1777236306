import { format } from "date-fns";

interface InvoicePreviewProps {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyVAT?: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientAddress?: string;
  orderNumber: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  guestCount: number;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  depositPaid: number;
  balanceDue: number;
  paymentTerms: string;
  bankDetails?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branchCode: string;
  };
  notes?: string;
}

export function InvoicePreview(props: InvoicePreviewProps) {
  return (
    <div className="bg-white p-8 shadow-lg max-w-4xl mx-auto" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-6 border-b-4 border-blue-600">
        <div>
          <h1 className="text-2xl font-bold text-blue-600 mb-3">{props.companyName}</h1>
          <div className="text-sm text-slate-600 space-y-1">
            <div>{props.companyAddress}</div>
            <div>Tel: {props.companyPhone}</div>
            <div>Email: {props.companyEmail}</div>
            {props.companyVAT && <div>VAT: {props.companyVAT}</div>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-bold text-blue-600">INVOICE</h2>
          <div className="mt-4 space-y-2">
            <div>
              <div className="text-xs text-slate-600">Invoice Number</div>
              <div className="text-lg font-bold text-blue-600">{props.invoiceNumber}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600">Invoice Date</div>
              <div className="text-sm">{format(new Date(props.invoiceDate), "dd MMM yyyy")}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600">Due Date</div>
              <div className="text-sm">{format(new Date(props.dueDate), "dd MMM yyyy")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bill To & Event Details */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <div className="bg-blue-600 text-white px-3 py-2 mb-3 font-bold">BILL TO</div>
          <div className="text-sm font-bold mb-2">{props.clientName}</div>
          {props.clientAddress && <div className="text-sm text-slate-600 mb-1">{props.clientAddress}</div>}
          <div className="text-sm text-slate-600">Email: {props.clientEmail}</div>
          {props.clientPhone && <div className="text-sm text-slate-600">Phone: {props.clientPhone}</div>}
        </div>
        <div>
          <div className="bg-blue-600 text-white px-3 py-2 mb-3 font-bold">EVENT DETAILS</div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-slate-600">Order Number:</span>
              <span className="ml-2 font-medium">{props.orderNumber}</span>
            </div>
            <div>
              <span className="text-slate-600">Event Date:</span>
              <span className="ml-2 font-medium">{props.eventDate ? format(new Date(props.eventDate), "dd MMM yyyy") : "TBD"}</span>
            </div>
            <div>
              <span className="text-slate-600">Event Time:</span>
              <span className="ml-2 font-medium">{props.eventTime || "TBD"}</span>
            </div>
            <div>
              <span className="text-slate-600">Venue:</span>
              <span className="ml-2 font-medium">{props.venue || "TBD"}</span>
            </div>
            <div>
              <span className="text-slate-600">Guest Count:</span>
              <span className="ml-2 font-bold text-blue-600">{props.guestCount} guests</span>
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-8">
        <div className="bg-blue-600 text-white px-3 py-2 mb-3 font-bold">ITEMS</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-3 font-bold border-b-2 border-slate-300">Description</th>
              <th className="text-right p-3 font-bold border-b-2 border-slate-300">Quantity</th>
              <th className="text-right p-3 font-bold border-b-2 border-slate-300">Unit Price</th>
              <th className="text-right p-3 font-bold border-b-2 border-slate-300">Total</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item, index) => (
              <tr key={index} className="border-b border-slate-200">
                <td className="p-3">{item.description}</td>
                <td className="text-right p-3">{item.quantity}</td>
                <td className="text-right p-3">R {item.unitPrice.toFixed(2)}</td>
                <td className="text-right p-3">R {item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-80">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="p-2">Subtotal</td>
                <td className="text-right p-2">R {props.subtotal.toFixed(2)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2">VAT ({props.taxRate}%)</td>
                <td className="text-right p-2">R {props.taxAmount.toFixed(2)}</td>
              </tr>
              <tr className="bg-blue-600 text-white font-bold">
                <td className="p-3">TOTAL</td>
                <td className="text-right p-3">R {props.total.toFixed(2)}</td>
              </tr>
              {props.depositPaid > 0 && (
                <>
                  <tr className="border-b">
                    <td className="p-2">Deposit Paid</td>
                    <td className="text-right p-2">R {props.depositPaid.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-yellow-100 font-bold">
                    <td className="p-3">BALANCE DUE</td>
                    <td className="text-right p-3">R {props.balanceDue.toFixed(2)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Details */}
      {props.bankDetails && (
        <div className="bg-slate-50 p-6 border-l-4 border-blue-600 mb-8">
          <div className="bg-blue-600 text-white px-3 py-2 mb-4 font-bold">PAYMENT DETAILS</div>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div className="text-slate-600">Bank Name</div>
              <div className="font-medium">{props.bankDetails.bankName}</div>
            </div>
            <div>
              <div className="text-slate-600">Account Name</div>
              <div className="font-medium">{props.bankDetails.accountName}</div>
            </div>
            <div>
              <div className="text-slate-600">Account Number</div>
              <div className="font-bold text-blue-600">{props.bankDetails.accountNumber}</div>
            </div>
            <div>
              <div className="text-slate-600">Branch Code</div>
              <div className="font-medium">{props.bankDetails.branchCode}</div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-200">
            <div className="text-slate-600 text-xs mb-1">Payment Terms</div>
            <div className="text-sm">{props.paymentTerms}</div>
          </div>
        </div>
      )}

      {/* Notes */}
      {props.notes && (
        <div className="mb-8">
          <div className="bg-blue-600 text-white px-3 py-2 mb-3 font-bold">NOTES</div>
          <div className="bg-slate-50 p-4 text-sm text-slate-700">{props.notes}</div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 pt-6 border-t">
        Thank you for your business! For any queries, contact us at {props.companyEmail} or {props.companyPhone}
      </div>
    </div>
  );
}