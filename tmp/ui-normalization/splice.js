const fs=require('fs');
let tail=fs.readFileSync('tmp/ui-normalization/timeline-tail.tsx','utf8');
const oldLine=tail.slice(tail.indexOf('              <span\n                aria-hidden="true"\n                className={`absolute right-1/2'), tail.indexOf('              />\n            )}\n            <span\n              className={`relative z-10')+'              />\n'.length);
if(!oldLine.includes('absolute right-1/2')) throw 'conn';
const r='(small ? 14 : 18)';
tail=tail.replace(oldLine,`              <span
                aria-hidden="true"
                className={\`absolute h-[3px] rounded-full \${lineTone}\`}
                style={{
                  top: small ? 13 : 17,
                  left: \`calc(-50% + \${small ? 16 : 20}px)\`,
                  right: \`calc(50% + \${small ? 16 : 20}px)\`,
                }}
              />
`);
const p='src/components/admin/orders/TimelineTrack.tsx';let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const legendStart=s.indexOf('function TimelineColourLegend(');
const cut=s.indexOf('// --- Cluster band');
s=s.slice(0,legendStart)+tail;
fs.writeFileSync(p,s);console.log('ok');
