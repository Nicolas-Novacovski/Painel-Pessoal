import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Restaurant, Review, User, Location, Memory, DatePlan, UserProfile } from '../types';
import { averageRating, slugify, compressImage } from '../utils/helpers';
import { MapPinIcon, StarIcon, TrashIcon, UberIcon, PencilIcon, GoogleIcon, CameraIcon, PlusIcon, XMarkIcon, PlayIcon, HeartIcon, TagIcon, SparklesIcon, ChevronDownIcon, ArrowPathIcon } from './Icons';
import { Button, PriceRatingDisplay, StarRatingDisplay, StarRatingInput, Modal, Input } from './UIComponents';
import DatePlannerForm from './DatePlannerForm';
import { supabase } from '../utils/supabase';
import { USERS } from '../constants';
import { GoogleGenAI } from "@google/genai";

interface RestaurantDetailProps {
    restaurant: Restaurant & { is_favorited: boolean };
    currentUser: UserProfile;
    onUpdateReview: (restaurantId: string, review: Review) => Promise<void>;
    onUpdateMemories: (restaurantId: string, memories: Memory[]) => Promise<void>;
    onUpdatePromotions: (restaurantId: string, promotions: string) => Promise<void>;
    onSaveDatePlan: (plan: Omit<DatePlan, 'id' | 'created_at'>) => Promise<void>;
    onEdit: (restaurant: Restaurant) => void;
    onRemoveFromList: (id: string) => Promise<void>;
    onToggleFavorite: (id: string, currentState: boolean) => Promise<void>;
}

export const RestaurantDetail: React.FC<RestaurantDetailProps> = ({ restaurant, currentUser, onUpdateReview, onUpdateMemories, onUpdatePromotions, onSaveDatePlan, onEdit, onRemoveFromList, onToggleFavorite }) => {
    // Review State
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [isSavingReview, setIsSavingReview] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(restaurant.locations?.[0] || null);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');

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
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
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


    const calculatedAverageRating = averageRating(restaurant.reviews);
    
    const mapSrc = useMemo(() => {
        if (!selectedLocation) {
            return `https://maps.google.com/maps?q=Curitiba,+PR&t=&z=12&ie=UTF8&iwloc=&output=embed`;
        }
        if (selectedLocation.latitude && selectedLocation.longitude) {
            return `https://maps.google.com/maps?q=${selectedLocation.latitude},${selectedLocation.longitude}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
        }
        // Append city and state to the address for better accuracy.
        const fullAddress = `${selectedLocation.address}, Curitiba, PR`;
        return `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    }, [selectedLocation]);

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
                <div className="h-60 w-full bg-slate-200 rounded-lg overflow-hidden border border-slate-300">
                    <iframe
                        key={mapSrc}
                        title={`Mapa para ${restaurant.name}`}
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        src={mapSrc}>
                    </iframe>
                </div>
                
                <div className="space-y-2">
                    <h4 className="font-bold text-lg text-slate-800">Endereços</h4>
                    <div className="flex flex-wrap gap-2">
                        {restaurant.locations?.map((loc, index) => (
                            <button 
                                key={index} 
                                onClick={() => setSelectedLocation(loc)}
                                className={`flex items-center gap-2 text-left p-2 rounded-lg transition-colors border-2 ${selectedLocation?.address === loc.address ? 'bg-primary/10 border-primary' : 'bg-slate-100 border-transparent hover:bg-slate-200'}`}
                            >
                                <MapPinIcon className={`w-5 h-5 flex-shrink-0 ${selectedLocation?.address === loc.address ? 'text-primary' : 'text-slate-500'}`} />
                                <span className="text-sm font-medium text-slate-700">{loc.address}</span>
                            </button>
                        ))}
                        {(!restaurant.locations || restaurant.locations.length === 0) && (
                            <p className="text-slate-500 text-sm">Nenhum endereço cadastrado.</p>
                        )}
                    </div>
                </div>

                 <div className="pt-4 border-t">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                         {restaurant.cuisine && <p className="text-md font-bold text-primary">{restaurant.cuisine}</p>}
                        <p className="text-sm text-slate-500 font-medium bg-secondary inline-block px-2 py-1 rounded-full">{restaurant.category}</p>
                        <PriceRatingDisplay rating={restaurant.price_range || 0} className="text-lg" />
                        {restaurant.inTourOqfc && (
                            <span className="text-sm font-bold text-accent-focus bg-amber-100 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                                <StarIcon className="w-4 h-4" />
                                Tour O Que Fazer
                            </span>
                        )}
                        {hasMenu && (
                             <a 
                                href={restaurant.menu_url!} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center gap-2 justify-center px-3 py-1.5 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-200 hover:text-dark focus:ring-primary focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200"
                            >
                                Ver Cardápio
                            </a>
                        )}
                    </div>
                </div>
                
                {/* Promotions Section */}
                <div className="pt-4 border-t">
                    <div 
                        className="flex justify-between items-center cursor-pointer p-2 -m-2 rounded-lg hover:bg-slate-100 transition-colors"
                        onClick={() => setIsPromotionsOpen(prev => !prev)}
                        role="button"
                        aria-expanded={isPromotionsOpen}
                    >
                        <h4 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            <TagIcon className="w-6 h-6 text-green-600"/>
                            Promoções da Semana
                            {isFetchingPromotions && <ArrowPathIcon className="w-5 h-5 text-primary animate-spin" />}
                        </h4>
                        <ChevronDownIcon className={`w-6 h-6 text-slate-500 transition-transform duration-200 ${isPromotionsOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {isPromotionsOpen && (
                        <div className="mt-2 space-y-3 animate-fade-in">
                            {restaurant.weekly_promotions && restaurant.weekly_promotions !== "Nenhuma promoção encontrada." ? (
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-green-800 whitespace-pre-wrap">{restaurant.weekly_promotions}</p>
                                </div>
                            ) : restaurant.weekly_promotions === "Nenhuma promoção encontrada." ? (
                                <p className="text-slate-500 text-sm">Nenhuma promoção encontrada pela IA na última busca.</p>
                            ) : (
                                <p className="text-slate-500 text-sm">Clique no botão para buscar promoções e descontos semanais com a IA.</p>
                            )}

                            <Button 
                                variant="secondary" 
                                size={!restaurant.weekly_promotions ? 'md' : 'sm'}
                                onClick={(e) => {
                                    e.stopPropagation(); // prevent accordion from closing
                                    handleFetchPromotions();
                                }} 
                                disabled={isFetchingPromotions}
                            >
                                {isFetchingPromotions ? (
                                    <>
                                        <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                        <span>Buscando...</span>
                                    </>
                                ) : (
                                    !restaurant.weekly_promotions ? (
                                        <>
                                            <SparklesIcon className="w-5 h-5" />
                                            <span>Buscar Promoções com IA</span>
                                        </>
                                    ) : (
                                        <>
                                            <ArrowPathIcon className="w-4 h-4" />
                                            <span>Buscar novamente</span>
                                        </>
                                    )
                                )}
                            </Button>
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t">
                    <div className="p-4 bg-green-100 border border-green-300 rounded-lg text-center animate-pop-in space-y-2">
                        <p className="text-2xl">🎉</p>
                        <p className="font-bold text-green-800">Este restaurante está na sua lista!</p>
                        <p className="text-sm text-green-700">Que tal marcar um dia?</p>
                            <Button variant="accent" size="sm" onClick={() => setIsDatePlannerOpen(true)}>
                            Planejar um Date!
                        </Button>
                    </div>
                </div>

                {/* --- Memories Album --- */}
                <div className="pt-4 border-t">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            <CameraIcon className="w-6 h-6"/>
                            Álbum Gastronômico
                        </h4>
                        <Button variant="secondary" size="sm" onClick={() => setIsMemoryModalOpen(true)}>
                            <PlusIcon className="w-4 h-4"/> Adicionar
                        </Button>
                    </div>
                    {memories.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {memories.map(memory => (
                                <div 
                                    key={memory.id} 
                                    className="group relative rounded-lg overflow-hidden shadow-sm cursor-pointer aspect-square bg-slate-100"
                                    onClick={() => setViewingMemory(memory)}
                                >
                                    {memory.type === 'video' ? (
                                        <video src={memory.image_url} className="w-full h-full object-cover" muted loop playsInline />
                                    ) : (
                                        <img src={memory.image_url} alt={memory.caption} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"/>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex flex-col justify-end">
                                        {memory.type === 'video' && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <PlayIcon className="w-8 h-8 text-white/80 drop-shadow-lg" />
                                            </div>
                                        )}
                                        <p className="text-white text-xs font-semibold leading-tight">{memory.caption}</p>
                                        <p className="text-slate-300 text-xs">{memory.created_by_user} - {new Date(memory.created_at).toLocaleDateString()}</p>
                                    </div>
                                    {memory.created_by_user === currentUser.name && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteMemory(memory); }}
                                            className="absolute top-1 right-1 z-10 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                        >
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6 bg-slate-50 rounded-lg">
                            <p className="text-slate-500">Nenhuma memória adicionada ainda.</p>
                            <p className="text-slate-400 text-sm">Seja o primeiro a registrar um momento!</p>
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t space-y-4">
                    <h4 className="font-bold text-lg text-slate-800 text-center">Nossas Opiniões</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 md:gap-8">
                        <div className="bg-slate-50 p-4 rounded-lg">
                            <h5 className="font-bold text-lg mb-2">Sua Avaliação ({currentUser.name === 'Ana Beatriz Diva Linda' ? 'Ana' : currentUser.name})</h5>
                            <div className="space-y-3">
                                <StarRatingInput rating={rating} setRating={setRating} />
                                <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Seu comentário..." rows={3} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"></textarea>
                                <Button onClick={handleReviewSubmit} disabled={rating === 0 || isSavingReview}>
                                    {isSavingReview ? 'Salvando...' : 'Salvar Avaliação'}
                                </Button>
                            </div>
                        </div>

                        {partnerReview ? (
                             <div className="p-4 rounded-lg mt-4 md:mt-0">
                                <h5 className="font-bold text-lg mb-2">Avaliação de {partner === 'Ana Beatriz Diva Linda' ? 'Ana' : partner}</h5>
                                <div className="space-y-3">
                                    <StarRatingDisplay rating={partnerReview.rating}/>
                                    {partnerReview.comment && <p className="text-slate-700 italic bg-white p-3 rounded-md border">"{partnerReview.comment}"</p>}
                                </div>
                            </div>
                        ) : (
                             <div className="p-4 rounded-lg mt-4 md:mt-0 flex items-center justify-center bg-slate-50">
                                 <p className="text-slate-500 text-center">Ainda não há avaliação de {partner === 'Ana Beatriz Diva Linda' ? 'Ana' : partner}.</p>
                             </div>
                        )}
                    </div>
                </div>

                <div className="pt-4 border-t flex flex-col sm:flex-row gap-3">
                     <Button
                        variant="accent"
                        onClick={handleNavigate}
                        disabled={isNavDisabled || copyStatus !== 'idle'}
                        className="w-full !justify-center"
                    >
                        <UberIcon className="w-5 h-5"/>
                        {getUberButtonText()}
                    </Button>
                    <Button variant="secondary" onClick={() => onToggleFavorite(restaurant.id, restaurant.is_favorited)} className="w-full !justify-center">
                        <HeartIcon className={`w-5 h-5 ${restaurant.is_favorited ? 'text-red-500' : 'text-slate-500'}`} />
                        {restaurant.is_favorited ? 'Favoritado' : 'Favoritar'}
                    </Button>
                     <Button variant="secondary" onClick={() => onRemoveFromList(restaurant.id)} className="w-full !justify-center">
                        <TrashIcon className="w-5 h-5 text-red-500"/>
                        Remover da Lista
                    </Button>
                    <Button variant="secondary" onClick={() => onEdit(restaurant)} className="w-full !justify-center">
                        <PencilIcon className="w-5 h-5"/>
                        Editar Detalhes
                    </Button>
                </div>
            </div>

            {/* --- Date Planner Modal --- */}
            <Modal isOpen={isDatePlannerOpen} onClose={() => setIsDatePlannerOpen(false)} title={`Planejar Date em: ${restaurant.name}`}>
                <DatePlannerForm 
                    onSave={handleProposeDate}
                    onClose={() => setIsDatePlannerOpen(false)}
                    isSaving={isSavingDate}
                />
            </Modal>

            {/* --- Add Memory Modal --- */}
            <Modal isOpen={isMemoryModalOpen} onClose={handleMemoryModalClose} title="Adicionar Novas Memórias">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="memory-image" className="block text-sm font-medium text-slate-700 mb-1">Fotos ou Vídeos</label>
                        <input
                            id="memory-image"
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            onChange={handleFilesChange}
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                            disabled={isSavingMemory || isProcessingMemory}
                        />
                        <p className="text-xs text-slate-500 mt-1">Dica: vídeos tem um limite de 25MB.</p>
                    </div>
                    
                    {previews.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {previews.map(p => (
                                <div key={p.id} className="relative group aspect-square">
                                    {p.type === 'video' ? (
                                        <video src={p.src} className="w-full h-full object-cover rounded-md bg-slate-200" muted loop playsInline/>
                                    ) : (
                                        <img src={p.src} alt="Preview" className="w-full h-full object-cover rounded-md bg-slate-200"/>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removePreview(p.id)}
                                        className="absolute top-1 right-1 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                        disabled={isSavingMemory || isProcessingMemory}
                                    >
                                        <XMarkIcon className="w-4 h-4"/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div>
                        <label htmlFor="memory-caption" className="block text-sm font-medium text-slate-700 mb-1">Legenda (para todas as mídias)</label>
                        <Input
                            id="memory-caption"
                            value={newMemoryCaption}
                            onChange={e => setNewMemoryCaption(e.target.value)}
                            placeholder="Ex: Aniversário de namoro!"
                            disabled={isSavingMemory || isProcessingMemory}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button type="button" variant="secondary" onClick={handleMemoryModalClose} disabled={isSavingMemory || isProcessingMemory}>Cancelar</Button>
                        <Button type="button" onClick={handleSaveMemory} disabled={isSavingMemory || isProcessingMemory || newMemoryFiles.length === 0}>
                            {getMemoryButtonText()}
                        </Button>
                    </div>
                </div>
            </Modal>
            
            {/* View Memory Modal */}
            {viewingMemory && (
                <Modal isOpen={true} onClose={handleCloseViewingMemory} title={viewingMemory.caption || `Memória em ${restaurant.name}`}>
                     <div className="space-y-4">
                        <div className="bg-black rounded-lg flex items-center justify-center max-h-[60vh]">
                            {viewingMemory.type === 'video' ? (
                                <video src={viewingMemory.image_url} className="max-h-[60vh] w-auto" controls autoPlay loop />
                            ) : (
                                <img src={viewingMemory.image_url} alt={viewingMemory.caption} className="max-h-[60vh] w-auto object-contain"/>
                            )}
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                             <div>
                                <p className="font-semibold text-slate-800">{viewingMemory.caption}</p>
                                <div className="text-sm text-slate-500">
                                    <span>{viewingMemory.created_by_user}, </span>
                                    {isEditingDate ? (
                                        <div className="inline-flex items-center gap-2">
                                            <select value={editingMonth} onChange={(e) => setEditingMonth(Number(e.target.value))} className="p-1 border rounded text-sm">
                                                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(0, m-1).toLocaleString('pt-BR', { month: 'long' })}</option>)}
                                            </select>
                                            <select value={editingYear} onChange={(e) => setEditingYear(Number(e.target.value))} className="p-1 border rounded text-sm">
                                                 {Array.from({length: 10}, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                            <Button size="sm" onClick={() => handleSaveDateChange(viewingMemory)}>Salvar</Button>
                                            <Button size="sm" variant="secondary" onClick={() => setIsEditingDate(false)}>Cancelar</Button>
                                        </div>
                                    ) : (
                                        <>
                                            <span>{new Date(viewingMemory.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                            {viewingMemory.created_by_user === currentUser.name && (
                                                <Button variant="ghost" size="sm" className="!p-1 ml-1" onClick={() => handleStartEditingDate(viewingMemory)} title="Editar Mês/Ano">
                                                    <PencilIcon className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                             </div>
                            {viewingMemory.created_by_user === currentUser.name && (
                                <Button variant="danger" size="sm" onClick={() => handleDeleteMemory(viewingMemory)}>
                                    <TrashIcon className="w-4 h-4"/> Apagar Memória
                                </Button>
                            )}
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};