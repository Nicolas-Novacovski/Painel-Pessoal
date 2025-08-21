import React, { useState, useEffect, useCallback } from 'react';
import { Restaurant, RestaurantCategory, Location } from '../types';
import { RESTAURANT_CATEGORIES } from '../constants';
import { Input, Button, PriceRatingInput } from './UIComponents';
import { SparklesIcon, TrashIcon, PlusIcon, XMarkIcon, CameraIcon, ArrowPathIcon } from './Icons';
import { supabase } from '../utils/supabase';
import { slugify, compressImage } from '../utils/helpers';
import { GoogleGenAI, Type } from "@google/genai";


interface RestaurantFormProps {
    onSave: (restaurant: Omit<Restaurant, 'id' | 'wants_to_go' | 'reviews' | 'addedBy' | 'memories' | 'created_at'>) => Promise<void>;
    onClose: () => void;
    initialData?: Restaurant | null;
    currentCity: string;
}

export const RestaurantForm: React.FC<RestaurantFormProps> = ({ onSave, onClose, initialData = null, currentCity }) => {
    const isEditMode = !!initialData;
    const [name, setName] = useState('');
    const [category, setCategory] = useState<RestaurantCategory>('Jantar');
    const [cuisine, setCuisine] = useState('');
    const [city, setCity] = useState(currentCity);
    const [vibe, setVibe] = useState('');
    const [locations, setLocations] = useState<Location[]>([{ address: '', latitude: null, longitude: null }]);
    const [priceRange, setPriceRange] = useState(0);
    const [inTourOqfc, setInTourOqfc] = useState(false);
    const [menu_url, setMenuUrl] = useState('');
    
    // Google properties
    const [googleRating, setGoogleRating] = useState<number | null>(null);
    const [googleRatingCount, setGoogleRatingCount] = useState<number | null>(null);
    
    // Image state
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

    // Loading states
    const [isSaving, setIsSaving] = useState(false);
    const [aiFillStatus, setAiFillStatus] = useState<'idle' | 'filling' | 'retrying'>('idle');
    const [isGeneratingVibe, setIsGeneratingVibe] = useState(false);
    const [isCompressing, setIsCompressing] = useState(false);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setCategory(initialData.category);
            setCuisine(initialData.cuisine || '');
            setCity(initialData.city || 'Curitiba');
            setVibe(initialData.vibe || '');
            setLocations(initialData.locations?.length > 0 ? initialData.locations : [{ address: '', latitude: null, longitude: null }]);
            setPriceRange(initialData.price_range || 0);
            setInTourOqfc(initialData.inTourOqfc || false);
            setCurrentImageUrl(initialData.image || null);
            setImagePreview(initialData.image || null);
            setMenuUrl(initialData.menu_url || '');
            setGoogleRating(initialData.google_rating || null);
            setGoogleRatingCount(initialData.google_rating_count || null);
        } else {
            setCity(currentCity); // Set city from prop for new restaurants
        }
    }, [initialData, currentCity]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsCompressing(true);
            setImageFile(null);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
            try {
                const compressedFile = await compressImage(file);
                setImageFile(compressedFile);
                setCurrentImageUrl(null); // Clear any existing URL if a file is chosen
            } catch (error) {
                console.error("Error compressing image:", error);
                alert("Houve um problema ao processar a imagem.");
                removeImage();
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

    const handleLocationChange = (index: number, value: string) => {
        const newLocations = [...locations];
        newLocations[index].address = value;
        // Reset lat/lng when address changes to force re-geocoding
        newLocations[index].latitude = null;
        newLocations[index].longitude = null;
        setLocations(newLocations);
    };

    const addLocation = () => setLocations([...locations, { address: '', latitude: null, longitude: null }]);
    const removeLocation = (index: number) => setLocations(locations.filter((_, i) => i !== index));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) { alert('O nome do restaurante é obrigatório.'); return; }
        setIsSaving(true);
        let imageUrl = currentImageUrl;
    
        try {
            if (imageFile) {
                 if (isEditMode && initialData?.image && !initialData.image.startsWith('data:')) {
                    const oldImagePath = new URL(initialData.image).pathname.split('/restaurant-images/')[1];
                    if (oldImagePath) await supabase.storage.from('restaurant-images').remove([oldImagePath]);
                }
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${slugify(name)}-${Date.now()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage.from('restaurant-images').upload(fileName, imageFile);
                if (uploadError) throw uploadError;
                imageUrl = supabase.storage.from('restaurant-images').getPublicUrl(uploadData.path).data.publicUrl;
            } else if (!currentImageUrl && isEditMode && initialData?.image) {
                const oldImagePath = new URL(initialData.image).pathname.split('/restaurant-images/')[1];
                if (oldImagePath) await supabase.storage.from('restaurant-images').remove([oldImagePath]);
                imageUrl = null;
            }
    
            const geocodedLocations = await Promise.all(locations.filter(l => l.address).map(async (loc) => {
                 if (loc.address && (loc.latitude === null || loc.longitude === null)) {
                    try {
                        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                        const prompt = `Your task is to find the precise latitude and longitude for a given address using Google Search. The address is: "${loc.address}". The context is the city of ${city}. Prioritize the full street name and number to avoid confusion with nearby streets. Return ONLY a valid JSON object with "latitude" and "longitude" as keys. Example of a perfect response: {"latitude": -25.4284, "longitude": -49.2733}. If you cannot determine the coordinates with high confidence, return {"latitude": null, "longitude": null}. Do not add any other text or markdown.`;
                        
                        const response = await ai.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: prompt,
                            config: {
                                tools: [{ googleSearch: {} }]
                            }
                        });

                        // Extract JSON from the response text, as it may contain markdown or other text
                        const responseText = response.text.trim();
                        const jsonMatch = responseText.match(/{[\s\S]*}/);
                        if (!jsonMatch) {
                             throw new Error("Geocoding failed: No valid JSON object found in the AI response.");
                        }
                        
                        const result = JSON.parse(jsonMatch[0]);
                        return { ...loc, latitude: result.latitude || null, longitude: result.longitude || null };
                    } catch (geoError) {
                        console.error(`Falha ao geocodificar "${loc.address}".`, geoError); return loc;
                    }
                } return loc;
            }));
    
            const restaurantData: Omit<Restaurant, 'id' | 'wants_to_go' | 'reviews' | 'addedBy' | 'memories' | 'created_at'> = {
                name, category, cuisine: cuisine || null, city, vibe: vibe || null, locations: geocodedLocations, image: imageUrl,
                price_range: priceRange, inTourOqfc, menu_url: menu_url || null,
                google_rating: googleRating, google_rating_count: googleRatingCount,
                google_rating_source_uri: initialData?.google_rating_source_uri || null, google_rating_source_title: initialData?.google_rating_source_title || null,
                weekly_promotions: initialData?.weekly_promotions || null,
            };
    
            await onSave(restaurantData);
            onClose();
        } catch (error) {
            const err = error as Error;
            console.error("Error saving restaurant:", err); alert(`Erro ao salvar: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };
    
   const handleAiFill = useCallback(async () => {
        if (!name) { alert('Por favor, insira o nome do restaurante primeiro.'); return; }
        setAiFillStatus('filling');
        
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                const prompt = `Sua tarefa é atuar como um assistente de pesquisa para preencher dados de um restaurante.
Realize uma busca detalhada no Google pelo restaurante "${name}". Se o nome não for específico de uma cidade, use "${city}" como contexto para a busca inicial. Analise os resultados para extrair os seguintes dados do local correto.

Responda APENAS com o texto no formato CHAVE: VALOR, com cada par em uma nova linha. Não inclua texto explicativo antes ou depois. Se não encontrar uma informação, retorne "N/A" para texto ou "0" para números.

CHAVES ESPERADAS:
- CATEGORIA (Deve ser um dos seguintes valores exatos: ${RESTAURANT_CATEGORIES.join(', ')})
- COZINHA
- VIBE
- PRECO (um número de 1 a 4)
- ENDERECO
- CIDADE (Extraia a cidade do endereço completo. Ex: Curitiba, Gramado, São Paulo)
- NOTA_GOOGLE (apenas o número, ex: 4.7)
- AVALIACOES_GOOGLE (apenas o número, ex: 350)
- MENU_URL

EXEMPLO DE RESPOSTA:
CATEGORIA: Café
COZINHA: Cafeteria, Doces
VIBE: Temático, Familiar
PRECO: 3
ENDERECO: Av. Borges de Medeiros, 2738 - Centro, Gramado - RS
CIDADE: Gramado
NOTA_GOOGLE: 4.6
AVALIACOES_GOOGLE: 6833
MENU_URL: https://www.instagram.com/casadavelhabruxa/
`;
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: { tools: [{googleSearch: {}}] }
                });
                
                const resultText = response.text.trim();
                const lines = resultText.split('\n');
                const parsedData: Record<string, string> = {};

                lines.forEach(line => {
                    const separatorIndex = line.indexOf(':');
                    if (separatorIndex > 0) {
                        const key = line.substring(0, separatorIndex).trim().toUpperCase().replace(/ /g, '_');
                        const value = line.substring(separatorIndex + 1).trim();
                        parsedData[key] = value;
                    }
                });
                
                if(parsedData.CIDADE && parsedData.CIDADE !== 'N/A') setCity(parsedData.CIDADE);

                const aiCategory = parsedData.CATEGORIA;
                if (aiCategory) {
                    const matchedCategory = RESTAURANT_CATEGORIES.find(c => c.toLowerCase() === aiCategory.toLowerCase());
                    if (matchedCategory) {
                        setCategory(matchedCategory);
                    }
                }
                if(parsedData.COZINHA && parsedData.COZINHA !== 'N/A') setCuisine(parsedData.COZINHA);
                if(parsedData.VIBE && parsedData.VIBE !== 'N/A') setVibe(parsedData.VIBE);
                if(parsedData.ENDERECO && parsedData.ENDERECO !== 'N/A') setLocations([{ address: parsedData.ENDERECO, latitude: null, longitude: null }]);
                if(parsedData.MENU_URL && parsedData.MENU_URL !== 'N/A') setMenuUrl(parsedData.MENU_URL);

                const googleRatingNum = parseFloat(parsedData.NOTA_GOOGLE);
                if (!isNaN(googleRatingNum) && googleRatingNum > 0) setGoogleRating(googleRatingNum);
                
                const googleRatingCountNum = parseInt(parsedData.AVALIACOES_GOOGLE, 10);
                if (!isNaN(googleRatingCountNum) && googleRatingCountNum > 0) setGoogleRatingCount(googleRatingCountNum);

                const priceRangeNum = parseInt(parsedData.PRECO, 10);
                if (!isNaN(priceRangeNum) && priceRangeNum >= 1 && priceRangeNum <= 4) setPriceRange(priceRangeNum);
                
                setAiFillStatus('idle');
                return; // Exit successfully
            } catch (error) {
                console.error(`AI Fill Error (Attempt ${attempt}):`, error);
                const errorMessage = (error as Error).message || '';
                const isOverloaded = errorMessage.toLowerCase().includes('overloaded') || errorMessage.includes('503') || errorMessage.includes('UNAVAILABLE');
                
                if (isOverloaded && attempt < maxRetries) {
                    setAiFillStatus('retrying');
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Wait 1s, then 2s
                } else {
                    alert(`Erro ao buscar informações com a IA: ${errorMessage}`);
                    setAiFillStatus('idle');
                    return; // Exit after final failure
                }
            }
        }
    }, [name, city]);
    
    const handleGenerateVibe = useCallback(async () => {
        if (!name && !cuisine) { alert("Forneça ao menos o nome ou a cozinha para gerar uma vibe."); return; }
        setIsGeneratingVibe(true);
        try {
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: `Para um restaurante chamado "${name}", cozinha "${cuisine}", gere 1 a 3 palavras-chave para a "vibe" do lugar. Retorne APENAS o texto.`});
            setVibe(response.text.trim().replace(/\"/g, ''));
        } catch(err) {
            console.error("Error generating vibe:", err); alert("Não foi possível gerar a vibe.");
        } finally {
            setIsGeneratingVibe(false);
        }
    }, [name, cuisine]);

    const isBusy = isSaving || aiFillStatus !== 'idle' || isGeneratingVibe || isCompressing;

    const getAiFillButtonContent = () => {
        switch (aiFillStatus) {
            case 'filling':
                return { text: 'Buscando...', icon: <SparklesIcon className="w-5 h-5 animate-spin" /> };
            case 'retrying':
                return { text: 'Tentando...', icon: <ArrowPathIcon className="w-5 h-5 animate-spin" /> };
            case 'idle':
            default:
                return { text: 'Preencher', icon: <SparklesIcon className="w-5 h-5" /> };
        }
    };

    const { text: aiButtonText, icon: aiButtonIcon } = getAiFillButtonContent();

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            
            {!isEditMode && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 space-y-3 text-center">
                     <h3 className="font-bold text-amber-900 text-lg">Comece por aqui!</h3>
                     <p className="text-sm text-amber-800">Digite o nome do restaurante e deixe a IA fazer o trabalho pesado de preencher os outros campos para você.</p>
                     <div className="flex gap-2">
                        <Input id="name-ai" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Cantina da Nona" required className="flex-grow" />
                        <Button type="button" variant="accent" onClick={handleAiFill} disabled={isBusy || !name} title="Preencher com IA">
                           {aiButtonIcon}
                           <span>{aiButtonText}</span>
                        </Button>
                    </div>
                </div>
            )}
            
            {isEditMode && (
                <div>
                     <label htmlFor="name" className="font-medium text-slate-700">Nome do Restaurante</label>
                     <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
                </div>
            )}
            
            <div className="pt-4 border-t">
                <h4 className="font-semibold text-lg text-slate-800 mb-3">Informações Principais</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                        <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                        <select id="category" value={category} onChange={e => setCategory(e.target.value as RestaurantCategory)} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition text-slate-900" disabled={isBusy}>
                            {RESTAURANT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="cuisine" className="block text-sm font-medium text-slate-700 mb-1">Tipo de Cozinha</label>
                        <Input id="cuisine" type="text" value={cuisine} onChange={e => setCuisine(e.target.value)} placeholder="Ex: Italiana, Japonesa" disabled={isBusy}/>
                    </div>
                     <div>
                        <label htmlFor="city" className="block text-sm font-medium text-slate-700 mb-1">Cidade</label>
                        <Input id="city" type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: Curitiba" disabled={isBusy} required/>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t">
                 <h4 className="font-semibold text-lg text-slate-800 mb-3">Detalhes</h4>
                 <div className="space-y-4">
                    <div>
                        <label htmlFor="vibe" className="block text-sm font-medium text-slate-700 mb-1">Vibe do Restaurante</label>
                        <div className="flex gap-2">
                            <Input id="vibe" type="text" value={vibe} onChange={e => setVibe(e.target.value)} placeholder="Ex: Romântico, Agitado..." disabled={isBusy}/>
                            <Button type="button" variant="secondary" onClick={handleGenerateVibe} disabled={isBusy}>
                                <SparklesIcon className={`w-5 h-5 ${isGeneratingVibe ? 'animate-spin' : ''}`} />
                                Gerar
                            </Button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Descreva o ambiente. Ex: Romântico, Familiar, Agitado...</p>
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-slate-700 mb-2">Endereços</label>
                         <div className="space-y-2">
                            {locations.map((loc, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Input type="text" placeholder="Rua, Número, Bairro, Cidade" value={loc.address} onChange={(e) => handleLocationChange(index, e.target.value)} disabled={isBusy} />
                                    {locations.length > 1 && ( <Button type="button" variant="danger" size="sm" onClick={() => removeLocation(index)} title="Remover" disabled={isBusy}><TrashIcon className="w-4 h-4"/></Button> )}
                                </div>
                            ))}
                         </div>
                         <Button type="button" variant="secondary" size="sm" onClick={addLocation} className="mt-2" disabled={isBusy}><PlusIcon className="w-4 h-4"/> Adicionar Endereço</Button>
                    </div>
                     <div>
                        <label htmlFor="menu_url" className="block text-sm font-medium text-slate-700 mb-1">URL do Cardápio</label>
                        <Input id="menu_url" type="url" value={menu_url} onChange={e => setMenuUrl(e.target.value)} placeholder="https://exemplo.com/cardapio.pdf" disabled={isBusy}/>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="google_rating" className="block text-sm font-medium text-slate-700 mb-1">Nota do Google</label>
                            <Input 
                                id="google_rating" 
                                type="number" 
                                step="0.1" 
                                min="0" 
                                max="5" 
                                value={googleRating ?? ''} 
                                onChange={e => setGoogleRating(e.target.value ? parseFloat(e.target.value) : null)} 
                                placeholder="Ex: 4.5" 
                                disabled={isBusy}
                            />
                        </div>
                        <div>
                            <label htmlFor="google_rating_count" className="block text-sm font-medium text-slate-700 mb-1">Qtd. de Avaliações (Google)</label>
                            <Input 
                                id="google_rating_count" 
                                type="number" 
                                min="0"
                                value={googleRatingCount ?? ''} 
                                onChange={e => setGoogleRatingCount(e.target.value ? parseInt(e.target.value, 10) : null)} 
                                placeholder="Ex: 350" 
                                disabled={isBusy}
                            />
                        </div>
                    </div>
                 </div>
            </div>
            
            <div className="pt-4 border-t">
                <h4 className="font-semibold text-lg text-slate-800 mb-3">Mídia e Outras Informações</h4>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Foto Principal</label>
                    <label htmlFor="restaurant-image" className="w-full cursor-pointer justify-center px-4 py-2 text-base font-semibold transition-all duration-200 ease-in-out bg-slate-200 text-slate-800 hover:bg-slate-300 rounded-lg flex items-center gap-2">
                        <CameraIcon className="w-5 h-5" />
                        <span>Escolher arquivo</span>
                        <input id="restaurant-image" type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isBusy} />
                    </label>
                     <p className="text-xs text-slate-500 mt-1 text-center">Carregue uma foto para o restaurante.</p>
                </div>
                 {(imagePreview || isCompressing) && (
                    <div className="relative group mt-2 w-full h-40 bg-slate-100 rounded-lg flex items-center justify-center">
                        {imagePreview && <img src={imagePreview} alt="Pré-visualização" className="w-full h-full object-cover rounded-lg"/>}
                        <button type="button" onClick={removeImage} className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600" disabled={isBusy} title="Remover Imagem">
                            <XMarkIcon className="w-4 h-4"/>
                        </button>
                        {isCompressing && (
                             <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                                <p className="font-semibold text-primary">Otimizando...</p>
                             </div>
                        )}
                    </div>
                )}
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center pt-6">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Faixa de Preço</label>
                        <PriceRatingInput rating={priceRange} setRating={setPriceRange} />
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                        <input id="inTourOqfc" type="checkbox" checked={inTourOqfc} onChange={e => setInTourOqfc(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" disabled={isBusy}/>
                        <label htmlFor="inTourOqfc" className="font-medium text-slate-700">Faz parte do Tour OQFC</label>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isBusy}>
                    {isSaving ? 'Salvando...' : (isEditMode ? 'Salvar Alterações' : 'Adicionar Restaurante')}
                </Button>
            </div>
        </form>
    );
};
