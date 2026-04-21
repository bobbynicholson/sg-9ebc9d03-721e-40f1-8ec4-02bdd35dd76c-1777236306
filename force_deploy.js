const fs = require('fs');
const { Client } = require('pg');

async function deploySchema() {
  console.log("Connecting to Supabase...");
  // Properly URL-encoded password
  const client = new Client({
    connectionString: 'postgresql://postgres:Bobbyisawesome%2323@db.vsuyzovzqtrngorpqnhy.supabase.co:5432/postgres'
  });
  
  try {
    await client.connect();
    console.log("Connected successfully!");

    // 1. Clean the public schema completely so we have a fresh slate for the 125+ tables
    console.log("Dropping existing public schema to prevent conflicts...");
    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `);
    
    // 2. Read the master migration file
    console.log("Reading migration file...");
    let sql = fs.readFileSync('supabase/migrations/20250101000000_master.sql', 'utf8');
    
    // 3. Fix the ENUM typos that were causing the deployment to fail
    // Convert generic roles to their proper system equivalents as expected by the ENUM
    console.log("Patching ENUM conflicts...");
    sql = sql.replace(/'admin'/g, "'company_admin'");
    sql = sql.replace(/'kitchen'/g, "'kitchen_staff'");
    sql = sql.replace(/'cleaning'/g, "'cleaning_staff'");
    sql = sql.replace(/'shopping'/g, "'shopping_staff'");
    sql = sql.replace(/'owner'/g, "'company_admin'");
    
    // 4. Execute the massive schema
    console.log("Deploying 125+ table schema...");
    await client.query(sql);
    console.log("✅ Master schema deployed successfully!");

    // 5. Verify the table count
    const res = await client.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';");
    console.log(`📊 Verification: ${res.rows[0].count} tables created in the public schema.`);
    
    const views = await client.query("SELECT count(*) FROM information_schema.views WHERE table_schema = 'public';");
    console.log(`📊 Verification: ${views.rows[0].count} views created.`);

  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    if (error.position) {
      console.error("At position:", error.position);
    }
  } finally {
    await client.end();
  }
}

deploySchema();
