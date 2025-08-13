import React, { useState, useCallback } from 'react';
import { UserProfile, AIRecommendation } from '../types';
import { Button, PriceRatingDisplay, StarRatingDisplay } from './UIComponents';
import { GoogleGenAI } from "@google/genai";
import { LightBulbIcon, SparklesIcon, MapPinIcon, StarIcon, TruckIcon, BuildingStorefrontIcon, ArrowPathIcon, GoogleIcon, PlusIcon } from './Icons';
import { supabase } from '../utils/supabase';

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
    onTryAgain: () => void,
    onAddToMyList: (recommendation: AIRecommendation) => void,
    isAdding: boolean,
}> = ({ recommendation, onTryAgain, onAddToMyList, isAdding }) => {
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
                    <Button onClick={onTryAgain} variant="secondary" className="flex-1 !justify-center">
                        <ArrowPathIcon className="w-5 h-5"/> Tentar Novamente
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

    const handleRecommend = useCallback(async () => {
        if (!cravings.trim()) {
            setError("Por favor, diga o que você está com vontade de comer.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setRecommendation(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
                Você é um assistente gourmet especialista em Curitiba. Baseado nos desejos e restrições do usuário, sua tarefa é recomendar um único restaurante na cidade. Use a busca do Google para obter informações atualizadas.

                Desejos do usuário: "${cravings}"
                Restrições (o que evitar): "${exclusions || 'Nenhuma'}"

                Sua resposta DEVE ser APENAS um objeto JSON válido, sem nenhum texto adicional, explicações ou formatação markdown.

                O objeto JSON deve ter a seguinte estrutura:
                {
                    "restaurant_name": "string",
                    "category": "string",
                    "reason": "Uma frase curta e convincente explicando por que esta é a recomendação perfeita baseada nos desejos do usuário.",
                    "price_range": "number (1-4)",
                    "delivery": "boolean",
                    "dine_in": "boolean",
                    "address": "string",
                    "rating": "number | null",
                    "image_url": "string | null",
                    "maps_url": "string | null"
                }

                Encontre a melhor opção e retorne o JSON.
            `;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                     tools: [{googleSearch: {}}],
                },
            });

            const responseText = response.text.trim();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
                throw new Error("A IA não retornou um JSON válido. Resposta recebida: " + responseText);
            }
            
            const result = JSON.parse(jsonMatch[0]) as AIRecommendation;
            setRecommendation(result);

        } catch (e) {
            console.error("AI Recommender Error:", e);
            const errorMessage = (e instanceof Error) ? e.message : "Ocorreu um erro desconhecido.";
            setError("Oops! A IA se atrapalhou na cozinha. " + errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [cravings, exclusions]);

    const handleAddToMyList = async (rec: AIRecommendation) => {
        if (!currentUser.couple_id) {
            alert("Erro: seu perfil não está associado a um casal.");
            return;
        }
        setIsAdding(true);
        
        try {
            // Check if restaurant already exists by name
            const { data: existing, error: findError } = await supabase
                .from('restaurants')
                .select('id')
                .eq('name', rec.restaurant_name)
                .maybeSingle();

            if(findError) throw findError;

            let restaurantId = existing?.id;

            // If it doesn't exist, create it
            if (!restaurantId) {
                const { data: newRestaurant, error: insertError } = await supabase
                    .from('restaurants')
                    .insert([{
                        name: rec.restaurant_name,
                        category: rec.category,
                        cuisine: rec.category,
                        locations: [{ address: rec.address, latitude: null, longitude: null }],
                        image: rec.image_url,
                        wants_to_go: [],
                        reviews: [],
                        addedBy: currentUser.name,
                        price_range: rec.price_range,
                        google_rating: rec.rating,
                        google_rating_source_uri: rec.maps_url,
                    }] as any)
                    .select('id')
                    .single();
                
                if (insertError) throw insertError;
                restaurantId = newRestaurant.id;
            }

            // Link restaurant to the couple
            const { error: linkError } = await supabase
                .from('couple_restaurants')
                .upsert({ couple_id: currentUser.couple_id, restaurant_id: restaurantId });
            
            if (linkError) throw linkError;
            
            alert(`${rec.restaurant_name} foi adicionado à sua lista!`);

        } catch(e) {
             const errorMessage = (e instanceof Error) ? e.message : "Erro desconhecido.";
             alert(`Não foi possível adicionar à lista: ${errorMessage}`);
        } finally {
            setIsAdding(false);
        }
    };


    const handleTryAgain = () => {
        setRecommendation(null);
        setError(null);
    }
    
    return (
        <div className="p-4 sm:p-8 w-full min-h-screen flex items-center justify-center bg-slate-50/50">
            {isLoading ? <LoadingState /> :
             recommendation ? <ResultCard recommendation={recommendation} onTryAgain={handleTryAgain} onAddToMyList={handleAddToMyList} isAdding={isAdding} /> :
             (
                <div className="w-full max-w-2xl text-center">
                    <LightBulbIcon className="w-16 h-16 text-amber-400 mx-auto mb-4"/>
                    <h1 className="text-4xl font-bold text-dark mb-2">O que vamos comer hoje?</h1>
                    <p className="text-slate-600 mb-8">Descreva seus desejos e aversões, e deixe a IA encontrar o lugar perfeito para vocês em Curitiba.</p>

                    <div className="space-y-4 text-left">
                        <div>
                             <label htmlFor="cravings" className="font-semibold text-slate-700">Me diga o que você quer...</label>
                             <textarea
                                id="cravings"
                                value={cravings}
                                onChange={(e) => setCravings(e.target.value)}
                                rows={3}
                                placeholder="Ex: algo com queijo derretido, crocante, finger food, não muito caro..."
                                className="mt-1 w-full p-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition"
                            />
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

                    <Button onClick={handleRecommend} size="lg" className="mt-8 !px-10 !py-4" disabled={isLoading}>
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