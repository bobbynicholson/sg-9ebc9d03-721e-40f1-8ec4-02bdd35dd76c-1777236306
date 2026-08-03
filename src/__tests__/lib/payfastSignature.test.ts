import crypto from "crypto";
import { generatePayFastPaymentForm } from "@/lib/payfastService";

describe("PayFast payment-form signature", () => {
  it("uses PHP-style encoding for punctuation in customer and event names", () => {
    const html = generatePayFastPaymentForm({
      // PayFast's alternate sandbox account supports signed requests.
      // The shared 10000100 account intentionally runs unsigned.
      merchantId: "10004002",
      merchantKey: "q1cd2rdny4a53",
      passphrase: "payfast",
      testMode: true,
      amount: 1250,
      itemName: "Cal's birthday (50 guests)",
      returnUrl: "https://example.com/return",
      cancelUrl: "https://example.com/cancel",
      notifyUrl: "https://example.com/notify",
      nameFirst: "Cal",
      nameLast: "O'Neil",
      emailAddress: "cal@example.com",
      customStr1: "order-1",
      customStr2: "deposit",
    });

    const signatureSource = [
      "merchant_id=10004002",
      "merchant_key=q1cd2rdny4a53",
      "return_url=https%3A%2F%2Fexample.com%2Freturn",
      "cancel_url=https%3A%2F%2Fexample.com%2Fcancel",
      "notify_url=https%3A%2F%2Fexample.com%2Fnotify",
      "name_first=Cal",
      "name_last=O%27Neil",
      "email_address=cal%40example.com",
      "amount=1250.00",
      "item_name=Cal%27s+birthday+%2850+guests%29",
      "custom_str1=order-1",
      "custom_str2=deposit",
      "passphrase=payfast",
    ].join("&");
    const expected = crypto.createHash("md5").update(signatureSource).digest("hex");

    expect(html).toContain('action="https://sandbox.payfast.co.za/eng/process"');
    expect(html).toContain(`name="signature" value="${expected}"`);
  });
});
