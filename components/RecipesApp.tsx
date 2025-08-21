import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { User, Recipe, RecipeCategory, Ingredient, NutritionalAnalysis, Drink, DrinkCategory } from '../types';
import { RECIPE_CATEGORIES, DRINK_CATEGORIES } from '../constants';
import { Button, Input, Modal, SegmentedControl } from './UIComponents';
import { PlusIcon, TrashIcon, XMarkIcon, CameraIcon, SparklesIcon, CheckIcon, PlayIcon, PencilIcon, ChevronDownIcon, BookOpenIcon, ChartBarIcon, MicrophoneIcon, MartiniGlassIcon } from './Icons';
import { compressImage, slugify } from '../utils/helpers';
import { GoogleGenAI, Type } from "@google/genai";
import RecipeVoiceInputModal from './RecipeVoiceInputModal';

// --- SUB-COMPONENTS FOR FOOD RECIPES (Existing Logic) ---

const STORAGE_RLS_FIX_SQL = `
-- Este script corrige as permissões do BUCKET de imagens 'recipe-images'.
-- Copie este código no Editor SQL do Supabase e clique em "RUN".

-- Apaga políticas antigas para garantir uma configuração limpa (se existirem)
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon deletes" ON storage.objects;

-- 1. Permite que qualquer pessoa VEJA as imagens (essencial para tags <img>)
CREATE POLICY "Public Read Access"
ON storage.objects
FOR SELECT
USING (bucket_id = 'recipe-images');

-- 2. Permite que qualquer pessoa FAÇA UPLOAD de imagens (a causa provável do erro)
CREATE POLICY "Allow anon uploads"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'recipe-images');

-- 3. Permite que qualquer pessoa ATUALIZE imagens
CREATE POLICY "Allow anon updates"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'recipe-images');

-- 4. Permite que qualquer pessoa APAGUE imagens
CREATE POLICY "Allow anon deletes"
ON storage.objects
FOR DELETE
USING (bucket_id = 'recipe-images');
`;

const CookingModeView: React.FC<{ recipe: Recipe; onClose: () => void }> = ({ recipe, onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const wakeLock = useRef<any>(null);
    const [wakeLockStatus, setWakeLockStatus] = useState<'pending' | 'active' | 'denied' | 'unsupported'>('pending');
    const [showIngredients, setShowIngredients] = useState(false);

    const steps = useMemo(() => recipe.instructions?.split('\n').filter(line => line.trim() !== '') || [], [recipe.instructions]);

    useEffect(() => {
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock.current = await navigator.wakeLock.request('screen');
                    setWakeLockStatus('active');
                } catch (err: any) {
                    setWakeLockStatus('denied');
                    console.error(`Wake Lock failed: ${err.name}, ${err.message}`);
                }
            } else {
                setWakeLockStatus('unsupported');
                console.warn('Screen Wake Lock API not supported.');
            }
        };

        requestWakeLock();

        return () => {
            if (wakeLock.current) {
                wakeLock.current.release();
                wakeLock.current = null;
            }
        };
    }, []);

    const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    const handlePrev = () => setCurrentStep(prev => Math.max(prev - 1, 0));

    return (
        <div className="fixed inset-0 bg-black z-50 font-sans animate-fade-in">
            {recipe.image_url && (
                <img 
                    src={recipe.image_url} 
                    alt="" 
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover filter blur-xl brightness-75"
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-br from-black/60 to-black/40"></div>

            <div className="relative z-10 h-full flex flex-col lg:flex-row">
                 <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-40 bg-white/20 hover:bg-white/30 backdrop-blur-sm p-3 rounded-full transition-colors text-white"
                    aria-label="Sair do Modo Cozinhar"
                >
                    <XMarkIcon className="w-6 h-6"/>
                </button>
            
                {(wakeLockStatus === 'denied' || wakeLockStatus === 'unsupported') && (
                    <div className="absolute top-4 left-4 bg-yellow-400/80 backdrop-blur-sm text-yellow-900 text-sm font-semibold px-4 py-2 rounded-lg shadow-md z-30">
                        {wakeLockStatus === 'denied'
                            ? "A permissão para manter a tela acesa foi negada."
                            : "Seu navegador não suporta manter a tela acesa."
                        }
                    </div>
                )}
                
                {showIngredients && (
                    <div 
                        className="lg:hidden fixed inset-0 bg-black/40 z-20"
                        onClick={() => setShowIngredients(false)}
                    ></div>
                )}

                <aside className={`
                    fixed inset-y-0 left-0 z-30 w-full max-w-md
                    bg-black/50 backdrop-blur-lg p-8 overflow-y-auto
                    transform transition-transform duration-300
                    ${showIngredients ? 'translate-x-0' : '-translate-x-full'}
                    lg:relative lg:translate-x-0 lg:w-1/3 xl:w-1/4 lg:max-w-none
                    lg:h-full lg:border-r lg:border-white/10 flex-shrink-0
                `}>
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="font-bold text-3xl text-white">Ingredientes</h2>
                        <button
                            onClick={() => setShowIngredients(false)}
                            className="lg:hidden bg-white/20 p-2 rounded-full text-white"
                            aria-label="Fechar Ingredientes"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="space-y-2 text-slate-200">
                        {recipe.ingredients?.map((ing) => (
                             ing.is_heading ? (
                                <h4 key={ing.id} className="font-bold text-white pt-3 text-xl">{ing.name}</h4>
                            ) : (
                                <p key={ing.id} className="pl-2">{ing.quantity ? `${ing.quantity} de ${ing.name}` : ing.name}</p>
                            )
                        ))}
                    </div>
                </aside>

                <main className="flex-grow flex flex-col p-8 lg:p-16 h-full">
                    <div className="flex-grow flex items-center justify-center overflow-hidden">
                        <p key={currentStep} className="text-4xl md:text-5xl lg:text-6xl font-serif text-center text-white leading-snug drop-shadow-lg animate-fade-in">
                            {steps.length > 0 ? steps[currentStep] : "Nenhuma instrução encontrada."}
                        </p>
                    </div>
                    <div className="flex-shrink-0 pt-8">
                        <div className="flex justify-between items-center">
                            <Button 
                                onClick={handlePrev} 
                                disabled={currentStep === 0} 
                                variant="secondary"
                                className="!bg-white/20 !text-white hover:!bg-white/30 !backdrop-blur-sm !px-6 !py-3"
                            >
                                Anterior
                            </Button>

                             <button
                                onClick={() => setShowIngredients(true)}
                                className="lg:hidden p-3 rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
                                aria-label="Ver Ingredientes"
                            >
                                <BookOpenIcon className="w-6 h-6"/>
                            </button>
                            
                            <span className="hidden lg:inline-block font-semibold text-white/80">
                                Passo {currentStep + 1} de {steps.length}
                            </span>

                             <Button 
                                onClick={handleNext} 
                                disabled={currentStep === steps.length - 1} 
                                className="!bg-white !text-dark hover:!bg-slate-200 !px-6 !py-3"
                            >
                                Próximo
                            </Button>
                        </div>
                         <p className="text-center font-semibold text-white/80 mt-2 lg:hidden">
                            Passo {currentStep + 1} de {steps.length}
                        </p>
                    </div>
                </main>
            </div>
        </div>
    );
};

const RecipeView: React.FC<{
    recipe: Recipe;
    onEdit: (recipe: Recipe) => void;
    onDelete: (recipe: Recipe) => void;
    onStartCooking: (recipe: Recipe) => void;
    onAnalyze: (recipe: Recipe) => void;
}> = ({ recipe, onEdit, onDelete, onStartCooking, onAnalyze }) => {
    return (
        <div className="bg-white p-6 md:p-10 rounded-xl shadow-lg overflow-y-auto" style={{maxHeight: 'calc(100vh - 220px)'}}>
            {recipe.image_url && (
                <div className="mb-6 rounded-lg overflow-hidden h-64 w-full bg-slate-200">
                    <img 
                        src={recipe.image_url} 
                        alt={recipe.name} 
                        className="w-full h-full object-cover"
                    />
                </div>
            )}
            <h1 className="font-hand text-5xl md:text-6xl text-slate-800 mb-4 break-words">{recipe.name}</h1>
            
            <div className="flex items-baseline gap-4 mb-8 text-slate-500 flex-wrap">
                <span className="font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full text-sm">{recipe.category}</span>
                {recipe.prep_time_minutes && <span>{recipe.prep_time_minutes} minutos</span>}
                {recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline">Ver receita original</a>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6">
                <div className="lg:col-span-1">
                    <h2 className="font-bold text-2xl text-slate-700 border-b-2 border-slate-200 pb-2 mb-4">Ingredientes</h2>
                    <div className="space-y-2 text-slate-600">
                        {recipe.ingredients?.map((ing) => (
                             ing.is_heading ? (
                                <h4 key={ing.id} className="font-bold text-slate-800 pt-3 text-lg">{ing.name}</h4>
                            ) : (
                                <p key={ing.id} className="pl-2">{ing.quantity ? `${ing.quantity} de ${ing.name}` : ing.name}</p>
                            )
                        ))}
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <h2 className="font-bold text-2xl text-slate-700 border-b-2 border-slate-200 pb-2 mb-4">Modo de preparo</h2>
                    <div className="space-y-4 text-slate-700 leading-relaxed">
                        {recipe.instructions?.split('\n').filter(line => line.trim() !== '').map((line, index) => (
                            <p key={index}>{line}</p>
                        ))}
                    </div>
                </div>
            </div>
            
            <div className="flex justify-between items-center pt-8 mt-8 border-t border-slate-200 flex-wrap gap-4">
                <div className="flex gap-2">
                    <Button variant="accent" onClick={() => onStartCooking(recipe)}>
                        <PlayIcon className="w-5 h-5"/>
                        Cozinhar
                    </Button>
                     <Button variant="secondary" onClick={() => onAnalyze(recipe)}>
                        <ChartBarIcon className="w-5 h-5"/>
                        Analisar Nutrientes
                    </Button>
                </div>
                <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={() => onDelete(recipe)}>
                        <TrashIcon className="w-4 h-4"/> Apagar
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(recipe)}>
                        <PencilIcon className="w-4 h-4"/> Editar
                    </Button>
                </div>
            </div>
        </div>
    );
};

const RecipeImportModal: React.FC<{
    onClose: () => void;
    onImportSuccess: (data: Partial<Recipe>) => void;
}> = ({ onClose, onImportSuccess }) => {
    const [queryInput, setQueryInput] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    const isUrl = (text: string) => {
        try {
            const url = new URL(text);
            return url.protocol === "http:" || url.protocol === "https:";
        } catch (_) {
            return false;
        }
    };

    const handleSearchWithAI = async () => {
        if (!queryInput) {
            setImportError("Por favor, digite o nome ou cole o link de uma receita.");
            return;
        }
        setIsImporting(true);
        setImportError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
            
            const isQueryUrl = isUrl(queryInput);

            const prompt = `
Realize uma busca no Google pela receita: "${queryInput}".
Se for uma URL, use o conteúdo dela. Se for um texto, encontre a melhor e mais confiável receita.

Analise a receita encontrada e extraia as seguintes informações, retornando **APENAS UM OBJETO JSON VÁLIDO**:
- **name**: O nome completo da receita (string).
- **category**: "Doce" ou "Salgado" (string).
- **prep_time_minutes**: Tempo de preparo em minutos (number, ou null).
- **image_url**: A URL de uma imagem de alta qualidade do prato (string, ou null).
- **source_url**: A URL exata da página onde a receita foi encontrada (string).
- **ingredients**: Uma lista de objetos, onde cada objeto tem "name" (string), "quantity" (string) e "is_heading" (boolean). Se a receita tiver seções (ex: "Massa", "Cobertura"), crie um item de ingrediente com "name" sendo o título da seção, "is_heading" como true, e "quantity" vazio.
- **instructions**: O modo de preparo completo, com passos separados por "\\n" (string).

**IMPORTANTE**:
- **Traduza tudo para o Português do Brasil** se a fonte original estiver em outro idioma.
- O campo "source_url" é obrigatório e deve ser o link real da fonte.
- A resposta deve ser APENAS o JSON, sem markdown (\`\`\`json), texto extra ou explicações.

Exemplo de formato da resposta:
{
  "name": "Bolo de Cenoura com Cobertura de Chocolate",
  "category": "Doce",
  "prep_time_minutes": 60,
  "image_url": "https://...",
  "source_url": "https://www.tudogostoso.com.br/receita/324-bolo-de-cenoura.html",
  "ingredients": [
    { "name": "Massa", "quantity": "", "is_heading": true },
    { "name": "Cenoura", "quantity": "3 médias", "is_heading": false },
    { "name": "Farinha de trigo", "quantity": "2 xícaras", "is_heading": false }
  ],
  "instructions": "Passo 1: Bata os ingredientes no liquidificador.\\nPasso 2: Asse em forno médio."
}
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
            const parsedData = JSON.parse(jsonString);

            if (parsedData.error) {
                throw new Error(parsedData.error);
            }
            
            const recipeData: Partial<Recipe> = {
                name: parsedData.name || (isQueryUrl ? "Receita da URL" : queryInput),
                category: parsedData.category || 'Salgado',
                prep_time_minutes: parsedData.prep_time_minutes || null,
                image_url: parsedData.image_url || null,
                source_url: parsedData.source_url || (isQueryUrl ? queryInput : null),
                ingredients: Array.isArray(parsedData.ingredients)
                    ? parsedData.ingredients.map((ing: any) => ({ ...ing, id: crypto.randomUUID(), is_heading: ing.is_heading || false }))
                    : [],
                instructions: parsedData.instructions || '',
            };

            onImportSuccess(recipeData);

        } catch (error) {
            console.error("Error importing recipe with AI:", error);
            const errorMessage = (error as Error).message || JSON.stringify(error);
            setImportError("Não foi possível buscar a receita. " + errorMessage);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600">
                Digite o nome de uma receita ou cole um link. A IA irá pesquisar na internet e preencher os detalhes para você.
            </p>
            <div>
                <label htmlFor="recipe-name-search" className="font-medium text-sm text-slate-700">Nome ou Link da Receita</label>
                <Input
                    id="recipe-name-search"
                    type="text"
                    placeholder="Ex: Bolo de fubá ou https://receitas.com/..."
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    disabled={isImporting}
                    className="mt-1"
                    onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleSearchWithAI(); }}}
                />
            </div>

            {importError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{importError}</p>}
            
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isImporting}>Cancelar</Button>
                <Button type="button" onClick={handleSearchWithAI} disabled={isImporting || !queryInput}>
                    {isImporting ? (
                        <><SparklesIcon className="w-4 h-4 animate-spin"/> Buscando...</>
                    ) : (
                        <><SparklesIcon className="w-4 h-4"/> Buscar com IA</>
                    )}
                </Button>
            </div>
        </div>
    );
};

const NutritionalAnalysisView: React.FC<{
    isAnalyzing: boolean,
    analysisResult: NutritionalAnalysis | null,
    analysisError: string | null
}> = ({ isAnalyzing, analysisResult, analysisError }) => {
    
    if (isAnalyzing) {
        return (
            <div className="flex flex-col items-center justify-center h-60 gap-4">
                <SparklesIcon className="w-10 h-10 text-primary animate-spin"/>
                <p className="text-slate-600 font-semibold">Analisando receita com a IA...</p>
            </div>
        );
    }
    
    if (analysisError) {
        return (
            <div className="flex flex-col items-center justify-center h-60 gap-4 bg-red-50 p-4 rounded-lg">
                <p className="font-bold text-red-700">Ocorreu um erro</p>
                <p className="text-red-600 text-center">{analysisError}</p>
            </div>
        );
    }
    
    if (!analysisResult) {
        return null;
    }

    const facts = [
        { label: 'Calorias', value: analysisResult.calories ? `${analysisResult.calories} kcal` : 'N/A', color: 'bg-orange-100 text-orange-800' },
        { label: 'Proteínas', value: analysisResult.protein, color: 'bg-blue-100 text-blue-800' },
        { label: 'Carboidratos', value: analysisResult.carbs, color: 'bg-yellow-100 text-yellow-800' },
        { label: 'Gorduras', value: analysisResult.fat, color: 'bg-purple-100 text-purple-800' },
        { label: 'Açúcares', value: analysisResult.sugar, color: 'bg-pink-100 text-pink-800' },
        { label: 'Sódio', value: analysisResult.sodium, color: 'bg-gray-100 text-gray-800' },
    ].filter(fact => fact.value);
    
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {facts.map(fact => (
                    <div key={fact.label} className={`p-4 rounded-lg text-center ${fact.color}`}>
                        <p className="text-sm font-semibold">{fact.label}</p>
                        <p className="text-2xl font-bold">{fact.value}</p>
                    </div>
                ))}
            </div>
            {analysisResult.summary && (
                <div>
                    <h3 className="font-bold text-lg text-slate-700 mb-2">Resumo da IA</h3>
                    <p className="text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-200">{analysisResult.summary}</p>
                </div>
            )}
             <p className="text-xs text-slate-400 text-center pt-2">
                * Os valores nutricionais são estimativas geradas por IA por porção e podem variar.
            </p>
        </div>
    );
};

const RecipeForm: React.FC<{
    onSave: (data: any, imageFile: File | null) => Promise<void>;
    onClose: () => void;
    initialData: Recipe | null;
    saveError: string | null;
}> = ({onSave, onClose, initialData, saveError}) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState<RecipeCategory>('Salgado');
    const [prepTime, setPrepTime] = useState<number | ''>('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [ingredients, setIngredients] = useState<Ingredient[]>([{id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
    const [instructions, setInstructions] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string|null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isParsingIngredients, setIsParsingIngredients] = useState(false);
    const [isGeneratingInstructions, setIsGeneratingInstructions] = useState(false);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
    const ingredientImageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if(initialData) {
            setName(initialData.name || '');
            setCategory(initialData.category || 'Salgado');
            setPrepTime(initialData.prep_time_minutes || '');
            setSourceUrl(initialData.source_url || '');
            setIngredients(initialData.ingredients?.length > 0 ? initialData.ingredients.map(i => ({...i, is_heading: i.is_heading || false})) : [{id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
            setInstructions(initialData.instructions || '');
            setImagePreview(initialData.image_url || null);
            setImageFile(null);
        } else {
            setName(''); setCategory('Salgado'); setPrepTime(''); setSourceUrl('');
            setIngredients([{id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
            setInstructions(''); setImagePreview(null); setImageFile(null);
        }
    }, [initialData]);

    const handleCopy = async (sql: string) => {
        try {
            await navigator.clipboard.writeText(sql.trim());
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2500);
        } catch(err) {
            console.error("Failed to copy", err);
            alert("Não foi possível copiar o código. Por favor, selecione e copie manually.");
        }
    }

    const handleIngredientChange = (id: string, field: 'name' | 'quantity', value: string) => {
        setIngredients(prev => prev.map(ing => ing.id === id ? {...ing, [field]: value} : ing));
    }
    const addIngredient = () => setIngredients(prev => [...prev, {id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
    const addHeading = () => setIngredients(prev => [...prev, {id: crypto.randomUUID(), name: '', quantity: '', is_heading: true}]);
    const removeIngredient = (id: string) => setIngredients(prev => prev.filter(ing => ing.id !== id));

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(null);
            setImagePreview(null);
            setIsSaving(true);
            try {
                const compressedFile = await compressImage(file, 800);
                setImageFile(compressedFile);
                
                const reader = new FileReader();
                reader.onloadend = () => setImagePreview(reader.result as string);
                reader.readAsDataURL(compressedFile);
            } catch (error) {
                console.error("Image processing error:", error);
                alert("Ocorreu um erro ao processar a imagem.");
            } finally {
                setIsSaving(false);
            }
        }
    };
    
    const handleParseIngredientsFromImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsingIngredients(true);
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});

            const base64EncodedDataPromise: Promise<string> = new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (reader.result && typeof reader.result === 'string') {
                         resolve(reader.result.split(',')[1]);
                    } else {
                        reject(new Error("Failed to read file as data URL."));
                    }
                };
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            });

            const imagePart = {
                inlineData: {
                    data: await base64EncodedDataPromise,
                    mimeType: file.type,
                },
            };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, {text: `Analise a imagem da lista de ingredientes. Se houver seções (como 'Massa' e 'Recheio'), identifique-as. Retorne um array de objetos JSON. Para um ingrediente, use as chaves "quantity" e "name". Para um título de seção, use a chave "name" para o título e adicione "is_heading": true. Exemplo: [{"name": "Massa", "is_heading": true}, {"quantity": "200g", "name": "Farinha"}].`}] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                quantity: { type: Type.STRING },
                                name: { type: Type.STRING },
                                is_heading: { type: Type.BOOLEAN },
                            },
                            required: ["name"],
                        },
                    },
                }
            });

            const jsonString = response.text.trim();
            const parsedIngredients = JSON.parse(jsonString);

            if (Array.isArray(parsedIngredients) && parsedIngredients.length > 0) {
                setIngredients(
                    parsedIngredients.map((ing: { name: string; quantity: string; is_heading?: boolean }) => ({
                        id: crypto.randomUUID(),
                        name: ing.name || '',
                        quantity: ing.quantity || '',
                        is_heading: ing.is_heading || false,
                    }))
                );
            } else {
                alert("A IA não conseguiu extrair ingredientes válidos da imagem.");
            }
        } catch (error) {
            console.error("Error parsing ingredients from image:", error);
            alert("Ocorreu um erro ao tentar ler os ingredientes da imagem. Por favor, tente novamente.");
        } finally {
            setIsParsingIngredients(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleGenerateInstructions = async () => {
        if (!name || ingredients.every(i => !i.name)) {
            alert("Por favor, forneça o nome da receita e ao menos um ingrediente.");
            return;
        }
        setIsGeneratingInstructions(true);
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});
            
            const ingredientsList = ingredients
                .filter(ing => ing.name && !ing.is_heading)
                .map(ing => `${ing.quantity} ${ing.name}`.trim())
                .join('\n');
                
            const prompt = `Crie um "Modo de Preparo" para uma receita de "${name}" usando os seguintes ingredientes:\n\n${ingredientsList}\n\nEscreva as instruções passo a passo. Cada passo deve estar em uma nova linha. Não inclua títulos como "Modo de Preparo" na sua resposta, apenas os passos.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { thinkingConfig: { thinkingBudget: 0 } }
            });

            const generatedInstructions = response.text;
            setInstructions(generatedInstructions.trim());

        } catch (error) {
            console.error("Error generating instructions:", error);
            alert("Ocorreu um erro ao gerar o modo de preparo. Tente novamente.");
        } finally {
            setIsGeneratingInstructions(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        const recipeData = {
            name, category, prep_time_minutes: Number(prepTime) || null, source_url: sourceUrl, 
            ingredients: ingredients.filter(i => i.name.trim()), // Filter out empty ingredients
            instructions
        };
        await onSave(recipeData, imageFile);
        setIsSaving(false);
    }
    
    const handleRemoveImage = () => {
        setImageFile(null);
        setImagePreview(null);
        const fileInput = document.getElementById('recipe-image') as HTMLInputElement;
        if(fileInput) fileInput.value = '';
        if (initialData) {
            initialData.image_url = null;
        }
    }

    const isBusy = isSaving || isParsingIngredients || isGeneratingInstructions;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {saveError && saveError.includes('violates row-level security') && (
                <div className="p-4 bg-red-50 border-2 border-dashed border-red-300 rounded-lg my-4 space-y-6">
                    <div>
                        <h4 className="font-bold text-red-900 text-lg">Ação Necessária: Corrigir Permissão de Armazenamento</h4>
                        <p className="text-sm text-red-800 mt-1">
                            Este erro ocorre porque as políticas de segurança do <strong>Supabase Storage</strong> (onde as imagens são guardadas) não estão configuradas corretamente. Como o erro acontece apenas ao enviar uma imagem, vamos corrigir as permissões do bucket de armazenamento <code className="text-xs bg-red-100 p-1 rounded font-mono">recipe-images</code>.
                        </p>
                    </div>
            
                    <div className="space-y-2">
                        <h5 className="font-semibold text-slate-800">Passo 1: Execute o Código de Correção</h5>
                        <p className="text-xs text-slate-600">
                           Copie o código SQL abaixo. Depois, vá para o 
                           <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline"> Editor SQL do Supabase</a>, cole o código e clique em "RUN". Este script é seguro e pode ser executado várias vezes.
                        </p>
                        <div className="relative group">
                            <pre className="bg-slate-800 text-white p-3 rounded-lg text-xs overflow-x-auto pr-16">
                                <code>{STORAGE_RLS_FIX_SQL.trim()}</code>
                            </pre>
                             <Button
                                type="button"
                                onClick={() => handleCopy(STORAGE_RLS_FIX_SQL)}
                                className="absolute top-2 right-2 py-1 px-2 text-xs opacity-50 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                size="sm"
                                variant="secondary"
                            >
                                {copyStatus === 'copied' ? <CheckIcon className="w-4 h-4 text-green-500" /> : 'Copiar'}
                            </Button>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <h5 className="font-semibold text-slate-800">Passo 2: Tente Salvar Novamente</h5>
                        <p className="text-xs text-slate-600">Após executar o script com sucesso, o erro de permissão deve ser resolvido. Você não precisa recarregar a página, apenas tente salvar a receita com a imagem novamente.
                        </p>
                    </div>
                </div>
            )}
            <Input type="text" placeholder="Nome da Receita" value={name} onChange={e => setName(e.target.value)} required disabled={isBusy}/>
            <div className="grid grid-cols-2 gap-4">
                <select value={category} onChange={e => setCategory(e.target.value as RecipeCategory)} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900" disabled={isBusy}>
                    {RECIPE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <Input type="number" placeholder="Tempo de preparo (min)" value={prepTime} onChange={e => setPrepTime(Number(e.target.value))} disabled={isBusy}/>
            </div>
            <Input type="url" placeholder="Link da receita original" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} disabled={isBusy}/>
             <div>
                <label className="font-medium text-sm text-slate-700">Foto da Receita</label>
                <input id="recipe-image" type="file" accept="image/*" onChange={handleFileChange} disabled={isBusy} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                {imagePreview && (
                    <div className="relative group mt-2">
                        <img src={imagePreview} alt="Preview" className="mt-2 rounded-lg max-h-40 w-full object-cover"/>
                        <button type="button" onClick={handleRemoveImage} className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                            <XMarkIcon className="w-4 h-4"/>
                        </button>
                    </div>
                )}
            </div>

            <div>
                 <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium text-sm text-slate-700">Ingredientes</h4>
                    <input type="file" ref={ingredientImageInputRef} onChange={handleParseIngredientsFromImage} accept="image/*" className="hidden" />
                    <Button type="button" variant="secondary" size="sm" onClick={() => ingredientImageInputRef.current?.click()} disabled={isBusy}>
                        {isParsingIngredients ? (
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 animate-spin"/>
                                <span>Lendo...</span>
                            </div>
                        ) : (
                             <div className="flex items-center gap-2">
                                <CameraIcon className="w-4 h-4"/>
                                <span>Extrair de Imagem</span>
                            </div>
                        )}
                    </Button>
                </div>
                <div className="space-y-2">
                    {ingredients.map(ing => (
                        <div key={ing.id} className="flex gap-2 items-center">
                             {ing.is_heading ? (
                                <Input type="text" placeholder="Título da Seção (ex: Para o recheio)" value={ing.name} onChange={e => handleIngredientChange(ing.id, 'name', e.target.value)} className="flex-grow font-semibold" />
                            ) : (
                                <>
                                    <Input type="text" placeholder="Quantidade" value={ing.quantity} onChange={e => handleIngredientChange(ing.id, 'quantity', e.target.value)} className="w-1/3" disabled={isBusy}/>
                                    <Input type="text" placeholder="Nome do ingrediente" value={ing.name} onChange={e => handleIngredientChange(ing.id, 'name', e.target.value)} className="flex-grow" disabled={isBusy}/>
                                </>
                            )}
                            <Button type="button" variant="danger" size="sm" onClick={() => removeIngredient(ing.id)} disabled={isBusy || ingredients.length <= 1}><TrashIcon className="w-4 h-4"/></Button>
                        </div>
                    ))}
                </div>
                 <div className="flex gap-2 mt-2">
                    <Button type="button" variant="secondary" size="sm" onClick={addIngredient} className="mt-2" disabled={isBusy}><PlusIcon className="w-4 h-4"/> Ingrediente</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={addHeading} className="mt-2" disabled={isBusy}><PlusIcon className="w-4 h-4"/> Título</Button>
                </div>
            </div>
            <div>
                 <div className="flex justify-between items-center mb-1">
                    <label className="font-medium text-sm text-slate-700">Modo de Preparo</label>
                     <Button type="button" variant="accent" size="sm" onClick={handleGenerateInstructions} disabled={isBusy || !name || ingredients.every(i => !i.name)}>
                         {isGeneratingInstructions ? (
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 animate-spin"/>
                                <span>Gerando...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4"/>
                                <span>Gerar com IA</span>
                            </div>
                        )}
                    </Button>
                </div>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition" disabled={isBusy}/>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>Cancelar</Button>
                <Button type="submit" disabled={isBusy || !name}>{isSaving ? 'Salvando...' : 'Salvar Receita'}</Button>
            </div>
        </form>
    )
}

const FoodSection: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
    const [isMobileListOpen, setIsMobileListOpen] = useState(false);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analyzingRecipe, setAnalyzingRecipe] = useState<Recipe | null>(null);
    const [analysisResult, setAnalysisResult] = useState<NutritionalAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const fetchRecipes = useCallback(async () => {
        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error("Error fetching recipes:", error);
        } else {
            setRecipes((data as any[]) || []);
        }
    }, []);

    useEffect(() => {
        fetchRecipes();
    }, [fetchRecipes]);
    
    useEffect(() => {
        if (!selectedRecipe && recipes.length > 0) {
            setSelectedRecipe(recipes[0]);
        } else if (selectedRecipe && !recipes.find(r => r.id === selectedRecipe.id)) {
            setSelectedRecipe(recipes[0] || null);
        }
    }, [recipes, selectedRecipe]);

    useEffect(() => {
        const channel = supabase.channel('realtime-recipes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, fetchRecipes)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchRecipes]);
    
    const handleAnalyzeRecipe = useCallback(async (recipe: Recipe) => {
        if (!recipe) return;
        setIsAnalyzing(true);
        setAnalysisResult(null);
        setAnalysisError(null);
        try {
            const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});
            const ingredientsString = recipe.ingredients
                .filter(ing => !ing.is_heading && ing.name)
                .map(ing => `${ing.quantity || ''} ${ing.name}`.trim())
                .join('\n');

            if (!ingredientsString) throw new Error("A receita não tem ingredientes para analisar.");
            
            const schema = {
                type: Type.OBJECT,
                properties: {
                    calories: { type: Type.NUMBER, description: "Total de calorias por porção (apenas o número)." },
                    protein: { type: Type.STRING, description: "Total de proteínas por porção, com unidade (ex: '25g')." },
                    carbs: { type: Type.STRING, description: "Total de carboidratos por porção, com unidade (ex: '40g')." },
                    fat: { type: Type.STRING, description: "Total de gorduras por porção, com unidade (ex: '15g')." },
                    sugar: { type: Type.STRING, description: "Total de açúcares por porção, com unidade (ex: '10g')." },
                    sodium: { type: Type.STRING, description: "Total de sódio por porção, com unidade (ex: '500mg')." },
                    summary: { type: Type.STRING, description: "Resumo curto e amigável em português sobre o perfil nutricional do prato." },
                },
                required: ["calories", "protein", "carbs", "fat", "summary"],
            };
            const prompt = `Analise a lista de ingredientes a seguir para a receita '${recipe.name}'. Os ingredientes são:\n${ingredientsString}\n\nForneça uma estimativa nutricional por porção. Retorne um objeto JSON no formato definido.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema },
            });
            
            const parsedData = JSON.parse(response.text.trim()) as NutritionalAnalysis;
            setAnalysisResult(parsedData);
        } catch (error) {
            console.error("Error analyzing recipe:", error);
            setAnalysisError("Não foi possível analisar a receita. Verifique se os ingredientes estão corretos e tente novamente.");
        } finally {
            setIsAnalyzing(false);
        }
    }, []);

    const handleOpenAnalysis = (recipe: Recipe) => {
        setAnalyzingRecipe(recipe);
        setIsAnalysisModalOpen(true);
        handleAnalyzeRecipe(recipe);
    };

    const handleCloseAnalysis = () => {
        setIsAnalysisModalOpen(false);
        setAnalyzingRecipe(null);
        setAnalysisResult(null);
        setAnalysisError(null);
        setIsAnalyzing(false);
    };

    const handleOpenFormWithImportedData = (data: Partial<Recipe>) => {
        setIsImportModalOpen(false);
        setIsVoiceModalOpen(false);
        setEditingRecipe(data as Recipe);
        setIsFormModalOpen(true);
    };

    const handleSaveRecipe = async (recipeData: Omit<Recipe, 'id' | 'added_by'>, imageFile: File | null) => {
        setSaveError(null);
        let imageUrl = editingRecipe?.image_url || recipeData.image_url || null;

        try {
            if (imageFile) {
                if (editingRecipe?.image_url) {
                    const oldImagePath = new URL(editingRecipe.image_url).pathname.split('/recipe-images/')[1];
                    if (oldImagePath) {
                        await supabase.storage.from('recipe-images').remove([oldImagePath]);
                    }
                }
                
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${slugify(recipeData.name)}-${Date.now()}.${fileExt}`;
                
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('recipe-images')
                    .upload(fileName, imageFile);

                if (uploadError) {
                    if (uploadError.message.includes('Bucket not found')) {
                        alert("Erro de Configuração: O bucket 'recipe-images' não foi encontrado no Supabase Storage.\n\nPor favor, crie um bucket público chamado 'recipe-images' no seu painel do Supabase.");
                        throw new Error("Bucket 'recipe-images' not found.");
                    }
                    throw uploadError;
                }
                
                imageUrl = supabase.storage.from('recipe-images').getPublicUrl(uploadData.path).data.publicUrl;
            }

            const dataToSave = { ...recipeData, image_url: imageUrl };

            if (editingRecipe?.id) {
                const { data: updatedData } = await supabase.from('recipes').update(dataToSave as any).eq('id', editingRecipe.id).select().single();
                if(updatedData) setSelectedRecipe(updatedData as any);
            } else {
                const { data: insertedData } = await supabase.from('recipes').insert([{ ...dataToSave, added_by: currentUser }] as any).select().single();
                if(insertedData) setSelectedRecipe(insertedData as any);
            }
            
            await fetchRecipes();
            handleCloseModal();

        } catch (error: any) {
            console.error("Error saving recipe:", error);
            setSaveError(error.message);
        }
    };
    
    const handleDeleteRecipe = async (recipe: Recipe) => {
        if(window.confirm(`Tem certeza que deseja apagar a receita "${recipe.name}"?`)) {
            try {
                if (recipe.image_url) {
                    const oldImagePath = new URL(recipe.image_url).pathname.split('/recipe-images/')[1];
                    if (oldImagePath) {
                        await supabase.storage.from('recipe-images').remove([oldImagePath]);
                    }
                }
                await supabase.from('recipes').delete().eq('id', recipe.id);
                if(selectedRecipe?.id === recipe.id) setSelectedRecipe(null);
            } catch (error: any) {
                 console.error("Error deleting recipe:", error);
                 alert(`Erro ao apagar receita: ${error.message}`);
            }
        }
    }
    
    const handleCloseModal = () => {
        setIsFormModalOpen(false);
        setEditingRecipe(null);
        setSaveError(null);
    }
    
    return (
        <>
            <div className="md:hidden relative mb-4">
                <button
                    onClick={() => setIsMobileListOpen(!isMobileListOpen)}
                    className="w-full bg-white p-3 rounded-lg shadow-sm text-left flex justify-between items-center button-active-effect"
                >
                    <span className="font-semibold text-slate-700 truncate">{selectedRecipe?.name || 'Selecione uma receita'}</span>
                    <ChevronDownIcon className={`w-5 h-5 text-slate-500 transition-transform ${isMobileListOpen ? 'rotate-180' : ''}`} />
                </button>
                {isMobileListOpen && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 shadow-lg rounded-lg mt-1 z-20 max-h-80 overflow-y-auto">
                        <div className="p-2 space-y-1">
                            {recipes.map(recipe => (
                                <button
                                    key={recipe.id}
                                    onClick={() => { setSelectedRecipe(recipe); setIsMobileListOpen(false); }}
                                    className={`w-full text-left p-3 rounded-md flex items-center gap-3 ${ selectedRecipe?.id === recipe.id ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-slate-100' }`}
                                >
                                    <img src={recipe.image_url || `https://picsum.photos/seed/${recipe.id}/80/80`} alt={recipe.name} className="w-8 h-8 object-cover rounded-md bg-slate-200 flex-shrink-0" />
                                    <span className="truncate">{recipe.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div className="flex flex-col md:flex-row gap-0 md:h-[calc(100vh-220px)]">
                <aside className="hidden md:flex md:w-1/3 lg:w-1/4 flex-col bg-white rounded-l-xl shadow-subtle p-4 border-r border-slate-200">
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-dark">Receitas</h2>
                        <div className="flex gap-2">
                            <Button onClick={() => setIsVoiceModalOpen(true)} size="sm" variant="secondary" title="Adicionar com Voz"><MicrophoneIcon className="w-4 h-4" /></Button>
                            <Button onClick={() => setIsImportModalOpen(true)} size="sm" variant="accent" title="Buscar com IA"><SparklesIcon className="w-4 h-4" /></Button>
                            <Button onClick={() => { setEditingRecipe(null); setIsFormModalOpen(true); }} size="sm" title="Adicionar Manualmente"><PlusIcon className="w-4 h-4"/></Button>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto -mr-2 pr-2">
                        <div className="space-y-1">
                            {recipes.map(recipe => (
                                <button key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className={`w-full text-left p-2 rounded-lg transition-colors text-slate-700 font-medium flex items-center gap-3 ${ selectedRecipe?.id === recipe.id ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100' }`}>
                                    <img src={recipe.image_url || `https://picsum.photos/seed/${recipe.id}/80/80`} alt={recipe.name} className="w-10 h-10 object-cover rounded-md bg-slate-200 flex-shrink-0"/>
                                    <span className="truncate">{recipe.name}</span>
                                </button>
                            ))}
                        </div>
                         {recipes.length === 0 && <div className="text-center py-12 text-slate-500"><p>Nenhuma receita encontrada.</p></div>}
                    </div>
                </aside>
                <div className="hidden md:block w-4 bg-slate-200" style={{background: 'linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0.01) 50%, rgba(0,0,0,0.1))'}}></div>
                <main className="flex-grow w-full md:w-2/3 lg:w-3/4 overflow-y-auto bg-white rounded-r-xl shadow-subtle">
                    {selectedRecipe ? (
                        <div key={selectedRecipe.id} className="animate-fade-in">
                            <RecipeView recipe={selectedRecipe} onEdit={(recipe) => { setEditingRecipe(recipe); setIsFormModalOpen(true); }} onDelete={handleDeleteRecipe} onStartCooking={setCookingRecipe} onAnalyze={handleOpenAnalysis} />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                             <div className="text-center text-slate-500 p-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v11.494m-5.747-3.996l11.494 0M4.125 10.125h15.75M4.125 13.875h15.75M12 21.75c5.385 0 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25 2.25 6.615 2.25 12s4.365 9.75 9.75 9.75z" /></svg>
                                <h3 className="mt-4 font-hand text-4xl text-slate-700">Seu Livro de Receitas</h3>
                                <p className="mt-1 text-sm text-slate-500">Selecione uma receita da lista para ver os detalhes aqui.</p>
                                {recipes.length === 0 && (
                                    <div className="mt-6"><Button onClick={() => { setEditingRecipe(null); setIsFormModalOpen(true); }}><PlusIcon className="w-5 h-5"/> Adicionar Primeira Receita</Button></div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            </div>
            
            <Modal isOpen={isFormModalOpen} onClose={handleCloseModal} title={editingRecipe?.id ? "Editar Receita" : "Adicionar Receita"}><RecipeForm onSave={handleSaveRecipe} onClose={handleCloseModal} initialData={editingRecipe} saveError={saveError} /></Modal>
            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Buscar Receita com IA"><RecipeImportModal onClose={() => setIsImportModalOpen(false)} onImportSuccess={handleOpenFormWithImportedData}/></Modal>
            <Modal isOpen={isVoiceModalOpen} onClose={() => setIsVoiceModalOpen(false)} title="Adicionar Receita por Voz"><RecipeVoiceInputModal onClose={() => setIsVoiceModalOpen(false)} onImportSuccess={handleOpenFormWithImportedData}/></Modal>
            <Modal isOpen={isAnalysisModalOpen} onClose={handleCloseAnalysis} title={`Análise Nutricional: ${analyzingRecipe?.name || ''}`}><NutritionalAnalysisView isAnalyzing={isAnalyzing} analysisResult={analysisResult} analysisError={analysisError}/></Modal>
            {cookingRecipe && <CookingModeView recipe={cookingRecipe} onClose={() => setCookingRecipe(null)} />}
        </>
    );
};

// --- SUB-COMPONENTS FOR DRINKS (New Logic) ---

const DrinkView: React.FC<{ drink: Drink; onEdit: (drink: Drink) => void; onDelete: (drink: Drink) => void; }> = ({ drink, onEdit, onDelete }) => (
    <div className="bg-white p-6 md:p-10 rounded-xl shadow-lg overflow-y-auto" style={{maxHeight: 'calc(100vh - 220px)'}}>
        {drink.image_url && <div className="mb-6 rounded-lg overflow-hidden h-64 w-full bg-slate-200"><img src={drink.image_url} alt={drink.name} className="w-full h-full object-cover"/></div>}
        <h1 className="font-hand text-5xl md:text-6xl text-slate-800 mb-2 break-words">{drink.name}</h1>
        <div className="flex items-baseline gap-4 mb-8 text-slate-500 flex-wrap">
            <span className="font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full text-sm">{drink.category}</span>
            <span className="font-semibold text-amber-600 bg-amber-100 px-3 py-1 rounded-full text-sm">Copo: {drink.glass}</span>
            {drink.garnish && <span className="font-semibold text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm">Guarnição: {drink.garnish}</span>}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6">
            <div className="lg:col-span-1">
                <h2 className="font-bold text-2xl text-slate-700 border-b-2 border-slate-200 pb-2 mb-4">Ingredientes</h2>
                <div className="space-y-2 text-slate-600">{drink.ingredients?.map(ing => (ing.is_heading ? <h4 key={ing.id} className="font-bold text-slate-800 pt-3 text-lg">{ing.name}</h4> : <p key={ing.id} className="pl-2">{ing.quantity ? `${ing.quantity} de ${ing.name}` : ing.name}</p>))}</div>
            </div>
            <div className="lg:col-span-2">
                <h2 className="font-bold text-2xl text-slate-700 border-b-2 border-slate-200 pb-2 mb-4">Modo de Preparo</h2>
                <div className="space-y-4 text-slate-700 leading-relaxed">{drink.instructions?.split('\n').filter(line => line.trim() !== '').map((line, index) => <p key={index}>{line}</p>)}</div>
            </div>
        </div>
        <div className="flex justify-end items-center pt-8 mt-8 border-t border-slate-200 flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={() => onDelete(drink)}><TrashIcon className="w-4 h-4"/> Apagar</Button>
            <Button variant="secondary" size="sm" onClick={() => onEdit(drink)}><PencilIcon className="w-4 h-4"/> Editar</Button>
        </div>
    </div>
);

const DrinkForm: React.FC<{ onSave: (data: any, imageFile: File | null) => Promise<void>; onClose: () => void; initialData: Drink | null; }> = ({ onSave, onClose, initialData }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState<DrinkCategory>('Batido');
    const [glass, setGlass] = useState('');
    const [garnish, setGarnish] = useState('');
    const [ingredients, setIngredients] = useState<Ingredient[]>([{id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
    const [instructions, setInstructions] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string|null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if(initialData) {
            setName(initialData.name || ''); setCategory(initialData.category || 'Batido'); setGlass(initialData.glass || ''); setGarnish(initialData.garnish || '');
            setIngredients(initialData.ingredients?.length > 0 ? initialData.ingredients.map(i => ({...i, is_heading: i.is_heading || false})) : [{id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
            setInstructions(initialData.instructions || ''); setImagePreview(initialData.image_url || null); setImageFile(null);
        } else {
            setName(''); setCategory('Batido'); setGlass(''); setGarnish(''); setIngredients([{id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
            setInstructions(''); setImagePreview(null); setImageFile(null);
        }
    }, [initialData]);

    const handleIngredientChange = (id: string, field: 'name' | 'quantity', value: string) => setIngredients(p => p.map(i => i.id === id ? {...i, [field]: value} : i));
    const addIngredient = () => setIngredients(p => [...p, {id: crypto.randomUUID(), name: '', quantity: '', is_heading: false}]);
    const addHeading = () => setIngredients(p => [...p, {id: crypto.randomUUID(), name: '', quantity: '', is_heading: true}]);
    const removeIngredient = (id: string) => setIngredients(p => p.filter(i => i.id !== id));
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const compressedFile = await compressImage(file, 800);
            setImageFile(compressedFile);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(compressedFile);
        }
    };
    const handleRemoveImage = () => { setImageFile(null); setImagePreview(null); (document.getElementById('drink-image') as HTMLInputElement).value = ''; if (initialData) initialData.image_url = null; };
    const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setIsSaving(true); await onSave({ name, category, glass, garnish, ingredients: ingredients.filter(i => i.name.trim()), instructions }, imageFile); setIsSaving(false); };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="text" placeholder="Nome do Drink" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
            <div className="grid grid-cols-2 gap-4">
                <select value={category} onChange={e => setCategory(e.target.value as DrinkCategory)} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900">
                    {DRINK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <Input type="text" placeholder="Copo Ideal" value={glass} onChange={e => setGlass(e.target.value)} />
            </div>
            <Input type="text" placeholder="Guarnição (opcional)" value={garnish} onChange={e => setGarnish(e.target.value)} />
            <div>
                <label className="font-medium text-sm text-slate-700">Foto</label>
                <input id="drink-image" type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                {imagePreview && <div className="relative group mt-2"><img src={imagePreview} alt="Preview" className="mt-2 rounded-lg max-h-40 w-full object-cover"/><button type="button" onClick={handleRemoveImage} className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"><XMarkIcon className="w-4 h-4"/></button></div>}
            </div>
            <div>
                <h4 className="font-medium text-sm text-slate-700 mb-2">Ingredientes</h4>
                <div className="space-y-2">{ingredients.map(ing => (<div key={ing.id} className="flex gap-2 items-center">{ing.is_heading ? <Input type="text" placeholder="Título da Seção" value={ing.name} onChange={e => handleIngredientChange(ing.id, 'name', e.target.value)} className="flex-grow font-semibold" /> : <><Input type="text" placeholder="Qtde" value={ing.quantity} onChange={e => handleIngredientChange(ing.id, 'quantity', e.target.value)} className="w-1/3"/><Input type="text" placeholder="Ingrediente" value={ing.name} onChange={e => handleIngredientChange(ing.id, 'name', e.target.value)} className="flex-grow"/></>}<Button type="button" variant="danger" size="sm" onClick={() => removeIngredient(ing.id)} disabled={ingredients.length <= 1}><TrashIcon className="w-4 h-4"/></Button></div>))}</div>
                <div className="flex gap-2 mt-2"><Button type="button" variant="secondary" size="sm" onClick={addIngredient}><PlusIcon className="w-4 h-4"/> Ingrediente</Button><Button type="button" variant="secondary" size="sm" onClick={addHeading}><PlusIcon className="w-4 h-4"/> Título</Button></div>
            </div>
            <div>
                <label className="font-medium text-sm text-slate-700">Modo de Preparo</label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition"/>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={isSaving || !name}>{isSaving ? 'Salvando...' : 'Salvar Drink'}</Button></div>
        </form>
    );
};

const DrinkImportModal: React.FC<{ onClose: () => void; onImportSuccess: (data: Partial<Drink>) => void; }> = ({ onClose, onImportSuccess }) => {
    const [queryInput, setQueryInput] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    const handleSearchWithAI = async () => {
        if (!queryInput) return; setIsImporting(true); setImportError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
            const prompt = `Realize uma busca no Google pela receita do drink: "${queryInput}". Analise a receita e retorne APENAS UM OBJETO JSON VÁLIDO com as chaves: "name" (string), "category" (um de [${DRINK_CATEGORIES.map(c => `'${c}'`).join(', ')}]), "glass" (string), "garnish" (string, ou null), "image_url" (string, ou null), "ingredients" (array de objetos com "name", "quantity", "is_heading"), "instructions" (string com passos separados por "\\n"). A resposta deve ser toda em português brasileiro.`;
            
            const response = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash', 
                contents: prompt, 
                config: { tools: [{ googleSearch: {} }] } 
            });

            let jsonString = response.text.trim();
            const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
            if (!jsonMatch) throw new Error("A IA não retornou um JSON válido.");
            const parsedData = JSON.parse(jsonMatch[1] || jsonMatch[2]);
            onImportSuccess({
                ...parsedData,
                ingredients: Array.isArray(parsedData.ingredients) ? parsedData.ingredients.map((ing: any) => ({ ...ing, id: crypto.randomUUID(), is_heading: ing.is_heading || false })) : [],
            });
        } catch (error) { setImportError("Não foi possível buscar a receita. " + (error as Error).message); } finally { setIsImporting(false); }
    };
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600">Digite o nome de um drink. A IA irá pesquisar e preencher os detalhes para você.</p>
            <Input type="text" placeholder="Ex: Negroni, Margarita, Caipirinha" value={queryInput} onChange={(e) => setQueryInput(e.target.value)} disabled={isImporting} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleSearchWithAI(); }}} autoFocus/>
            {importError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{importError}</p>}
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isImporting}>Cancelar</Button>
                <Button type="button" onClick={handleSearchWithAI} disabled={isImporting || !queryInput}><SparklesIcon className={`w-4 h-4 ${isImporting ? 'animate-spin': ''}`}/> {isImporting ? 'Buscando...' : 'Buscar com IA'}</Button>
            </div>
        </div>
    );
};

const DrinksSection: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [drinks, setDrinks] = useState<Drink[]>([]);
    const [selectedDrink, setSelectedDrink] = useState<Drink | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingDrink, setEditingDrink] = useState<Drink | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    
    const fetchDrinks = useCallback(async () => {
        const { data, error } = await supabase.from('drinks').select('*').order('name', { ascending: true });
        if (error) console.error("Error fetching drinks:", error); else setDrinks((data as any[]) || []);
    }, []);

    useEffect(() => { fetchDrinks(); }, [fetchDrinks]);
    useEffect(() => { if (!selectedDrink && drinks.length > 0) setSelectedDrink(drinks[0]); else if (selectedDrink && !drinks.find(d => d.id === selectedDrink.id)) setSelectedDrink(drinks[0] || null); }, [drinks, selectedDrink]);
    useEffect(() => { const channel = supabase.channel('realtime-drinks').on('postgres_changes', { event: '*', schema: 'public', table: 'drinks' }, fetchDrinks).subscribe(); return () => { supabase.removeChannel(channel); }; }, [fetchDrinks]);

    const handleOpenFormWithImportedData = (data: Partial<Drink>) => { setIsImportModalOpen(false); setEditingDrink(data as Drink); setIsFormModalOpen(true); };
    
    const handleSaveDrink = async (drinkData: Omit<Drink, 'id' | 'added_by' | 'created_at'>, imageFile: File | null) => {
        let imageUrl = editingDrink?.image_url || (drinkData as Drink).image_url || null;
        try {
            if (imageFile) {
                if (editingDrink?.image_url) { const oldPath = new URL(editingDrink.image_url).pathname.split('/recipe-images/')[1]; if (oldPath) await supabase.storage.from('recipe-images').remove([oldPath]); }
                const fileName = `${slugify(drinkData.name)}-${Date.now()}.${imageFile.name.split('.').pop()}`;
                const { data, error } = await supabase.storage.from('recipe-images').upload(fileName, imageFile);
                if (error) throw error;
                imageUrl = supabase.storage.from('recipe-images').getPublicUrl(data.path).data.publicUrl;
            }
            const dataToSave = { ...drinkData, image_url: imageUrl };
            if (editingDrink?.id) {
                const { data, error } = await supabase.from('drinks').update(dataToSave as any).eq('id', editingDrink.id).select().single();
                if (error) throw error;
                if(data) setSelectedDrink(data as any);
            } else {
                const { data, error } = await supabase.from('drinks').insert([{ ...dataToSave, added_by: currentUser }] as any).select().single();
                if (error) throw error;
                if(data) setSelectedDrink(data as any);
            }
            await fetchDrinks();
            setIsFormModalOpen(false);
            setEditingDrink(null);
        } catch (error) {
            console.error("Error saving drink:", error);
            alert("Erro ao salvar drink.");
        }
    };

    const handleDeleteDrink = async (drink: Drink) => {
        if (window.confirm(`Apagar "${drink.name}"?`)) {
            try {
                if (drink.image_url) {
                    const oldPath = new URL(drink.image_url).pathname.split('/recipe-images/')[1];
                    if (oldPath) await supabase.storage.from('recipe-images').remove([oldPath]);
                }
                const { error } = await supabase.from('drinks').delete().eq('id', drink.id);
                if (error) throw error;
                if (selectedDrink?.id === drink.id) setSelectedDrink(null);
                await fetchDrinks();
            } catch (error) {
                console.error("Error deleting drink:", error);
                alert("Erro ao apagar drink.");
            }
        }
    };

    return (
        <>
            <div className="flex flex-col md:flex-row gap-0 md:h-[calc(100vh-220px)]">
                <aside className="md:w-1/3 lg:w-1/4 flex-col bg-white rounded-l-xl shadow-subtle p-4 border-r border-slate-200 hidden md:flex">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold text-dark">Drinks</h2><div className="flex gap-2"><Button onClick={() => setIsImportModalOpen(true)} size="sm" variant="accent" title="Buscar com IA"><SparklesIcon className="w-4 h-4"/></Button><Button onClick={() => { setEditingDrink(null); setIsFormModalOpen(true); }} size="sm" title="Adicionar Manualmente"><PlusIcon className="w-4 h-4"/></Button></div></div>
                    <div className="flex-grow overflow-y-auto -mr-2 pr-2">
                        <div className="space-y-1">{drinks.map(drink => <button key={drink.id} onClick={() => setSelectedDrink(drink)} className={`w-full text-left p-2 rounded-lg transition-colors text-slate-700 font-medium flex items-center gap-3 ${selectedDrink?.id === drink.id ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100'}`}><img src={drink.image_url || `https://picsum.photos/seed/drink-${drink.id}/80/80`} alt={drink.name} className="w-10 h-10 object-cover rounded-md bg-slate-200 flex-shrink-0"/><span className="truncate">{drink.name}</span></button>)}</div>
                        {drinks.length === 0 && <div className="text-center py-12 text-slate-500"><p>Nenhum drink na lista.</p></div>}
                    </div>
                </aside>
                <div className="hidden md:block w-4 bg-slate-200" style={{background: 'linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0.01) 50%, rgba(0,0,0,0.1))'}}></div>
                <main className="flex-grow w-full md:w-2/3 lg:w-3/4 overflow-y-auto bg-white rounded-r-xl shadow-subtle">
                    {selectedDrink ? <div key={selectedDrink.id} className="animate-fade-in"><DrinkView drink={selectedDrink} onEdit={(d) => { setEditingDrink(d); setIsFormModalOpen(true); }} onDelete={handleDeleteDrink} /></div> : <div className="flex items-center justify-center h-full"><div className="text-center text-slate-500 p-4"><MartiniGlassIcon className="mx-auto h-16 w-16 text-slate-300"/><h3 className="mt-4 font-hand text-4xl text-slate-700">Seu Livro de Drinks</h3><p className="mt-1 text-sm text-slate-500">Selecione um drink ou adicione um novo.</p></div></div>}
                </main>
            </div>
            <Modal isOpen={isFormModalOpen} onClose={() => { setIsFormModalOpen(false); setEditingDrink(null); }} title={editingDrink?.id ? "Editar Drink" : "Adicionar Drink"}><DrinkForm onSave={handleSaveDrink} onClose={() => { setIsFormModalOpen(false); setEditingDrink(null); }} initialData={editingDrink} /></Modal>
            <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Buscar Drink com IA"><DrinkImportModal onClose={() => setIsImportModalOpen(false)} onImportSuccess={handleOpenFormWithImportedData}/></Modal>
        </>
    );
};

const RecipesApp: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [activeTab, setActiveTab] = useState<'food' | 'drinks'>('food');

    return (
        <div className="container mx-auto p-4 sm:p-6">
            <div className="max-w-xs mx-auto mb-8">
                <SegmentedControl
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as 'food' | 'drinks')}
                    options={[
                        { label: 'Comida', value: 'food' },
                        { label: 'Drinks', value: 'drinks' }
                    ]}
                />
            </div>
            {activeTab === 'food' ? <FoodSection currentUser={currentUser} /> : <DrinksSection currentUser={currentUser} />}
        </div>
    );
};

export default RecipesApp;