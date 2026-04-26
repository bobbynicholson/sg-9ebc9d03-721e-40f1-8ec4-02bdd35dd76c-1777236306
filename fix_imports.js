const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const fixFile = (filePath) => {
  if (filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // 1. Fix UserRole import
    if (content.includes('UserRole')) {
      const wrongImports = [
        /@\/types\/UserRole/,
        /@\/types\/userRole/,
        /@\/types\/users/,
        /@\/models\/UserRole/,
        /@\/constants\/UserRole/,
        /@\/constants\/roles/
      ];
      
      for (const regex of wrongImports) {
        if (content.match(regex)) {
          content = content.replace(new RegExp(`import\\s+{([^}]*UserRole[^}]*)}\\s+from\\s+["']${regex.source}["']`), 'import { $1 } from "@/types/app"');
          changed = true;
        }
      }
      
      // Fix `import { UserRole } from "@/types";`
      if (content.match(/import\s+{([^}]*UserRole[^}]*)}\s+from\s+["']@\/types["']/)) {
        content = content.replace(/import\s+{([^}]*UserRole[^}]*)}\s+from\s+["']@\/types["']/, 'import { $1 } from "@/types/app"');
        changed = true;
      }
      
      if (!content.match(/import\s+.*UserRole.*\s+from\s+["']@\/types\/app["']/)) {
         content = 'import { UserRole } from "@/types/app";\n' + content;
         changed = true;
      }
    }

    // 2. Fix ProtectedRoute import
    if (content.includes('<ProtectedRoute')) {
      if (content.match(/import\s+ProtectedRoute\s+from\s+["']@\/components\/ProtectedRoute["']/)) {
        content = content.replace(/import\s+ProtectedRoute\s+from\s+["']@\/components\/ProtectedRoute["']/, 'import { ProtectedRoute } from "@/components/ProtectedRoute"');
        changed = true;
      }
      if (!content.includes('import { ProtectedRoute } from "@/components/ProtectedRoute"')) {
         content = 'import { ProtectedRoute } from "@/components/ProtectedRoute";\n' + content;
         changed = true;
      }
    }

    // 3. Fix duplicate default exports and undefined inner components
    const protectedMatch = content.match(/export default function Protected([A-Za-z0-9_]+)\s*\(\)\s*{\s*return\s*\(\s*<ProtectedRoute[^>]*>\s*<([A-Za-z0-9_]+)\s*\/>/);
    if (protectedMatch) {
      const innerComponent = protectedMatch[2];
      
      const defaultExportRegex = /export default function ([A-Za-z0-9_]+)/g;
      let match;
      while ((match = defaultExportRegex.exec(content)) !== null) {
        const funcName = match[1];
        if (!funcName.startsWith('Protected')) {
          content = content.replace(new RegExp(`export default function ${funcName}`), `function ${funcName}`);
          changed = true;
          
          if (innerComponent !== funcName) {
            content = content.replace(new RegExp(`<${innerComponent}\\s*\\/>`), `<${funcName} />`);
          }
        }
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
};

walkDir('src/pages/admin', fixFile);
// Also apply fixes to the root of pages just in case
fs.readdirSync('src/pages').forEach(f => {
  if (f.endsWith('.tsx')) {
    fixFile(path.join('src/pages', f));
  }
});

// Fix callback.tsx specifically for companySlug
const callbackPath = 'src/pages/auth/callback.tsx';
if (fs.existsSync(callbackPath)) {
  let cb = fs.readFileSync(callbackPath, 'utf8');
  if (cb.includes('companySlug')) {
    // If companySlug isn't defined, replace it with a fallback logic
    // Usually companySlug comes from user_metadata.company_slug
    if (!cb.includes('const companySlug')) {
      cb = cb.replace(/case "admin":\n\s+router\.push\(companySlug \? `\/\$\{companySlug\}\/admin\/dashboard` : "\/admin\/dashboard"\);/g, 
        `case "admin":\n          const userCompanySlug = user?.user_metadata?.company_slug;\n          router.push(userCompanySlug ? \`/\${userCompanySlug}/admin/dashboard\` : "/admin/dashboard");`);
      cb = cb.replace(/case "company_admin":\n\s+router\.push\(companySlug \? `\/\$\{companySlug\}\/admin\/dashboard` : "\/admin\/dashboard"\);/g, 
        `case "company_admin":\n          const adminCompanySlug = user?.user_metadata?.company_slug;\n          router.push(adminCompanySlug ? \`/\${adminCompanySlug}/admin/dashboard\` : "/admin/dashboard");`);
      cb = cb.replace(/case "owner":\n\s+router\.push\(companySlug \? `\/\$\{companySlug\}\/admin\/dashboard` : "\/admin\/dashboard"\);/g, 
        `case "owner":\n          const ownerCompanySlug = user?.user_metadata?.company_slug;\n          router.push(ownerCompanySlug ? \`/\${ownerCompanySlug}/admin/dashboard\` : "/admin/dashboard");`);
      fs.writeFileSync(callbackPath, cb, 'utf8');
    }
  }
}