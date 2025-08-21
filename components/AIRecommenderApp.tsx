/// <reference types="vite/client" />

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UserProfile, AIRecommendation, AIRecommenderHistoryItem } from '../types';
import { Button, PriceRatingDisplay, StarRatingDisplay } from './UIComponents';
import { GoogleGenAI, Type } from "@google/genai";
import { LightBulbIcon, SparklesIcon, MapPinIcon, StarIcon, TruckIcon, BuildingStorefrontIcon, ArrowPathIcon, GoogleIcon, PlusIcon, ClockIcon } from './Icons';
import { supabase } from '../utils/supabase';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface AIRecommenderAppProps {
    currentUser: UserProfile;
}

const LoadingState: React.FC = () => {
    const messages = [
        "Consultando os melhores chefs de Curitiba...",
        "Analisando cardápios e temperos...",
        "Ligando para os restaurantes... (brincadeira!)",
        "Ajustando a bússola do sabor...",
        "Verificando o nível de 'crocância'...",
    ];
    const [message, setMessage] = useState(messages[0]);

    React.useEffect(() => {
        const interval = setInterval(() => {
            setMessage(messages[Math.floor(Math.random() * messages.length)]);
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center gap-4 text-center">
            <SparklesIcon className="w-16 h-16 text-primary animate-pulse" />
            <h2 className="text-2xl font-bold text-dark">Buscando a Opção Perfeita...</h2>
            <p className="text-slate-500 transition-all duration-300">{message}</p>
        </div>
    );
};

const ResultCard: React.FC<{
    recommendation: AIRecommendation,
    onNewSearch: () => void,
    onAddToMyList: (recommendation: AIRecommendation) => void,
    isAdding: boolean,
}> = ({ recommendation, onNewSearch, onAddToMyList, isAdding }) => {
    return (
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-fade-in">
            {recommendation.image_url && (
                <div className="h-64 bg-slate-200">
                    <img src={recommendation.image_url} alt={recommendation.restaurant_name} className="w-full h-full object-cover" />
                </div>
            )}
            <div className="p-8 space-y-6">
                <div>
                    <p className="text-sm font-bold text-primary uppercase tracking-wide">{recommendation.category}</p>
                    <h2 className="text-4xl font-bold text-dark mt-1">{recommendation.restaurant_name}</h2>
                </div>
                
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                    <h3 className="font-bold text-blue-900 flex items-center gap-2"><LightBulbIcon className="w-5 h-5"/> Por que este lugar?</h3>
                    <p className="text-blue-800 mt-1">{recommendation.reason}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-6 border-t">
                    <div className="flex items-center gap-3"><MapPinIcon className="w-6 h-6 text-slate-500"/><span className="text-dark">{recommendation.address}</span></div>
                    <div className="flex items-center gap-3"><PriceRatingDisplay rating={recommendation.price_range} className="text-2xl" /><span className="text-dark">Faixa de Preço</span></div>
                    <div className="flex items-center gap-3"><TruckIcon className="w-6 h-6 text-slate-500"/><span className="text-dark">Delivery: {recommendation.delivery ? 'Sim' : 'Não'}</span></div>
                    <div className="flex items-center gap-3"><BuildingStorefrontIcon className="w-6 h-6 text-slate-500"/><span className="text-dark">Presencial: {recommendation.dine_in ? 'Sim' : 'Não'}</span></div>
                    {recommendation.rating && (
                        <div className="flex items-center gap-3"><GoogleIcon className="w-6 h-6"/><StarRatingDisplay rating={recommendation.rating} /><span className="font-semibold text-sm text-slate-500">({recommendation.rating})</span></div>
                    )}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t">
                    {recommendation.maps_url && (
                        <a href={recommendation.maps_url} target="_blank" rel="noopener noreferrer" className="font-semibold transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center gap-2 rounded-lg active:scale-95 px-4 py-2 text-base bg-primary text-white hover:bg-primary-focus focus:ring-primary shadow-sm hover:shadow-md flex-1 justify-center">
                            <MapPinIcon className="w-5 h-5"/> Ver no Mapa
                        </a>
                    )}
                    <Button onClick={() => onAddToMyList(recommendation)} variant="secondary" className="flex-1 !justify-center" disabled={isAdding}>
                       <PlusIcon className="w-5 h-5"/> {isAdding ? 'Adicionando...' : 'Adicionar à Minha Lista'}
                    </Button>
                    <Button onClick={onNewSearch} variant="secondary" className="flex-1 !justify-center">
                        <ArrowPathIcon className="w-5 h-5"/> Nova Busca
                    </Button>
                </div>
            </div>
        </div>
    );
};

const AIRecommenderApp: React.FC<AIRecommenderAppProps> = ({ currentUser }) => {
    const [cravings, setCravings] = useState('');
    const [exclusions, setExclusions] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);
    const [error, setError] = useState<string | null>(null);

    // New feature states
    const [history, setHistory] = useLocalStorage<AIRecommenderHistoryItem[]>('aiRecommenderHistory', []);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const cravingsInputRef = useRef<HTMLTextAreaElement>(null);
    const debounceTimeoutRef = useRef<number | null>(null);

    const handleRecommend = useCallback(async (cravingsOverride?: string, exclusionsOverride?: string) => {
        const cravingsToUse = cravingsOverride ?? cravings;
        const exclusionsToUse = exclusionsOverride ?? exclusions;

        if (!cravingsToUse.trim()) {
            setError("Por favor, diga o que você está com vontade de comer.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setRecommendation(null);
        setSuggestions([]);

        const maxRetries = 2;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

                const prompt = `
                    Você é um assistente gourmet especialista em Curitiba. Baseado nos desejos e restrições do usuário, sua tarefa é recomendar um único restaurante na cidade. Use a busca do Google para obter informações atualizadas.

                    Desejos do usuário: "${cravingsToUse}"
                    Restrições (o que evitar): "${exclusionsToUse || 'Nenhuma'}"

                    Encontre a melhor opção e retorne APENAS um objeto JSON com as seguintes chaves: restaurant_name, category, reason, price_range (1-4), delivery (boolean), dine_in (boolean), address, rating (number|null), image_url (string|null), maps_url (string|null).
                `;
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: {
                        tools: [{ googleSearch: {} }],
                    },
                });

                let jsonString = response.text.trim();
                const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
                if (!jsonMatch) {
                    throw new Error("A IA não retornou um JSON válido. Resposta: " + jsonString);
                }
                jsonString = jsonMatch[1] || jsonMatch[2];
                const result = JSON.parse(jsonString) as AIRecommendation;
                setRecommendation(result);

                const newHistoryItem = { cravings: cravingsToUse, exclusions: exclusionsToUse };
                setHistory(prev => {
                    const filtered = prev.filter(h => h.cravings !== newHistoryItem.cravings || h.exclusions !== newHistoryItem.exclusions);
                    return [newHistoryItem, ...filtered].slice(0, 5);
                });

                setIsLoading(false);
                return;

            } catch (e: any) {
                console.error(`AI Recommender Error (Attempt ${attempt}):`, e);
                const errorMessage = e?.message ? e.message.toString() : JSON.stringify(e);
                const isInternalError = errorMessage.includes('500') || errorMessage.includes('INTERNAL');

                if (isInternalError && attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                setError("Oops! A IA se atrapalhou na cozinha. " + errorMessage);
                setIsLoading(false);
                return;
            }
        }
    }, [cravings, exclusions, setHistory]);

    const fetchSuggestions = useCallback(async (query: string) => {
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});
            const prompt = `Baseado no que o usuário está digitando para uma busca de restaurante: "${query}", gere até 5 sugestões curtas para autocompletar. As sugestões podem ser tipos de culinária, pratos específicos ou características (ex: "comida de boteco", "ambiente romântico"). Retorne um objeto JSON com uma chave "suggestions" que contém um array de strings.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            suggestions: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.STRING,
                                },
                            },
                        },
                    },
                    thinkingConfig: { thinkingBudget: 0 } // Faster response for autocomplete
                },
            });

            const result = JSON.parse(response.text.trim());
            if (result.suggestions && Array.isArray(result.suggestions)) {
                // Filter out suggestions that are already in the input to avoid redundancy
                setSuggestions(result.suggestions.filter((s: string) => !query.toLowerCase().includes(s.toLowerCase())));
            }
        } catch (e) {
            console.error("Autocomplete fetch error:", e);
            setSuggestions([]); // Clear suggestions on error
        }
    }, []);

    const debouncedFetchSuggestions = useCallback((query: string) => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        // Clear suggestions immediately and do not set a timeout if query is too short
        if (query.trim().length < 3) {
            setSuggestions([]);
            return;
        }
        debounceTimeoutRef.current = window.setTimeout(() => {
            fetchSuggestions(query);
        }, 250); // Reduced delay for faster response
    }, [fetchSuggestions]);


    const handleCravingsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setCravings(value);
        debouncedFetchSuggestions(value);
    };
    
    const handleSuggestionClick = (suggestion: string) => {
        setCravings(prev => {
            const trimmedPrev = prev.trim();
            const words = trimmedPrev.split(/\s+/);
            const lastWord = words.pop() || '';

            // Check if the suggestion is a completion of the last word
            if (suggestion.toLowerCase().startsWith(lastWord.toLowerCase())) {
                return [...words, suggestion].join(' ') + ' ';
            } else {
                return `${trimmedPrev} ${suggestion} `;
            }
        });
        setSuggestions([]);
        cravingsInputRef.current?.focus();
    };
    
    const quickFilters = [
        { label: '🍔 Lanches', prompt: "Encontre um restaurante em Curitiba especializado em lanches saborosos, como hambúrguer artesanal, sanduíches e acompanhamentos como batata frita. Priorize lugares bem avaliados, aconchegantes e com bom custo-benefício." },
        { label: '🍣 Sushi', prompt: "Sugira um restaurante japonês em Curitiba com foco em sushi fresco, sashimi e combinados variados. Dê preferência a locais bem avaliados, com ambiente agradável e ingredientes de alta qualidade." },
        { label: '🍕 Pizza', prompt: "Encontre uma pizzaria em Curitiba que sirva pizzas artesanais ou tradicionais, com variedade de sabores e boa reputação. Priorize ambientes confortáveis e preços justos." },
        { label: '💖 Romântico', prompt: "Sugira um restaurante em Curitiba com atmosfera romântica, iluminação aconchegante e boa gastronomia, ideal para um jantar a dois. Pode ser de qualquer culinária, mas deve ter boas avaliações e ambiente intimista." },
        { label: '🍝 Massas', prompt: "Encontre um restaurante italiano em Curitiba especializado em massas frescas e pratos típicos, como lasanha, nhoque e fettuccine. Priorize locais autênticos, bem avaliados e com boa carta de vinhos." },
        { label: '🔁 Rodízio', prompt: "Sugira um restaurante em Curitiba famoso pelo seu rodízio, seja de carnes (churrascaria), pizza ou comida japonesa. Priorize locais com boas avaliações, variedade e um ambiente agradável." },
        { label: '🍽️ Buffet', prompt: "Encontre um restaurante em Curitiba que ofereça um buffet por quilo ou livre de alta qualidade, ideal para o almoço. Busque por opções com variedade de saladas, pratos quentes e boa reputação." }
    ];

    const handleQuickFilterClick = (prompt: string) => {
        setCravings(prompt);
        setExclusions('');
        cravingsInputRef.current?.focus();
    };
    
    const handleHistoryClick = (item: AIRecommenderHistoryItem) => {
        setCravings(item.cravings);
        setExclusions(item.exclusions);
        handleRecommend(item.cravings, item.exclusions);
    };

    const handleAddToMyList = async (rec: AIRecommendation) => {
        if (!currentUser.couple_id) {
            alert("Erro: seu perfil não está associado a um casal.");
            return;
        }
        setIsAdding(true);
        
        try {
            const { data: existing, error: findError } = await supabase.from('restaurants').select('id').eq('name', rec.restaurant_name).maybeSingle();
            if(findError) throw findError;
            let restaurantId = existing?.id;

            if (!restaurantId) {
                const { data: newRestaurant, error: insertError } = await supabase
                    .from('restaurants')
                    .insert([{
                        name: rec.restaurant_name,
                        category: rec.category,
                        cuisine: rec.category,
                        city: 'Curitiba',
                        locations: [{ address: rec.address, latitude: null, longitude: null }],
                        image: rec.image_url,
                        addedBy: currentUser.name,
                        price_range: rec.price_range,
                        google_rating: rec.rating,
                        google_rating_source_uri: rec.maps_url,
                    }]).select('id').single();
                if (insertError) throw insertError;
                restaurantId = newRestaurant.id;
            }

            const { error: linkError } = await supabase.from('couple_restaurants').upsert([{ couple_id: currentUser.couple_id, restaurant_id: restaurantId }]);
            if (linkError) throw linkError;
            alert(`${rec.restaurant_name} foi adicionado à sua lista!`);
        } catch(e) {
             const errorMessage = (e instanceof Error) ? e.message : "Erro desconhecido.";
             alert(`Não foi possível adicionar à lista: ${errorMessage}`);
        } finally {
            setIsAdding(false);
        }
    };

    const handleNewSearch = () => {
        setRecommendation(null);
        setError(null);
    }
    
    return (
        <div className="p-4 sm:p-8 w-full min-h-screen flex items-center justify-center bg-slate-50/50">
            {isLoading ? <LoadingState /> :
             recommendation ? <ResultCard recommendation={recommendation} onNewSearch={handleNewSearch} onAddToMyList={handleAddToMyList} isAdding={isAdding} /> :
             (
                <div className="w-full max-w-2xl text-center">
                    <LightBulbIcon className="w-16 h-16 text-amber-400 mx-auto mb-4"/>
                    <h1 className="text-4xl font-bold text-dark mb-2">O que vamos comer hoje?</h1>
                    <p className="text-slate-600 mb-8">Descreva seus desejos e aversões, e deixe a IA encontrar o lugar perfeito para vocês em Curitiba.</p>

                    <div className="space-y-4 text-left">
                        <div>
                             <label htmlFor="cravings" className="font-semibold text-slate-700">Me diga o que você quer...</label>
                             <div className="relative">
                                <textarea
                                    ref={cravingsInputRef}
                                    id="cravings"
                                    value={cravings}
                                    onChange={handleCravingsChange}
                                    rows={3}
                                    placeholder="Ex: algo com queijo derretido, crocante, finger food, não muito caro..."
                                    className="mt-1 w-full p-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition"
                                />
                                {suggestions.length > 0 && (
                                    <div className="absolute z-10 w-full bg-white border border-slate-300 rounded-lg mt-1 shadow-lg p-1">
                                        {suggestions.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => handleSuggestionClick(s)}
                                                className="w-full text-left px-3 py-1.5 rounded-md hover:bg-slate-100"
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                             </div>
                             <div className="mt-2 flex flex-wrap gap-2">
                                {quickFilters.map(filter => (
                                    <button key={filter.label} onClick={() => handleQuickFilterClick(filter.prompt)} className="px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-200 bg-slate-200 text-slate-700 hover:bg-slate-300">
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                         <div>
                             <label htmlFor="exclusions" className="font-semibold text-slate-700">Algo para evitar?</label>
                            <input
                                id="exclusions"
                                type="text"
                                value={exclusions}
                                onChange={(e) => setExclusions(e.target.value)}
                                placeholder="Ex: sem pizza, nada de frutos do mar"
                                className="mt-1 w-full p-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition"
                            />
                        </div>
                    </div>
                    
                    {error && <p className="text-red-600 bg-red-100 p-3 rounded-lg mt-6">{error}</p>}
                    
                    {history.length > 0 && (
                        <div className="mt-8 text-left">
                            <h3 className="font-semibold text-slate-700 flex items-center gap-2 mb-2">
                                <ClockIcon className="w-5 h-5"/>
                                Buscas Recentes
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {history.map((item, index) => (
                                    <button 
                                        key={index}
                                        onClick={() => handleHistoryClick(item)}
                                        className="px-3 py-1 text-sm font-medium rounded-full transition-colors duration-200 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400"
                                    >
                                        {item.cravings}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <Button onClick={() => handleRecommend()} size="lg" className="mt-8 !px-10 !py-4" disabled={isLoading}>
                         <SparklesIcon className="w-6 h-6"/>
                        Me Surpreenda!
                    </Button>
                </div>
             )
            }
        </div>
    );
};

export default AIRecommenderApp;
