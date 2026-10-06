const fs = require('fs');
function edit(p, fn) {
  let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  s = fn(s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok', p);
}
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); return s.replace(a, b); };

// 1. Damage breakdown: live columns missing from the generated types.
edit('src/services/equipmentTrackingService.ts', (s) => {
  s = rep(s, `    const itemMap = new Map<string, { cost: number; count: number }>();

    damages.forEach((damage) => {`, `    const itemMap = new Map<string, { cost: number; count: number }>();

    // total_cost / damage_stage / quantity_damaged exist on the live
    // equipment_damages table but not in the generated types yet.
    type DamageRow = (typeof damages)[number] & {
      total_cost: number | null;
      damage_stage: HandoverStage;
      quantity_damaged: number | null;
    };
    (damages as DamageRow[]).forEach((row) => {
      const damage = {
        ...row,
        damage_type: row.damage_type as DamageType,
        total_cost: Number(row.total_cost) || 0,
        quantity_damaged: Number(row.quantity_damaged) || 0,
      };`);
  return s;
});

// 2. Ledger summary: staff_payment_ledger's generated Row is stale.
edit('src/services/paymentLedgerService.ts', (s) => rep(s,
  `    const payments = await this.getAllPayments(startDate, now);`,
  `    // total_amount / total_hours / payment_method are live columns on
    // staff_payment_ledger that the generated types don't describe.
    const payments = (await this.getAllPayments(startDate, now)) as unknown as Array<{
      total_amount: number | null;
      total_hours: number | null;
      payment_method: string | null;
    }>;`).replace(
  `      const method = payment.payment_method;`,
  `      const method = payment.payment_method || "unknown";`));

// 3. Primary role lookup used a non-existent camelCase field.
edit('src/services/roleService.ts', (s) => rep(s,
  `const newActiveRole = roles.find((r) => r.isPrimary) || roles[0];`,
  `const newActiveRole = roles.find((r) => r.is_primary) || roles[0];`));

// 4. Shopping: calls to notification helpers that were never written.
edit('src/services/shoppingService.ts', (s) => {
  s = rep(s, `    // NOTIFICATION: Shopping item purchased → Real-time update to admin
    if (data && updates.purchased === true) {
      await this.sendItemPurchasedNotification(data);
    }

`, ``);
  s = rep(s, `    // NOTIFICATION: Shopping receipt uploaded → Notification to admin for approval
    if (data) {
      await this.sendReceiptUploadedNotification(data);
    }

`, ``);
  s = rep(s, `  async checkBudgetExceeded(listId: string, estimatedBudget: number, actualCost: number): Promise<void> {
    if (actualCost > estimatedBudget) {
      // NOTIFICATION: Shopping budget exceeded → Alert to admin
      await this.sendBudgetExceededNotification(listId, estimatedBudget, actualCost);
    }
  },`, `  /**
   * True when the actual spend is over budget. The admin alert this was
   * meant to send was never implemented (the helper didn't exist and the
   * call threw after a successful save), so it now just reports the check.
   */
  async checkBudgetExceeded(_listId: string, estimatedBudget: number, actualCost: number): Promise<boolean> {
    return actualCost > estimatedBudget;
  },`);
  return s;
});
