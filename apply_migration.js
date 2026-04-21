const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
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