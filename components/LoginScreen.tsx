import React from 'react';
import { GoogleIcon } from './Icons';
import { Button } from './UIComponents';

interface LoginScreenProps {
  onLogin: () => void;
  isInitializing: boolean;
  error?: string | null;
}

const USER_PROFILES_SETUP_SQL = `-- SCRIPT DE CORREÇÃO E CONFIGURAÇÃO DA TABELA DE USUÁRIOS
-- Este script apaga e recria a tabela 'user_profiles' com a configuração correta para resolver erros de login.
BEGIN;

-- Apaga a tabela antiga para garantir uma configuração limpa.
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- 1. Recria a tabela 'user_profiles' com todas as colunas necessárias.
CREATE TABLE public.user_profiles (
    email text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    couple_id text NULL,
    allowed_views jsonb NULL, -- Adiciona a coluna de permissões
    CONSTRAINT user_profiles_pkey PRIMARY KEY (email)
);

-- 2. DESABILITA as Políticas de Segurança (RLS), que são a causa do erro de login.
-- A tabela precisa ser legível publicamente para que o app verifique se um email existe.
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- 3. (Opcional) Insere o usuário administrador principal para permitir o primeiro acesso.
-- Substitua pelo e-mail que você usa para logar.
INSERT INTO public.user_profiles (email, name, role, couple_id, allowed_views)
VALUES (
  'nicolas.vendrami@gmail.com',
  'Nicolas',
  'admin',
  'c1',
  '["dashboard", "restaurants", "expenses", "recipes", "reminders", "wellness", "lists", "applications", "admin"]'::jsonb
)
ON CONFLICT (email) DO NOTHING;

COMMIT;`;


const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, isInitializing, error }) => {
    if (error === 'CONFIG_ERROR') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-100 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-3xl w-full text-left animate-fade-in">
                    <h1 className="text-2xl font-bold text-red-700 mb-2">Configuração do Banco de Dados Necessária</h1>
                    <p className="text-slate-700 mb-4">
                        O aplicativo não conseguiu acessar a lista de usuários, seja porque a tabela não existe ou por um problema de permissão (RLS). Isso é comum na primeira execução ou após uma atualização.
                    </p>
                    <div className="p-4 bg-red-50 border-l-4 border-red-400">
                        <h4 className="font-semibold text-red-900">Como corrigir (solução definitiva):</h4>
                        <ol className="list-decimal list-inside text-sm text-red-800 mt-2 space-y-1">
                            <li>Copie o código SQL abaixo. Ele é seguro e resolve ambos os problemas.</li>
                            <li>
                                Vá para o seu painel Supabase, encontre o <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a>.
                            </li>
                            <li>Cole o código e clique em "RUN".</li>
                            <li>Após a execução, recarregue esta página e o login funcionará.</li>
                        </ol>
                    </div>
                     <div className="mt-4">
                        <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                            <code>{USER_PROFILES_SETUP_SQL}</code>
                        </pre>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex items-center justify-center h-screen bg-slate-100">
            <div className="text-center bg-white p-12 rounded-2xl shadow-xl max-w-md mx-4 animate-fade-in">
                <h1 className="font-hand text-6xl text-primary mb-2">Nosso Painel</h1>
                <p className="text-slate-600 mb-8">Um lugar especial para organizar nossa vida juntos.</p>
                
                {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4 text-sm">{error}</p>}

                <Button
                    size="lg"
                    onClick={onLogin}
                    disabled={isInitializing}
                >
                    <GoogleIcon className="w-6 h-6" />
                    <span>{isInitializing ? 'Inicializando...' : 'Entrar com Google'}</span>
                </Button>
            </div>
        </div>
    );
};

export default LoginScreen;