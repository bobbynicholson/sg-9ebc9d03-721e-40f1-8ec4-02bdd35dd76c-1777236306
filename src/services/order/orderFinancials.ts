import { supabase } from "@/integrations/supabase/client";

/**
 * Order Financial Operations
 * Handles payments, invoices, and financial calculations
 */

export async function calculateOrderTotal(orderItems: any[]) {
  const subtotal = orderItems.reduce((sum, item) => {
    return sum + (item.unit_price * item.quantity);
  }, 0);

  const tax = subtotal * 0.15; // 15% VAT
  const total = subtotal + tax;

  return {
    subtotal,
    tax,
    total,
  };
}

export async function recordPayment(
  orderId: string,
  amount: number,
  paymentMethod: string,
  transactionId?: string
) {
  try {
    const { data, error } = await supabase
      .from("payments")
      .insert({
        order_id: orderId,
        amount,
        payment_method: paymentMethod,
        transaction_id: transactionId,
        status: "completed",
        payment_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update order payment status
    await updateOrderPaymentStatus(orderId);

    return { success: true, data };
  } catch (error: any) {
    console.error("Error recording payment:", error);
    return { success: false, error: error.message };
  }
}

export async function updateOrderPaymentStatus(orderId: string) {
  try {
    // Get order total and payments
    const { data: order } = await supabase
      .from("orders")
      .select("total_amount, deposit_amount")
      .eq("id", orderId)
      .single();

    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("order_id", orderId)
      .eq("status", "completed");

    const totalPaid = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;
    const totalAmount = order?.total_amount || 0;

    let paymentStatus = "unpaid";
    if (totalPaid >= totalAmount) {
      paymentStatus = "paid";
    } else if (totalPaid > 0) {
      paymentStatus = "partial";
    }

    await supabase
      .from("orders")
      .update({ payment_status: paymentStatus })
      .eq("id", orderId);

    return { success: true, paymentStatus };
  } catch (error: any) {
    console.error("Error updating payment status:", error);
    return { success: false, error: error.message };
  }
}

export async function getOrderPayments(orderId: string) {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .order("payment_date", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error("Error fetching order payments:", error);
    return [];
  }
}

export async function generateInvoice(orderId: string) {
  try {
    // Get order with all details
    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        *,
        client:clients(*),
        order_items(*),
        company:companies(*)
      `)
      .eq("id", orderId)
      .single();

    if (error) throw error;

    // Generate invoice number
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Create invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        company_id: order.company_id,
        order_id: orderId,
        client_id: order.client_id,
        invoice_number: invoiceNumber,
        issue_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        subtotal: order.subtotal,
        tax_amount: order.tax_amount || 0,
        total_amount: order.total_amount,
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    return { success: true, invoice };
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return { success: false, error: error.message };
  }
}