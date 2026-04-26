const fs = require('fs');
const filePath = 'src/pages/auth/callback.tsx';
let cb = fs.readFileSync(filePath, 'utf8');
cb = cb.replace(/router\.push\(companySlug[^;]+;/g, 'router.push("/admin/dashboard");');
fs.writeFileSync(filePath, cb);
console.log("Successfully patched callback.tsx to resolve scope errors");