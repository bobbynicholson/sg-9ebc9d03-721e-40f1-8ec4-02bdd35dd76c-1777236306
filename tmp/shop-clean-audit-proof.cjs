// Isolated source-level reproduction: no network or real database writes.
const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, { exports, require: () => ({ notificationService: { broadcastNotification: async () => {} } }), console: { warn() {}, error() {} } });
  return exports;
}
const { completeJob } = load('src/services/cleaningJobsService.ts');
async function scenario(label, status, updateWins, inventoryFails) {
  const writes = [];
  const sb = { from(table) {
    let patch;
    const q = {
      select() { return q; }, eq() { return q; },
      update(value) { patch = value; writes.push({ table, patch }); return q; },
      maybeSingle: async () => table === 'cleaning_jobs'
        ? { data: patch ? (updateWins ? { id: 'job' } : null) : { company_id: 'company', equipment_id: 'gear', quantity: 2, status } }
        : { data: { available_quantity: 2, quantity: 10, name: 'gear' } },
      then(resolve) { resolve({ error: inventoryFails ? { message: 'simulated stock write failure' } : null }); }
    }; return q;
  }};
  const result = await completeJob(sb, 'job');
  return { label, result, inventoryWrites: writes.filter(w => w.table === 'equipment') };
}
(async () => {
  const results = await Promise.all([
    scenario('Queued job: completion changes zero rows', 'queued', false, false),
    scenario('Concurrent loser: stale in_progress snapshot, zero rows changed', 'in_progress', false, false),
    scenario('Inventory write fails after completion', 'in_progress', true, true),
    scenario('Already complete: existing retry guard', 'complete', false, false)
  ]);
  fs.writeFileSync('tmp/shop-clean-audit-proof.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
