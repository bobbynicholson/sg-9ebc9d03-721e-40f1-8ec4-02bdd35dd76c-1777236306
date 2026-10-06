const {spawnSync}=require('node:child_process');
(async()=>{
 const raw=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true});
 if(raw.status!==0)throw new Error('Git credentials unavailable');
 const creds=Object.fromEntries(raw.stdout.trim().split(/\r?\n/).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}));
 const sha=process.argv[2]||'9d2b515a';
 const base='https://api.github.com/repos/bobbynicholson/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306';
 for(const path of ['/commits/'+sha+'/status','/commits/'+sha+'/check-runs']){
  const r=await fetch(base+path,{headers:{Authorization:'Bearer '+creds.password,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});
  const d=await r.json();
  console.log(JSON.stringify({http:r.status,state:d.state,statuses:d.statuses?.map(s=>({state:s.state,description:s.description,context:s.context,url:s.target_url})),checks:d.check_runs?.map(s=>({name:s.name,status:s.status,conclusion:s.conclusion,detail:s.details_url,summary:s.output?.summary})),message:d.message}));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
