import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data: ws, error: wsErr } = await supabase.from('workspaces').select('*');
  console.log('Workspaces:', ws);
  if (wsErr) console.error(wsErr);

  const { data: cust, error: custErr } = await supabase.from('customers').select('*');
  console.log('Customers:', cust);
  if (custErr) console.error(custErr);
}

check();
