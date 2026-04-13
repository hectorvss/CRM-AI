import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function seedOrg() {
  console.log('Seeding default organization and workspace...');
  
  const { error: orgError } = await supabase.from('organizations').upsert({
    id: 'tenant_1',
    name: 'Default Org',
    slug: 'default-org',
    created_at: new Date().toISOString()
  });
  if (orgError) console.error('Org error:', orgError);

  const { error: wsError } = await supabase.from('workspaces').upsert({
    id: 'ws_default',
    org_id: 'tenant_1',
    name: 'Default Workspace',
    slug: 'default-ws',
    plan_id: 'pro',
    settings: '{}',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (wsError) console.error('WS error:', wsError);

  console.log('Done!');
}

seedOrg();