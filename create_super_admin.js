const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await client.connect();
  try {
    console.log("Enabling pgcrypto...");
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    console.log("Inserting/Updating user in auth.users...");
    const res = await client.query(`
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
        'bobby@skylight-digital.co.za', crypt('11223344', gen_salt('bf')), now(), 
        '{"provider":"email","providers":["email"]}', '{"role":"super_admin","full_name":"Bobby (Super Admin)"}', now(), now()
      )
      ON CONFLICT (email) DO UPDATE 
      SET encrypted_password = crypt('11223344', gen_salt('bf')),
          raw_user_meta_data = '{"role":"super_admin","full_name":"Bobby (Super Admin)"}'
      RETURNING id;
    `);
    
    const userId = res.rows[0].id;
    console.log("Auth user created/updated with ID:", userId);
    
    // Wait for Supabase trigger to create the profile row
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log("Updating role in public.profiles...");
    const profileRes = await client.query(`
      UPDATE public.profiles 
      SET role = 'super_admin', full_name = 'Bobby (Super Admin)', is_active = true 
      WHERE email = 'bobby@skylight-digital.co.za'
      RETURNING id;
    `);

    if (profileRes.rowCount === 0) {
      console.log("Profile didn't exist, inserting manually...");
      await client.query(`
        INSERT INTO public.profiles (id, email, full_name, role, is_active)
        VALUES ($1, 'bobby@skylight-digital.co.za', 'Bobby (Super Admin)', 'super_admin', true)
      `, [userId]);
    }
    
    console.log("✅ Super Admin Account successfully created!");
  } catch (e) {
    console.error("❌ Error:", e);
  } finally {
    await client.end();
  }
}

run();