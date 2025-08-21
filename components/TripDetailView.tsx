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
                <ExpenseForm onSave={handleSaveExpense} onClose={() => setExpenseModal({ open: false })} initial