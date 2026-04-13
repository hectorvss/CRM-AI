import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data: cases, error } = await supabase.from('cases').select('*');
  console.log('Cases:', cases);
  if (error) console.error(error);
}

check();