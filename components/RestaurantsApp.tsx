


import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Restaurant, Review, User, RestaurantCategory, Memory, DatePlan, UserProfile, CuratedList, Location } from '../types';
import { RESTAURANT_CATEGORIES, ADMIN_COUPLE_EMAILS, USERS } from '../constants';
import { PlusIcon, SparklesIcon, ChevronDownIcon, BookmarkIcon, InformationCircleIcon, MapIcon, TicketIcon, CheckIcon } from './Icons';
import { Modal, Button, Input, SegmentedControl } from './UIComponents';
import { RestaurantCard } from './RestaurantCard';
import { RestaurantForm } from './RestaurantForm';
import { RestaurantDetail } from './RestaurantDetail';
import { RestaurantDiscovery } from './RestaurantDiscovery';
import { supabase } from '../utils/supabase';
import { averageRating, extractNeighborhood, calculateDistance } from '../utils/helpers';
import { GoogleGenAI, Type } from "@google/genai";
import DateRoulette from './DateRoulette';
import AchievementsMap from './AchievementsMap';


interface RestaurantsAppProps {
    currentUser: UserProfile;
    onProfileUpdate: (updatedFields: Partial<UserProfile>) => void;
}

interface CoupleRestaurant extends Restaurant {
    is_favorited: boolean;
}

const SQL_SETUP_COUPLE_RESTAURANTS = `
-- Recria a tabela de vínculo, adicionando o status 'is_favorited'.
-- Este script é seguro para ser executado múltiplas vezes.
DROP TABLE IF EXISTS public.couple_restaurants CASCADE;

CREATE TABLE public.couple_restaurants (
    couple_id TEXT NOT NULL,
    restaurant_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_favorited BOOLEAN NOT NULL DEFAULT false,
    
    CONSTRAINT couple_restaurants_pkey PRIMARY KEY (couple_id, restaurant_id),
    CONSTRAINT couple_restaurants_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE
);

-- Desabilita RLS para simplicidade.
ALTER TABLE public.couple_restaurants DISABLE ROW LEVEL SECURITY;
`;

const AddressSetupModal: React.FC<{
    onSave: (address: string) => Promise<void>;
    onSkip: () => void;
}> = ({ onSave, onSkip }) => {
    const [address, setAddress] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!address.trim()) {
            setError('Por favor, insira um endereço.');
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            await onSave(address);
        } catch (e: any) {
            setError(e.message || 'Ocorreu um erro ao salvar.');
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4 text-center">
            <h3 className="text-2xl font-bold text-dark">Bem-vindo(a)!</h3>
            <p className="text-slate-600">
                Para ajudar a encontrar restaurantes perto de você, por favor, insira seu endereço de casa.
            </p>
            <Input
                type="text"
                placeholder="Ex: Rua das Flores, 123, Curitiba, PR"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoFocus
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex justify-center gap-3 pt-4">
                <Button variant="secondary" onClick={onSkip} disabled={isSaving}>
                    Pular por agora
                </Button>
                <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Salvando...' : 'Salvar Endereço'}
                </Button>
            </div>
        </div>
    );
};


const DatabaseErrorResolver: React.FC<{ title: string; instructions: string; sql: string }> = ({ title, instructions, sql }) => (
    <div className="p-4 mb-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg">
        <h4 className="font-semibold text-red-900">{title}</h4>
        <p className="text-sm text-red-800 mt-1">{instructions}</p>
        <div className="mt-4">
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{sql}</code>
            </pre>
            <p className="text-xs text-slate-600 mt-2">
                Copie este código, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase e clique em "RUN". Depois, recarregue a página.
            </p>
        </div>
    </div>
);

const EmptyState: React.FC<{ onImportClick: () => void; onAddClick: () => void; hasCuratedLists: boolean }> = ({ onImportClick, onAddClick, hasCuratedLists }) => (
    <div className="text-center p-8 bg-white rounded-xl shadow-subtle flex flex-col items-center animate-fade-in mt-8">
        <h2 className="text-2xl font-bold text-dark">Bem-vindo(a) à sua lista!</h2>
        <p className="mt-2 max-w-lg text-slate-600">Sua lista de restaurantes está vazia. Comece a sua jornada gastronômica importando uma de nossas listas ou adicionando o seu primeiro restaurante manualmente.</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-4">
            {hasCuratedLists && (
                <Button variant="accent" onClick={onImportClick}>
                    <BookmarkIcon className="w-5 h-5"/>
                    Explorar Listas Curadas
                </Button>
            )}
            <Button variant="primary" onClick={onAddClick}>
                <PlusIcon className="w-5 h-5"/>
                Adicionar Restaurante Manualmente
            </Button>
        </div>
    </div>
);

const getCityImage = (city: string): string => {
    const sanitizedCity = city.toLowerCase().trim();
    switch (sanitizedCity) {
        case 'curitiba':
            return 'https://upload.wikimedia.org/wikipedia/commons/1/19/Jardim_Bot%C3%A2nico_Centro_Curitiba.jpg';
        case 'gramado':
            return 'https://www.segueviagem.com.br/wp-content/uploads/2021/05/Igreja-Matriz-Sao-Pedro-Gramado-Rio-Grande-do-Sul-shutterstock_1633168567.jpg';
        default:
            return 'https://images.unsplash.com/photo-1500835556837-99ac94a94552?q=80&w=400&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'; // Generic travel
    }
};


const RestaurantsApp: React.FC<RestaurantsAppProps> = ({ currentUser, onProfileUpdate }) => {
    const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
    const [coupleRestaurants, setCoupleRestaurants] = useState<CoupleRestaurant[]>([]);
    const [curatedLists, setCuratedLists] = useState<CuratedList[]>([]);
    const [coupleProfiles, setCoupleProfiles] = useState<UserProfile[]>([]);
    
    const [currentCity, setCurrentCity] = useState<string>('Curitiba');

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<'all' | RestaurantCategory>('all');
    const [cuisineFilter, setCuisineFilter] = useState<'all' | string>('all');
    const [tourFilter, setTourFilter] = useState<'all' | 'tour_only'>('all');
    const [priceFilters, setPriceFilters] = useState<number[]>([]);
    const [visitedFilter, setVisitedFilter] = useState<'all' | 'visited' | 'not_visited'>('all');
    const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'favorites_only'>('all');
    const [sortBy, setSortBy] = useState<'name' | 'rating_our' | 'rating_google' | 'price_asc' | 'price_desc' | 'recent' | 'distance'>('name');
    const [filtersOpen, setFiltersOpen] = useState(false);
    
    const [neighborhoodFilter, setNeighborhoodFilter] = useState<'all' | string>('all');
    const [proximityFilter, setProximityFilter] = useState<string>('all');
    const [proximityRadius, setProximityRadius] = useState(5);
    
    const [modalContent, setModalContent] = useState<null | 'add' | 'import' | CoupleRestaurant>(null);
    const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
    const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
    const [discoverySnapshot, setDiscoverySnapshot] = useState<Restaurant[]>([]);
    const [dbError, setDbError] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
    const [isRouletteOpen, setIsRouletteOpen] = useState(false);
    const [isCityAccordionOpen, setIsCityAccordionOpen] = useState(false);

    const fetchData = useCallback(async () => {
        if (!currentUser.couple_id) {
            setDbError("missing_couple_id");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setDbError(null);
        try {
            // Check if couple_restaurants table exists and has the new column
            const { error: checkError } = await supabase.from('couple_restaurants').select('is_favorited').limit(1);
            if (checkError && (checkError.code === '42P01' || checkError.code === '42703')) {
                setDbError("setup_needed");
                setIsLoading(false);
                return;
            }

            const [allRestaurantsRes, coupleLinksRes, curatedListsRes, coupleProfilesRes] = await Promise.all([
                supabase.from('restaurants').select('*'),
                supabase.from('couple_restaurants').select('is_favorited, restaurants(*)').eq('couple_id', currentUser.couple_id),
                supabase.from('curated_lists').select('*').order('name'),
                supabase.from('user_profiles').select('*').eq('couple_id', currentUser.couple_id),
            ]);
            
            if (allRestaurantsRes.error) throw allRestaurantsRes.error;
            if (coupleLinksRes.error) throw coupleLinksRes.error;
            if (curatedListsRes.error && curatedListsRes.error.code !== '42P01') throw curatedListsRes.error;
            if (coupleProfilesRes.error) throw coupleProfilesRes.error;


            const fetchedRestaurants = (allRestaurantsRes.data as Restaurant[]) || [];
            setAllRestaurants(fetchedRestaurants);

            const dbCuratedLists = (curatedListsRes.data as CuratedList[]) || [];
            
            // Dynamically create and inject the "All Restaurants" curated list
            const allRestaurantsList: CuratedList = {
                id: 'all-restaurants-virtual', // A unique, non-db ID
                name: 'Todos os Restaurantes',
                description: 'Uma lista dinâmica com todos os restaurantes cadastrados no sistema.',
                restaurant_ids: fetchedRestaurants.map(r => r.id),
                icon: '🍽️',
                created_at: new Date().toISOString(),
            };
            // Prepend it to the lists from DB
            setCuratedLists([allRestaurantsList, ...dbCuratedLists]);

            const coupleData = (coupleLinksRes.data || [])
                .map(link => (link.restaurants ? { ...(link.restaurants as Restaurant), is_favorited: link.is_favorited } : null))
                .filter((r): r is CoupleRestaurant => r !== null);
            setCoupleRestaurants(coupleData);

            setCoupleProfiles((coupleProfilesRes.data as any[]) || []);

             if (currentUser.address === null) {
                setIsAddressModalOpen(true);
            }

        } catch (error: any) {
            console.error('Error fetching data:', error);
            alert("Ocorreu um erro ao carregar os restaurantes.");
        } finally {
            setIsLoading(false);
        }
    }, [currentUser.couple_id, currentUser.address]);


    useEffect(() => {
        fetchData(); 

        const channel = supabase.channel('realtime-restaurants-all');

        channel.on(
            'postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, fetchData
        ).on(
            'postgres_changes', { event: '*', schema: 'public', table: 'curated_lists' }, fetchData
        ).on(
            'postgres_changes', { event: '*', schema: 'public', table: 'couple_restaurants', filter: `couple_id=eq.${currentUser.couple_id}` }, fetchData
        ).on(
            'postgres_changes', { event: '*', schema: 'public', table: 'user_profiles', filter: `couple_id=eq.${currentUser.couple_id}` }, fetchData
        ).subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchData, currentUser.couple_id]);


    useEffect(() => {
        if (modalContent && typeof modalContent === 'object' && modalContent.id) {
            const updatedRestaurant = coupleRestaurants.find(r => r.id === modalContent.id);
            if (updatedRestaurant && JSON.stringify(updatedRestaurant) !== JSON.stringify(modalContent)) {
                setModalContent(updatedRestaurant);
            }
        }
    }, [coupleRestaurants, modalContent]);

     // Automatically switch to sort by distance when a proximity filter is applied
    useEffect(() => {
        if (proximityFilter !== 'all') {
            setSortBy('distance');
        }
    }, [proximityFilter]);
    
    const handleSaveRestaurant = useCallback(async (data: Omit<Restaurant, 'id' | 'wants_to_go' | 'reviews' | 'addedBy' | 'memories' | 'created_at'>, id?: string) => {
        const handleError = (error: Error) => {
             console.error('Error saving restaurant:', error);
             alert(`Erro ao salvar o restaurante: ${error.message}`);
        }
        
        if(id) { // Editing existing restaurant
             const dataToUpdate = { ...data };
             const { error } = await supabase.from('restaurants').update(dataToUpdate as any).eq('id', id);
             if (error) {
                handleError(error as unknown as Error);
                return;
             }
             setEditingRestaurant(null);
        } else { // Adding new restaurant
            const dataToSave = {
                ...data,
                addedBy: currentUser.name as User,
                wants_to_go: [],
                reviews: [],
                memories: [],
            };
            const { data: newRestaurant, error } = await supabase.from('restaurants').insert([dataToSave] as any).select().single();
            if (error) {
                handleError(error as unknown as Error);
                return;
            } else if (newRestaurant && currentUser.couple_id) {
                // Link the new restaurant to the couple
                const { error: linkError } = await supabase.from('couple_restaurants').insert({
                    couple_id: currentUser.couple_id,
                    restaurant_id: newRestaurant.id,
                    is_favorited: false,
                });
                if (linkError) {
                    console.error("Error linking new restaurant:", linkError);
                    alert("O restaurante foi criado, mas houve um erro ao adicioná-lo à sua lista.");
                    return;
                } else {
                    if (newRestaurant.city && newRestaurant.city !== currentCity) {
                        setCurrentCity(newRestaurant.city);
                    }
                    setModalContent(null);
                }
            }
        }
        
        await fetchData();

    }, [currentUser.name, currentUser.couple_id, fetchData, currentCity]);

    const handleOpenEditModal = (restaurant: Restaurant) => {
        setModalContent(null);
        setEditingRestaurant(restaurant);
    };
    
    const handleRemoveFromList = useCallback(async (restaurantId: string) => {
        if (!currentUser.couple_id) return;
        
        // Optimistic update
        setCoupleRestaurants(prev => prev.filter(r => r.id !== restaurantId));
        if (modalContent && typeof modalContent === 'object' && modalContent.id === restaurantId) {
            setModalContent(null);
        }
        
        const { error } = await supabase
            .from('couple_restaurants')
            .delete()
            .match({ couple_id: currentUser.couple_id, restaurant_id: restaurantId });
            
        if (error) {
            console.error("Error removing from list:", error);
            alert("Ocorreu um erro ao remover da sua lista. A tela será atualizada.");
            fetchData(); 
        }
    }, [currentUser.couple_id, fetchData, modalContent]);

    const handleToggleFavorite = useCallback(async (restaurantId: string, currentState: boolean) => {
        if (!currentUser.couple_id) return;
        
        // Optimistic update
        setCoupleRestaurants(prev => 
            prev.map(r => r.id === restaurantId ? { ...r, is_favorited: !currentState } : r)
        );

        const { error } = await supabase
            .from('couple_restaurants')
            .update({ is_favorited: !currentState })
            .match({ couple_id: currentUser.couple_id, restaurant_id: restaurantId });

        if (error) {
            console.error("Error toggling favorite:", error);
            alert("Erro ao favoritar. A tela será atualizada.");
            fetchData();
        }
    }, [currentUser.couple_id, fetchData]);

    const handleSetFavoriteState = useCallback(async (restaurantId: string, newFavoriteState: boolean) => {
        if (!currentUser.couple_id) return;
        
        // Optimistic update
        setCoupleRestaurants(prev => 
            prev.map(r => r.id === restaurantId ? { ...r, is_favorited: newFavoriteState } : r)
        );

        const { error } = await supabase
            .from('couple_restaurants')
            .update({ is_favorited: newFavoriteState })
            .match({ couple_id: currentUser.couple_id, restaurant_id: restaurantId });

        if (error) {
            console.error("Error setting favorite state:", error);
            alert("Erro ao favoritar. A tela será atualizada.");
            fetchData();
        }
    }, [currentUser.couple_id, fetchData]);


    const handleUpdateReview = useCallback(async (restaurantId: string, review: Review) => {
        const restaurant = allRestaurants.find(r => r.id === restaurantId);
        if (!restaurant) return;
        
        const otherReviews = restaurant.reviews.filter(rv => rv.user !== review.user);
        const newReviews = [...otherReviews, review];

        const { error } = await supabase.from('restaurants').update({ reviews: newReviews } as any).eq('id', restaurantId);

        if (error) console.error('Error updating review:', error);
    }, [allRestaurants]);

    const handleUpdatePriceRange = useCallback(async (restaurantId: string, price_range: number) => {
        const { error } = await supabase
            .from('restaurants')
            .update({ price_range })
            .eq('id', restaurantId);
        
        if (error) {
            console.error('Error updating price range:', error);
            alert("Erro ao atualizar a faixa de preço.");
        }
    }, []);

    const handleUpdateGoogleRating = useCallback(async (restaurantId: string, rating: number | null, count: number | null) => {
        const { error } = await supabase
            .from('restaurants')
            .update({ google_rating: rating, google_rating_count: count })
            .eq('id', restaurantId);
        
        if (error) {
            console.error('Error updating google rating:', error);
            alert("Erro ao atualizar a avaliação do Google.");
        }
    }, []);

    const handleUpdateLocation = useCallback(async (restaurantId: string, locationToUpdate: Location) => {
        const restaurant = allRestaurants.find(r => r.id === restaurantId);
        if (!restaurant) return;
    
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});
            const prompt = `Your task is to find the precise latitude and longitude for a given address using Google Search. The address is: "${locationToUpdate.address}". The context is the city of Curitiba, PR, Brazil. Return ONLY a valid JSON object with "latitude" and "longitude" keys. Example of a perfect response: {"latitude": -25.4284, "longitude": -49.2733}. If you cannot determine the coordinates with high confidence, return {"latitude": null, "longitude": null}. Do not add any other text or markdown.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });
    
            const responseText = response.text.trim();
            const jsonMatch = responseText.match(/{[\s\S]*}/);
            if (!jsonMatch) {
                 throw new Error("Geocoding failed: No valid JSON object found in the AI response.");
            }
            
            const result = JSON.parse(jsonMatch[0]);
            const newCoords = { latitude: result.latitude || null, longitude: result.longitude || null };
    
            const updatedLocations = restaurant.locations.map(loc => 
                loc.address === locationToUpdate.address ? { ...loc, ...newCoords } : loc
            );
    
            const { error } = await supabase.from('restaurants').update({ locations: updatedLocations } as any).eq('id', restaurantId);
            if (error) throw error;
            
            // Refetch to ensure all components are updated
            await fetchData();
            alert("Coordenadas atualizadas com sucesso!");
    
        } catch (error) {
            console.error("Error re-geocoding location:", error);
            alert(`Não foi possível atualizar as coordenadas: ${(error as Error).message}`);
        }
    }, [allRestaurants, fetchData]);

    const handleUpdateMemories = useCallback(async (restaurantId: string, newMemories: Memory[]) => {
        const { error } = await supabase.from('restaurants').update({ memories: newMemories } as any).eq('id', restaurantId);
        if (error) console.error('Error updating memories:', error);
    }, []);

    const handleUpdatePromotions = useCallback(async (restaurantId: string, promotions: string) => {
        const { error } = await supabase.from('restaurants').update({ weekly_promotions: promotions } as any).eq('id', restaurantId);
        if (error) {
             console.error('Error updating promotions:', error);
             alert('Erro ao salvar as promoções.');
        } else {
            // Manually refetch to ensure UI is up-to-date immediately
            await fetchData();
        }
    }, [fetchData]);
    
    const handleSaveDatePlan = useCallback(async (planData: Omit<DatePlan, 'id' | 'created_at'>) => {
        const { error } = await supabase.from('date_plans').insert([planData]);
        if (error) {
            console.error('Error creating date plan:', error);
            alert('Não foi possível salvar o plano de date.');
        } else {
            alert('Proposta de date enviada! Verifique o painel principal.');
        }
    }, []);

    const handleTogglePriceFilter = (price: number) => {
        setPriceFilters(prev => prev.includes(price) ? prev.filter(p => p !== price) : [...prev, price]);
    };

    const handleImportList = async (list: CuratedList) => {
        if (!currentUser.couple_id) return;
        setIsImporting(true);
        try {
            const validRestaurantIds = new Set(allRestaurants.map(r => r.id));
            const existingRestaurantIds = list.restaurant_ids.filter(id => validRestaurantIds.has(id));

            if (existingRestaurantIds.length === 0) {
                alert(`Nenhum restaurante válido encontrado na lista "${list.name}". A importação foi cancelada.`);
                setIsImporting(false);
                return;
            }
            
            if (existingRestaurantIds.length < list.restaurant_ids.length) {
                const missingCount = list.restaurant_ids.length - existingRestaurantIds.length;
                alert(`Aviso: ${missingCount} restaurante(s) da lista "${list.name}" não foram encontrados (provavelmente foram excluídos) e não serão importados.`);
            }

            const linksToInsert = existingRestaurantIds.map(id => ({
                couple_id: currentUser.couple_id!,
                restaurant_id: id,
                is_favorited: false,
            }));

            const { error } = await supabase
                .from('couple_restaurants')
                .upsert(linksToInsert, { onConflict: 'couple_id, restaurant_id' });
            
            if (error) throw error;

            alert(`A lista "${list.name}" foi importada com sucesso!`);
            fetchData();
            setModalContent(null);
    
        } catch (error: any) {
            console.error("Error importing list:", error);
            alert(`Ocorreu um erro ao importar a lista. Erro: ${error.message}`);
        } finally {
            setIsImporting(false);
        }
    };
    
    const handleOpenDiscovery = () => {
        const shuffledList = [...coupleRestaurants].sort(() => Math.random() - 0.5);
        setDiscoverySnapshot(shuffledList);
        setIsDiscoveryOpen(true);
    };

    const handleSaveAddress = async (address: string) => {
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});
            const prompt = `Geocode the address "${address}" and return ONLY a valid JSON object with "latitude" and "longitude" keys. Example: {"latitude": -25.4284, "longitude": -49.2733}. If not found, return {"latitude": null, "longitude": null}.`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: { latitude: { type: Type.NUMBER }, longitude: { type: Type.NUMBER } },
                    },
                },
            });
            const coords = JSON.parse(response.text.trim());
            
            if (!coords.latitude || !coords.longitude) {
                throw new Error("Não foi possível encontrar as coordenadas para este endereço. Tente ser mais específico.");
            }

            const updatedFields = { address, latitude: coords.latitude, longitude: coords.longitude };
            
            const { error } = await supabase.from('user_profiles').update(updatedFields).eq('email', currentUser.email);
            if (error) throw error;
            
            onProfileUpdate(updatedFields);
            setIsAddressModalOpen(false);

        } catch (error: any) {
            console.error("Error saving address:", error);
            throw error;
        }
    };
    
    const proximityOptions = useMemo(() => {
        const options = [{ label: 'Qualquer', value: 'all' }];
        coupleProfiles.forEach(profile => {
            if (profile.address && profile.latitude && profile.longitude) {
                options.push({ label: `Perto de ${profile.name}`, value: profile.email });
            }
        });
        return options;
    }, [coupleProfiles]);

    const citiesWithCount = useMemo(() => {
        const cityMap = new Map<string, number>();
        coupleRestaurants.forEach(r => {
            const city = r.city || 'Curitiba';
            cityMap.set(city, (cityMap.get(city) || 0) + 1);
        });
        const allCityNames = ['Curitiba', ...Array.from(cityMap.keys())];
        const uniqueCityNames = Array.from(new Set(allCityNames));
        
        return uniqueCityNames.map(city => ({
            name: city,
            count: cityMap.get(city) || 0,
        }));
    }, [coupleRestaurants]);

    const uniqueCuisines = useMemo(() => {
        const cuisines = new Set<string>();
        coupleRestaurants.forEach(r => {
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
    }, [coupleRestaurants]);
    
    const uniqueNeighborhoods = useMemo(() => {
        const neighborhoods = new Set<string>();
        coupleRestaurants.forEach(r => {
            r.locations.forEach(l => {
                const neighborhood = extractNeighborhood(l.address);
                if (neighborhood) {
                    neighborhoods.add(neighborhood);
                }
            });
        });
        return Array.from(neighborhoods).sort();
    }, [coupleRestaurants]);
    
    const hasItemsOnList = coupleRestaurants.length > 0;
    const hasCuratedLists = curatedLists.length > 0;

    const visitedRestaurants = useMemo(() => {
        const coupleMemberNames = coupleProfiles.map(p => p.name);
        return coupleRestaurants.filter(r => 
            r.reviews && r.reviews.some(review => coupleMemberNames.includes(review.user as string))
        );
    }, [coupleRestaurants, coupleProfiles]);

    const filteredAndSortedRestaurants = useMemo(() => {
        const selectedProfile = coupleProfiles.find(p => p.email === proximityFilter);

        // 1. Pre-calculate distances for all restaurants if a proximity filter is active
        const restaurantsWithDistance = coupleRestaurants.map(r => {
            let distance = Infinity;
            if (selectedProfile?.latitude && selectedProfile?.longitude) {
                const distances = r.locations
                    .map(l => l.latitude && l.longitude ? calculateDistance(selectedProfile.latitude, selectedProfile.longitude, l.latitude, l.longitude) : Infinity);
                distance = Math.min(...distances);
            }
            return { ...r, distance };
        });

        // 2. Filter the restaurants based on all criteria
        return restaurantsWithDistance
            .filter(r => {
                if ((r.city || 'Curitiba') !== currentCity) return false;
                
                const hasVisited = r.reviews.some(review => review.user === (currentUser.name as User) && review.rating > 0);
                if (visitedFilter !== 'all' && (visitedFilter === 'visited' ? !hasVisited : hasVisited)) {
                    return false;
                }
                
                if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
                
                if (cuisineFilter !== 'all' && !(r.cuisine && r.cuisine.toLowerCase().includes(cuisineFilter.toLowerCase()))) return false;
                
                if (tourFilter === 'all' ? false : !r.inTourOqfc) return false;

                if (favoriteFilter === 'favorites_only' && !r.is_favorited) return false;
                
                const term = searchTerm.toLowerCase();
                if (term && !(r.name.toLowerCase().includes(term) || (r.cuisine && r.cuisine.toLowerCase().includes(term)) || (r.locations && r.locations.some(l => l.address.toLowerCase().includes(term))))) {
                    return false;
                }
                
                if (priceFilters.length > 0 && (r.price_range === null || !priceFilters.includes(r.price_range))) return false;
                
                if (neighborhoodFilter !== 'all' && !r.locations.some(l => {
                    const neighborhood = extractNeighborhood(l.address);
                    return neighborhood?.toLowerCase() === neighborhoodFilter.toLowerCase();
                })) {
                    return false;
                }
                
                if (proximityFilter !== 'all' && r.distance > proximityRadius) {
                    return false;
                }

                return true;
            })
            .sort((a, b) => {
                switch (sortBy) {
                    case 'rating_our':
                        return averageRating(b.reviews) - averageRating(a.reviews);
                    case 'rating_google':
                        return (b.google_rating || 0) - (b.google_rating || 0);
                    case 'price_asc':
                        return (a.price_range || 0) - (b.price_range || 0);
                    case 'price_desc':
                        return (b.price_range || 0) - (a.price_range || 0);
                    case 'recent':
                         return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    case 'distance':
                        return a.distance - b.distance;
                    case 'name':
                    default:
                        return a.name.localeCompare(b.name);
                }
            });
    }, [coupleRestaurants, currentUser.name, categoryFilter, cuisineFilter, searchTerm, tourFilter, priceFilters, visitedFilter, favoriteFilter, sortBy, neighborhoodFilter, proximityFilter, proximityRadius, coupleProfiles, currentCity]);

    if (isLoading) {
        return <div className="p-6 text-center text-slate-500">Carregando restaurantes...</div>;
    }

    if (dbError === "setup_needed") {
        return (
            <div className="p-6">
                <DatabaseErrorResolver
                    title="Configuração Necessária"
                    instructions="A funcionalidade de listas de restaurantes foi atualizada para incluir 'favoritos'. É necessário atualizar a tabela no banco de dados para que isso funcione."
                    sql={SQL_SETUP_COUPLE_RESTAURANTS}
                />
            </div>
        );
    }
    
    if (dbError === "missing_couple_id") {
        return <div className="p-6 text-center text-red-500">Erro: Seu perfil não está associado a um casal. Contate o administrador.</div>
    }

    return (
        <>
            <div className="container mx-auto p-4 sm:p-6">
                {hasItemsOnList ? (
                    <>
                        <div className="bg-white p-4 rounded-xl shadow-subtle mb-6">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Input 
                                    placeholder={`Buscar em ${currentCity}...`}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="flex-grow"
                                />
                                 <SegmentedControl
                                    value={viewMode}
                                    onChange={(value) => setViewMode(value as 'list' | 'map')}
                                    options={[
                                        { label: 'Lista', value: 'list' },
                                        { label: 'Mapa', value: 'map' }
                                    ]}
                                />
                                {hasCuratedLists && (
                                    <Button variant="secondary" onClick={() => setModalContent('import')}>
                                        <BookmarkIcon className="w-5 h-5"/>
                                        <span>Importar</span>
                                    </Button>
                                )}
                            </div>
                             <div className="mt-4 pt-4 border-t border-slate-100">
                                <div className="border border-slate-200 rounded-xl overflow-hidden transition-shadow hover:shadow-md">
                                    {/* Accordion Header */}
                                    <button
                                        onClick={() => setIsCityAccordionOpen(!isCityAccordionOpen)}
                                        className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors text-left"
                                        aria-expanded={isCityAccordionOpen}
                                        aria-controls="city-list"
                                    >
                                        <div className="flex items-center gap-3">
                                            <MapIcon className="w-6 h-6 text-primary"/>
                                            <div>
                                                <span className="text-sm text-slate-500">Destino Atual</span>
                                                <p className="font-bold text-lg text-dark">{currentCity}</p>
                                            </div>
                                        </div>
                                        <ChevronDownIcon className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${isCityAccordionOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    
                                    {/* Accordion Body */}
                                    {isCityAccordionOpen && (
                                        <div id="city-list" className="bg-slate-50/70 p-2 border-t border-slate-200 animate-fade-in">
                                            <div className="space-y-1">
                                                {citiesWithCount
                                                    .filter(cityInfo => cityInfo.name !== currentCity)
                                                    .map(cityInfo => (
                                                        <button
                                                            key={cityInfo.name}
                                                            onClick={() => {
                                                                setCurrentCity(cityInfo.name);
                                                                setIsCityAccordionOpen(false);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 text-slate-700 hover:bg-slate-200/70 cursor-pointer rounded-lg transition-colors text-left"
                                                        >
                                                            <img src={getCityImage(cityInfo.name)} alt={cityInfo.name} className="w-8 h-8 rounded-md object-cover bg-slate-200"/>
                                                            <div>
                                                                <p className="font-semibold text-dark">{cityInfo.name}</p>
                                                                <p className="text-xs text-slate-500">{cityInfo.count} {cityInfo.count === 1 ? 'restaurante' : 'restaurantes'}</p>
                                                            </div>
                                                        </button>
                                                    ))
                                                }
                                                 {citiesWithCount.filter(cityInfo => cityInfo.name !== currentCity).length === 0 && (
                                                    <p className="px-3 py-2 text-sm text-slate-500 text-center">Nenhuma outra cidade na sua lista.</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-2">
                                <button onClick={() => setFiltersOpen(!filtersOpen)} className="w-full flex justify-between items-center text-left font-semibold text-slate-700 p-2 rounded-lg hover:bg-slate-100">
                                    <span>Filtros e Ordenação</span>
                                    <ChevronDownIcon className={`w-5 h-5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {filtersOpen && viewMode === 'list' && (
                                    <div className="mt-2 pt-4 border-t space-y-4 animate-fade-in">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as any)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition text-slate-900">
                                                <option value="all">Todas as Categorias</option>
                                                {RESTAURANT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <select value={cuisineFilter} onChange={e => setCuisineFilter(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition text-slate-900">
                                                <option value="all">Todos os Tipos</option>
                                                {uniqueCuisines.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label htmlFor="neighborhood-filter" className="text-sm font-medium text-slate-600 block mb-1">Filtrar por Bairro:</label>
                                                <select id="neighborhood-filter" value={neighborhoodFilter} onChange={e => setNeighborhoodFilter(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition text-slate-900">
                                                    <option value="all">Todos os Bairros</option>
                                                    {uniqueNeighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
                                                </select>
                                            </div>
                                            {proximityOptions.length > 1 && (
                                                <div>
                                                    <label className="text-sm font-medium text-slate-600 block mb-1">Filtrar por Proximidade:</label>
                                                    <SegmentedControl
                                                        value={proximityFilter}
                                                        onChange={(value) => setProximityFilter(value)}
                                                        options={proximityOptions}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        {proximityFilter !== 'all' && (
                                            <div>
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <label htmlFor="proximity-radius" className="text-sm font-medium text-slate-600">
                                                        Raio de busca: <strong className="text-primary">{proximityRadius} km</strong>
                                                    </label>
                                                    <div className="relative group flex items-center">
                                                        <InformationCircleIcon className="w-5 h-5 text-slate-400 cursor-help" />
                                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-700 text-white text-xs rounded-md py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                                                            As distâncias são aproximadas e podem ter uma variação de quilometragem.
                                                        </span>
                                                    </div>
                                                </div>
                                                <input
                                                    id="proximity-radius"
                                                    type="range"
                                                    min="1"
                                                    max="25"
                                                    value={proximityRadius}
                                                    onChange={(e) => setProximityRadius(Number(e.target.value))}
                                                    className="w-full cursor-pointer custom-range-slider"
                                                />
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <SegmentedControl value={visitedFilter} onChange={(value) => setVisitedFilter(value)} options={[{label: 'Todos', value: 'all'},{label: 'Já Fui', value: 'visited'},{label: 'Não Fui', value: 'not_visited'}]}/>
                                            <SegmentedControl value={tourFilter} onChange={(value) => setTourFilter(value)} options={[{ label: 'Todos', value: 'all' },{ label: 'Apenas Tour OQFC', value: 'tour_only' }]}/>
                                            <SegmentedControl
                                                value={favoriteFilter}
                                                onChange={(value) => setFavoriteFilter(value)}
                                                options={[
                                                    { label: 'Todos', value: 'all' },
                                                    { label: 'Favoritos', value: 'favorites_only' }
                                                ]}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-slate-600 block mb-2">Filtrar por Preço:</label>
                                            <div className="flex flex-wrap gap-2">
                                                {[1, 2, 3, 4].map(price => (
                                                    <button key={price} onClick={() => handleTogglePriceFilter(price)} className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-200 border-2 ${priceFilters.includes(price) ? 'bg-primary border-primary text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-primary hover:text-primary'}`}>
                                                        {'$'.repeat(price)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="sort-by" className="text-sm font-medium text-slate-600 block mb-1">Ordenar por:</label>
                                            <select id="sort-by" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition text-slate-900">
                                                <option value="name">Nome (A-Z)</option>
                                                {proximityFilter !== 'all' && <option value="distance">Mais Próximo</option>}
                                                <option value="rating_our">Melhor Avaliação (Nossa)</option>
                                                <option value="rating_google">Melhor Avaliação (Google)</option>
                                                <option value="price_asc">Mais Barato</option>
                                                <option value="price_desc">Mais Caro</option>
                                                <option value="recent">Adicionados Recentemente</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {viewMode === 'list' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredAndSortedRestaurants.map(r => {
                                    const distanceToDisplay = (proximityFilter !== 'all' && r.distance !== Infinity)
                                        ? Math.min(r.distance * 1.3, proximityRadius)
                                        : r.distance;

                                    return (
                                        <RestaurantCard 
                                            key={r.id} 
                                            restaurant={r} 
                                            distance={distanceToDisplay} 
                                            onSelect={setModalContent} 
                                            onToggleFavorite={handleToggleFavorite} 
                                            onRemoveFromList={handleRemoveFromList} 
                                            currentUser={currentUser.name as User} 
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                             <AchievementsMap
                                restaurants={filteredAndSortedRestaurants}
                                onSelectRestaurant={(r) => setModalContent(r as CoupleRestaurant)}
                            />
                        )}
                    </>
                ) : (
                    <EmptyState
                        onImportClick={() => setModalContent('import')}
                        onAddClick={() => setModalContent('add')}
                        hasCuratedLists={hasCuratedLists}
                    />
                )}
                 
                 <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3">
                    <Button onClick={handleOpenDiscovery} disabled={isLoading || viewMode === 'map'} className="!rounded-full !p-4 shadow-lg" variant="accent" title="Tinder de Restaurantes">
                        <SparklesIcon className="w-6 h-6"/>
                    </Button>
                    <Button onClick={() => setIsRouletteOpen(true)} disabled={isLoading || viewMode === 'map'} className="!rounded-full !p-4 shadow-lg" variant="accent" title="Roleta do Date">
                        <TicketIcon className="w-6 h-6"/>
                    </Button>
                    <Button onClick={() => setModalContent('add')} className="!rounded-full !p-4 shadow-lg" variant="primary" title="Adicionar Novo Restaurante"><PlusIcon className="w-6 h-6"/></Button>
                </div>
            </div>
            
             <Modal isOpen={isAddressModalOpen} onClose={() => {}} title="Configurar Endereço">
                <AddressSetupModal onSave={handleSaveAddress} onSkip={() => setIsAddressModalOpen(false)} />
            </Modal>

            <Modal isOpen={modalContent !== null && typeof modalContent === 'object'} onClose={() => setModalContent(null)} title={modalContent && typeof modalContent === 'object' ? modalContent.name : ''}>
                {modalContent && typeof modalContent === 'object' && <RestaurantDetail restaurant={modalContent} currentUser={currentUser} onUpdateReview={handleUpdateReview} onUpdatePriceRange={handleUpdatePriceRange} onUpdateGoogleRating={handleUpdateGoogleRating} onUpdateMemories={handleUpdateMemories} onUpdatePromotions={handleUpdatePromotions} onSaveDatePlan={handleSaveDatePlan} onEdit={handleOpenEditModal} onRemoveFromList={handleRemoveFromList} onToggleFavorite={handleToggleFavorite} onUpdateLocation={handleUpdateLocation} />}
            </Modal>
            <Modal isOpen={modalContent === 'add'} onClose={() => setModalContent(null)} title="Adicionar Novo Restaurante">
                <RestaurantForm onSave={(data) => handleSaveRestaurant(data)} onClose={() => setModalContent(null)} currentCity={currentCity} />
            </Modal>
            <Modal isOpen={modalContent === 'import'} onClose={() => setModalContent(null)} title="Importar Lista de Restaurantes">
                 <div className="space-y-6">
                    <p className="text-sm text-slate-600 text-center">Selecione uma lista para adicionar os restaurantes dela à sua lista.</p>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto -mx-2 px-2">
                        {curatedLists.map(list => {
                             const listRestaurants = list.restaurant_ids
                                .map(id => allRestaurants.find(r => r.id === id))
                                .filter((r): r is Restaurant => r !== undefined);

                            return (
                                <div key={list.id} className="bg-slate-50 rounded-xl overflow-hidden shadow-md border border-slate-200">
                                    <div className="p-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-3xl">{list.icon || '🍽️'}</span>
                                            <div>
                                                <h4 className="font-bold text-lg text-dark">{list.name}</h4>
                                                <p className="text-sm text-slate-500">{list.description}</p>
                                            </div>
                                        </div>
                                         <div className="flex -space-x-2 justify-center my-3 h-10">
                                            {listRestaurants.slice(0, 5).map(r => (
                                                <img key={r.id} src={r.image || undefined} alt={r.name} title={r.name} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow"/>
                                            ))}
                                            {listRestaurants.length > 5 && (
                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 border-2 border-white shadow">
                                                    +{listRestaurants.length - 5}
                                                </div>
                                            )}
                                        </div>
                                        <Button size="md" onClick={() => handleImportList(list)} disabled={isImporting} className="w-full">
                                            {isImporting ? 'Importando...' : `Importar ${list.restaurant_ids.length} Restaurantes`}
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </Modal>
            <Modal isOpen={editingRestaurant !== null} onClose={() => setEditingRestaurant(null)} title={`Editando: ${editingRestaurant?.name || ''}`}>
                <RestaurantForm initialData={editingRestaurant} onSave={(data) => handleSaveRestaurant(data, editingRestaurant?.id)} onClose={() => setEditingRestaurant(null)} currentCity={editingRestaurant?.city || currentCity} />
            </Modal>
             <Modal isOpen={isRouletteOpen} onClose={() => setIsRouletteOpen(false)} title="">
                <DateRoulette
                    restaurants={coupleRestaurants}
                    currentUser={currentUser.name as User}
                    onClose={() => setIsRouletteOpen(false)}
                    onSelectRestaurant={(r) => setModalContent(r)}
                    onToggleFavorite={handleToggleFavorite}
                    onRemoveFromList={handleRemoveFromList}
                />
            </Modal>
            {isDiscoveryOpen && (
                <div className="fixed inset-0 bg-slate-100 z-50 animate-fade-in">
                    <RestaurantDiscovery 
                        restaurants={discoverySnapshot}
                        onClose={() => setIsDiscoveryOpen(false)}
                        onInterest={(id) => handleSetFavoriteState(id, true)}
                        onDislike={(id) => handleSetFavoriteState(id, false)}
                        currentUser={currentUser.name as User}
                    />
                </div>
            )}
        </>
    );
};

export default RestaurantsApp;
