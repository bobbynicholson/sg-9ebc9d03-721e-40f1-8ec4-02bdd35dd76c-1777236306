const { Client } = require('pg');
const fs = require('fs');

const run = async () => {
    // Connect to Supabase using port 5432 for direct DDL execution (avoids transaction pooler issues)
    let connectionString = process.env.DATABASE_URL 
        ? process.env.DATABASE_URL.replace(':6543', ':5432') 
        : 'postgresql://postgres.vsuyzovzqtrngorpqnhy:Bobbyisawesome%2323@aws-0-eu-west-2.pooler.supabase.com:5432/postgres';
        
    // Fix any unencoded '#' in the connection string if it came from the env
    if (connectionString.includes('Bobbyisawesome#23')) {
        connectionString = connectionString.replace('Bobbyisawesome#23', 'Bobbyisawesome%2323');
    }
        
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to Supabase via pg driver successfully.');

        // 1. Deploy the core master schema
        if (fs.existsSync('CATERINGMS_MASTER_DATABASE_SCHEMA.sql')) {
            let baseSql = fs.readFileSync('CATERINGMS_MASTER_DATABASE_SCHEMA.sql', 'utf8');
            baseSql = 'SET check_function_bodies = false;\n' + baseSql;
            console.log('Deploying core master schema...');
            try {
                await client.query(baseSql);
                console.log('✅ Core schema deployed.');
            } catch(e) {
                console.log('⚠️ Core schema conflicts (expected if already exists):', e.message.substring(0, 150));
            }
        }

        // 2. Deploy extended DDL safely
        if (fs.existsSync('COMPLETE_DATABASE_DDL.sql')) {
            let extSql = fs.readFileSync('COMPLETE_DATABASE_DDL.sql', 'utf8');
            extSql = 'SET check_function_bodies = false;\n' + 
                     extSql.replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ')
                           .replace(/ADD COLUMN\s+(?!IF NOT EXISTS)/gi, 'ADD COLUMN IF NOT EXISTS ');
            
            console.log('Deploying extended DDL schema...');
            try {
                await client.query(extSql);
                console.log('✅ Extended schema deployed.');
            } catch(e) {
                console.log('⚠️ Extended schema conflicts:', e.message.substring(0, 150));
            }
        }

        // 3. Deploy all 2025 migrations safely
        if (fs.existsSync('ALL_2025_MIGRATIONS.sql')) {
            let allSql = fs.readFileSync('ALL_2025_MIGRATIONS.sql', 'utf8');
            allSql = 'SET check_function_bodies = false;\n' + 
                     allSql.replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ')
                           .replace(/ADD COLUMN\s+(?!IF NOT EXISTS)/gi, 'ADD COLUMN IF NOT EXISTS ');
            
            console.log('Deploying ALL 2025 MIGRATIONS schema...');
            try {
                await client.query(allSql);
                console.log('✅ 2025 Migrations schema deployed.');
            } catch(e) {
                console.log('⚠️ 2025 Migrations conflicts:', e.message.substring(0, 150));
            }
        }

        // 4. Verify final table count
        const res = await client.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('\n📊 Final total tables in public schema:', res.rows[0].count);

    } catch (err) {
        console.error('❌ Error connecting or executing SQL:', err.message);
    } finally {
        await client.end();
    }
};

run();