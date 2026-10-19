const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console});return exports;}
const settings=load('src/services/shopping/shoppingSettingsService.ts');
const rules=load('src/lib/shopping/completionRules.ts');
(async()=>{
 const results=[];
 let stored;
 const db={from:()=>({upsert:async row=>(stored=row,{error:null})})};
 const saved=await settings.saveShoppingSettings(db,'company','user',{...settings.SHOPPING_SETTINGS_DEFAULTS,varianceAlertPct:0});
 assert.equal(saved.ok,true);assert.equal(stored.variance_alert_pct,0);
 const variance=rules.getShoppingCostVariance(100,110,stored.variance_alert_pct/100);
 assert.equal(variance.shouldFlag,false);
 results.push({case:'Saved zero-percent threshold with ten-percent variance',savedThreshold:stored.variance_alert_pct,flagged:variance.shouldFlag,expectedIfZeroHonored:true});
 const failed={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:{code:'42501',message:'permission denied'}})})};
 const read=await settings.getShoppingSettings(failed,'company');
 assert.equal(read.isDefault,true);assert.equal(read.tableMissing,false);
 results.push({case:'Permission-denied settings read',returnedDefaults:read.isDefault,tableMissing:read.tableMissing,errorExposed:'error' in read});
 const denied=await settings.saveShoppingSettings({from:()=>({upsert:async()=>({error:{code:'42501',message:'permission denied'}})})},'company','user',settings.SHOPPING_SETTINGS_DEFAULTS);
 assert.equal(denied.ok,false);
 results.push({case:'Explicit denied save correctly reports failure',ok:denied.ok});
 results.push({case:'Malformed money accepted',abc:rules.parseMoneyInput('abc'),embeddedLetters:rules.parseMoneyInput('12abc34')});
 fs.writeFileSync('tmp/shop-clean-settings-proof.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})();
