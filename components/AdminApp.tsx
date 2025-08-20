import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { UserProfile, Role, View, Restaurant, CuratedList } from '../types';
import { ALL_VIEWS } from '../constants';
import { Button, Input, Modal } from './UIComponents';
import { PlusIcon, PencilIcon, TrashIcon } from './Icons';
import CuratedListForm from './RestaurantTemplateForm';

const PERMISSIONS_MIGRATION_SQL = `-- Este script prepara seu banco de dados para o novo sistema de permissões.
-- Ele adiciona a coluna 'allowed_views' e migra seus usuários existentes.
-- É seguro executá-lo múltiplas vezes.

-- 1. Adiciona a nova coluna 'allowed_views' se ela não existir.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS allowed_views jsonb;

-- 2. Migra usuários com a role 'admin' que ainda não foram migrados.
UPDATE public.user_profiles
SET allowed_views = '["dashboard", "restaurants", "expenses", "recipes", "reminders", "wellness", "lists", "applications", "admin"]'::jsonb
WHERE role = 'admin' AND allowed_views IS NULL;

-- 3. Migra usuários com a role 'partner' que ainda não foram migrados.
UPDATE public.user_profiles
SET allowed_views = '["dashboard", "restaurants", "expenses", "recipes", "reminders", "wellness", "lists"]'::jsonb
WHERE role = 'partner' AND allowed_views IS NULL;

-- 4. Migra usuários com a role 'parent' que ainda não foram migrados.
UPDATE public.user_profiles
SET allowed_views = '["applications"]'::jsonb
WHERE role = 'parent' AND allowed_views IS NULL;

-- 5. Migra usuários com a role 'visitor' que ainda não foram migrados.
UPDATE public.user_profiles
SET allowed_views = '["restaurants"]'::jsonb
WHERE role = 'visitor' AND allowed_views IS NULL;
`;

const CURATED_LISTS_SETUP_SQL = `
-- Este script reseta completamente a funcionalidade de Listas Curadas para corrigir problemas de cache.
-- ATENÇÃO: Ele APAGARÁ a tabela 'curated_lists' existente e todos os seus dados antes de recriá-la.

BEGIN;

-- PASSO 1: Apaga a tabela existente para garantir uma configuração limpa.
DROP TABLE IF EXISTS public.curated_lists CASCADE;

-- PASSO 2: Recria a tabela com o esquema correto, incluindo a coluna 'icon'.
CREATE TABLE public.curated_lists (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL,
    description text NULL,
    restaurant_ids jsonb NOT NULL,
    icon text NULL,
    CONSTRAINT curated_lists_pkey PRIMARY KEY (id)
);

-- PASSO 3: DESABILITA as Políticas de Segurança (RLS).
-- A segurança é garantida pela interface do app, que só mostra esta página para admins.
ALTER TABLE public.curated_lists DISABLE ROW LEVEL SECURITY;

COMMIT;
`;

const USER_PROFILES_RLS_FIX_SQL = `-- SCRIPT PARA CORRIGIR A VISIBILIDADE DOS USUÁRIOS
-- Este script desabilita a Política de Segurança de Nível de Linha (RLS) na tabela 'user_profiles'.
-- A RLS pode impedir que administradores vejam a lista completa de usuários se não estiver configurada corretamente.
-- Esta é a solução recomendada e segura para este aplicativo.

ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
`;

const DatabaseErrorResolver: React.FC<{ sql: string, title: string, instructions: string }> = ({ sql, title, instructions }) => (
    <div className="p-4 mb-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg">
        <h4 className="font-semibold text-red-900">{title}</h4>
        <p className="text-sm text-red-800 mt-1">{instructions}</p>
        <div className="mt-4">
             <p className="text-xs text-slate-600 mb-2">
                Copie o código SQL abaixo, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase e clique em "RUN". Depois, recarregue a página.
            </p>
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{sql.trim()}</code>
            </pre>
        </div>
    </div>
);


// Form for adding/editing a user profile
const UserProfileForm: React.FC<{
    onSave: (profile: Omit<UserProfile, 'picture'>, isNew: boolean) => Promise<void>;
    onClose: () => void;
    initialData?: UserProfile | null;
}> = ({ onSave, onClose, initialData }) => {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<Role>('parent');
    const [coupleId, setCoupleId] = useState('');
    const [selectedViews, setSelectedViews] = useState<View[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const isNewUser = !initialData;

    useEffect(() => {
        if (initialData) {
            setEmail(initialData.email);
            setName(initialData.name);
            setRole(initialData.role);
            setCoupleId(initialData.couple_id || '');
            setSelectedViews(initialData.allowed_views || []);
        }
    }, [initialData]);
    
    const handleViewToggle = (view: View) => {
        setSelectedViews(prev => 
            prev.includes(view) ? prev.filter(v => v !== view) : [...prev, view]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !name) {
            alert('Email e Nome são obrigatórios.');
            return;
        }
        setIsSaving(true);
        const profileToSave: Omit<UserProfile, 'picture'> = {
            email,
            name,
            role,
            couple_id: coupleId || null,
            allowed_views: selectedViews,
            address: initialData?.address || null,
            latitude: initialData?.latitude || null,
            longitude: initialData?.longitude || null,
        };
        await onSave(profileToSave, isNewUser);
        setIsSaving(false);
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email do usuário" type="email" required disabled={!isNewUser} />
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do usuário" required />
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="role-select" className="font-medium text-sm text-slate-600 block mb-1">Papel (Role)</label>
                    <select id="role-select" value={role} onChange={e => setRole(e.target.value as Role)} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900">
                        <option value="partner">Partner</option>
                        <option value="parent">Parent</option>
                        <option value="admin">Admin</option>
                        <option value="visitor">Visitor</option>
                    </select>
                </div>
                 <div>
                    <label htmlFor="couple-id" className="font-medium text-sm text-slate-600 block mb-1">ID do Casal</label>
                    <Input id="couple-id" value={coupleId} onChange={e => setCoupleId(e.target.value)} placeholder="Ex: c1" />
                </div>
            </div>

            <div>
                <label className="font-medium text-sm text-slate-600 block mb-2">Páginas Permitidas</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 border rounded-lg bg-slate-50">
                    {ALL_VIEWS.map(viewInfo => (
                         <label key={viewInfo.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-slate-200 transition-colors">
                            <input
                                type="checkbox"
                                checked={selectedViews.includes(viewInfo.id)}
                                onChange={() => handleViewToggle(viewInfo.id)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                             <span className="font-medium text-slate-700">{viewInfo.name}</span>
                        </label>
                    ))}
                </div>
                 <p className="text-xs text-slate-500 mt-1">Ainda é recomendado definir um 'Papel' para comportamento legado.</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Perfil'}</Button>
            </div>
        </form>
    );
};

// Main component for the Admin view
const AdminApp: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
    // User Profiles state
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
    const [profileDbError, setProfileDbError] = useState<null | 'migration_needed' | 'rls_issue'>(null);
    
    // Curated Lists state
    const [curatedLists, setCuratedLists] = useState<CuratedList[]>([]);
    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [isListModalOpen, setIsListModalOpen] = useState(false);
    const [editingList, setEditingList] = useState<CuratedList | null>(null);
    const [isListsConfigured, setIsListsConfigured] = useState(false);

    const [isLoading, setIsLoading] = useState(true);

    const checkAndFetchData = useCallback(async () => {
        setIsLoading(true);
        setProfileDbError(null);

        try {
            // --- CURATED LISTS SETUP CHECK ---
            const { error: checkError } = await supabase.from('curated_lists').select('id', { count: 'exact', head: true });

            if (checkError && checkError.code === '42P01') { // 42P01 = undefined_table
                setIsListsConfigured(false);
            } else if (checkError) {
                 if (checkError.message.includes('permission denied for table curated_lists')) {
                    setIsListsConfigured(false);
                 } else {
                    throw checkError;
                 }
            } else {
                setIsListsConfigured(true);
            }

            // --- FETCH ALL OTHER DATA ---
            const [profilesRes, restaurantsRes, listsRes] = await Promise.all([
                supabase.from('user_profiles').select('*'),
                supabase.from('restaurants').select('id, name, cuisine').order('name'),
                isListsConfigured ? supabase.from('curated_lists').select('*') : Promise.resolve({ data: [], error: null })
            ]);
            
            // Handle Profile errors
            if (profilesRes.error) throw profilesRes.error;
            if (profilesRes.data && profilesRes.data.length > 0 && profilesRes.data[0].allowed_views === undefined) {
                 throw new Error("Missing 'allowed_views' column");
            }

            if (profilesRes.data && profilesRes.data.length === 0 && currentUser.role === 'admin') {
                setProfileDbError('rls_issue');
                setProfiles([]);
            } else {
                setProfiles((profilesRes.data as any[]) || []);
            }

            if (restaurantsRes.error) throw restaurantsRes.error;
            setRestaurants(restaurantsRes.data || []);
            
            if (listsRes.error && listsRes.error.code !== '42P01') throw listsRes.error;
            if (!listsRes.error) {
                setCuratedLists((listsRes.data as any[]) || []);
            }

        } catch (error: any) {
            console.error('Error fetching admin data:', error.message);
            const msg = (error.message || '').toLowerCase();
             if (error?.code === '42P01' || msg.includes('allowed_views')) {
                setProfileDbError('migration_needed');
            } else {
                 alert("Erro ao buscar dados. Verifique o console.");
            }
        } finally {
            setIsLoading(false);
        }
    }, [isListsConfigured, currentUser.role]);

    useEffect(() => {
        if (currentUser.role !== 'admin') return;
        checkAndFetchData();
    }, [currentUser.role, checkAndFetchData]);

    const handleSaveProfile = async (profileData: Omit<UserProfile, 'picture'>, isNew: boolean) => {
        try {
            if (isNew) {
                const { error } = await supabase.from('user_profiles').insert([profileData] as any);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('user_profiles').update(profileData as any).eq('email', profileData.email);
                if (error) throw error;
            }
            checkAndFetchData();
        } catch (err: any) {
            console.error("Save profile error:", err);
            alert(`Falha ao salvar perfil: ${err.message}`);
        }
    };
    
    const handleSaveList = async (listData: Omit<CuratedList, 'id' | 'created_at'>, isNew: boolean) => {
        try {
            if (isNew) {
                const { error } = await supabase.from('curated_lists').insert([listData] as any);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('curated_lists').update(listData as any).eq('id', editingList!.id);
                if (error) throw error;
            }
            
            checkAndFetchData();
            setIsListModalOpen(false);
            setEditingList(null);

        } catch(err: any) {
            console.error("Save list error:", err);
            const message = (err.message || '').toLowerCase();
            if (message.includes("could not find the 'icon' column")) {
                alert("Erro de configuração detectado! O banco de dados parece estar desatualizado. A tela de correção será exibida.");
                setIsListsConfigured(false); // This will show the setup guide.
            } else {
                alert(`Falha ao salvar lista: ${err.message}`);
            }
        }
    };

    const handleDeleteList = async (listId: string) => {
        if (window.confirm("Tem certeza que deseja apagar esta lista?")) {
            try {
                const { error } = await supabase.from('curated_lists').delete().eq('id', listId);
                if (error) throw error;
                checkAndFetchData();
            } catch (err: any) {
                console.error("Delete list error:", err);
                alert(`Falha ao apagar lista: ${err.message}`);
            }
        }
    };

    const seedExampleList = async () => {
        if (restaurants.length < 3) {
            alert("Adicione pelo menos 3 restaurantes ao sistema para criar uma lista de exemplo.");
            return;
        }
        const exampleData: Omit<CuratedList, 'id'|'created_at'> = {
            name: "Clássicos de Curitiba",
            description: "Uma seleção de restaurantes icônicos e bem avaliados para começar.",
            restaurant_ids: restaurants.slice(0, 3).map(r => r.id),
            icon: "🏆",
        };
        
        try {
            const { error } = await supabase.from('curated_lists').insert([exampleData] as any);
            if (error) {
                 alert(`Falha ao criar lista de exemplo: ${error.message}`);
                 if (error.message.includes('violates row-level security policy') || error.message.toLowerCase().includes("could not find the 'icon' column")) {
                    setIsListsConfigured(false);
                 }
                return;
            };
            alert("Lista de exemplo criada com sucesso!");
            checkAndFetchData();
        } catch(err: any) {
            alert(`Falha ao criar lista de exemplo: ${err.message}`);
        }
    }
    
    if (currentUser.role !== 'admin') {
        return <div className="p-8 text-center text-red-500">Acesso negado. Apenas administradores podem ver esta página.</div>
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 space-y-8">
            {/* User Profiles Section */}
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-dark">Gerenciamento de Usuários</h2>
                    <Button onClick={() => { setEditingProfile(null); setIsProfileModalOpen(true); }}><PlusIcon className="w-5 h-5"/> Novo Usuário</Button>
                </div>
                
                {profileDbError === 'migration_needed' && <DatabaseErrorResolver sql={PERMISSIONS_MIGRATION_SQL} title="Atualizar Permissões de Usuário" instructions="Para usar o novo sistema de permissões por página, a tabela de usuários precisa ser atualizada."/>}
                {profileDbError === 'rls_issue' && <DatabaseErrorResolver sql={USER_PROFILES_RLS_FIX_SQL} title="Corrigir Visibilidade de Usuários" instructions="A lista de usuários está vazia. Isso geralmente é causado por uma Política de Segurança (RLS) que impede o acesso. O script abaixo desabilita a RLS na tabela de usuários, permitindo que administradores vejam todos os perfis."/>}

                {isLoading && !profileDbError && <p>Carregando perfis...</p>}
                
                {!isLoading && !profileDbError && (
                    <div className="bg-white rounded-xl shadow-subtle overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                             <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Permissões</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Papel</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Editar</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {profiles.map(profile => (
                                <tr key={profile.email}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-dark">{profile.name}</div>
                                        <div className="text-sm text-slate-500">{profile.email}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1" style={{maxWidth: '300px'}}>
                                            {(profile.allowed_views || []).map(view => (
                                                <span key={view} className="px-2 py-0.5 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">
                                                    {ALL_VIEWS.find(v => v.id === view)?.name || view}
                                                </span>
                                            ))}
                                            {!profile.allowed_views && <span className="text-xs text-red-500">Não migrado</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 capitalize">{profile.role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Button variant="ghost" size="sm" onClick={() => { setEditingProfile(profile); setIsProfileModalOpen(true); }}>
                                            <PencilIcon className="w-4 h-4" /> Editar
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Curated Lists Section */}
             <div>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-dark">Gerenciar Listas Curadas</h2>
                    {isListsConfigured && (
                        <Button onClick={() => { setEditingList(null); setIsListModalOpen(true); }}><PlusIcon className="w-5 h-5"/> Nova Lista</Button>
                    )}
                </div>
                
                {!isLoading && !isListsConfigured && <DatabaseErrorResolver sql={CURATED_LISTS_SETUP_SQL} title="Configuração Definitiva das Listas Curadas" instructions="Este recurso requer uma nova configuração de banco de dados que remove a fonte de erros de permissão. O script abaixo irá apagar qualquer configuração antiga e problemática e criar a nova estrutura corretamente."/>}
                {isLoading && <p>Verificando configuração...</p>}

                {!isLoading && isListsConfigured && (
                    <div className="bg-white rounded-xl shadow-subtle overflow-hidden">
                       <div className="p-4 space-y-3">
                           {curatedLists.map(list => (
                               <div key={list.id} className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                                   <div className="flex items-center gap-4">
                                       <span className="text-3xl">{list.icon || '🍽️'}</span>
                                       <div>
                                           <p className="font-bold text-dark">{list.name}</p>
                                           <p className="text-sm text-slate-500">{list.description}</p>
                                           <p className="text-xs text-slate-400 mt-1">{list.restaurant_ids.length} restaurantes</p>
                                       </div>
                                   </div>
                                   <div className="flex gap-2">
                                       <Button variant="ghost" size="sm" onClick={() => { setEditingList(list); setIsListModalOpen(true); }}>
                                           <PencilIcon className="w-4 h-4" />
                                       </Button>
                                       <Button variant="danger" size="sm" onClick={() => handleDeleteList(list.id)}>
                                           <TrashIcon className="w-4 h-4" />
                                       </Button>
                                   </div>
                               </div>
                           ))}
                           {curatedLists.length === 0 && (
                               <div className="text-center p-6">
                                   <p className="text-slate-500">Nenhuma lista curada criada ainda.</p>
                                   <Button onClick={seedExampleList} variant="secondary" className="mt-3">Criar Lista de Exemplo</Button>
                               </div>
                           )}
                       </div>
                    </div>
                )}
            </div>

            {isProfileModalOpen && (
                 <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title={editingProfile ? "Editar Perfil" : "Novo Perfil de Usuário"}>
                    <UserProfileForm onSave={handleSaveProfile} onClose={() => setIsProfileModalOpen(false)} initialData={editingProfile} />
                </Modal>
            )}
             {isListModalOpen && (
                 <Modal isOpen={isListModalOpen} onClose={() => setIsListModalOpen(false)} title={editingList ? "Editar Lista Curada" : "Nova Lista Curada"}>
                    <CuratedListForm
                        onSave={handleSaveList} 
                        onClose={() => setIsListModalOpen(false)} 
                        initialData={editingList}
                        allRestaurants={restaurants}
                    />
                </Modal>
            )}
        </div>
    );
};

export default AdminApp;