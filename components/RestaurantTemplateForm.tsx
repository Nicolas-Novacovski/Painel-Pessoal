import React, { useState, useEffect, useMemo } from 'react';
import { CuratedList, Restaurant } from '../types';
import { Button, Input } from './UIComponents';

interface CuratedListFormProps {
    onSave: (list: Omit<CuratedList, 'id' | 'created_at'>, isNew: boolean) => Promise<void>;
    onClose: () => void;
    initialData: CuratedList | null;
    allRestaurants: (Pick<Restaurant, 'id' | 'name'> & { cuisine: string | null })[];
}

const CuratedListForm: React.FC<CuratedListFormProps> = ({ onSave, onClose, initialData, allRestaurants }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [icon, setIcon] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [cuisineFilter, setCuisineFilter] = useState('all');
    const [isSaving, setIsSaving] = useState(false);
    
    const isNew = !initialData;

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setDescription(initialData.description || '');
            setIcon(initialData.icon || '');
            setSelectedIds(initialData.restaurant_ids || []);
        }
    }, [initialData]);

    const handleToggleRestaurant = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };
    
    const uniqueCuisines = useMemo(() => {
        const cuisines = new Set<string>();
        allRestaurants.forEach(r => {
            if (r.cuisine) {
                r.cuisine.split(',').forEach(c => {
                    const trimmedCuisine = c.trim();
                    if (trimmedCuisine) {
                        cuisines.add(trimmedCuisine);
                    }
                });
            }
        });
        return Array.from(cuisines).sort();
    }, [allRestaurants]);

    const handleAddByCuisine = () => {
        if (cuisineFilter === 'all') return;
        const restaurantsToAdd = allRestaurants
            .filter(r => r.cuisine && r.cuisine.toLowerCase().includes(cuisineFilter.toLowerCase()))
            .map(r => r.id);
        
        setSelectedIds(prev => Array.from(new Set([...prev, ...restaurantsToAdd])));
        setCuisineFilter('all'); // Reset filter after adding
    };

    const filteredRestaurants = allRestaurants.filter(r =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || selectedIds.length === 0) {
            alert("O nome da lista e ao menos um restaurante são obrigatórios.");
            return;
        }
        setIsSaving(true);
        await onSave({ name, description, icon, restaurant_ids: selectedIds }, isNew);
        setIsSaving(false);
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nome da Lista"
                    required
                    className="sm:col-span-3"
                />
                 <Input
                    value={icon}
                    onChange={e => setIcon(e.target.value)}
                    placeholder="Ícone (Ex: 🇮🇹)"
                    maxLength={4}
                    className="text-center text-2xl"
                />
            </div>
            <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descrição (opcional)"
            />
            
            <div>
                 <h4 className="font-medium text-slate-700 mb-2">Adicionar Restaurantes por Filtro</h4>
                 <div className="flex gap-2 p-3 bg-slate-100 rounded-lg">
                    <select value={cuisineFilter} onChange={e => setCuisineFilter(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900">
                        <option value="all">Selecione uma culinária...</option>
                        {uniqueCuisines.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Button type="button" variant="secondary" onClick={handleAddByCuisine} disabled={cuisineFilter === 'all'}>
                        Adicionar Todos
                    </Button>
                </div>
            </div>

            <div>
                <h4 className="font-medium text-slate-700 mb-2">Selecionar Restaurantes Manualmente</h4>
                <Input
                    type="search"
                    placeholder="Buscar restaurantes para adicionar..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="mb-2"
                />
                <div className="max-h-60 overflow-y-auto p-3 bg-slate-50 border rounded-lg space-y-2">
                    {filteredRestaurants.map(restaurant => (
                        <label key={restaurant.id} className="flex items-center gap-2 p-2 hover:bg-slate-200 rounded-md cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(restaurant.id)}
                                onChange={() => handleToggleRestaurant(restaurant.id)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span>{restaurant.name}</span>
                        </label>
                    ))}
                </div>
                <p className="text-sm text-slate-500 mt-1">{selectedIds.length} restaurantes selecionados.</p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : 'Salvar Lista'}
                </Button>
            </div>
        </form>
    );
};

export default CuratedListForm;