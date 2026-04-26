const fs = require('fs');

// Fix authService.ts
let authService = fs.readFileSync('src/services/authService.ts', 'utf8');
authService = authService.replace(
  /user_metadata\?: Record<string, unknown>;/g, 
  'user_metadata?: {\n    company_id?: string;\n    company_slug?: string;\n    full_name?: string;\n    avatar_url?: string;\n    [key: string]: unknown;\n  };'
);
authService = authService.replace(
  /metadata\?: Record<string, unknown>/g,
  'metadata?: Record<string, unknown>' // keep as is
);
fs.writeFileSync('src/services/authService.ts', authService);

// Fix AuthContext.tsx
let authContext = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
authContext = authContext.replace(
  /user_metadata\?: Record<string, unknown>;/g,
  'user_metadata?: {\n    company_id?: string;\n    company_slug?: string;\n    full_name?: string;\n    avatar_url?: string;\n    [key: string]: unknown;\n  };'
);
authContext = authContext.replace(
  /app_metadata\?: Record<string, unknown>;/g,
  'app_metadata?: {\n    provider?: string;\n    [key: string]: unknown;\n  };'
);
fs.writeFileSync('src/contexts/AuthContext.tsx', authContext);
console.log('Fixed types in authService.ts and AuthContext.tsx');
