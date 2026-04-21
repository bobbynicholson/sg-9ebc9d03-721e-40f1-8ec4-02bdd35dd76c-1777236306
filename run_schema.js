const { Client } = require('pg');
const fs = require('fs');

const run = async () => {
    const urls = [
        // Connection Pooler (Port 6543)
        'postgresql://postgres.vsuyzovzqtrngorpqnhy:Bobbyisawesome%2323@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
        // Direct Connection (Port 5432)
        'postgresql://postgres:Bobbyisawesome%2323@db.vsuyzovzqtrngorpqnhy.supabase.co:5432/postgres'
    ];

    let client;
    let connected = false;
    
    for (const url of urls) {
        console.log('Trying connection:', url.replace(/:[^:@]+@/, ':***@'));
        client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
        try {
            await client.connect();
            connected = true;
            console.log('✅ Connected successfully!');
            break;
        } catch (e) {
            console.log('❌ Failed:', e.message);
        }
    }

    if (!connected) {
        console.error('🚨 Could not connect to the database with any configuration.');
        return;
    }

    try {
        console.log('Reading ALL_2025_MIGRATIONS.sql...');
        const sql = fs.readFileSync('ALL_2025_MIGRATIONS.sql', 'utf8');
        
        console.log('Executing complete original 2025 master schema (~7000 lines)...');
        await client.query(sql);
        console.log('✅ Schema execution successful!');
        
        console.log('Verifying table creation...');
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
        
        console.log('\n=============================================');
        console.log('🎉 VERIFICATION COMPLETE');
        console.log(`📊 TOTAL TABLES CREATED: ${res.rows.length}`);
        console.log('=============================================\n');
        
    } catch(e) {
        console.error('\n🚨 Execution error:', e.message);
        // If there's a specific SQL error, print a bit of context
        if (e.position) {
             console.error(`Error at position: ${e.position}`);
        }
    } finally {
        await client.end();
    }
};

run();
