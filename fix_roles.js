const fs = require('fs');
const file = 'supabase/migrations/20250101000000_master.sql';
let sql = fs.readFileSync(file, 'utf8');

// Fix the first definition by making sure it has all the roles
const correctEnum = `CREATE TYPE user_role AS ENUM (
  'super_admin',
  'company_admin',
  'kitchen_staff',
  'driver',
  'shopping_staff',
  'cleaning_staff',
  'client'
);`;

// We'll replace the first creation block (lines ~69-76) with a clean version, but it's safer to just replace it using regex.
sql = sql.replace(/CREATE TYPE user_role AS ENUM \([\s\S]*?\);/, correctEnum);

// Fix the second redundant block around line 5188
const redundantEnumPattern = /CREATE TYPE user_role AS ENUM \([\s\S]*?'company_admin'[\s\S]*?\);/;
sql = sql.replace(redundantEnumPattern, correctEnum);

// Also let's clean up any random 'owner' default values or checks that might have snuck in 
// (we replaced them before, but just in case)
sql = sql.replace(/'owner'/g, "'company_admin'");
sql = sql.replace(/'admin'/g, "'company_admin'");
sql = sql.replace(/'kitchen'/g, "'kitchen_staff'");
sql = sql.replace(/'cleaning'/g, "'cleaning_staff'");
sql = sql.replace(/'shopping'/g, "'shopping_staff'");

fs.writeFileSync(file, sql);
console.log("Migration file patched successfully.");
