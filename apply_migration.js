const fs = require('fs');
const { Client } = require('pg');
const dns = require('dns');

// Force IPv4 resolution
dns.setDefaultResultOrder('ipv4first');

// Read DATABASE_URL from .env.local
function getDatabaseUrl() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/DATABASE_URL=(.+)/);
  return match ? match[1].trim() : null;
}

async function applyMigration() {
  const connectionString = getDatabaseUrl();
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in .env.local');
    process.exit(1);
  }

  // Force IPv4 and use connection pooler
  const poolerString = connectionString.replace(':5432/', ':6543/');
  
  const client = new Client({
    connectionString: poolerString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    host: 'db.vsuyzovzqtrngorpqnhy.supabase.co',
    port: 6543,
    database: 'postgres',
    user: 'postgres',
    password: 'Bobbyisawesome#23'
  });

  try {
    console.log('🔌 Connecting to database (IPv4, pooler)...');
    await client.connect();
    console.log('✅ Connected successfully!');

    // Read the migration file
    const migrationSQL = fs.readFileSync('supabase/migrations/20250101000000_master.sql', 'utf8');
    
    console.log('📋 Applying migration (53KB)...');
    console.log('⏳ This may take 30-60 seconds...');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration applied successfully!');
    console.log('🎉 Database schema is now up to date!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.position) {
      console.error('Error at position:', error.position);
    }
    throw error;
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

applyMigration().catch(console.error);