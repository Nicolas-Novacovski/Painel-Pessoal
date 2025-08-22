import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Trip, ItineraryItem, TripExpense, ChecklistItem, ItineraryCategory, GalleryItem, TripExpenseCategory } from '../types';
import { supabase } from '../utils/supabase';
import { Button, Modal, Input, SegmentedControl, CurrencyInput } from './UIComponents';
import { ChevronLeftIcon, PlusIcon, CalendarDaysIcon, RouteIcon, CurrencyDollarIcon, ClipboardDocumentCheckIcon, PhotoIcon, TrashIcon, PencilIcon, PaperAirplaneIcon, HomeIcon, RestaurantIcon, SparklesIcon, TruckIcon, LightBulbIcon, CameraIcon, XMarkIcon, ShoppingBagIcon, QuestionMarkCircleIcon, LinkIcon, CheckIcon, TicketIcon, ClockIcon } from './Icons';
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
        if (!window.confirm("Tem certeza que deseja apagar esta foto?")) return;
        const imagePath = new URL(item.image_url).pathname.split('/trip-images/')[1];
        if(imagePath) await supabase.storage.from('trip-images').remove([imagePath]);
        await supabase.from('trip_gallery_items').delete().eq('id', item.id);
        if (viewingImage?.id === item.id) setViewingImage(null);
        fetchData();
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
            case 'itinerary': return <ItineraryTab trip={trip} itinerary={itinerary} isLoading={isLoading.itinerary} onEdit={(item) => setItineraryModal({ open: true, item })} onDelete={handleDeleteItineraryItem} onAddNew={() => setItineraryModal({ open: true })} />;
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
             <Modal isOpen={!!viewingImage} onClose={() => setViewingImage(null)} title={viewingImage?.caption || 'Galeria'}>
                {viewingImage && (
                    <div className="space-y-2">
                        <img src={viewingImage.image_url} alt={viewingImage.caption || ''} className="w-full max-h-[80vh] object-contain rounded-lg"/>
                        <p className="text-center text-slate-600">{viewingImage.caption}</p>
                    </div>
                )}
            </Modal>
        </>
    );
};

// --- Sub-components (Tabs) ---
const OverviewTab: React.FC<{ trip: Trip; itinerary: ItineraryItem[]; expenses: TripExpense[]; isLoading: boolean }> = ({ trip, itinerary, expenses, isLoading }) => {
    const countdown = useMemo(() => {
        if (!trip.start_date) return null;
        const diff = new Date(trip.start_date).getTime() - new Date().setHours(0,0,0,0);
        if (diff < 0) return { past: true, days: 0 };
        return { past: false, days: Math.ceil(diff / (1000 * 60 * 60 * 24)) };
    }, [trip.start_date]);
    
    const totalSpent = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
    const budgetRemaining = trip.budget ? trip.budget - totalSpent : null;
    
    if (isLoading) return <p>Carregando visão geral...</p>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <div className="bg-blue-50 p-6 rounded-2xl text-center border border-blue-200">
                <h3 className="font-bold text-blue-900 text-lg">Contagem Regressiva</h3>
                {countdown ? (
                    countdown.past ? (
                        <p className="text-4xl font-bold text-blue-700 mt-2">Viagem concluída!</p>
                    ) : (
                        <p className="text-5xl font-bold text-blue-700 mt-2">{countdown.days} <span className="text-2xl">dias</span></p>
                    )
                ) : (
                    <p className="text-slate-500 mt-2">Defina uma data de início.</p>
                )}
            </div>
             <div className="bg-green-50 p-6 rounded-2xl text-center border border-green-200">
                <h3 className="font-bold text-green-900 text-lg">Balanço Financeiro</h3>
                {trip.budget ? (
                    <>
                        <p className={`text-4xl font-bold mt-2 ${budgetRemaining! < 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budgetRemaining!)}
                        </p>
                        <p className="text-sm text-slate-500">restantes de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(trip.budget)}</p>
                    </>
                ) : (
                    <p className="text-slate-500 mt-2">Defina um orçamento para acompanhar os gastos.</p>
                )}
            </div>
             <div className="bg-purple-50 p-6 rounded-2xl text-center border border-purple-200">
                <h3 className="font-bold text-purple-900 text-lg">Atividades Planejadas</h3>
                <p className="text-5xl font-bold text-purple-700 mt-2">{itinerary.length}</p>
                <p className="text-sm text-slate-500">itens no roteiro</p>
            </div>
        </div>
    );
};
const ItineraryTab: React.FC<{ trip: Trip; itinerary: ItineraryItem[]; isLoading: boolean; onEdit: (item: ItineraryItem) => void; onDelete: (id: string) => void; onAddNew: () => void; }> = ({ trip, itinerary, isLoading, onEdit, onDelete, onAddNew }) => {
    const itineraryByDate = useMemo(() => {
        return itinerary.reduce((acc, item) => {
            const date = item.item_date;
            if (!acc[date]) acc[date] = [];
            acc[date].push(item);
            return acc;
        }, {} as Record<string, ItineraryItem[]>);
    }, [itinerary]);

    const itineraryCategoryIcons: Record<ItineraryCategory, React.FC<any>> = {
        activity: TicketIcon, flight: PaperAirplaneIcon, accommodation: HomeIcon, food: RestaurantIcon, transport: TruckIcon,
    };

    if (isLoading) return <p>Carregando roteiro...</p>;

    return (
        <div>
            <div className="flex justify-end mb-4">
                <Button onClick={onAddNew}><PlusIcon className="w-5 h-5"/> Adicionar Item</Button>
            </div>
            {Object.keys(itineraryByDate).length === 0 ? (
                <p className="text-center text-slate-500 py-8">Nenhum item no roteiro ainda.</p>
            ) : (
                <div className="space-y-8">
                    {Object.entries(itineraryByDate).map(([date, items]) => (
                        <div key={date}>
                            <h3 className="text-xl font-bold text-dark border-b-2 border-primary/20 pb-2 mb-4">
                                {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                            </h3>
                            <div className="space-y-4">
                                {items.map(item => {
                                    const Icon = itineraryCategoryIcons[item.category] || SparklesIcon;
                                    return (
                                        <div key={item.id} className="group flex gap-4 p-4 bg-white rounded-xl shadow-sm border hover:border-primary/50 transition-all">
                                            <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                                                <Icon className="w-6 h-6 text-primary" />
                                            </div>
                                            <div className="flex-grow">
                                                {(item.start_time || item.end_time) && <p className="font-bold text-primary">{item.start_time?.slice(0,5)} {item.end_time && ` - ${item.end_time.slice(0,5)}`}</p>}
                                                <p className="font-semibold text-lg text-dark">{item.description}</p>
                                                {item.details?.address && <p className="text-sm text-slate-500">{item.details.address}</p>}
                                                {item.details?.notes && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{item.details.notes}</p>}
                                            </div>
                                            <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="sm" onClick={() => onEdit(item)} className="!p-2"><PencilIcon className="w-4 h-4" /></Button>
                                                <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} className="!p-2"><TrashIcon className="w-4 h-4 text-red-500" /></Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
const BudgetTab: React.FC<{ trip: Trip; expenses: TripExpense[]; isLoading: boolean; onEdit: (item: TripExpense) => void; onDelete: (id: string) => void; onAddNew: () => void; }> = ({ trip, expenses, isLoading, onEdit, onDelete, onAddNew }) => {
    const totalSpent = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
    
    const chartData = useMemo(() => {
        const dataByCategory = expenses.reduce((acc, e) => {
            acc[e.category] = (acc[e.category] || 0) + e.amount;
            return acc;
        }, {} as Record<TripExpenseCategory, number>);
        
        const labels = Object.keys(dataByCategory);
        const data = Object.values(dataByCategory);

        return {
            labels,
            datasets: [{
                label: 'Gastos por Categoria',
                data,
                backgroundColor: ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#64748b'],
            }],
        };
    }, [expenses]);
    
    if (isLoading) return <p>Carregando orçamento...</p>;

    return (
        <div>
            <div className="flex justify-end mb-4"><Button onClick={onAddNew}><PlusIcon className="w-5 h-5"/> Adicionar Despesa</Button></div>
            <div className="mb-8 p-6 bg-white rounded-xl shadow-sm border">
                <h3 className="text-xl font-bold text-dark">Resumo do Orçamento</h3>
                <div className="w-full bg-slate-200 rounded-full h-4 mt-4">
                    <div className="bg-primary h-4 rounded-full" style={{ width: `${trip.budget ? Math.min((totalSpent / trip.budget) * 100, 100) : 0}%` }}></div>
                </div>
                <div className="flex justify-between mt-2 text-sm font-semibold">
                    <span className="text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSpent)} gastos</span>
                    {trip.budget && <span className="text-slate-500">de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(trip.budget)}</span>}
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border">
                    <h3 className="text-lg font-bold text-dark mb-4">Gastos por Categoria</h3>
                    <Bar data={chartData} options={{ responsive: true }}/>
                </div>
                 <div className="bg-white p-6 rounded-xl shadow-sm border">
                     <h3 className="text-lg font-bold text-dark mb-4">Lista de Despesas</h3>
                     <div className="space-y-2 max-h-96 overflow-y-auto">
                        {expenses.map(exp => (
                            <div key={exp.id} className="group flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg">
                                <div>
                                    <p className="font-semibold text-dark">{exp.description}</p>
                                    <p className="text-sm text-slate-500">{exp.category} - {new Date(exp.payment_date+'T00:00:00').toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="font-bold text-dark">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(exp.amount)}</span>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="sm" onClick={() => onEdit(exp)} className="!p-1"><PencilIcon className="w-4 h-4" /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => onDelete(exp.id)} className="!p-1"><TrashIcon className="w-4 h-4 text-red-500" /></Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>
            </div>
        </div>
    );
};
const GalleryTab: React.FC<{ trip: Trip; gallery: GalleryItem[]; isLoading: boolean; onSave: (file: File, caption: string) => Promise<void>; onDelete: (item: GalleryItem) => Promise<void>; onFetch: () => void; onSelectImage: (item: GalleryItem) => void }> = ({ trip, gallery, isLoading, onSave, onDelete, onFetch, onSelectImage }) => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [caption, setCaption] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const compressed = await compressImage(file, 1920, 0.8);
            setImageFile(compressed);
        }
    };
    
    const handleUpload = async () => {
        if (!imageFile) return;
        setIsUploading(true);
        try {
            await onSave(imageFile, caption);
            setImageFile(null);
            setCaption('');
            (document.getElementById('gallery-upload') as HTMLInputElement).value = '';
            onFetch();
        } catch(e) {
            alert("Erro ao fazer upload da imagem.");
        } finally {
            setIsUploading(false);
        }
    };

    if(isLoading) return <p>Carregando galeria...</p>;
    
    return (
        <div>
             <div className="p-4 bg-slate-50 rounded-lg border mb-8 flex flex-col sm:flex-row gap-4 items-center">
                <Input type="file" id="gallery-upload" accept="image/*" onChange={handleFileChange} className="flex-grow"/>
                <Input type="text" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Legenda (opcional)" className="flex-grow"/>
                <Button onClick={handleUpload} disabled={!imageFile || isUploading} className="w-full sm:w-auto">
                    {isUploading ? "Enviando..." : "Adicionar Foto"}
                </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {gallery.map(item => (
                    <div key={item.id} className="group relative aspect-square bg-slate-200 rounded-lg overflow-hidden cursor-pointer" onClick={() => onSelectImage(item)}>
                        <img src={item.image_url} alt={item.caption || ''} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                        {item.caption && <p className="absolute bottom-2 left-2 text-white text-sm font-semibold drop-shadow">{item.caption}</p>}
                        <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="!rounded-full !p-1.5 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <TrashIcon className="w-4 h-4"/>
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
};
const ChecklistTab: React.FC<{ trip: Trip; onTripUpdate: (updatedTrip: Trip) => void; }> = ({ trip, onTripUpdate }) => {
    const [checklist, setChecklist] = useState<ChecklistItem[]>(trip.checklist || []);
    const [newItemText, setNewItemText] = useState('');
    const timeoutRef = useRef<number | null>(null);

    const debouncedSave = useCallback((updatedChecklist: ChecklistItem[]) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(async () => {
            const { data, error } = await supabase.from('trips').update({ checklist: updatedChecklist }).eq('id', trip.id).select().single();
            if (error) alert("Erro ao salvar checklist."); else onTripUpdate(data as Trip);
        }, 1000);
    }, [trip.id, onTripUpdate]);

    const handleToggle = (id: string) => {
        const updated = checklist.map(item => item.id === id ? { ...item, is_done: !item.is_done } : item);
        setChecklist(updated);
        debouncedSave(updated);
    };

    const handleAddItem = (isHeading = false) => {
        if (!newItemText.trim()) return;
        const newItem: ChecklistItem = { id: crypto.randomUUID(), text: newItemText, is_done: false, is_heading: isHeading };
        const updated = [...checklist, newItem];
        setChecklist(updated);
        debouncedSave(updated);
        setNewItemText('');
    };

    const handleDeleteItem = (id: string) => {
        const updated = checklist.filter(item => item.id !== id);
        setChecklist(updated);
        debouncedSave(updated);
    };

    return (
        <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex gap-2 mb-4">
                <Input value={newItemText} onChange={e => setNewItemText(e.target.value)} placeholder="Ex: Passaporte, Protetor Solar..." onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
                <Button onClick={() => handleAddItem(false)}><PlusIcon className="w-4 h-4"/> Item</Button>
                <Button onClick={() => handleAddItem(true)} variant="secondary"><PlusIcon className="w-4 h-4"/> Título</Button>
            </div>
            <div className="space-y-2">
                {checklist.map(item => (
                    item.is_heading ? (
                        <h4 key={item.id} className="font-bold text-dark pt-4 text-lg">{item.text}</h4>
                    ) : (
                         <div key={item.id} className="group flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={item.is_done} onChange={() => handleToggle(item.id)} className="w-5 h-5 rounded text-primary focus:ring-primary/50" />
                                <span className={`text-slate-700 ${item.is_done ? 'line-through text-slate-400' : ''}`}>{item.text}</span>
                            </label>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)} className="!p-1 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-4 h-4 text-red-500"/></Button>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
};

// --- Sub-components (Forms) ---
const ItineraryForm: React.FC<{ onSave: (item: Omit<ItineraryItem, 'id' | 'trip_id' | 'is_completed' | 'created_at'>, id?: string) => void, onClose: () => void, initialData?: ItineraryItem, tripStartDate: string | null }> = ({ onSave, onClose, initialData, tripStartDate }) => {
    const [itemDate, setItemDate] = useState(initialData?.item_date || tripStartDate || new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState(initialData?.start_time || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [category, setCategory] = useState<ItineraryCategory>(initialData?.category || 'activity');
    const [cost, setCost] = useState(initialData?.cost || 0);
    const [notes, setNotes] = useState(initialData?.details?.notes || '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ item_date: itemDate, start_time: startTime || null, end_time: null, category, description, cost, details: { notes } }, initialData?.id);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (Ex: Visita ao Museu do Louvre)" required />
            <div className="grid grid-cols-2 gap-4">
                <Input type="date" value={itemDate} onChange={e => setItemDate(e.target.value)} required/>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                 <select value={category} onChange={e => setCategory(e.target.value as ItineraryCategory)} className="w-full p-2 bg-white border border-slate-300 rounded-lg">
                    <option value="activity">Atividade</option><option value="flight">Voo</option><option value="accommodation">Hospedagem</option><option value="food">Refeição</option><option value="transport">Transporte</option>
                </select>
                <CurrencyInput value={cost} onValueChange={setCost} placeholder="Custo (opcional)"/>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações (nº reserva, endereço, etc.)" rows={3} className="w-full p-2 bg-white border border-slate-300 rounded-lg" />
            <div className="flex justify-end gap-3 pt-4 border-t"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
        </form>
    );
};
const ExpenseForm: React.FC<{ onSave: (expense: Omit<TripExpense, 'id'|'trip_id'|'created_at'|'itinerary_item_id'>, id?: string) => void, onClose: () => void, initialData?: TripExpense, tripStartDate: string | null }> = ({ onSave, onClose, initialData, tripStartDate }) => {
    const [description, setDescription] = useState(initialData?.description || '');
    const [amount, setAmount] = useState(initialData?.amount || 0);
    const [category, setCategory] = useState<TripExpenseCategory>(initialData?.category || 'food');
    const [paymentDate, setPaymentDate] = useState(initialData?.payment_date || tripStartDate || new Date().toISOString().split('T')[0]);
    
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave({ description, amount, category, payment_date: paymentDate, user_email: null }, initialData?.id); };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição da Despesa" required />
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="Valor Gasto" />
            <div className="grid grid-cols-2 gap-4">
                <select value={category} onChange={e => setCategory(e.target.value as TripExpenseCategory)} className="w-full p-2 bg-white border border-slate-300 rounded-lg">
                    <option value="food">Alimentação</option><option value="transport">Transporte</option><option value="accommodation">Hospedagem</option><option value="activities">Atividades</option><option value="shopping">Compras</option><option value="other">Outro</option>
                </select>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required/>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
        </form>
    );
};

export default TripDetailView;