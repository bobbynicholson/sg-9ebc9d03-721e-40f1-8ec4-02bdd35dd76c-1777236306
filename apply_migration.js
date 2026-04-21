const fs = require('fs');
const { Client } = require('pg');
const dns = require('dns').promises;

// Force IPv4 resolution
require('dns').setDefaultResultOrder('ipv4first');

// Read DATABASE_URL from .env.local
function getDatabaseUrl() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const match = envContent.match(/DATABASE_URL=(.+)/);
  return match ? match[1].trim() : null;
}

async function applyMigration() {
  try {
    // Manually resolve IPv4 address only
    console.log('🔍 Resolving IPv4 address for db.vsuyzovzqtrngorpqnhy.supabase.co...');
    const addresses = await dns.resolve4('db.vsuyzovzqtrngorpqnhy.supabase.co');
    const ipv4Address = addresses[0];
    console.log('✅ Resolved to IPv4:', ipv4Address);

    const client = new Client({
      host: ipv4Address,  // Use IPv4 address directly
      port: 6543,  // Pooler port
      database: 'postgres',
      user: 'postgres',
      password: 'Bobbyisawesome#23',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });

    console.log('🔌 Connecting to database...');
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

    await client.end();
    console.log('🔌 Database connection closed');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.position) {
      console.error('Error at position:', error.position);
    }
    throw error;
  }
}

applyMigration().catch(console.error);