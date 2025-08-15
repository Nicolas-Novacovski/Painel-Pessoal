import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { UserProfile, ListItem, ListType } from '../types';
import { Button, Input, Modal } from './UIComponents';
import { PlusIcon, TrashIcon, TagIcon, BookmarkIcon, MapPinIcon, CheckIcon } from './Icons';

const LISTS_SETUP_SQL = `
-- SCRIPT DE CONFIGURAÇÃO PARA A TABELA 'lists'
-- Este script cria a tabela se ela não existir e desabilita a Row-Level Security (RLS)
-- para corrigir erros de salvamento.

-- 1. Cria a tabela 'lists' se ela não existir.
CREATE TABLE IF NOT EXISTS public.lists (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    description text NULL,
    url text NULL,
    image_url text NULL,
    list_type text NOT NULL,
    user_email text NOT NULL,
    is_done boolean NOT NULL DEFAULT false,
    CONSTRAINT lists_pkey PRIMARY KEY (id)
);

-- 2. Desabilita RLS, que é a causa provável do erro ao salvar.
ALTER TABLE public.lists DISABLE ROW LEVEL SECURITY;
`;


const DatabaseErrorResolver: React.FC = () => (
    <div className="p-4 m-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg">
        <h4 className="font-semibold text-red-900">Configuração Necessária</h4>
        <p className="text-sm text-red-800 mt-1">
            A funcionalidade de 'Listas' não pode ser carregada ou salva. Isso geralmente ocorre por uma tabela ausente ou por permissões de banco de dados (RLS) incorretas.
            O script abaixo resolve ambos os problemas.
        </p>
        <div className="mt-4">
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{LISTS_SETUP_SQL.trim()}</code>
            </pre>
            <p className="text-xs text-slate-600 mt-2">
                Copie o código, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase, clique em "RUN" e, em seguida, <strong>recarregue esta página</strong>.
            </p>
        </div>
    </div>
);

// A simplified profile type for what's fetched from the DB for this component.
interface SimpleDBUserProfile {
    email: string;
    name: string;
    couple_id: string | null;
}


// Form component for adding/editing a list item
const ListItemForm: React.FC<{
    onSave: (item: Omit<ListItem, 'id' | 'created_at' | 'user_email'>) => Promise<void>;
    onClose: () => void;
    listType: ListType;
}> = ({ onSave, onClose, listType }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [url, setUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title) {
            alert('O título é obrigatório.');
            return;
        }
        setIsSaving(true);
        await onSave({
            title,
            description: description || null,
            url: url || null,
            image_url: imageUrl || null,
            list_type: listType,
            is_done: false,
        });
        setIsSaving(false);
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do item" required />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={3} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary" />
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL do link (opcional)" type="url" />
            <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="URL da imagem (opcional)" type="url" />
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Item'}</Button>
            </div>
        </form>
    );
};

// Card component for displaying a list item
const ItemCard: React.FC<{
    item: ListItem;
    onDelete: (id: string) => void;
    onToggleDone?: (id: string, isDone: boolean) => void;
    creator?: SimpleDBUserProfile | null;
}> = ({ item, onDelete, onToggleDone, creator }) => {
    const creatorInitial = creator ? creator.name.charAt(0) : '?';
    // A simple way to assign colors based on email for the couple
    const creatorColor = creator?.email === 'nicolas.vendrami@gmail.com' ? 'bg-primary' : 'bg-partner';

    return (
        <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200 transition-all hover:shadow-lg hover:-translate-y-0.5 relative animate-fade-in">
            {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-32 object-cover rounded-md mb-3 bg-slate-200" />}
            <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-3 flex-grow min-w-0">
                    {onToggleDone && (
                         <button onClick={() => onToggleDone(item.id, item.is_done)} className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${item.is_done ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-primary'}`}>
                            {item.is_done && <CheckIcon className="w-4 h-4" />}
                        </button>
                    )}
                    <h4 className={`font-bold text-dark break-words ${item.is_done ? 'line-through text-slate-400' : ''}`}>{item.title}</h4>
                </div>
                <button onClick={() => onDelete(item.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full flex-shrink-0">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
            {item.description && <p className={`text-sm text-slate-600 mt-2 ${onToggleDone ? 'ml-9' : ''} whitespace-pre-wrap break-words ${item.is_done ? 'line-through text-slate-400' : ''}`}>{item.description}</p>}
            {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className={`text-sm text-primary hover:underline truncate block mt-2 ${onToggleDone ? 'ml-9' : ''}`}>Visitar Link</a>}
            
            {creator && (
                <div title={`Adicionado por: ${creator.name}`} className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-2 border-white shadow flex items-center justify-center text-white font-bold text-xs ${creatorColor}`}>
                    {creatorInitial}
                </div>
            )}
        </div>
    );
};


interface ListsAppProps {
    currentUser: UserProfile;
}

const ListsApp: React.FC<ListsAppProps> = ({ currentUser }) => {
    const [items, setItems] = useState<ListItem[]>([]);
    const [profiles, setProfiles] = useState<Record<string, SimpleDBUserProfile>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeListType, setActiveListType] = useState<ListType | null>(null);
    const [dbError, setDbError] = useState(false);

    const fetchItems = useCallback(async () => {
        setIsLoading(true);
        setDbError(false);
        try {
            const { data: profilesData, error: profilesError } = await supabase.from('user_profiles').select('email, name, couple_id');
            if (profilesError) throw profilesError;
            
            const profilesMap = (profilesData || []).reduce((acc, p) => {
                acc[p.email] = p;
                return acc;
            }, {} as Record<string, SimpleDBUserProfile>);
            setProfiles(profilesMap);

            let emailsToFetch: string[] = [currentUser.email];
            if (currentUser.couple_id) {
                const coupleEmails = Object.values(profilesMap)
                    .filter((p: SimpleDBUserProfile) => p.couple_id === currentUser.couple_id)
                    .map((p: SimpleDBUserProfile) => p.email);
                if (coupleEmails.length > 0) emailsToFetch = coupleEmails;
            }

            const { data, error } = await supabase.from('lists').select('*').in('user_email', emailsToFetch).order('created_at', { ascending: false });
            
            if (error) {
                 if (error.code === '42P01') {
                    setDbError(true);
                    return;
                }
                throw error;
            }
            
            setItems(data as any[] || []);
        } catch (error: any) {
            console.error('Error fetching list items:', error);
            if (error.code === '42P01' || error.message.includes('violates row-level security policy')) {
                setDbError(true);
            } else {
                alert(`Erro ao buscar itens: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    }, [currentUser.email, currentUser.couple_id]);

    useEffect(() => {
        fetchItems();
        const channel = supabase.channel('realtime-lists').on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, fetchItems).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchItems]);
    
    const handleOpenModal = (listType: ListType) => {
        setActiveListType(listType);
        setIsModalOpen(true);
    };

    const handleSaveItem = async (itemData: Omit<ListItem, 'id' | 'created_at' | 'user_email'>) => {
        try {
            const { error } = await supabase.from('lists').insert([{ ...itemData, user_email: currentUser.email }]);
            if (error) throw error;
        } catch(err: any) {
            console.error('Error saving item:', err);
             if (err.message.includes('violates row-level security policy')) {
                setDbError(true);
            } else {
                alert(`Erro ao salvar: ${err.message}`);
            }
        }
    };
    
    const handleDeleteItem = async (id: string) => {
        if(window.confirm('Tem certeza que deseja apagar este item?')) {
            await supabase.from('lists').delete().eq('id', id);
        }
    };

    const handleToggleDone = async (id: string, currentStatus: boolean) => {
        setItems(items.map(it => it.id === id ? { ...it, is_done: !currentStatus } : it));
        const { error } = await supabase.from('lists').update({ is_done: !currentStatus }).eq('id', id);
        if (error) {
            alert('Erro ao atualizar o status do item.');
            fetchItems(); // Revert on error
        }
    };

    const listColumns: { type: ListType; title: string; icon: React.FC<any>; hasDone: boolean }[] = [
        { type: 'wishlist', title: 'Quero Comprar', icon: TagIcon, hasDone: true },
        { type: 'links', title: 'Links Úteis', icon: BookmarkIcon, hasDone: false },
        { type: 'todos', title: 'Preciso Ir', icon: MapPinIcon, hasDone: true },
    ];

    if (dbError) {
        return <DatabaseErrorResolver />;
    }

    return (
        <div className="h-screen flex flex-col">
            <div className="p-4 sm:p-6">
                <h1 className="text-3xl font-bold text-dark">Minhas Listas</h1>
            </div>
            <div className="flex-grow p-4 sm:p-6 pt-0 grid grid-cols-1 lg:grid-cols-3 gap-6 h-0">
                {listColumns.map(({ type, title, icon: Icon, hasDone }) => {
                    const filteredItems = items.filter(item => item.list_type === type);
                    return (
                         <div key={type} className="bg-slate-100/70 p-4 rounded-2xl flex flex-col h-full">
                            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                                <h3 className="font-bold text-lg text-dark flex items-center gap-2">
                                    <Icon className="w-5 h-5 text-primary" />
                                    {title} ({filteredItems.length})
                                </h3>
                                <Button size="sm" onClick={() => handleOpenModal(type)}><PlusIcon className="w-4 h-4"/> Adicionar</Button>
                            </div>
                            <div className="space-y-3 overflow-y-auto flex-grow pr-1 -mr-2">
                                 {isLoading ? (
                                    <p className="text-center text-slate-500 p-4">Carregando...</p>
                                ) : filteredItems.length > 0 ? (
                                    filteredItems.map(item => (
                                        <ItemCard 
                                            key={item.id} 
                                            item={item} 
                                            onDelete={handleDeleteItem}
                                            onToggleDone={hasDone ? handleToggleDone : undefined}
                                            creator={profiles[item.user_email] || null}
                                        />
                                    ))
                                ) : (
                                    <div className="text-center p-6 text-slate-500 rounded-lg border-2 border-dashed border-slate-300 h-full flex items-center justify-center">
                                        <p>Nenhum item aqui.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
            {activeListType && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Adicionar a: ${listColumns.find(c => c.type === activeListType)?.title}`}>
                    <ListItemForm onSave={handleSaveItem} onClose={() => setIsModalOpen(false)} listType={activeListType} />
                </Modal>
            )}
        </div>
    );
};

export default ListsApp;
