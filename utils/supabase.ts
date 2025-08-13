import { createClient } from '@supabase/supabase-js';
import { Database } from '../database.types';

const supabaseUrl = 'https://akndnpejlsejablmpykk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrbmRucGVqbHNlamFibG1weWtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4ODI1NTQsImV4cCI6MjA2OTQ1ODU1NH0.EHFbWJoXytRfudQCr-IQkil0q1uCYYUHmpV60DI3YwA';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
