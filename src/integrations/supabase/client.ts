// DEPRECATED: Supabase is being replaced by Vyas-Backend. Do not add new calls here.
// See src/lib/apiClient.ts for the new HTTP client.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://oacrbzapchtoeshmmhrf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hY3JiemFwY2h0b2VzaG1taHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMzI3MDEsImV4cCI6MjA2OTYwODcwMX0.0JDDizFguhGhPT5ko3alQTEPtVHrq0AYKmqwzl0C-lg";

// Wrapped so a missing/invalid env var during the transition doesn't crash the whole app.
let client: ReturnType<typeof createClient<Database>>;
try {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
  client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
} catch (err) {
  console.error('Failed to initialize Supabase client:', err);
  client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

export const supabase = client;