/// <reference types="vite/client" />

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trip, ItineraryItem, TripExpense, ChecklistItem, ItineraryCategory, GalleryItem, TripExpenseCategory } from '../types';
import { supabase } from '../utils/supabase';
import { Button, Modal, Input, SegmentedControl, CurrencyInput } from './UIComponents';
import { ChevronLeftIcon, PlusIcon, CalendarDaysIcon, RouteIcon, CurrencyDollarIcon, ClipboardDocumentCheckIcon, PhotoIcon, TrashIcon, PencilIcon, PaperAirplaneIcon, HomeIcon, RestaurantIcon, SparklesIcon, TruckIcon, LightBulbIcon, CameraIcon, XMarkIcon, ShoppingBagIcon, QuestionMarkCircleIcon, LinkIcon, CheckIcon } from './Icons';
import { compressImage, slugify } from '../utils/helpers';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { GoogleGenAI, Type } from "@google/genai";


ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface TripDetailViewProps {
    trip: Trip;
    onBack: () => void;
    onTripUpdate: (updatedTrip: Trip) => void;
    onEdit: (trip: Trip) => void;
    onDelete: (trip: Trip) => void;
}

type ActiveTab = 'overview' | 'itinerary' | 'budget' | 'checklist' | 'gallery';

// --- Main Component ---
const TripDetailView: React.FC<TripDetailViewProps> = ({ trip, onBack, onTripUpdate, onEdit, onDelete }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
    const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
    const [expenses, setExpenses] = useState<TripExpense[]>([]);
    const [gallery, setGallery] = useState<GalleryItem[]>([]);
    const [isLoading, setIsLoading] = useState({ itinerary: true, expenses: true, gallery: true });
    
    // Modals state
    const [itineraryModal, setItineraryModal] = useState<{ open: boolean; item?: ItineraryItem }>({ open: false });
    const [expenseModal, setExpenseModal] = useState<{ open: boolean; item?: TripExpense }>({ open: false });
    const [galleryModal, setGalleryModal] = useState<{ open: boolean; item?: GalleryItem }>({ open: false });
    const [viewingImage, setViewingImage] = useState<GalleryItem | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading({ itinerary: true, expenses: true, gallery: true });
        try {
            const [itineraryRes, expensesRes, galleryRes] = await Promise.all([
                supabase.from('trip_itinerary_items').select('*').eq('trip_id', trip.id).order('item_date').order('start_time'),
                supabase.from('trip_expenses').select('*').eq('trip_id', trip.id).order('payment_date', { ascending: false }),
                supabase.from('trip_gallery_items').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }),
            ]);

            if (itineraryRes.error) throw itineraryRes.error;
            setItinerary(itineraryRes.data);
            setIsLoading(prev => ({ ...prev, itinerary: false }));

            if (expensesRes.error) throw expensesRes.error;
            setExpenses(expensesRes.data);
            setIsLoading(prev => ({ ...prev, expenses: false }));

            if (galleryRes.error) throw galleryRes.error;
            setGallery(galleryRes.data);
            setIsLoading(prev => ({...prev, gallery: false}));

        } catch (error: any) {
            console.error("Error fetching trip details:", error);
            alert(`Erro ao buscar detalhes da viagem: ${error.message}`);
        }
    }, [trip.id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveItineraryItem = async (item: Omit<ItineraryItem, 'id' | 'trip_id' | 'is_completed' | 'created_at'>, id?: string) => {
        const { cost, ...itineraryData } = item;
        const itemToSave = { ...itineraryData, cost, trip_id: trip.id };
        const existingExpense = id ? expenses.find(e => e.itinerary_item_id === id) : undefined;
        let upsertedItemId = id;
    
        try {
            if (id) {
                const { data, error } = await supabase.from('trip_itinerary_items').update(itemToSave).eq('id', id).select().single();
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('trip_itinerary_items').insert([itemToSave]).select().single();
                if (error) throw error;
                upsertedItemId = data.id;
            }
    
            const itineraryCategoryToExpense: Record<ItineraryCategory, TripExpenseCategory> = {
                'flight': 'transport', 'transport': 'transport', 'accommodation': 'accommodation', 'food': 'food', 'activity': 'activities'
            };
    
            if (cost && cost > 0 && upsertedItemId) {
                const expensePayload = {
                    trip_id: trip.id,
                    description: `[Roteiro] ${item.description}`,
                    amount: cost,
                    category: itineraryCategoryToExpense[item.category],
                    payment_date: item.item_date,
                    itinerary_item_id: upsertedItemId,
                };
                if (existingExpense) {
                    await supabase.from('trip_expenses').update(expensePayload).eq('id', existingExpense.id);
                } else {
                    await supabase.from('trip_expenses').insert([expensePayload]);
                }
            } else if (existingExpense) {
                await supabase.from('trip_expenses').delete().eq('id', existingExpense.id);
            }
    
        } catch(err: any) {
            alert(`Erro ao salvar item do roteiro: ${err.message}`);
        } finally {
            fetchData();
            setItineraryModal({ open: false });
        }
    };

    const handleDeleteItineraryItem = async (itemId: string) => {
        if (window.confirm("Tem certeza que deseja apagar este item do roteiro? A despesa associada também será removida.")) {
            const expenseToDelete = expenses.find(e => e.itinerary_item_id === itemId);
            if(expenseToDelete){
                const { error: expenseError } = await supabase.from('trip_expenses').delete().eq('id', expenseToDelete.id);
                if(expenseError) {
                    alert("Erro ao apagar despesa associada.");
                    return;
                }
            }
            const { error } = await supabase.from('trip_itinerary_items').delete().eq('id', itemId);
            if (error) alert("Erro ao apagar item."); else fetchData();
        }
    };

    const handleSaveExpense = async (expense: Omit<TripExpense, 'id'|'trip_id'|'created_at'|'itinerary_item_id'>, id?: string) => {
        const expenseToSave = { ...expense, trip_id: trip.id };
        const { error } = id
            ? await supabase.from('trip_expenses').update(expenseToSave).eq('id', id)
            : await supabase.from('trip_expenses').insert([expenseToSave]);
        if(error) alert(`Erro ao salvar despesa: ${error.message}`); else {
            fetchData();
            setExpenseModal({ open: false });
        }
    };

    const handleDeleteExpense = async (expenseId: string) => {
        if(window.confirm("Tem certeza que deseja apagar esta despesa?")) {
            const { error } = await supabase.from('trip_expenses').delete().eq('id', expenseId);
            if(error) alert("Erro ao apagar despesa."); else fetchData();
        }
    };

    const handleSaveGalleryItem = async (imageFile: File, caption: string) => {
        const fileName = `${slugify(caption) || 'gallery'}-${Date.now()}.jpg`;
        const filePath = `${trip.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('trip-images').upload(filePath, imageFile);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('trip-images').getPublicUrl(filePath);
        const { error: insertError } = await supabase.from('trip_gallery_items').insert([{
            trip_id: trip.id,
            image_url: urlData.publicUrl,
            caption,
            is_inspiration: false,
        }]);
        if(insertError) throw insertError;
    };
    
    const handleDeleteGalleryItem = async (item: GalleryItem) => {
        const imagePath = new URL(item.image_url).pathname.split('/trip-images/')[1];
        if(imagePath) await supabase.storage.from('trip-images').remove([imagePath]);
        await supabase.from('trip_gallery_items').delete().eq('id', item.id);
    };
    
    const navItems = [
        { id: 'overview', label: 'Visão Geral', icon: CalendarDaysIcon },
        { id: 'itinerary', label: 'Roteiro', icon: RouteIcon },
        { id: 'budget', label: 'Orçamento', icon: CurrencyDollarIcon },
        { id: 'checklist', label: 'Checklist', icon: ClipboardDocumentCheckIcon },
        { id: 'gallery', label: 'Galeria', icon: PhotoIcon },
    ];

    const renderContent = () => {
        switch(activeTab) {
            case 'overview': return <OverviewTab trip={trip} itinerary={itinerary} expenses={expenses} isLoading={isLoading.itinerary || isLoading.expenses} />;
            case 'itinerary': return <ItineraryTab trip={trip} itinerary={itinerary} isLoading={isLoading.itinerary} onEdit={(item) => setItineraryModal({ open: true, item })} onDelete={handleDeleteItineraryItem} onAddNew={() => setItineraryModal({ open: true })} onSaveNewItem={handleSaveItineraryItem} />;
            case 'budget': return <BudgetTab trip={trip} expenses={expenses} isLoading={isLoading.expenses} onEdit={(item) => setExpenseModal({ open: true, item })} onDelete={handleDeleteExpense} onAddNew={() => setExpenseModal({ open: true })} />;
            case 'gallery': return <GalleryTab trip={trip} gallery={gallery} isLoading={isLoading.gallery} onSave={handleSaveGalleryItem} onDelete={handleDeleteGalleryItem} onFetch={fetchData} onSelectImage={setViewingImage} />;
            case 'checklist': return <ChecklistTab trip={trip} onTripUpdate={onTripUpdate} />;
            default: return null;
        }
    };

    return (
        <>
            <div className="animate-fade-in">
                <div className="relative h-60 md:h-80 bg-slate-300">
                    <img src={trip.cover_image_url || `https://picsum.photos/seed/${trip.id}/1200/400`} alt={`Capa para ${trip.name}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10"></div>
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between">
                         <Button onClick={onBack} variant="secondary" size="sm" className="!bg-white/20 !text-white hover:!bg-white/30 backdrop-blur-sm">
                            <ChevronLeftIcon className="w-5 h-5" /> Voltar
                        </Button>
                        <div className="flex gap-2">
                             <Button onClick={() => onEdit(trip)} variant="secondary" size="sm" className="!bg-white/20 !text-white hover:!bg-white/30 backdrop-blur-sm">
                                <PencilIcon className="w-4 h-4" /> Editar Viagem
                            </Button>
                             <Button onClick={() => onDelete(trip)} variant="danger" size="sm" className="!bg-red-600/50 !text-white hover:!bg-red-600/80 backdrop-blur-sm">
                                <TrashIcon className="w-4 h-4" /> Apagar
                            </Button>
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 p-8 text-white">
                        <h1 className="text-4xl md:text-5xl font-bold drop-shadow-lg">{trip.name}</h1>
                        <p className="text-xl drop-shadow-md">{trip.destination}</p>
                    </div>
                </div>
                <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-slate-200">
                     <div className="container mx-auto px-4 sm:px-8">
                        <div className="flex items-center gap-2 overflow-x-auto">
                            {navItems.map(item => (
                                <button key={item.id} onClick={() => setActiveTab(item.id as ActiveTab)} className={`flex items-center gap-2 px-4 py-3 font-semibold border-b-2 whitespace-nowrap transition-colors ${activeTab === item.id ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-dark'}`}>
                                    <item.icon className="w-5 h-5" />
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                     </div>
                </div>
                <div className="container mx-auto p-4 sm:p-8">
                    {renderContent()}
                </div>
            </div>
             <Modal isOpen={itineraryModal.open} onClose={() => setItineraryModal({ open: false })} title={itineraryModal.item ? "Editar Item do Roteiro" : "Adicionar ao Roteiro"}>
                <ItineraryForm onSave={handleSaveItineraryItem} onClose={() => setItineraryModal({ open: false })} initialData={itineraryModal.item} tripStartDate={trip.start_date}/>
            </Modal>
             <Modal isOpen={expenseModal.open} onClose={() => setExpenseModal({ open: false })} title={expenseModal.item ? "Editar Despesa" : "Adicionar Despesa"}>
                <ExpenseForm onSave={handleSaveExpense} onClose={() => setExpenseModal({ open: false })} initialData={expenseModal.item} tripStartDate={trip.start_date}/>
            </Modal>
             <Modal isOpen={galleryModal.open} onClose={() => setGalleryModal({ open: false })} title="Adicionar Foto à Galeria">
                <GalleryForm onSave={handleSaveGalleryItem} onClose={() => { setGalleryModal({ open: false }); fetchData(); }} />
            </Modal>
            {viewingImage && (
                 <Modal isOpen={true} onClose={() => setViewingImage(null)} title={viewingImage.caption || `Foto da Viagem`}>
                    <div className="space-y-4">
                        <div className="bg-black rounded-lg flex items-center justify-center max-h-[70vh]">
                            <img src={viewingImage.image_url} alt={viewingImage.caption || ''} className="max-h-[70vh] w-auto object-contain"/>
                        </div>
                        <p className="font-semibold text-slate-800 text-center">{viewingImage.caption}</p>
                    </div>
                </Modal>
            )}
        </>
    );
};

// --- Tab Components ---

const OverviewTab: React.FC<{ trip: Trip; itinerary: ItineraryItem[]; expenses: TripExpense[], isLoading: boolean }> = ({ trip, itinerary, expenses, isLoading }) => {
    const countdown = useMemo(() => {
        if (!trip.start_date) return null;
        const diff = new Date(trip.start_date).getTime() - new Date().setHours(0,0,0,0);
        if (diff < 0) return { type: 'past', days: 0 };
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return { type: days === 0 ? 'today' : 'future', days };
    }, [trip.start_date]);

    const totalSpent = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
    const budgetProgress = useMemo(() => trip.budget ? Math.min((totalSpent / trip.budget) * 100, 100) : 0, [totalSpent, trip.budget]);

    const upcomingItinerary = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return itinerary.filter(item => item.item_date >= today).slice(0, 3);
    }, [itinerary]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-subtle text-center">
                <h4 className="font-bold text-lg text-dark mb-2">Contagem Regressiva</h4>
                {countdown === null ? <p className="text-4xl font-bold text-primary">?</p> :
                 countdown.type === 'past' ? <p className="text-2xl font-bold text-slate-500">Viagem concluída!</p> :
                 countdown.type === 'today' ? <p className="text-4xl font-bold text-amber-500">É HOJE!</p> :
                 <><p className="text-6xl font-bold text-primary">{countdown.days}</p><p className="text-slate-500">dias para a viagem</p></>}
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-subtle">
                <h4 className="font-bold text-lg text-dark mb-2">Resumo do Orçamento</h4>
                {trip.budget ? <>
                    <div className="w-full bg-slate-200 rounded-full h-4"><div className="bg-primary h-4 rounded-full" style={{ width: `${budgetProgress}%` }}></div></div>
                    <div className="flex justify-between items-baseline mt-2">
                        <span className="font-bold text-xl text-dark">R$ {totalSpent.toFixed(2)}</span>
                        <span className="text-sm text-slate-500">de R$ {trip.budget.toFixed(2)}</span>
                    </div>
                </> : <p className="text-center text-slate-500">Orçamento não definido.</p>}
            </div>
            <div className="md:col-span-2 lg:col-span-1 bg-white p-6 rounded-2xl shadow-subtle">
                <h4 className="font-bold text-lg text-dark mb-2">Próximos Passos</h4>
                {isLoading ? <p className="text-slate-500">Carregando...</p> : upcomingItinerary.length > 0 ? (
                    <div className="space-y-3">
                        {upcomingItinerary.map(item => (
                             <div key={item.id} className="text-sm">
                                 <p className="font-semibold text-dark">{item.description}</p>
                                 <p className="text-slate-500">{new Date(item.item_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} {item.start_time ? `- ${item.start_time}` : ''}</p>
                             </div>
                        ))}
                    </div>
                ) : <p className="text-center text-slate-500">Nenhum evento futuro no roteiro.</p>}
            </div>
        </div>
    );
};

// --- Itinerary Tab ---

const ItineraryTab: React.FC<{
    trip: Trip;
    itinerary: ItineraryItem[];
    isLoading: boolean;
    onEdit: (item: ItineraryItem) => void;
    onDelete: (id: string) => void;
    onAddNew: () => void;
    onSaveNewItem: (item: Omit<ItineraryItem, 'id' | 'trip_id' | 'is_completed' | 'created_at'>) => void;
}> = ({ trip, itinerary, isLoading, onEdit, onDelete, onAddNew, onSaveNewItem }) => {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
    const [selectedSubOptions, setSelectedSubOptions] = useState<Record<string, any[]>>({});
    const [suggestionQuery, setSuggestionQuery] = useState('');

    const handleFetchSuggestions = async (query: string) => {
        if (!trip.destination) {
            alert("Defina um destino para a viagem para obter sugestões.");
            return;
        }
        if (!query.trim()) {
            alert("Por favor, diga o que você procura.");
            return;
        }

        setIsFetchingSuggestions(true);
        setSuggestions([]);
        setSelectedSubOptions({});
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});

            const existingItems = itinerary.map(item => item.description).join(', ');

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: `Você é um planejador de viagens especialista. O usuário está planejando uma viagem para ${trip.destination}.
            A viagem é para ${trip.travelers} ${trip.travelers > 1 ? 'pessoas' : 'pessoa'}. Para qualquer sugestão que tenha um custo, a estimativa de 'cost' deve ser o **valor total multiplicado pelo número de viajantes**. Por exemplo, se um jantar custa R$150 por pessoa para uma viagem de 2 pessoas, o 'cost' retornado deve ser 300.
            O usuário está procurando por: "${query}".
            O roteiro atual já contém os seguintes itens, por favor, evite sugerir coisas repetidas: ${existingItems || "Nenhum"}.

            Sugira até 5 atividades, restaurantes ou pontos turísticos relevantes para a busca.
            Para sugestões genéricas (ex: "Jantar Fondue"), inclua um campo 'sub_options' com uma lista de até 4 locais específicos, incluindo 'name', 'cost' (estimativa em BRL, já para ${trip.travelers} ${trip.travelers > 1 ? 'pessoas' : 'pessoa'}), e 'address'.
            Para sugestões específicas (ex: "Visitar a Torre Eiffel"), não inclua 'sub_options'.
            Sempre inclua uma 'category' ('activity', 'food', 'accommodation', 'transport'), 'description' e 'cost' (total para ${trip.travelers} ${trip.travelers > 1 ? 'pessoas' : 'pessoa'}) para a sugestão principal.`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            suggestions: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING, description: "Nome principal da sugestão. Ex: 'Jantar Fondue' ou 'Museu do Louvre'" },
                                        category: { type: Type.STRING, enum: ['activity', 'food', 'accommodation', 'transport'] },
                                        description: { type: Type.STRING, description: "Descrição curta sobre a sugestão principal." },
                                        cost: { type: Type.NUMBER, description: "Custo estimado em BRL para a sugestão principal (ex: 150 para fondue). 0 para gratuito." },
                                        sub_options: {
                                            type: Type.ARRAY,
                                            nullable: true,
                                            description: "Lista de locais específicos para sugestões genéricas.",
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    name: { type: Type.STRING, description: "Nome do local específico. Ex: 'Le Chalet de La Fondue'" },
                                                    cost: { type: Type.NUMBER, description: "Custo estimado para este local específico." },
                                                    address: { type: Type.STRING, description: "Endereço do local." }
                                                },
                                                required: ["name"]
                                            }
                                        }
                                    },
                                    required: ["name", "category", "description"]
                                }
                            }
                        }
                    }
                }
            });
            const parsed = JSON.parse(response.text.trim());
            setSuggestions(parsed.suggestions || []);
        } catch (error) {
            console.error("AI suggestion error:", error);
            alert("Não foi possível obter sugestões da IA. Tente novamente.");
        } finally {
            setIsFetchingSuggestions(false);
        }
    };
    
    const handleToggleSubOption = (mainSuggestionName: string, subOption: any) => {
        setSelectedSubOptions(prev => {
            const currentSelection = prev[mainSuggestionName] || [];
            const isSelected = currentSelection.some(s => s.name === subOption.name);
            if (isSelected) {
                return {
                    ...prev,
                    [mainSuggestionName]: currentSelection.filter(s => s.name !== subOption.name)
                };
            } else {
                return {
                    ...prev,
                    [mainSuggestionName]: [...currentSelection, subOption]
                };
            }
        });
    };
    
    const handleAddSelected = (mainSuggestion: any) => {
        const selected = selectedSubOptions[mainSuggestion.name] || [];
        if (selected.length === 0) return;
    
        selected.forEach(sub => {
            const newItem = {
                item_date: trip.start_date || new Date().toISOString().split('T')[0],
                start_time: null,
                end_time: null,
                category: mainSuggestion.category as ItineraryCategory,
                description: sub.name,
                details: { notes: `Opção para "${mainSuggestion.name}".\nEndereço: ${sub.address || 'Não informado'}` },
                cost: sub.cost || null,
            };
            onSaveNewItem(newItem);
        });
        
        setSuggestions(prev => prev.filter(s => s.name !== mainSuggestion.name));
        setSelectedSubOptions(prev => {
            const newSelections = { ...prev };
            delete newSelections[mainSuggestion.name];
            return newSelections;
        });
    };

    const handleAddSuggestion = (suggestion: any) => {
        const newItem: Omit<ItineraryItem, 'id' | 'trip_id' | 'is_completed' | 'created_at'> = {
            item_date: trip.start_date || new Date().toISOString().split('T')[0],
            start_time: null,
            end_time: null,
            category: suggestion.category as ItineraryCategory,
            description: suggestion.name,
            details: { notes: suggestion.description },
            cost: suggestion.cost || null,
        };
        onSaveNewItem(newItem);
        setSuggestions(prev => prev.filter(s => s.name !== suggestion.name));
    };

    const groupedItinerary = useMemo(() => itinerary.reduce((acc, item) => {
        (acc[item.item_date] = acc[item.item_date] || []).push(item);
        return acc;
    }, {} as Record<string, ItineraryItem[]>), [itinerary]);

    const sortedDates = useMemo(() => Object.keys(groupedItinerary).sort(), [groupedItinerary]);

    const ItineraryCategoryIcons: Record<ItineraryCategory, React.FC<any>> = {
        flight: PaperAirplaneIcon, accommodation: HomeIcon, food: RestaurantIcon, activity: SparklesIcon, transport: TruckIcon
    };

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button onClick={onAddNew}><PlusIcon className="w-5 h-5"/> Adicionar ao Roteiro</Button>
            </div>
            
            <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2">Assistente de Roteiro IA</h4>
                <p className="text-sm text-slate-600 mb-3">Peça sugestões com base nos seus interesses para preencher o seu roteiro.</p>
                <div className="flex gap-2">
                    <Input 
                        value={suggestionQuery}
                        onChange={(e) => setSuggestionQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleFetchSuggestions(suggestionQuery); }}
                        placeholder="Ex: restaurantes românticos, museus..."
                        className="flex-grow"
                    />
                    <Button onClick={() => handleFetchSuggestions(suggestionQuery)} variant="accent" disabled={isFetchingSuggestions}>
                        <SparklesIcon className={`w-5 h-5 ${isFetchingSuggestions ? 'animate-spin' : ''}`}/>
                        Buscar
                    </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => handleFetchSuggestions("Restaurantes")} className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors">Restaurantes</button>
                    <button onClick={() => handleFetchSuggestions("Cafeterias")} className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors">Cafeterias</button>
                    <button onClick={() => handleFetchSuggestions("Passeios ao ar livre")} className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors">Passeios</button>
                </div>
            </div>

             {(isFetchingSuggestions || suggestions.length > 0) && (
                <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h4 className="font-bold text-amber-900 mb-2">Sugestões da IA</h4>
                    <div className="space-y-3">
                        {isFetchingSuggestions && <p className="text-sm text-amber-800">Aguarde...</p>}
                        {suggestions.map((s, i) => (
                            <div key={i} className="bg-white p-3 rounded-md shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-dark">{s.name} {s.cost > 0 && <span className="text-xs font-normal text-slate-500">(~R${s.cost})</span>}</p>
                                        <p className="text-xs text-slate-500">{s.description}</p>
                                    </div>
                                    {(!s.sub_options || s.sub_options.length === 0) && (
                                        <Button size="sm" onClick={() => handleAddSuggestion(s)}><PlusIcon className="w-4 h-4"/> Adicionar</Button>
                                    )}
                                </div>

                                {s.sub_options && s.sub_options.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                                        <p className="text-xs font-semibold text-slate-600">Opções encontradas:</p>
                                        {s.sub_options.map((sub: any, j: number) => (
                                            <label key={j} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                    checked={(selectedSubOptions[s.name] || []).some(sel => sel.name === sub.name)}
                                                    onChange={() => handleToggleSubOption(s.name, sub)}
                                                />
                                                <div className="text-sm">
                                                    <span className="font-medium text-slate-800">{sub.name}</span>
                                                    {sub.cost > 0 && <span className="text-xs text-slate-500 ml-1">(~R${sub.cost})</span>}
                                                    {sub.address && <span className="block text-xs text-slate-400">{sub.address}</span>}
                                                </div>
                                            </label>
                                        ))}
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="mt-2"
                                            onClick={() => handleAddSelected(s)}
                                            disabled={!selectedSubOptions[s.name] || selectedSubOptions[s.name].length === 0}
                                        >
                                            Adicionar Selecionados
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {isLoading ? <p className="text-center text-slate-500 p-8">Carregando roteiro...</p> :
             sortedDates.length === 0 ? <p className="text-center text-slate-500 p-8 bg-slate-50 rounded-lg">Seu roteiro está vazio.</p> :
             <div className="space-y-6">
                 {sortedDates.map(date => {
                     const dateObj = new Date(date + 'T00:00:00');
                     return (
                        <div key={date}>
                             <h3 className="text-xl font-bold text-primary mb-2 sticky top-[60px] bg-slate-50/80 backdrop-blur-sm py-2 px-2 -mx-2 rounded-md">
                                {dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                             </h3>
                             <div className="space-y-3 pl-4 border-l-2 border-slate-200">
                                {groupedItinerary[date].map(item => {
                                    const Icon = ItineraryCategoryIcons[item.category] || SparklesIcon;
                                    return (
                                        <div key={item.id} className="group relative bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                                            <div className="flex items-start gap-4">
                                                <div className="flex flex-col items-center">
                                                     <Icon className="w-6 h-6 text-slate-500" />
                                                     {item.start_time && <span className="text-sm font-semibold text-slate-600 mt-1 whitespace-nowrap">{item.start_time}{item.end_time ? ` - ${item.end_time}` : ''}</span>}
                                                </div>
                                                <div className="flex-grow">
                                                     <p className="font-bold text-dark">{item.description}</p>
                                                     {item.cost && item.cost > 0 && <p className="text-sm font-semibold text-green-600">Custo: R$ {item.cost.toFixed(2)}</p>}
                                                     {item.details?.notes && <p className="text-sm text-slate-500 mt-1">{item.details.notes}</p>}
                                                </div>
                                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="sm" className="!p-1.5" onClick={() => onEdit(item)}><PencilIcon className="w-4 h-4"/></Button>
                                                    <Button variant="ghost" size="sm" className="!p-1.5" onClick={() => onDelete(item.id)}><TrashIcon className="w-4 h-4 text-red-500"/></Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                             </div>
                        </div>
                     )
                 })}
             </div>
            }
        </div>
    );
};

// --- Budget Tab ---

const BudgetTab: React.FC<{
    trip: Trip;
    expenses: TripExpense[];
    isLoading: boolean;
    onEdit: (item: TripExpense) => void;
    onDelete: (id: string) => void;
    onAddNew: () => void;
}> = ({ trip, expenses, isLoading, onEdit, onDelete, onAddNew }) => {
    const totalSpent = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
    const budgetData = useMemo(() => {
        const data: Record<TripExpenseCategory, number> = { transport: 0, accommodation: 0, food: 0, activities: 0, shopping: 0, other: 0 };
        expenses.forEach(e => { data[e.category] = (data[e.category] || 0) + e.amount; });
        return {
            labels: Object.keys(data).filter(k => data[k as TripExpenseCategory] > 0),
            datasets: [{
                label: 'Gastos por Categoria',
                data: Object.values(data).filter(v => v > 0),
                backgroundColor: ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#64748b'],
            }],
        };
    }, [expenses]);
    
    const ExpenseCategoryIcons: Record<TripExpenseCategory, React.FC<any>> = {
        transport: TruckIcon, accommodation: HomeIcon, food: RestaurantIcon, activities: SparklesIcon, shopping: ShoppingBagIcon, other: QuestionMarkCircleIcon
    };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white p-4 rounded-xl shadow-sm text-center border">
                    <p className="text-sm text-slate-500">Orçamento Total</p>
                    <p className="text-3xl font-bold text-dark">{trip.budget ? `R$ ${trip.budget.toFixed(2)}` : 'N/A'}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm text-center border">
                    <p className="text-sm text-slate-500">Total Gasto</p>
                    <p className="text-3xl font-bold text-red-500">R$ {totalSpent.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm text-center border">
                    <p className="text-sm text-slate-500">Saldo Restante</p>
                    <p className={`text-3xl font-bold ${trip.budget && totalSpent > trip.budget ? 'text-red-500' : 'text-green-600'}`}>
                        {trip.budget ? `R$ ${(trip.budget - totalSpent).toFixed(2)}` : 'N/A'}
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-subtle border">
                    <h3 className="font-bold text-lg mb-4">Gráfico de Gastos</h3>
                    {expenses.length > 0 ? <Bar data={budgetData} options={{ responsive: true, plugins: { legend: { display: false }}}} /> : <p className="text-slate-500 text-center">Nenhuma despesa para exibir.</p>}
                </div>
                <div className="bg-white p-6 rounded-xl shadow-subtle border">
                    <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Despesas</h3><Button onClick={onAddNew} size="sm"><PlusIcon className="w-4 h-4"/> Adicionar</Button></div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {isLoading ? <p>Carregando...</p> : expenses.map(e => {
                            const Icon = ExpenseCategoryIcons[e.category] || QuestionMarkCircleIcon;
                            const isFromItinerary = !!e.itinerary_item_id;
                            return (
                                <div key={e.id} className={`group flex items-center gap-3 p-2 rounded-md ${isFromItinerary ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                                    <Icon className="w-6 h-6 text-slate-500"/>
                                    <div className="flex-grow">
                                        <p className="font-semibold text-dark flex items-center gap-1.5">{isFromItinerary && <span title="Item do Roteiro"><LinkIcon className="w-4 h-4 text-blue-500"/></span>}{e.description.replace('[Roteiro]', '').trim()}</p>
                                        <p className="text-xs text-slate-500">{new Date(e.payment_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <p className="font-bold">R$ {e.amount.toFixed(2)}</p>
                                    <div className={`opacity-0 group-hover:opacity-100 ${isFromItinerary ? '!opacity-0' : ''}`}>
                                        <Button size="sm" variant="ghost" className="!p-1" onClick={() => onEdit(e)} disabled={isFromItinerary}><PencilIcon className="w-4 h-4"/></Button>
                                        <Button size="sm" variant="ghost" className="!p-1" onClick={() => onDelete(e.id)} disabled={isFromItinerary}><TrashIcon className="w-4 h-4 text-red-500"/></Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Gallery Tab ---

const GalleryTab: React.FC<{
    trip: Trip;
    gallery: GalleryItem[];
    isLoading: boolean;
    onSave: (file: File, caption: string) => Promise<void>;
    onDelete: (item: GalleryItem) => Promise<void>;
    onFetch: () => void;
    onSelectImage: (item: GalleryItem) => void;
}> = ({ trip, gallery, isLoading, onSave, onDelete, onFetch, onSelectImage }) => {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    const handleDeleteWithConfirmation = async (item: GalleryItem) => {
        if(window.confirm(`Apagar a foto "${item.caption || 'sem legenda'}"?`)) {
            await onDelete(item);
            onFetch();
        }
    };

    return (
        <div>
            <div className="flex justify-end mb-4"><Button onClick={() => setIsUploadModalOpen(true)}><PlusIcon className="w-5 h-5"/> Adicionar Foto</Button></div>
            {isLoading ? <p>Carregando galeria...</p> :
             gallery.length === 0 ? <p className="text-center text-slate-500 p-8 bg-slate-50 rounded-lg">Sua galeria está vazia.</p> :
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {gallery.map(item => (
                     <div key={item.id} className="group relative aspect-square bg-slate-200 rounded-lg overflow-hidden cursor-pointer" onClick={() => onSelectImage(item)}>
                         <img src={item.image_url} alt={item.caption || ''} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"/>
                         <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent p-2 flex flex-col justify-end">
                             <p className="text-white text-sm font-semibold drop-shadow-md">{item.caption}</p>
                         </div>
                         <button onClick={(e) => { e.stopPropagation(); handleDeleteWithConfirmation(item); }} className="absolute top-2 right-2 p-1.5 bg-black/40 rounded-full text-white opacity-0 group-hover:opacity-100 hover:bg-red-500"><TrashIcon className="w-4 h-4"/></button>
                     </div>
                 ))}
             </div>
            }
             <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Adicionar Foto à Galeria">
                <GalleryForm onSave={onSave} onClose={() => { setIsUploadModalOpen(false); onFetch(); }} />
            </Modal>
        </div>
    );
};

// --- Checklist Tab ---
const DEFAULT_CHECKLIST: ChecklistItem[] = [
    { id: crypto.randomUUID(), text: 'Documentos', is_heading: true, is_done: false },
    { id: crypto.randomUUID(), text: 'Passaportes / IDs', is_done: false },
    { id: crypto.randomUUID(), text: 'Vistos (se necessário)', is_done: false },
    { id: crypto.randomUUID(), text: 'Passagens (aéreas, trem, etc.)', is_done: false },
    { id: crypto.randomUUID(), text: 'Reservas de hotel', is_done: false },
    { id: crypto.randomUUID(), text: 'Seguro viagem', is_done: false },
    { id: crypto.randomUUID(), text: 'Saúde e Segurança', is_heading: true, is_done: false },
    { id: crypto.randomUUID(), text: 'Comprar remédios necessários', is_done: false },
    { id: crypto.randomUUID(), text: 'Adaptador de tomada', is_done: false },
    { id: crypto.randomUUID(), text: 'Malas', is_heading: true, is_done: false },
    { id: crypto.randomUUID(), text: 'Fazer as malas', is_done: false },
];

const ChecklistTab: React.FC<{ trip: Trip; onTripUpdate: (updatedTrip: Trip) => void; }> = ({ trip, onTripUpdate }) => {
    const [checklist, setChecklist] = useState<ChecklistItem[]>(trip.checklist || DEFAULT_CHECKLIST);
    const [newItemText, setNewItemText] = useState('');
    const [newItemType, setNewItemType] = useState<'item' | 'heading'>('item');

    useEffect(() => {
        const handler = setTimeout(() => {
            if (JSON.stringify(trip.checklist) !== JSON.stringify(checklist)) {
                 onTripUpdate({ ...trip, checklist });
            }
        }, 1000);
        return () => clearTimeout(handler);
    }, [checklist, trip, onTripUpdate]);

    const handleToggle = (id: string) => {
        setChecklist(prev => prev.map(item => item.id === id ? { ...item, is_done: !item.is_done } : item));
    };

    const handleDelete = (id: string) => {
        setChecklist(prev => prev.filter(item => item.id !== id));
    };

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if(!newItemText.trim()) return;
        const newItem: ChecklistItem = {
            id: crypto.randomUUID(),
            text: newItemText.trim(),
            is_done: false,
            is_heading: newItemType === 'heading'
        };
        setChecklist(prev => [...prev, newItem]);
        setNewItemText('');
    };
    
    return (
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow-subtle border">
            {checklist.map(item => (
                <div key={item.id} className={`group flex items-center gap-3 py-2 border-b ${item.is_heading ? '' : 'pl-4'}`}>
                    {!item.is_heading && (
                        <button onClick={() => handleToggle(item.id)} className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${item.is_done ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-primary'}`}>
                             {item.is_done && <CheckIcon className="w-4 h-4" />}
                        </button>
                    )}
                    <span className={`flex-grow ${item.is_heading ? 'font-bold text-lg text-primary' : ''} ${item.is_done ? 'line-through text-slate-400' : 'text-dark'}`}>
                        {item.text}
                    </span>
                    <Button variant="ghost" size="sm" className="!p-1.5 opacity-0 group-hover:opacity-100" onClick={() => handleDelete(item.id)}>
                        <TrashIcon className="w-4 h-4 text-red-500" />
                    </Button>
                </div>
            ))}
            <form onSubmit={handleAddItem} className="flex gap-2 mt-4 pt-4 border-t">
                <Input value={newItemText} onChange={e => setNewItemText(e.target.value)} placeholder="Novo item..." className="flex-grow" />
                <select value={newItemType} onChange={e => setNewItemType(e.target.value as any)} className="p-2 bg-white border border-slate-300 rounded-lg text-slate-900">
                    <option value="item">Item</option>
                    <option value="heading">Título</option>
                </select>
                <Button type="submit">Adicionar</Button>
            </form>
        </div>
    );
};


// --- Forms ---

const ItineraryForm: React.FC<{ onSave: (item: any, id?: string) => void, onClose: () => void, initialData?: ItineraryItem, tripStartDate?: string | null }> = ({ onSave, onClose, initialData, tripStartDate }) => {
    const [itemDate, setItemDate] = useState(initialData?.item_date || tripStartDate || new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState(initialData?.start_time || '');
    const [endTime, setEndTime] = useState(initialData?.end_time || '');
    const [category, setCategory] = useState<ItineraryCategory>(initialData?.category || 'activity');
    const [description, setDescription] = useState(initialData?.description || '');
    const [notes, setNotes] = useState(initialData?.details?.notes || '');
    const [cost, setCost] = useState(initialData?.cost || 0);

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if(!description) return; onSave({ item_date: itemDate, start_time: startTime || null, end_time: endTime || null, category, description, details: { notes: notes || undefined }, cost: cost || null }, initialData?.id); };
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (Ex: Jantar no Restaurante X)" required autoFocus />
            <div className="flex flex-wrap gap-2">
                <SegmentedControl value={category} onChange={(v) => setCategory(v as ItineraryCategory)} options={[ { label: 'Atividade', value: 'activity' }, { label: 'Comida', value: 'food' }, { label: 'Voo', value: 'flight' }, { label: 'Hotel', value: 'accommodation' }, { label: 'Transporte', value: 'transport' } ]}/>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input type="date" value={itemDate} onChange={e => setItemDate(e.target.value)} required className="sm:col-span-1"/>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="sm:col-span-1" />
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="sm:col-span-1"/>
            </div>
             <div>
                <label className="font-medium text-sm text-slate-700 block mb-1">Custo (Opcional)</label>
                <CurrencyInput value={cost || 0} onValueChange={setCost} />
             </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações (nº de reserva, endereço, etc.)" rows={3} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"></textarea>
            <div className="flex justify-end gap-3 pt-4 border-t"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
        </form>
    );
};

const ExpenseForm: React.FC<{ onSave: (item: any, id?: string) => void, onClose: () => void, initialData?: TripExpense, tripStartDate?: string | null }> = ({ onSave, onClose, initialData, tripStartDate }) => {
    const [description, setDescription] = useState(initialData?.description || '');
    const [amount, setAmount] = useState(initialData?.amount || 0);
    const [category, setCategory] = useState<TripExpenseCategory>(initialData?.category || 'food');
    const [paymentDate, setPaymentDate] = useState(initialData?.payment_date || tripStartDate || new Date().toISOString().split('T')[0]);
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if(!description || amount <= 0) return; onSave({ description, amount, category, payment_date: paymentDate }, initialData?.id); };
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição da Despesa" required autoFocus />
            <CurrencyInput value={amount} onValueChange={setAmount} />
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
            <SegmentedControl value={category} onChange={(v) => setCategory(v as TripExpenseCategory)} options={[ {label: 'Transporte', value: 'transport'}, {label: 'Hotel', value: 'accommodation'}, {label: 'Comida', value: 'food'}, {label: 'Atividades', value: 'activities'}, {label: 'Compras', value: 'shopping'}, {label: 'Outros', value: 'other'} ]}/>
            <div className="flex justify-end gap-3 pt-4 border-t"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
        </form>
    );
};

const GalleryForm: React.FC<{ onSave: (file: File, caption: string) => Promise<void>, onClose: () => void }> = ({ onSave, onClose }) => {
    const [caption, setCaption] = useState('');
    const [imageFile, setImageFile] = useState<File|null>(null);
    const [preview, setPreview] = useState<string|null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsSaving(true);
            const compressed = await compressImage(file, 1920, 0.8);
            setImageFile(compressed);
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result as string);
            reader.readAsDataURL(compressed);
            setIsSaving(false);
        }
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!imageFile) return;
        setIsSaving(true);
        try { await onSave(imageFile, caption); onClose(); }
        catch (error) { alert(`Erro no upload: ${error instanceof Error ? error.message : 'Erro desconhecido'}`); }
        finally { setIsSaving(false); }
    };
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="file" accept="image/*" onChange={handleFileChange} required/>
            {preview && <img src={preview} alt="Preview" className="w-full h-auto max-h-60 object-contain rounded-lg bg-slate-100"/>}
            <Input type="text" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Legenda (opcional)" />
            <div className="flex justify-end gap-3 pt-4 border-t"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={isSaving || !imageFile}>{isSaving ? 'Enviando...' : 'Salvar Foto'}</Button></div>
        </form>
    );
};

export default TripDetailView;
