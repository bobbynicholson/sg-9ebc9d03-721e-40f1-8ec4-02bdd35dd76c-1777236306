const fs=require('fs');const p='src/pages/admin/regions.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a=`              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatTile label="Total regions" value={stats.total} tooltip={"How many regions you have set up for your business."} />
                <StatTile label="Countries" value={stats.countries} tooltip={"How many different countries you operate in across your regions."} />
                <StatTile label="Linked staff" icon={Users} value={stats.totalStaff} tooltip={"Total staff members linked to any region. Client profiles are excluded."} />
              </div>
`;
const b=`
          <div className="mt-12 text-sm">
            <Link href={withSlug("/admin/dashboard")} className="text-slate-600 hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to dashboard
            </Link>
          </div>
`;
if(!s.includes(a)||!s.includes(b)) throw 'x';
s=s.replace(a,'').replace(b,'');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
