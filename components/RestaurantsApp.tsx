import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Restaurant, Review, User, RestaurantCategory, Memory, DatePlan, UserProfile, CuratedList } from '../types';
import { RESTAURANT_CATEGORIES, HOME_ADDRESSES, PROXIMITY_THRESHOLD_KM, ADMIN_COUPLE_EMAILS, USERS } from '../constants';
import { PlusIcon, SparklesIcon, ChevronDownIcon, BookmarkIcon } from './Icons';
import { Modal, Button, Input, SegmentedControl } from './UIComponents';
import { RestaurantCard } from './RestaurantCard';
import { RestaurantForm } from './RestaurantForm';
import { RestaurantDetail } from './RestaurantDetail';
import { RestaurantDiscovery } from './RestaurantDiscovery';
import { supabase } from '../utils/supabase';
import { averageRating, extractNeighborhood, calculateDistance } from '../utils/helpers';

interface RestaurantsAppProps {
    currentUser: UserProfile;
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


const RestaurantsApp: React.FC<RestaurantsAppProps> = ({ currentUser }) => {
    const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
    const [coupleRestaurants, setCoupleRestaurants] = useState<CoupleRestaurant[]>([]);
    const [curatedLists, setCuratedLists] = useState<CuratedList[]>([]);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<'all' | RestaurantCategory>('all');
    const [cuisineFilter, setCuisineFilter] = useState<'all' | string>('all');
    const [tourFilter, setTourFilter] = useState<'all' | 'tour_only'>('all');
    const [priceFilters, setPriceFilters] = useState<number[]>([]);
    const [visitedFilter, setVisitedFilter] = useState<'all' | 'visited' | 'not_visited'>('all');
    const [sortBy, setSortBy] = useState<'name' | 'rating_our' | 'rating_google' | 'price_asc' | 'price_desc' | 'recent' | 'distance'>('name');
    const [filtersOpen, setFiltersOpen] = useState(false);
    
    const [neighborhoodFilter, setNeighborhoodFilter] = useState<'all' | string>('all');
    const [proximityFilter, setProximityFilter] = useState<'all' | 'nicolas_home' | 'ana_home'>('all');
    
    const [modalContent, setModalContent] = useState<null | 'add' | 'import' | CoupleRestaurant>(null);
    const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null);
    const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
    const [discoverySnapshot, setDiscoverySnapshot] = useState<Restaurant[]>([]);
    const [dbError, setDbError] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

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

            const [allRestaurantsRes, coupleLinksRes, curatedListsRes] = await Promise.all([
                supabase.from('restaurants').select('*'),
                supabase.from('couple_restaurants').select('is_favorited, restaurants(*)').eq('couple_id', currentUser.couple_id),
                supabase.from('curated_lists').select('*').order('name')
            ]);
            
            if (allRestaurantsRes.error) throw allRestaurantsRes.error;
            if (coupleLinksRes.error) throw coupleLinksRes.error;
            if (curatedListsRes.error && curatedListsRes.error.code !== '42P01') throw curatedListsRes.error;

            setAllRestaurants((allRestaurantsRes.data as any[]) || []);
            const coupleData = (coupleLinksRes.data || [])
                .map(link => (link.restaurants ? { ...(link.restaurants as Restaurant), is_favorited: link.is_favorited } : null))
                .filter((r): r is CoupleRestaurant => r !== null);
            setCoupleRestaurants(coupleData);
            setCuratedLists((curatedListsRes.data as any[]) || []);

        } catch (error: any) {
            console.error('Error fetching data:', error);
            alert("Ocorreu um erro ao carregar os restaurantes.");
        } finally {
            setIsLoading(false);
        }
    }, [currentUser.couple_id]);


    // This useEffect handles both initial data fetching and realtime updates.
    useEffect(() => {
        fetchData(); 

        const channel = supabase.channel('realtime-restaurants-all');

        channel.on(
            'postgres_changes', { event: '*', schema: 'public', table: 'restaurants' }, fetchData
        ).on(
            'postgres_changes', { event: '*', schema: 'public', table: 'curated_lists' }, fetchData
        ).on(
            'postgres_changes', { event: '*', schema: 'public', table: 'couple_restaurants', filter: `couple_id=eq.${currentUser.couple_id}` }, fetchData
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
                    is_favorited: true, // New restaurants are favorited by default
                });
                if (linkError) {
                    console.error("Error linking new restaurant:", linkError);
                    alert("O restaurante foi criado, mas houve um erro ao adicioná-lo à sua lista.");
                    return;
                } else {
                    setModalContent(null);
                }
            }
        }
        
        await fetchData();

    }, [currentUser.name, currentUser.couple_id, fetchData]);

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


    const handleUpdateReview = useCallback(async (restaurantId: string, review: Review) => {
        const restaurant = allRestaurants.find(r => r.id === restaurantId);
        if (!restaurant) return;
        
        const otherReviews = restaurant.reviews.filter(rv => rv.user !== review.user);
        const newReviews = [...otherReviews, review];

        const { error } = await supabase.from('restaurants').update({ reviews: newReviews } as any).eq('id', restaurantId);

        if (error) console.error('Error updating review:', error);
    }, [allRestaurants]);

    const handleUpdateMemories = useCallback(async (restaurantId: string, newMemories: Memory[]) => {
        const { error } = await supabase.from('restaurants').update({ memories: newMemories } as any).eq('id', restaurantId);
        if (error) console.error('Error updating memories:', error);
    }, []);

    const handleUpdatePromotions = useCallback(async (restaurantId: string, promotions: string) => {
        const { error } = await supabase.from('restaurants').update({ weekly_promotions: promotions } as any).eq('id', restaurantId);
        if (error) {
             console.error('Error updating promotions:', error);
             alert('Erro ao salvar as promoções.');
        }
    }, []);
    
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
            const linksToInsert = list.restaurant_ids.map(id => ({
                couple_id: currentUser.couple_id!,
                restaurant_id: id,
                is_favorited: false, // Items from lists are not favorited by default
            }));

            // Upsert will insert new rows, and ignore existing ones based on the primary key constraint
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
    
    const handleAddToList = useCallback(async (restaurantId: string) => {
        if (!currentUser.couple_id) return;

        const { error } = await supabase
            .from('couple_restaurants')
            .insert({ couple_id: currentUser.couple_id, restaurant_id: restaurantId, is_favorited: true });

        if (error) {
            console.error('Error adding to list from discovery:', error);
        } else {
            // No need to fetch, discovery mode will just move to the next card
        }
    }, [currentUser.couple_id]);

    const handleOpenDiscovery = () => {
        setDiscoverySnapshot(restaurantsForDiscovery);
        setIsDiscoveryOpen(true);
    };

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

    const filteredAndSortedRestaurants = useMemo(() => {
         return coupleRestaurants
            .filter(r => {
                if (visitedFilter === 'all') return true;
                const hasVisited = r.reviews.some(review => review.user === (currentUser.name as User) && review.rating > 0);
                return visitedFilter === 'visited' ? hasVisited : !hasVisited;
            })
            .filter(r => categoryFilter === 'all' || r.category === categoryFilter)
            .filter(r => cuisineFilter === 'all' || (r.cuisine && r.cuisine.toLowerCase().includes(cuisineFilter.toLowerCase())))
            .filter(r => tourFilter === 'all' || r.inTourOqfc === true)
            .filter(r => {
                const term = searchTerm.toLowerCase();
                if (!term) return true;
                return r.name.toLowerCase().includes(term) ||
                       (r.cuisine && r.cuisine.toLowerCase().includes(term)) ||
                       (r.locations && r.locations.some(l => l.address.toLowerCase().includes(term)));
            })
            .filter(r => priceFilters.length === 0 || (r.price_range !== null && priceFilters.includes(r.price_range)))
             .filter(r => {
                if (neighborhoodFilter === 'all') return true;
                return r.locations.some(l => {
                    const neighborhood = extractNeighborhood(l.address);
                    return neighborhood?.toLowerCase() === neighborhoodFilter.toLowerCase();
                });
            })
            .filter(r => {
                if (proximityFilter === 'all') return true;
                const targetCoords = proximityFilter === 'nicolas_home' 
                    ? HOME_ADDRESSES.nicolas.coords 
                    : HOME_ADDRESSES.ana.coords;
                
                return r.locations.some(l => {
                    if (l.latitude && l.longitude) {
                        const distance = calculateDistance(targetCoords.latitude, targetCoords.longitude, l.latitude, l.longitude);
                        return distance <= PROXIMITY_THRESHOLD_KM;
                    }
                    return false;
                });
            })
            .map(r => {
                let distance = Infinity;
                if (proximityFilter !== 'all') {
                    const targetCoords = proximityFilter === 'nicolas_home' 
                        ? HOME_ADDRESSES.nicolas.coords 
                        : HOME_ADDRESSES.ana.coords;
                    
                    const distances = r.locations
                        .map(l => l.latitude && l.longitude ? calculateDistance(targetCoords.latitude, targetCoords.longitude, l.latitude, l.longitude) : Infinity);
                    distance = Math.min(...distances);
                }
                return { ...r, distance };
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
    }, [coupleRestaurants, currentUser.name, categoryFilter, cuisineFilter, searchTerm, tourFilter, priceFilters, visitedFilter, sortBy, neighborhoodFilter, proximityFilter]);

    const restaurantsForDiscovery = useMemo(() => {
        const coupleRestaurantIds = new Set(coupleRestaurants.map(r => r.id));
        return allRestaurants.filter(r => !coupleRestaurantIds.has(r.id));
    }, [allRestaurants, coupleRestaurants]);
    
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
                                    placeholder="Buscar na sua lista..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="flex-grow"
                                />
                                {hasCuratedLists && (
                                    <Button variant="secondary" onClick={() => setModalContent('import')}>
                                        <BookmarkIcon className="w-5 h-5"/>
                                        <span>Importar Listas</span>
                                    </Button>
                                )}
                            </div>
                            <div className="mt-2">
                                <button onClick={() => setFiltersOpen(!filtersOpen)} className="w-full flex justify-between items-center text-left font-semibold text-slate-700 p-2 rounded-lg hover:bg-slate-100">
                                    <span>Filtros e Ordenação</span>
                                    <ChevronDownIcon className={`w-5 h-5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {filtersOpen && (
                                    <div className="mt-2 pt-4 border-t space-y-4 animate-fade-in">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as any)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition">
                                                <option value="all">Todas as Categorias</option>
                                                {RESTAURANT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <select value={cuisineFilter} onChange={e => setCuisineFilter(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition">
                                                <option value="all">Todos os Tipos</option>
                                                {uniqueCuisines.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label htmlFor="neighborhood-filter" className="text-sm font-medium text-slate-600 block mb-1">Filtrar por Bairro:</label>
                                                <select id="neighborhood-filter" value={neighborhoodFilter} onChange={e => setNeighborhoodFilter(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition">
                                                    <option value="all">Todos os Bairros</option>
                                                    {uniqueNeighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium text-slate-600 block mb-1">Filtrar por Proximidade:</label>
                                                <SegmentedControl
                                                    value={proximityFilter}
                                                    onChange={(value) => setProximityFilter(value)}
                                                    options={[
                                                        { label: 'Qualquer', value: 'all' },
                                                        { label: 'Casa (NV)', value: 'nicolas_home' },
                                                        { label: 'Casa (AB)', value: 'ana_home' },
                                                    ]}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <SegmentedControl value={visitedFilter} onChange={(value) => setVisitedFilter(value)} options={[{label: 'Todos', value: 'all'},{label: 'Já Fui', value: 'visited'},{label: 'Não Fui', value: 'not_visited'}]}/>
                                            <SegmentedControl value={tourFilter} onChange={(value) => setTourFilter(value)} options={[{ label: 'Todos', value: 'all' },{ label: 'Apenas Tour OQFC', value: 'tour_only' }]}/>
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
                                            <select id="sort-by" value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition">
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

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredAndSortedRestaurants.map(r => (
                                <RestaurantCard key={r.id} restaurant={r} distance={r.distance} onSelect={setModalContent} onToggleFavorite={handleToggleFavorite} onRemoveFromList={handleRemoveFromList} currentUser={currentUser.name as User} />
                            ))}
                        </div>
                    </>
                ) : (
                    <EmptyState
                        onImportClick={() => setModalContent('import')}
                        onAddClick={() => setModalContent('add')}
                        hasCuratedLists={hasCuratedLists}
                    />
                )}
                 
                 <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3">
                    <Button onClick={handleOpenDiscovery} disabled={isLoading} className="!rounded-full !p-4 shadow-lg animate-glow" variant="accent" title="Modo Descoberta">
                        <SparklesIcon className="w-6 h-6"/>
                    </Button>
                    <Button onClick={() => setModalContent('add')} className="!rounded-full !p-4 shadow-lg" variant="primary" title="Adicionar Novo Restaurante"><PlusIcon className="w-6 h-6"/></Button>
                </div>
            </div>
            
            <Modal isOpen={modalContent !== null && typeof modalContent === 'object'} onClose={() => setModalContent(null)} title={modalContent && typeof modalContent === 'object' ? modalContent.name : ''}>
                {modalContent && typeof modalContent === 'object' && <RestaurantDetail restaurant={modalContent} currentUser={currentUser} onUpdateReview={handleUpdateReview} onUpdateMemories={handleUpdateMemories} onUpdatePromotions={handleUpdatePromotions} onSaveDatePlan={handleSaveDatePlan} onEdit={handleOpenEditModal} onRemoveFromList={handleRemoveFromList} onToggleFavorite={handleToggleFavorite} />}
            </Modal>
            <Modal isOpen={modalContent === 'add'} onClose={() => setModalContent(null)} title="Adicionar Novo Restaurante">
                <RestaurantForm onSave={(data) => handleSaveRestaurant(data)} onClose={() => setModalContent(null)} />
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
                <RestaurantForm initialData={editingRestaurant} onSave={(data) => handleSaveRestaurant(data, editingRestaurant?.id)} onClose={() => setEditingRestaurant(null)} />
            </Modal>
            {isDiscoveryOpen && (
                <div className="fixed inset-0 bg-slate-100 z-50 animate-fade-in">
                    <RestaurantDiscovery 
                        restaurants={discoverySnapshot}
                        onClose={() => setIsDiscoveryOpen(false)}
                        onInterest={handleAddToList}
                        currentUser={currentUser.name as User}
                    />
                </div>
            )}
        </>
    );
};

export default RestaurantsApp;