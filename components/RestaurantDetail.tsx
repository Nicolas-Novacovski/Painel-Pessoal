
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Restaurant, Review, User, Location, Memory, DatePlan, UserProfile } from '../types';
import { averageRating, slugify, compressImage } from '../utils/helpers';
import { MapPinIcon, StarIcon, TrashIcon, UberIcon, PencilIcon, GoogleIcon, CameraIcon, PlusIcon, XMarkIcon, PlayIcon, HeartIcon, TagIcon, SparklesIcon, ChevronDownIcon, ArrowPathIcon, CheckIcon, HomeIcon, RouteIcon } from './Icons';
import { Button, PriceRatingDisplay, StarRatingDisplay, StarRatingInput, Modal, Input, PriceRatingInput } from './UIComponents';
import DatePlannerForm from './DatePlannerForm';
import { supabase } from '../utils/supabase';
import { USERS } from '../constants';
import { GoogleGenAI } from "@google/genai";
import L from 'leaflet';

// --- Interactive Map Component ---
const InteractiveMap: React.FC<{
    restaurantLocation: Location | null;
    userLocation: { lat: number; lng: number } | null;
    showHome: boolean;
}> = ({ restaurantLocation, userLocation, showHome }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.FeatureGroup | null>(null);
    const routeControlRef = useRef<any | null>(null);


    // Initialize map
    useEffect(() => {
        if (mapRef.current === null && mapContainerRef.current) {
            mapRef.current = L.map(mapContainerRef.current, { scrollWheelZoom: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapRef.current);
            markersRef.current = L.featureGroup().addTo(mapRef.current);

            setTimeout(() => mapRef.current?.invalidateSize(), 300);
        }
    }, []);

    // Update markers and view
    useEffect(() => {
        const map = mapRef.current;
        const markers = markersRef.current;
        if (!map || !markers) return;

        // Limpa rota e marcadores antigos
        if (routeControlRef.current) {
            map.removeControl(routeControlRef.current);
            routeControlRef.current = null;
        }
        markers.clearLayers();

        const restaurantIconHtml = `<div style="background-color: #0284c7; border-radius: 9999px; padding: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="white" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5c0-.621-.504-1.125-1.125-1.125h-2.25c.621 0 1.125.504 1.125 1.125V21M3 6.375c0-.621.504-1.125 1.125-1.125h15.75c.621 0 1.125.504 1.125 1.125v10.5A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V6.375z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 21a2.25 2.25 0 0 0 2.25-2.25v-1.125c0-.621-.504-1.125-1.125-1.125-2.254 0-4.49-1.21-6.096-3.132-1.606-1.922-3.23-1.922-4.836 0-1.606 1.922-3.842 3.132-6.096 3.132C3.504 16.5 3 17.004 3 17.625v1.125c0 1.242 1.008 2.25 2.25 2.25h14.25zM12 18.75h.008v.008H12v-.008z" /></svg></div>`;
        const homeIconHtml = `<div style="background-color: #ec4899; border-radius: 9999px; padding: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="white" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.955-8.955a1.125 1.125 0 0 1 1.59 0L21.75 12" /><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5" /></svg></div>`;
        const restaurantIcon = L.divIcon({ html: restaurantIconHtml, className: 'bg-transparent border-none', iconSize: [32, 32], iconAnchor: [16, 32] });
        const homeIcon = L.divIcon({ html: homeIconHtml, className: 'bg-transparent border-none', iconSize: [32, 32], iconAnchor: [16, 32] });
        
        const hasRestaurantCoords = restaurantLocation?.latitude && restaurantLocation?.longitude;

        if (showHome && userLocation && hasRestaurantCoords) {
            const userLatLng = L.latLng(userLocation.lat, userLocation.lng);
            const restaurantLatLng = L.latLng(restaurantLocation!.latitude!, restaurantLocation!.longitude!);
            
            L.marker(userLatLng, { icon: homeIcon }).addTo(markers);
            L.marker(restaurantLatLng, { icon: restaurantIcon }).addTo(markers);
            
            const control = (L as any).Routing.control({
                waypoints: [userLatLng, restaurantLatLng],
                routeWhileDragging: false,
                show: false,
                addWaypoints: false,
                draggableWaypoints: false,
                lineOptions: {
                    styles: [{ color: '#0284c7', opacity: 0.8, weight: 6 }]
                },
                createMarker: () => null
            }).addTo(map);

            routeControlRef.current = control;
            
            // FIX: Fit bounds to show both markers and the route
            const bounds = markers.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }

        } else if (hasRestaurantCoords) {
            const restaurantLatLng = L.latLng(restaurantLocation!.latitude!, restaurantLocation!.longitude!);
            L.marker(restaurantLatLng, { icon: restaurantIcon }).addTo(markers);
            map.setView(restaurantLatLng, 15);
        } else {
             map.setView([-25.4284, -49.2733], 13);
        }
        
    }, [restaurantLocation, userLocation, showHome]);


    return <div ref={mapContainerRef} className="h-60 w-full bg-slate-200 rounded-lg overflow-hidden border border-slate-300 z-0" />;
};


interface RestaurantDetailProps {
    restaurant: Restaurant & { is_favorited: boolean };
    currentUser: UserProfile;
    onUpdateReview: (restaurantId: string, review: Review) => Promise<void>;
    onUpdatePriceRange: (restaurantId: string, priceRange: number) => Promise<void>;
    onUpdateGoogleRating: (restaurantId: string, rating: number | null, count: number | null) => Promise<void>;
    onUpdateMemories: (restaurantId: string, memories: Memory[]) => Promise<void>;
    onUpdatePromotions: (restaurantId: string, promotions: string) => Promise<void>;
    onSaveDatePlan: (plan: Omit<DatePlan, 'id' | 'created_at'>) => Promise<void>;
    onEdit: (restaurant: Restaurant) => void;
    onRemoveFromList: (id: string) => Promise<void>;
    onToggleFavorite: (id: string, currentState: boolean) => Promise<void>;
    onUpdateLocation: (restaurantId: string, location: Location) => Promise<void>;
}

export const RestaurantDetail: React.FC<RestaurantDetailProps> = ({ restaurant, currentUser, onUpdateReview, onUpdatePriceRange, onUpdateGoogleRating, onUpdateMemories, onUpdatePromotions, onSaveDatePlan, onEdit, onRemoveFromList, onToggleFavorite, onUpdateLocation }) => {
    // Review State
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [isSavingReview, setIsSavingReview] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(restaurant.locations?.[0] || null);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
    const [isGeocoding, setIsGeocoding] = useState<string | null>(null);
    const [showHome, setShowHome] = useState(false);

    // Google Rating State
    const [isEditingGoogleRating, setIsEditingGoogleRating] = useState(false);
    const [tempGoogleRating, setTempGoogleRating] = useState(restaurant.google_rating?.toString() || '');
    const [tempGoogleRatingCount, setTempGoogleRatingCount] = useState(restaurant.google_rating_count?.toString() || '');

    // Date Planner State
    const [isDatePlannerOpen, setIsDatePlannerOpen] = useState(false);
    const [isSavingDate, setIsSavingDate] = useState(false);

    // Promotions State
    const [isFetchingPromotions, setIsFetchingPromotions] = useState(false);
    const [isPromotionsOpen, setIsPromotionsOpen] = useState(false);

    // Memories State
    const memories = useMemo(() => restaurant.memories || [], [restaurant.memories]);
    const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
    const [newMemoryCaption, setNewMemoryCaption] = useState('');
    const [newMemoryFiles, setNewMemoryFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<{ id: string, src: string, file: File, type: 'image' | 'video' }[]>([]);
    const [isSavingMemory, setIsSavingMemory] = useState(false);
    const [isProcessingMemory, setIsProcessingMemory] = useState(false);
    const [viewingMemory, setViewingMemory] = useState<Memory | null>(null);
    const [isEditingDate, setIsEditingDate] = useState(false);
    const [editingMonth, setEditingMonth] = useState(1);
    const [editingYear, setEditingYear] = useState(new Date().getFullYear());

    const userHasLocation = !!currentUser.latitude && !!currentUser.longitude;
    const userLocation = userHasLocation ? { lat: currentUser.latitude!, lng: currentUser.longitude! } : null;

    const partner = useMemo(() => USERS.find(u => u !== currentUser.name && u !== 'Visitante'), [currentUser.name]);

    const handleStartEditingDate = (memory: Memory) => {
        const memoryDate = new Date(memory.created_at);
        setEditingMonth(memoryDate.getUTCMonth() + 1); // getUTCMonth is 0-indexed
        setEditingYear(memoryDate.getUTCFullYear());
        setIsEditingDate(true);
    };

    const handleSaveDateChange = async (memoryToUpdate: Memory) => {
        const originalDate = new Date(memoryToUpdate.created_at);
        const originalDay = originalDate.getUTCDate();
        const originalHours = originalDate.getUTCHours();
        const originalMinutes = originalDate.getUTCMinutes();
        const originalSeconds = originalDate.getUTCSeconds();

        // Find the last day of the target month to prevent rollovers (e.g., March 31 to Feb)
        const lastDayOfTargetMonth = new Date(Date.UTC(editingYear, editingMonth, 0)).getUTCDate();
        const newDay = Math.min(originalDay, lastDayOfTargetMonth);

        const newDate = new Date(Date.UTC(
            editingYear,
            editingMonth - 1, // month is 0-indexed in JS
            newDay,
            originalHours,
            originalMinutes,
            originalSeconds
        ));
        const newDateIsoString = newDate.toISOString();

        const updatedMemories = memories.map(mem =>
            mem.id === memoryToUpdate.id ? { ...mem, created_at: newDateIsoString } : mem
        );

        await onUpdateMemories(restaurant.id, updatedMemories);
        
        setViewingMemory(prev => prev ? { ...prev, created_at: newDateIsoString } : null);
        setIsEditingDate(false);
    };

    const handleCloseViewingMemory = () => {
        setViewingMemory(null);
        setIsEditingDate(false);
    };


    useEffect(() => {
        const existingReview = restaurant.reviews.find(r => r.user === currentUser.name);
        setRating(existingReview?.rating || 0);
        setComment(existingReview?.comment || '');
        if (!selectedLocation && restaurant.locations?.length > 0) {
            setSelectedLocation(restaurant.locations[0]);
        }
    }, [restaurant, currentUser.name, selectedLocation]);

    const handleReviewSubmit = async () => {
        if(rating > 0) {
            setIsSavingReview(true);
            await onUpdateReview(restaurant.id, { user: currentUser.name as User, rating, comment });
            setIsSavingReview(false);
        }
    };

    const handleStartEditGoogleRating = () => {
        setTempGoogleRating(restaurant.google_rating?.toString() || '');
        setTempGoogleRatingCount(restaurant.google_rating_count?.toString() || '');
        setIsEditingGoogleRating(true);
    };

    const handleCancelGoogleRating = () => {
        setIsEditingGoogleRating(false);
    };

    const handleSaveGoogleRating = async () => {
        const newRating = tempGoogleRating ? parseFloat(tempGoogleRating) : null;
        const newCount = tempGoogleRatingCount ? parseInt(tempGoogleRatingCount, 10) : null;
        
        if (newRating !== null && (newRating < 0 || newRating > 5)) {
            alert("A nota do Google deve ser entre 0 e 5.");
            return;
        }
        
        await onUpdateGoogleRating(restaurant.id, newRating, newCount);
        setIsEditingGoogleRating(false);
    };
    
    const handleMemoryModalClose = () => {
        setIsMemoryModalOpen(false);
        setNewMemoryFiles([]);
        setPreviews([]);
        setNewMemoryCaption('');
    };

    const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsProcessingMemory(true);

        const processedFiles: File[] = [];
        const newPreviews: { id: string, src: string, file: File, type: 'image' | 'video' }[] = [];

        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            if (isVideo && file.size > 25 * 1024 * 1024) {
                alert(`O vídeo "${file.name}" é muito grande! O limite é de 25MB.`);
                continue;
            }

            try {
                const processedFile = isVideo ? file : await compressImage(file);
                processedFiles.push(processedFile);

                const previewSrc = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file); // Use original file for preview to be fast
                });
                
                newPreviews.push({
                    id: crypto.randomUUID(),
                    src: previewSrc,
                    file: processedFile,
                    type: isVideo ? 'video' : 'image',
                });
            } catch (error) {
                console.error("Error processing file:", error);
                alert(`Houve um problema ao processar o arquivo "${file.name}".`);
            }
        }
        
        setNewMemoryFiles(prev => [...prev, ...processedFiles]);
        setPreviews(prev => [...prev, ...newPreviews]);
        setIsProcessingMemory(false);
        e.target.value = ''; // Reset input to allow re-selecting same files
    };
    
    const removePreview = (id: string) => {
        const previewToRemove = previews.find(p => p.id === id);
        if (!previewToRemove) return;
        
        setPreviews(prev => prev.filter(p => p.id !== id));
        setNewMemoryFiles(prev => prev.filter(f => f !== previewToRemove.file));
    };


    const handleSaveMemory = async () => {
        if (newMemoryFiles.length === 0) {
            alert('Por favor, selecione uma imagem ou vídeo.');
            return;
        }
        setIsSavingMemory(true);
        try {
            const newMemories: Memory[] = [];
            
            const uploadPromises = newMemoryFiles.map(async (file) => {
                 const fileExt = file.name.split('.').pop();
                 const fileName = `${slugify(currentUser.name)}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
                 const filePath = `${restaurant.id}/${fileName}`;
            
                const { error: uploadError } = await supabase.storage
                    .from('memory-images')
                    .upload(filePath, file);
                
                 if (uploadError) {
                    if (uploadError.message.includes('Bucket not found')) {
                        alert("Erro de Configuração: O bucket 'memory-images' não foi encontrado no Supabase Storage.\n\nPor favor, crie um bucket público chamado 'memory-images' no seu painel do Supabase.");
                    }
                    throw uploadError;
                }

                 const { data: urlData } = supabase.storage.from('memory-images').getPublicUrl(filePath);
                 
                 const newMemory: Memory = {
                    id: crypto.randomUUID(),
                    created_by_user: currentUser.name as User,
                    image_url: urlData.publicUrl,
                    caption: newMemoryCaption,
                    created_at: new Date().toISOString(),
                    type: file.type.startsWith('video/') ? 'video' : 'image',
                };
                newMemories.push(newMemory);
            });

            await Promise.all(uploadPromises);

            const updatedMemories = [...memories, ...newMemories];
            await onUpdateMemories(restaurant.id, updatedMemories);
            
            handleMemoryModalClose();

        } catch (error) {
            const err = error as Error;
            console.error("Error saving memories:", err);
            alert(`Erro ao salvar as memórias: ${err.message}`);
        } finally {
            setIsSavingMemory(false);
        }
    };
    
    const handleDeleteMemory = async (memoryToDelete: Memory) => {
        if (window.confirm('Tem certeza que deseja apagar esta memória?')) {
            try {
                const imagePath = new URL(memoryToDelete.image_url).pathname.split('/memory-images/')[1];
                
                if (imagePath) {
                    const { error: storageError } = await supabase.storage
                        .from('memory-images')
                        .remove([imagePath]);
                    
                    if (storageError && storageError.message !== 'The resource was not found') {
                        throw storageError;
                    }
                }
                
                const updatedMemories = memories.filter(m => m.id !== memoryToDelete.id);
                await onUpdateMemories(restaurant.id, updatedMemories);
                if (viewingMemory?.id === memoryToDelete.id) {
                    setViewingMemory(null);
                }

            } catch (error) {
                const err = error as Error;
                console.error('Error deleting memory', err);
                alert(`Não foi possível apagar a memória: ${err.message}`);
            }
        }
    }

    const handleProposeDate = async (datetime: string) => {
        if (!partner) return;
        setIsSavingDate(true);
        try {
            const participantStatus = {
                [currentUser.name]: 'accepted',
                [partner]: 'pending'
            };
    
            const planData = {
                restaurant_id: restaurant.id,
                restaurant_name: restaurant.name,
                restaurant_image_url: restaurant.image,
                created_by: currentUser.name as User,
                proposed_datetime: datetime,
                status: 'pending' as const,
                participants_status: participantStatus
            };
            
            await onSaveDatePlan(planData);
            setIsDatePlannerOpen(false);

        } catch (err) {
            console.error("Error proposing date:", err);
            alert("Não foi possível salvar a proposta de date.");
        } finally {
            setIsSavingDate(false);
        }
    };

    const handleNavigate = async () => {
        if (!selectedLocation?.address) {
            alert('Selecione um endereço para navegar.');
            return;
        }

        setCopyStatus('copying');
        const textToCopy = `${restaurant.name}, ${selectedLocation.address}`;

        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopyStatus('copied');

            // Open Uber app or website
            window.open('https://m.uber.com/ul', '_blank');

            // Reset the button state after 3 seconds
            setTimeout(() => setCopyStatus('idle'), 3000);
        } catch (err) {
            console.error('Failed to copy address:', err);
            alert('Não foi possível copiar o endereço. Por favor, copie manualmente.');
            setCopyStatus('idle');
        }
    };
    
    const handleFetchPromotions = useCallback(async () => {
        setIsFetchingPromotions(true);
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});
            const prompt = `
Pesquise na internet por promoções, happy hour, ou descontos semanais para o restaurante "${restaurant.name}", localizado em Curitiba, PR.
Priorize informações de fontes oficiais do restaurante ou de guias confiáveis.
Retorne um resumo conciso em formato de lista (usando '-') ou um parágrafo.
Se nenhuma promoção ativa for encontrada, retorne APENAS a frase: "Nenhuma promoção encontrada."
`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{googleSearch: {}}],
                },
            });

            const resultText = response.text?.trim();
            if (!resultText) {
                throw new Error("A IA não retornou nenhuma informação. Tente novamente.");
            }

            await onUpdatePromotions(restaurant.id, resultText);

        } catch (error) {
            console.error("Error fetching promotions:", error);
            const errorMessage = (error instanceof Error) ? error.message : "Ocorreu um erro desconhecido.";
            alert(`Ocorreu um erro ao buscar as promoções com a IA: ${errorMessage}`);
        } finally {
            setIsFetchingPromotions(false);
        }
    }, [restaurant.id, restaurant.name, onUpdatePromotions]);

    const handleRefreshLocation = async (location: Location) => {
        if (!location.address) {
            alert("O endereço está vazio e não pode ser geocodificado.");
            return;
        }
        setIsGeocoding(location.address);
        await onUpdateLocation(restaurant.id, location);
        setIsGeocoding(null);
    };


    const calculatedAverageRating = averageRating(restaurant.reviews);

    const getMemoryButtonText = () => {
        if(isSavingMemory) return 'Salvando...';
        if(isProcessingMemory) return 'Processando...';
        return `Salvar ${newMemoryFiles.length > 1 ? `${newMemoryFiles.length} Memórias` : 'Memória'}`;
    }
    
    const isNavDisabled = !selectedLocation || !selectedLocation.address;

    const getUberButtonText = () => {
        if (copyStatus === 'copying') return 'Copiando...';
        if (copyStatus === 'copied') return 'Endereço Copiado!';
        return 'Ir com a Uber';
    };

    const hasMenu = !!restaurant.menu_url;
    
    const partnerReview = partner ? restaurant.reviews.find(r => r.user === partner) : null;

    return (
        <>
            <div className="space-y-6">
                <div className="relative">
                    <InteractiveMap 
                        restaurantLocation={selectedLocation}
                        userLocation={userLocation}
                        showHome={showHome}
                    />
                    <div className="absolute top-3 right-3 z-[500] flex flex-col gap-2">
                        {userHasLocation && selectedLocation?.latitude && (
                            <Button 
                                variant={showHome ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => setShowHome(!showHome)}
                                className="!p-2 shadow-lg !bg-white/80 hover:!bg-white"
                                title={showHome ? "Ocultar rota" : "Mostrar rota de casa"}
                            >
                                <HomeIcon className={`w-5 h-5 ${showHome ? 'text-primary' : 'text-slate-600'}`}/>
                            </Button>
                        )}
                    </div>
                </div>
                
                <div className="space-y-2">
                    <h4 className="font-bold text-lg text-slate-800">Endereços</h4>
                    <div className="flex flex-wrap gap-2">
                        {restaurant.locations?.map((loc, index) => {
                             const hasCoords = loc.latitude && loc.longitude;
                             return (
                                <div key={index} className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg group">
                                    <button 
                                        onClick={() => setSelectedLocation(loc)}
                                        className={`flex items-center gap-2 text-left px-2 py-1 rounded-md transition-colors w-full ${selectedLocation?.address === loc.address ? 'bg-primary/20' : 'hover:bg-slate-200'}`}
                                    >
                                         <MapPinIcon className={`w-5 h-5 flex-shrink-0 ${selectedLocation?.address === loc.address ? 'text-primary' : (hasCoords ? 'text-slate-500' : 'text-red-400')}`} title={!hasCoords ? "Coordenadas ausentes" : ""} />
                                        <span className="text-sm font-medium text-slate-700">{loc.address}</span>
                                    </button>
                                    {!hasCoords && (
                                        <Button
                                            variant="ghost" 
                                            size="sm"
                                            className="!p-1.5"
                                            onClick={() => handleRefreshLocation(loc)}
                                            disabled={isGeocoding === loc.address}
                                            title="Buscar coordenadas com IA"
                                        >
                                            <ArrowPathIcon className={`w-4 h-4 ${isGeocoding === loc.address ? 'animate-spin' : 'text-red-500 group-hover:text-primary'}`} />
                                        </Button>
                                    )}
                                </div>
                             )
                        })}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={handleNavigate} disabled={isNavDisabled} className="flex-1">
                         <UberIcon className="w-5 h-5"/>
                         {getUberButtonText()}
                    </Button>
                    <Button onClick={() => setIsDatePlannerOpen(true)} variant="accent" className="flex-1">
                        <HeartIcon className="w-5 h-5"/>
                        Propor um Date
                    </Button>
                     {hasMenu && <Button onClick={() => window.open(restaurant.menu_url!, '_blank')} variant="secondary" className="flex-1">Ver Cardápio</Button>}
                </div>
                
                <div className="p-4 bg-slate-100/70 rounded-lg border border-slate-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-1">
                            <h4 className="font-bold text-dark mb-2">Nossa Avaliação ({calculatedAverageRating.toFixed(1)})</h4>
                             <div className="space-y-2">
                                <div className="p-2 bg-white/50 rounded">
                                    <p className="font-semibold text-sm">{currentUser.name === 'Nicolas' ? 'Nicolas' : 'Ana'}</p>
                                    <StarRatingDisplay rating={restaurant.reviews.find(r => r.user === currentUser.name)?.rating || 0} />
                                </div>
                                {partnerReview && (
                                     <div className="p-2 bg-white/50 rounded">
                                        <p className="font-semibold text-sm">{partner === 'Nicolas' ? 'Nicolas' : 'Ana'}</p>
                                        <StarRatingDisplay rating={partnerReview.rating} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                             <h4 className="font-bold text-dark mb-2">Sua vez de avaliar!</h4>
                             <StarRatingInput rating={rating} setRating={setRating} />
                             <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Deixe um comentário..." className="mt-2 w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"></textarea>
                             <Button onClick={handleReviewSubmit} disabled={isSavingReview || rating === 0} size="sm" className="mt-2">
                                 {isSavingReview ? 'Salvando...' : 'Salvar Avaliação'}
                             </Button>
                        </div>
                    </div>
                     <div className="pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                             <h4 className="font-bold text-dark mb-2 flex items-center gap-1.5"><TagIcon className="w-4 h-4"/> Preço</h4>
                             <PriceRatingInput rating={restaurant.price_range || 0} setRating={(newPrice) => onUpdatePriceRange(restaurant.id, newPrice)} />
                        </div>
                        <div className="sm:col-span-2">
                            <h4 className="font-bold text-dark mb-2 flex items-center gap-1.5"><GoogleIcon className="w-4 h-4"/> Google</h4>
                            {isEditingGoogleRating ? (
                                <div className="flex items-center gap-2">
                                    <Input type="number" step="0.1" value={tempGoogleRating} onChange={e => setTempGoogleRating(e.target.value)} placeholder="Nota" className="w-24" />
                                    <Input type="number" value={tempGoogleRatingCount} onChange={e => setTempGoogleRatingCount(e.target.value)} placeholder="Avaliações" className="w-28" />
                                    <Button size="sm" onClick={handleSaveGoogleRating}><CheckIcon className="w-4 h-4"/></Button>
                                    <Button size="sm" variant="secondary" onClick={handleCancelGoogleRating}><XMarkIcon className="w-4 h-4"/></Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 group">
                                    <StarRatingDisplay rating={restaurant.google_rating || 0} />
                                    <span className="text-sm font-semibold">{restaurant.google_rating?.toFixed(1) || 'N/A'}</span>
                                    <span className="text-xs text-slate-500">({restaurant.google_rating_count || 0})</span>
                                    <Button variant="ghost" size="sm" className="!p-1 opacity-0 group-hover:opacity-100" onClick={handleStartEditGoogleRating}><PencilIcon className="w-4 h-4"/></Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- Memories --- */}
                <div className="p-4 bg-slate-100/70 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-lg text-dark">Nossas Memórias</h4>
                        <Button onClick={() => setIsMemoryModalOpen(true)}><CameraIcon className="w-5 h-5" /> Adicionar</Button>
                    </div>
                    {memories.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {memories.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(memory => (
                                <div key={memory.id} className="group relative aspect-square bg-slate-300 rounded-lg overflow-hidden cursor-pointer" onClick={() => setViewingMemory(memory)}>
                                    <img src={memory.image_url} alt={memory.caption} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    {memory.type === 'video' && (
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                            <PlayIcon className="w-10 h-10 text-white/80"/>
                                        </div>
                                    )}
                                     <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                                        <p className="text-white text-xs font-semibold truncate">{memory.caption}</p>
                                        <p className="text-white/80 text-xs">{new Date(memory.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                    </div>
                                    {memory.created_by_user === currentUser.name &&
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteMemory(memory); }} className="absolute top-1 right-1 bg-black/40 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                                            <TrashIcon className="w-3 h-3"/>
                                        </button>
                                    }
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-slate-500 py-4">Nenhuma memória adicionada ainda.</p>
                    )}
                </div>

                <div className="p-4 bg-slate-100/70 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-lg text-dark">Promoções Semanais</h4>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleFetchPromotions}
                            disabled={isFetchingPromotions}
                        >
                            <SparklesIcon className={`w-4 h-4 ${isFetchingPromotions ? 'animate-spin' : ''}`} />
                            {isFetchingPromotions ? 'Buscando...' : 'Buscar com IA'}
                        </Button>
                    </div>
                     <div className="p-2 text-sm text-slate-700 whitespace-pre-wrap">
                        {restaurant.weekly_promotions ? restaurant.weekly_promotions.replace(/(\r\n|\n|\r)/gm, "\n") : <p className="italic text-slate-500">Clique em "Buscar com IA" para procurar por promoções e happy hours.</p>}
                     </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t mt-6">
                    <Button variant="danger" size="sm" onClick={() => onRemoveFromList(restaurant.id)}>
                        <TrashIcon className="w-4 h-4" /> Remover da Lista
                    </Button>
                    <div className="flex items-center gap-2">
                         <button
                            onClick={() => onToggleFavorite(restaurant.id, restaurant.is_favorited)}
                            className={`p-2 rounded-full transition-colors ${restaurant.is_favorited ? 'text-red-500 bg-red-100' : 'text-slate-500 bg-slate-200 hover:bg-slate-300'}`}
                            aria-label={restaurant.is_favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        >
                            <HeartIcon className="w-6 h-6" />
                        </button>
                        <Button variant="secondary" size="sm" onClick={() => onEdit(restaurant)}><PencilIcon className="w-4 h-4"/> Editar Detalhes</Button>
                    </div>
                </div>
            </div>

            {/* --- Modals --- */}
            <Modal isOpen={isMemoryModalOpen} onClose={handleMemoryModalClose} title="Adicionar Memória">
                <div className="space-y-4">
                    <label htmlFor="memory-upload" className="w-full cursor-pointer justify-center p-6 border-2 border-dashed border-slate-300 hover:border-primary hover:bg-slate-50 rounded-lg flex flex-col items-center gap-2 text-slate-600">
                        <CameraIcon className="w-8 h-8"/>
                        <span>Clique para escolher fotos ou vídeos</span>
                        <input id="memory-upload" type="file" accept="image/*,video/*" multiple onChange={handleFilesChange} className="hidden" />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {previews.map(p => (
                            <div key={p.id} className="relative group">
                                <img src={p.src} alt="Preview" className="w-full h-24 object-cover rounded"/>
                                <button onClick={() => removePreview(p.id)} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white opacity-0 group-hover:opacity-100"><XMarkIcon className="w-3 h-3"/></button>
                            </div>
                        ))}
                    </div>
                    <Input value={newMemoryCaption} onChange={e => setNewMemoryCaption(e.target.value)} placeholder="Legenda (opcional)" />
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button type="button" variant="secondary" onClick={handleMemoryModalClose}>Cancelar</Button>
                        <Button type="button" onClick={handleSaveMemory} disabled={isSavingMemory || isProcessingMemory || newMemoryFiles.length === 0}>{getMemoryButtonText()}</Button>
                    </div>
                </div>
            </Modal>
            
            <Modal isOpen={!!viewingMemory} onClose={handleCloseViewingMemory} title={viewingMemory?.caption || 'Memória'}>
                 {viewingMemory && (
                    <div className="space-y-4">
                        {viewingMemory.type === 'video' ? (
                            <video src={viewingMemory.image_url} controls autoPlay className="w-full max-h-[70vh] rounded-lg bg-black"></video>
                        ) : (
                            <img src={viewingMemory.image_url} alt={viewingMemory.caption || ''} className="w-full max-h-[70vh] object-contain rounded-lg"/>
                        )}
                        <div className="text-center">
                            {viewingMemory.created_by_user === currentUser.name && isEditingDate ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Input type="number" value={editingMonth} min="1" max="12" onChange={e => setEditingMonth(Number(e.target.value))} className="w-20" />
                                    <Input type="number" value={editingYear} min="2000" max={new Date().getFullYear()} onChange={e => setEditingYear(Number(e.target.value))} className="w-24" />
                                    <Button size="sm" onClick={() => handleSaveDateChange(viewingMemory)}>Salvar</Button>
                                    <Button size="sm" variant="secondary" onClick={() => setIsEditingDate(false)}>Cancelar</Button>
                                </div>
                            ) : (
                                <div className="group flex items-center justify-center gap-2 text-slate-500">
                                    <span>{new Date(viewingMemory.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                    {viewingMemory.created_by_user === currentUser.name && 
                                        <button onClick={() => handleStartEditingDate(viewingMemory)} className="opacity-0 group-hover:opacity-100"><PencilIcon className="w-4 h-4"/></button>
                                    }
                                </div>
                            )}
                        </div>
                    </div>
                 )}
            </Modal>

            <Modal isOpen={isDatePlannerOpen} onClose={() => setIsDatePlannerOpen(false)} title={`Propor um date no ${restaurant.name}`}>
                <DatePlannerForm 
                    onSave={handleProposeDate}
                    onClose={() => setIsDatePlannerOpen(false)}
                    isSaving={isSavingDate}
                />
            </Modal>
        </>
    );
};
