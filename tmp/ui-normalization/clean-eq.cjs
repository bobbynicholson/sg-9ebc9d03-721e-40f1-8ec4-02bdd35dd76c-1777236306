const fs=require('fs');const p='src/pages/team-portal/cleaning/equipment.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const rep=(a,b)=>{if(!s.includes(a))throw new Error('missing '+a.slice(0,60));s=s.replace(a,b);};
rep(`} text-xs\`}>
                        {i.condition}`,`} text-xs capitalize\`}>
                        {i.condition}`);
rep(`                        className="inline-flex items-center text-xs text-brand-primary dark:text-brand-primary hover:underline"
                        title={\`How to clean \${i.category}\`}
                      >
                        <BookOpen className="h-4 w-4" />
                        <span className="sr-only">How to clean {i.category}</span>`,`                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/5 hover:underline dark:text-brand-primary"
                        title={\`How to clean \${i.category}\`}
                      >
                        <BookOpen className="h-4 w-4" />
                        <span className="hidden sm:inline">How to clean</span>
                        <span className="sr-only sm:hidden">How to clean {i.category}</span>`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
