import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://erzfvnpzbmwnpchhemjt.supabase.co';
// Fallback to service role key purely for development/demo ease. 
// IN PRODUCTION, USE VITE_SUPABASE_ANON_KEY
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyemZ2bnB6Ym13bnBjaGhlbWp0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc5MDkyNCwiZXhwIjoyMDkxMzY2OTI0fQ.nCl0VtUiCd_1j_hoSV_wqyiDE4PKEKa3G95D154t4kY';

export const supabase = createClient(supabaseUrl, supabaseKey);
