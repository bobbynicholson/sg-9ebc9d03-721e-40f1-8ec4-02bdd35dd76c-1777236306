const fs = require('fs');

let sql = fs.readFileSync('COMPLETE_DATABASE_DDL.sql', 'utf8');

// Remove triggers on auth.users
sql = sql.replace(/DROP TRIGGER IF EXISTS on_auth_user_created_confirm ON auth\.users;/g, '-- Dropped protected trigger');
sql = sql.replace(/CREATE TRIGGER on_auth_user_created_confirm[\s\S]*?EXECUTE FUNCTION public\.auto_confirm_user\(\);/g, '-- Created protected trigger');

sql = sql.replace(/DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users;/g, '-- Dropped protected trigger');
sql = sql.replace(/CREATE TRIGGER on_auth_user_created[\s\S]*?EXECUTE PROCEDURE public\.handle_new_user\(\);/g, '-- Created protected trigger');

// Remove update on auth.users
sql = sql.replace(/UPDATE auth\.users[\s\S]*?WHERE email_confirmed_at IS NULL;/g, '-- Updated protected table');

fs.writeFileSync('CLEAN_SCHEMA_FINAL.sql', sql);
console.log('Cleaned schema written to CLEAN_SCHEMA_FINAL.sql');
