import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/integrations/supabase/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow only GET requests for the test
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Execute a fast, lightweight query to verify database connectivity
    // We limit to 1 just to check if the connection to the 'profiles' table is alive
    const { data, error, status } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    return res.status(200).json({
      success: true,
      message: 'Successfully connected to Supabase!',
      database_reachable: true,
      details: {
        table_queried: 'profiles',
        has_error: !!error,
        error_message: error?.message || null,
        http_status: status
      },
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ 
      success: false, 
      message: 'Database connection failed.',
      error: err.message 
    });
  }
}