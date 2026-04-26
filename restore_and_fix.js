const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Find all files that are significantly smaller now compared to 358cd8a
const diffStat = execSync('git diff 358cd8a HEAD --numstat').toString();
const lines = diffStat.split('\n');
const truncatedFiles = [];
for (const line of lines) {
  const parts = line.trim().split(/\s+/);
  if (parts.length >= 3) {
    const added = parseInt(parts[0]);
    const removed = parseInt(parts[1]);
    const file = parts[2];
    // If we removed more than 100 lines and added very few, it's probably truncated
    if (removed > 100 && added < 50 && file.endsWith('.tsx')) {
      truncatedFiles.push(file);
    }
  }
}

console.log('Truncated files to restore:', truncatedFiles);

// 2. Restore them
if (truncatedFiles.length > 0) {
  execSync(`git checkout 358cd8a -- ${truncatedFiles.join(' ')}`);
}

// 3. Add ADMIN role to ProtectedRoute in all admin pages
function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir('src/pages/admin', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Don't add admin to financial pages
    const isFinancial = filePath.includes('financial-dashboard') || 
                        filePath.includes('subscription') || 
                        filePath.includes('payment-gateways');

    if (!isFinancial) {
      if (content.includes('allowedRoles={[')) {
        if (!content.includes('UserRole.ADMIN')) {
          content = content.replace(/UserRole\.COMPANY_ADMIN/g, 'UserRole.COMPANY_ADMIN, UserRole.ADMIN');
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
});

console.log('Restored and patched files.');
