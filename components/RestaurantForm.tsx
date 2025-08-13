import React, { useState, useEffect, useCallback } from 'react';
import { Restaurant, RestaurantCategory, Location } from '../types';
import { RESTAURANT_CATEGORIES } from '../constants';
import { Input, Button, PriceRatingInput, PriceRatingDisplay } from './UIComponents';
import { SparklesIcon, TrashIcon, PlusIcon, XMarkIcon, GoogleIcon, StarIcon } from './Icons';
import { supabase } from '../utils/supabase';
import { slugify, compressImage } from '../utils/helpers';
import { GoogleGenAI, Type } from "@google/genai";


interface RestaurantFormProps {
    onSave: (restaurant: Omit<Restaurant, 'id' | 'wants_to_go' | 'reviews' | 'addedBy' | 'memories' | 'created_at'>) => Promise<void>;
    onClose: () => void;
    initialData?: Restaurant | null;
}

export const RestaurantForm: React.FC<RestaurantFormProps> = ({ onSave, onClose, initialData = null }) => {
    const isEditMode = !!initialData;
    const [name, setName] = useState('');
    const [category, setCategory] = useState<RestaurantCategory>('Jantar');
    const [cuisine, setCuisine] = useState('');
    const [vibe, setVibe] = useState('');
    const [locations, setLocations] = useState<Location[]>([{ address: '', latitude: null, longitude: null }]);
    const [priceRange, setPriceRange] = useState(0);
    const [inTourOqfc, setInTourOqfc] = useState(false);
    const [menu_url, setMenuUrl] = useState('');
    
    // Google properties
    const [googleRating, setGoogleRating] = useState<number | null>(null);
    const [googleRatingCount, setGoogleRatingCount] = useState<number | null>(null);
    const [googleRatingSourceUri, setGoogleRatingSourceUri] = useState<string | null>(null);
    const [googleRatingSourceTitle, setGoogleRatingSourceTitle] = useState<string | null>(null);

    // Image state
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

    // Loading states
    const [isSaving, setIsSaving] = useState(false);
    const [isAiFilling, setIsAiFilling] = useState(false);
    const [isUpdatingRating, setIsUpdatingRating] = useState(false);
    const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);
    const [isGeneratingVibe, setIsGeneratingVibe] = useState(false);
    const [isCompressing, setIsCompressing] = useState(false);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setCategory(initialData.category);
            setCuisine(initialData.cuisine || '');
            setVibe(initialData.vibe || '');
            setLocations(initialData.locations?.length > 0 ? initialData.locations : [{ address: '', latitude: null, longitude: null }]);
            setPriceRange(initialData.price_range || 0);
            setInTourOqfc(initialData.inTourOqfc || false);
            setCurrentImageUrl(initialData.image || null);
            setImagePreview(initialData.image || null);
            setGoogleRating(initialData.google_rating);
            setGoogleRatingCount(initialData.google_rating_count);
            setGoogleRatingSourceUri(initialData.google_rating_source_uri);
            setGoogleRatingSourceTitle(initialData.google_rating_source_title);
            setMenuUrl(initialData.menu_url || '');
        }
    }, [initialData]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsCompressing(true);
            setImageFile(null);

            // Show a preview immediately with the original image data
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);

            try {
                const compressedFile = await compressImage(file);
                setImageFile(compressedFile);
            } catch (error) {
                console.error("Error compressing image:", error);
                alert("Houve um problema ao processar a imagem. Tente novamente com outra foto.");
                removeImage(); // Reset everything
            } finally {
                setIsCompressing(false);
            }
        }
    };
    
    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
        setCurrentImageUrl(null);
        const fileInput = document.getElementById('restaurant-image') as HTMLInputElement;
        if(fileInput) fileInput.value = '';
    }

    const handleLocationChange = (index: number, field: keyof Location, value: string | number | null) => {
        const newLocations = [...locations];
        (newLocations[index] as any)[field] = value;
        setLocations(newLocations);
    };

    const addLocation = () => setLocations([...locations, { address: '', latitude: null, longitude: null }]);
    const removeLocation = (index: number) => setLocations(locations.filter((_, i) => i !== index));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) {
            alert('O nome do restaurante é obrigatório.');
            return;
        }
        setIsSaving(true);
        let imageUrl = currentImageUrl;
    
        try {
            if (imageFile) {
                if (isEditMode && currentImageUrl) {
                    const oldImagePath = new URL(currentImageUrl).pathname.split('/restaurant-images/')[1];
                    if (oldImagePath) {
                        await supabase.storage.from('restaurant-images').remove([oldImagePath]);
                    }
                }
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${slugify(name)}-${Date.now()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('restaurant-images')
                    .upload(fileName, imageFile);
                if (uploadError) throw uploadError;
                const { data: urlData } = supabase.storage.from('restaurant-images').getPublicUrl(uploadData.path);
                imageUrl = urlData.publicUrl;
            } else if (!currentImageUrl) {
                if (isEditMode && initialData?.image) {
                    const oldImagePath = new URL(initialData.image).pathname.split('/restaurant-images/')[1];
                    if (oldImagePath) {
                        await supabase.storage.from('restaurant-images').remove([oldImagePath]);
                    }
                }
                imageUrl = null;
            }
    
            // Geocode locations that don't have lat/lon
            const geocodedLocations = await Promise.all(
                locations.map(async (loc) => {
                    if (loc.address && (loc.latitude === null || loc.longitude === null)) {
                        try {
                            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                            const prompt = `
                                Para o endereço "${loc.address}, Curitiba, PR, Brasil", forneça as coordenadas geográficas.
                                Retorne APENAS um objeto JSON válido com as chaves "latitude" e "longitude".
                                Exemplo: {"latitude": -25.4284, "longitude": -49.2733}.
                                Se o endereço não puder ser encontrado, retorne {"latitude": null, "longitude": null}.
                            `;
                            
                            const response = await ai.models.generateContent({
                                model: 'gemini-2.5-flash',
                                contents: prompt,
                                config: {
                                    responseMimeType: "application/json",
                                    responseSchema: {
                                        type: Type.OBJECT,
                                        properties: {
                                            latitude: { type: Type.NUMBER },
                                            longitude: { type: Type.NUMBER },
                                        }
                                    }
                                }
                            });
                            
                            const result = JSON.parse(response.text.trim());
                            return { 
                                ...loc,
                                latitude: result.latitude || null,
                                longitude: result.longitude || null,
                            };
                        } catch (geoError) {
                            console.error(`Falha ao geocodificar "${loc.address}".`, geoError);
                            return loc; // Retorna a localização original em caso de erro
                        }
                    }
                    return loc;
                })
            );
    
            const restaurantData: Omit<Restaurant, 'id' | 'wants_to_go' | 'reviews' | 'addedBy' | 'memories' | 'created_at'> = {
                name,
                category,
                cuisine: cuisine || null,
                vibe: vibe || null,
                locations: geocodedLocations.filter(l => l.address),
                image: imageUrl,
                price_range: priceRange,
                inTourOqfc,
                google_rating: googleRating,
                google_rating_count: googleRatingCount,
                google_rating_source_uri: googleRatingSourceUri,
                google_rating_source_title: googleRatingSourceTitle,
                menu_url: menu_url || null,
                weekly_promotions: initialData?.weekly_promotions || null,
            };
    
            await onSave(restaurantData);
            onClose();
        } catch (error) {
            const err = error as Error;
            console.error("Error saving restaurant:", err);
            alert(`Erro ao salvar: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };
    
   const handleAiFill = useCallback(async () => {
        if (!name) {
            alert('Por favor, insira o nome do restaurante primeiro.');
            return;
        }
        
        setIsAiFilling(true);
        try {
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

            const prompt = `
Baseado em uma busca no Google pelo estabelecimento "${name}" em Curitiba, PR, extraia as seguintes informações e retorne APENAS um objeto JSON:
1.  **category**: A categoria do local (uma de: ${RESTAURANT_CATEGORIES.join(', ')}).
2.  **cuisine**: O tipo de culinária (ex: "Italiana", "Japonesa").
3.  **vibe**: De 1 a 3 palavras-chave que descrevam a "vibe" do lugar (ex: "Romântico, Aconchegante").
4.  **price_symbols**: A faixa de preço em símbolos de dólar (ex: "$", "$$", "$$$", ou "$$$$"). Se não encontrar, retorne null.
5.  **address**: O endereço principal completo.
6.  **google_rating**: A nota média de avaliação do Google (número).
7.  **google_rating_count**: O número total de avaliações do Google (número inteiro).
8.  **google_maps_url**: O link para o local no Google Maps.

Exemplo de resposta JSON:
{"category": "Jantar", "cuisine": "Italiana", "vibe": "Romântico", "price_symbols": "$$$", "address": "Rua das Flores, 123 - Centro, Curitiba - PR", "google_rating": 4.7, "google_rating_count": 890, "google_maps_url": "https://maps.google.com/..."}

Se não encontrar uma informação, retorne null para o campo correspondente. NÃO inclua texto extra ou formatação markdown.
`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{googleSearch: {}}],
                    thinkingConfig: { thinkingBudget: 0 }
                },
            });
    
            let jsonString = response.text.trim();

            const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
            if (!jsonMatch) {
                throw new Error("A IA não retornou um JSON válido. Resposta: " + jsonString);
            }
            jsonString = jsonMatch[1] || jsonMatch[2];

            const result = JSON.parse(jsonString);
            
            if(result.category && RESTAURANT_CATEGORIES.includes(result.category)) setCategory(result.category);
            if(result.cuisine) setCuisine(result.cuisine);
            if(result.vibe) setVibe(result.vibe);

            if (result.price_symbols && typeof result.price_symbols === 'string') {
                setPriceRange(result.price_symbols.length);
            } else if (result.hasOwnProperty('price_symbols')) {
                setPriceRange(0);
            }
            
            if(result.address) {
                setLocations([{
                    address: result.address, 
                    latitude: null,
                    longitude: null
                }]);
            }
            
            if (result.hasOwnProperty('google_rating')) setGoogleRating(result.google_rating);
            if (result.hasOwnProperty('google_rating_count')) setGoogleRatingCount(result.google_rating_count);

            if(result.google_maps_url) {
                setGoogleRatingSourceUri(result.google_maps_url);
                setGoogleRatingSourceTitle(`Avaliações de "${name}" no Google`);
            } else {
                setGoogleRatingSourceUri(null);
                setGoogleRatingSourceTitle(null);
            }
    
        } catch (error) {
            console.error("AI Fill Error:", error);
            const errorMessage = (error instanceof Error) ? error.message : JSON.stringify(error);
            alert(`Erro ao buscar informações com a IA: ${errorMessage}`);
        } finally {
            setIsAiFilling(false);
        }
    
    }, [name]);
    
    const handleGenerateVibe = useCallback(async () => {
        if (!name && !cuisine) {
            alert("Forneça ao menos o nome ou a cozinha para gerar uma vibe.");
            return;
        }
        setIsGeneratingVibe(true);
        try {
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
            const prompt = `Para um restaurante chamado "${name}", cuja cozinha é "${cuisine}", gere 1 a 3 palavras-chave que descrevam a "vibe" do lugar (ex: "Romântico, Aconchegante", "Agitado, Moderno", "Familiar"). Retorne APENAS o texto das palavras-chave.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { thinkingConfig: { thinkingBudget: 0 } }
            });
    
            setVibe(response.text.trim().replace(/\"/g, ''));
        } catch(err) {
            console.error("Error generating vibe:", err);
            alert("Não foi possível gerar a vibe.");
        } finally {
            setIsGeneratingVibe(false);
        }
    }, [name, cuisine]);

    const handleUpdateGoogleRating = useCallback(async () => {
        if (!name) return;
        setIsUpdatingRating(true);
        try {
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
            const prompt = `Foque no perfil oficial do Google Maps para o restaurante "${name}" em Curitiba. Extraia a nota de avaliação (google_rating) e o número total de avaliações (google_rating_count). Retorne SOMENTE um objeto JSON com as chaves "google_rating" e "google_rating_count". Se uma informação não for encontrada, retorne null para a chave correspondente. Exemplo: {"google_rating": 4.5, "google_rating_count": 1234}.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { 
                    tools: [{googleSearch: {}}],
                    thinkingConfig: { thinkingBudget: 0 }
                },
            });
            
            let jsonString = response.text.trim();
            const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
            if (!jsonMatch) {
                throw new Error("A IA não retornou um JSON válido. Resposta: " + jsonString);
            }
            jsonString = jsonMatch[1] || jsonMatch[2];

            const result = JSON.parse(jsonString);

            if (result.hasOwnProperty('google_rating')) {
                setGoogleRating(result.google_rating);
            }
            if (result.hasOwnProperty('google_rating_count')) {
                setGoogleRatingCount(result.google_rating_count);
            }
            
        } catch (error) {
             console.error("AI Rating Update Error:", error);
             const errorMessage = (error instanceof Error) ? error.message : JSON.stringify(error);
             alert(`Erro ao atualizar avaliação: ${errorMessage}`);
        } finally {
            setIsUpdatingRating(false);
        }
    }, [name]);

    const handleUpdatePriceRange = useCallback(async () => {
        if (!name) return;
        setIsUpdatingPrice(true);
        try {
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
            const prompt = `Foque no perfil oficial do Google Maps para o restaurante "${name}" em Curitiba. Encontre a faixa de preço representada por símbolos (ex: "$", "$$", "$$$"). Retorne SOMENTE um objeto JSON com a chave "price_symbols". Se não encontrar, retorne {"price_symbols": null}.`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { 
                    tools: [{googleSearch: {}}],
                    thinkingConfig: { thinkingBudget: 0 }
                },
            });
            
            let jsonString = response.text.trim();
            const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
            if (!jsonMatch) {
                throw new Error("A IA não retornou um JSON válido. Resposta: " + jsonString);
            }
            jsonString = jsonMatch[1] || jsonMatch[2];

            const result = JSON.parse(jsonString);
             if (result.price_symbols && typeof result.price_symbols === 'string') {
                setPriceRange(result.price_symbols.length);
            } else {
                setPriceRange(0);
            }
        } catch (error) {
             console.error("AI Price Update Error:", error);
             const errorMessage = (error instanceof Error) ? error.message : JSON.stringify(error);
             alert(`Erro ao atualizar preço: ${errorMessage}`);
        } finally {
            setIsUpdatingPrice(false);
        }
    }, [name]);

    const getButtonText = () => {
        if (isSaving) return 'Salvando...';
        if (isCompressing) return 'Otimizando Imagem...';
        return isEditMode ? 'Salvar Alterações' : 'Adicionar Restaurante';
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <label htmlFor="name" className="font-medium text-slate-700">Nome do Restaurante</label>
                <div className="flex gap-2">
                    <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Cantina da Nona" required />
                    {!isEditMode && (
                        <Button type="button" variant="accent" onClick={handleAiFill} disabled={isAiFilling || !name} title="Preencher com IA">
                            <SparklesIcon className={`w-5 h-5 ${isAiFilling ? 'animate-spin' : ''}`} />
                        </Button>
                    )}
                </div>
            </div>

            {isEditMode && (
                 <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-600 mb-3 text-center">
                        As informações mudaram? Atualize os dados com as informações mais recentes do Google.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Button type="button" variant="secondary" onClick={handleUpdateGoogleRating} disabled={isUpdatingRating || isUpdatingPrice || !name}>
                            {isUpdatingRating ? (
                                <>
                                    <SparklesIcon className="w-5 h-5 animate-spin" />
                                    Buscando...
                                </>
                            ) : (
                                <>
                                    <GoogleIcon className="w-4 h-4"/>
                                    Atualizar Avaliação
                                </>
                            )}
                        </Button>
                        <Button type="button" variant="secondary" onClick={handleUpdatePriceRange} disabled={isUpdatingRating || isUpdatingPrice || !name}>
                            {isUpdatingPrice ? (
                                <>
                                    <SparklesIcon className="w-5 h-5 animate-spin" />
                                    Buscando...
                                </>
                            ) : (
                                <>
                                    <span className="font-bold text-green-600 text-lg">$</span>
                                    Atualizar Preço
                                </>
                            )}
                        </Button>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <h5 className="text-sm font-semibold text-slate-700 mb-2 text-center">Dados Atuais Salvos</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                            {/* Google Rating Inputs */}
                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-slate-600 text-center">Avaliação Google</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label htmlFor="google_rating" className="block text-xs font-medium text-slate-500 mb-1">Nota</label>
                                        <Input 
                                            id="google_rating"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="5"
                                            placeholder="Ex: 4.7"
                                            value={googleRating ?? ''}
                                            onChange={(e) => setGoogleRating(e.target.value ? parseFloat(e.target.value) : null)}
                                            className="text-sm p-1.5"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="google_rating_count" className="block text-xs font-medium text-slate-500 mb-1">Nº de Avaliações</label>
                                        <Input 
                                            id="google_rating_count"
                                            type="number"
                                            step="1"
                                            min="0"
                                            placeholder="Ex: 1250"
                                            value={googleRatingCount ?? ''}
                                            onChange={(e) => setGoogleRatingCount(e.target.value ? parseInt(e.target.value, 10) : null)}
                                            className="text-sm p-1.5"
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* Price Range Display */}
                            <div className="text-center">
                                <label className="block text-xs font-medium text-slate-600">Faixa de Preço</label>
                                <div className="pt-1 mt-2 flex items-center justify-center min-h-[34px]">
                                    {priceRange > 0 ? (
                                        <PriceRatingDisplay rating={priceRange} className="text-xl justify-center" />
                                    ) : (
                                        <p className="text-sm text-slate-500">Não encontrada</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                    <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                    <select id="category" value={category} onChange={e => setCategory(e.target.value as RestaurantCategory)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition">
                        {RESTAURANT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="cuisine" className="block text-sm font-medium text-slate-700 mb-1">Tipo de Cozinha</label>
                    <Input id="cuisine" type="text" value={cuisine} onChange={e => setCuisine(e.target.value)} placeholder="Ex: Italiana, Japonesa"/>
                </div>
            </div>

            <div>
                <label htmlFor="vibe" className="block text-sm font-medium text-slate-700 mb-1">Vibe do Restaurante</label>
                <div className="flex gap-2">
                    <Input id="vibe" type="text" value={vibe} onChange={e => setVibe(e.target.value)} placeholder="Ex: Romântico, Agitado..." />
                    <Button type="button" variant="secondary" onClick={handleGenerateVibe} disabled={isGeneratingVibe}>
                        <SparklesIcon className={`w-5 h-5 ${isGeneratingVibe ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>
            
            <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">Endereços</label>
                 <div className="space-y-2">
                    {locations.map((loc, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <Input 
                                type="text"
                                placeholder="Rua, Número, Bairro, Cidade"
                                value={loc.address}
                                onChange={(e) => handleLocationChange(index, 'address', e.target.value)}
                            />
                            {locations.length > 1 && (
                                <Button type="button" variant="danger" size="sm" onClick={() => removeLocation(index)} title="Remover Endereço">
                                    <TrashIcon className="w-4 h-4"/>
                                </Button>
                            )}
                        </div>
                    ))}
                 </div>
                 <Button type="button" variant="secondary" size="sm" onClick={addLocation} className="mt-2">
                    <PlusIcon className="w-4 h-4"/> Adicionar Endereço
                 </Button>
            </div>
            
            <div>
                <label htmlFor="menu_url" className="block text-sm font-medium text-slate-700 mb-1">URL do Cardápio</label>
                <Input 
                    id="menu_url" 
                    type="url" 
                    value={menu_url} 
                    onChange={e => setMenuUrl(e.target.value)} 
                    placeholder="https://exemplo.com/cardapio.pdf"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center pt-6 border-t">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Faixa de Preço</label>
                    <PriceRatingInput rating={priceRange} setRating={setPriceRange} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                    <input id="inTourOqfc" type="checkbox" checked={inTourOqfc} onChange={e => setInTourOqfc(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    <label htmlFor="inTourOqfc" className="font-medium text-slate-700">Faz parte do Tour OQFC</label>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Foto Principal</label>
                 <input
                    id="restaurant-image"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    disabled={isSaving || isCompressing}
                />
            </div>
             {imagePreview && (
                <div className="relative group mt-2">
                    <img src={imagePreview} alt="Pré-visualização" className="w-full h-auto max-h-60 object-contain rounded-lg bg-slate-100"/>
                    <button
                        type="button"
                        onClick={removeImage}
                        className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        disabled={isSaving || isCompressing}
                        title="Remover Imagem"
                    >
                        <XMarkIcon className="w-4 h-4"/>
                    </button>
                    {isCompressing && (
                         <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                            <p className="font-semibold text-primary">Otimizando imagem...</p>
                         </div>
                    )}
                </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving || isCompressing}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving || isCompressing || isUpdatingRating || isUpdatingPrice || isGeneratingVibe}>
                    {getButtonText()}
                </Button>
            </div>
        </form>
    );
};