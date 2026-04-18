import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados no .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const migrationSQL = `
-- Migration: Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`

async function setupSupabase() {
  try {
    console.log('📦 Executando setup do Supabase...')
    
    // Execute the migration SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    }).catch(() => {
      // Se exec_sql não existir, tentar via SQL direto
      return { data: null, error: { message: 'RPC não disponível, tente pelo SQL Editor do Supabase' } }
    })

    if (error) {
      console.error('⚠️  Não foi possível executar via API.')
      console.error('Copie o SQL abaixo e execute no SQL Editor do Supabase:')
      console.log('\n' + migrationSQL)
      process.exit(0)
    }

    console.log('✅ Tabelas criadas com sucesso!')
    console.log('✅ Row Level Security ativado!')
    console.log('✅ Políticas criadas!')
    console.log('✅ Função trigger criada!')
    
  } catch (err) {
    console.error('❌ Erro:', err.message)
    console.error('\nCopie o SQL abaixo e execute no SQL Editor do Supabase:')
    console.log('\n' + migrationSQL)
    process.exit(1)
  }
}

setupSupabase()
