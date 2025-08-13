import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { UserProfile, ListItem, ListType } from '../types';
import { Button, Input, Modal } from './UIComponents';
import { PlusIcon, TrashIcon, CheckIcon } from './Icons';

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
    onToggleDone?: (id: string, is_done: boolean) => void;
}> = ({ item, onDelete, onToggleDone }) => (
    <div className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${item.is_done ? 'border-green-400 opacity-60' : 'border-primary'}`}>
        {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-32 object-cover rounded-md mb-3 bg-slate-200" />}
        <div className="flex justify-between items-start gap-2">
            <h4 className="font-bold text-dark break-words">{item.title}</h4>
            <div className="flex-shrink-0 flex items-center gap-1">
                 {onToggleDone && (
                    <button onClick={() => onToggleDone(item.id, !item.is_done)} className={`w-6 h-6 rounded flex items-center justify-center border-2 ${item.is_done ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-slate-500'}`}>
                        {item.is_done && <CheckIcon className="w-4 h-4" />}
                    </button>
                )}
                <button onClick={() => onDelete(item.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
        {item.description && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap break-words">{item.description}</p>}
        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block mt-2">Visitar Link</a>}
    </div>
);


interface ListsAppProps {
    currentUser: UserProfile;
}

const ListsApp: React.FC<ListsAppProps> = ({ currentUser }) => {
    const [items, setItems] = useState<ListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeListType, setActiveListType] = useState<ListType | null>(null);

    const fetchItems = useCallback(async () => {
        setIsLoading(true);
        const { data, error } = await supabase.from('lists').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching list items:', error);
        } else {
            setItems(data as any[] || []);
        }
        setIsLoading(false);
    }, []);

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
        const { error } = await supabase.from('lists').insert([{ ...itemData, user_email: currentUser.email }]);
        if (error) {
            console.error('Error saving item:', error);
            alert(`Erro ao salvar: ${error.message}`);
        }
    };
    
    const handleDeleteItem = async (id: string) => {
        if(window.confirm('Tem certeza que deseja apagar este item?')) {
            await supabase.from('lists').delete().eq('id', id);
        }
    }

    const handleToggleDone = async (id: string, is_done: boolean) => {
        await supabase.from('lists').update({ is_done }).eq('id', id);
    };

    const listColumns: { type: ListType; title: string }[] = [
        { type: 'wishlist', title: 'Quero Comprar' },
        { type: 'links', title: 'Links Úteis' },
        { type: 'todos', title: 'Preciso Fazer' },
    ];

    return (
        <div className="h-full overflow-x-auto">
            <div className="p-4 sm:p-6 min-w-max">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {listColumns.map(({ type, title }) => (
                        <div key={type} className="bg-slate-100 p-4 rounded-xl w-[350px] md:w-auto flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-dark">{title}</h3>
                                <Button size="sm" onClick={() => handleOpenModal(type)}><PlusIcon className="w-4 h-4"/> Adicionar</Button>
                            </div>
                            <div className="space-y-3 overflow-y-auto flex-grow h-0 pr-1">
                                {items.filter(item => item.list_type === type).map(item => (
                                    <ItemCard key={item.id} item={item} onDelete={handleDeleteItem} onToggleDone={type === 'todos' ? handleToggleDone : undefined} />
                                ))}
                                {isLoading && <p>Carregando...</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {activeListType && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Adicionar Novo Item">
                    <ListItemForm onSave={handleSaveItem} onClose={() => setIsModalOpen(false)} listType={activeListType} />
                </Modal>
            )}
        </div>
    );
};

export default ListsApp;