import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://oacrbzapchtoeshmmhrf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hY3JiemFwY2h0b2VzaG1taHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMzI3MDEsImV4cCI6MjA2OTYwODcwMX0.0JDDizFguhGhPT5ko3alQTEPtVHrq0AYKmqwzl0C-lg";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.log(SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL);
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});