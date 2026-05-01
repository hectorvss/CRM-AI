import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkAgents() {
  const { count, error } = await supabase.from('agents').select('*', { count: 'exact', head: true });
  if (error) {
    console.error('Error checking agents:', error);
  } else {
    console.log(`Found ${count} agents in Supabase`);
  }
}

checkAgents();