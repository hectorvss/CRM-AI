import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function listAgents() {
  const { data, error } = await supabase.from('agents').select('id, name, tenant_id');
  if (error) {
    console.error('Error listing agents:', error);
  } else {
    console.log(data);
  }
}

listAgents();