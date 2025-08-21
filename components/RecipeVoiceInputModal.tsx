/// <reference types="vite/client" />

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Button } from './UIComponents';
import { MicrophoneIcon, SparklesIcon } from './Icons';
import { Recipe } from '../types';

interface RecipeVoiceInputModalProps {
    onClose: () => void;
    onImportSuccess: (data: Partial<Recipe>) => void;
}

const RecipeVoiceInputModal: React.FC<RecipeVoiceInputModalProps> = ({ onClose, onImportSuccess }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError("Seu navegador não suporta reconhecimento de voz.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    setTranscript(prev => prev + event.results[i][0].transcript + '. ');
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
        };

        recognition.onerror = (event: any) => {
            setError(`Erro no reconhecimento: ${event.error}. Por favor, verifique a permissão do microfone.`);
            setIsListening(false);
        };
        
        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            setTranscript('');
            setError(null);
            recognitionRef.current?.start();
            setIsListening(true);
        }
    };

    const handleProcessTranscript = async () => {
        if (!transcript.trim()) {
            setError("Nenhum texto foi capturado. Fale a receita primeiro.");
            return;
        }
        setIsProcessing(true);
        setError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
            
            const prompt = `
            Analise o seguinte texto de uma receita ditada e extraia as informações, retornando APENAS UM OBJETO JSON VÁLIDO:
            - **name**: O nome completo da receita (string).
            - **category**: "Doce" ou "Salgado" (string).
            - **prep_time_minutes**: Tempo de preparo em minutos (number, ou null).
            - **ingredients**: Uma lista de objetos, onde cada objeto tem "name", "quantity" e "is_heading" (boolean). Se houver seções, crie um item de ingrediente com "name" sendo o título da seção, "is_heading" como true, e "quantity" como uma string vazia.
            - **instructions**: O modo de preparo completo, com passos separados por "\\n".

            Texto da Receita Ditada:
            "${transcript}"

            **IMPORTANTE**: A resposta deve ser APENAS o JSON, sem markdown (\`\`\`json), texto extra ou explicações.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            category: { type: Type.STRING, enum: ['Doce', 'Salgado'] },
                            prep_time_minutes: { type: Type.NUMBER, nullable: true },
                            ingredients: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING },
                                        quantity: { type: Type.STRING },
                                        is_heading: { type: Type.BOOLEAN },
                                    },
                                    required: ["name"],
                                }
                            },
                            instructions: { type: Type.STRING }
                        },
                        required: ["name", "category", "ingredients", "instructions"],
                    },
                }
            });

            const parsedData = JSON.parse(response.text.trim());
            
            const recipeData: Partial<Recipe> = {
                name: parsedData.name || "Receita ditada",
                category: parsedData.category || 'Salgado',
                prep_time_minutes: parsedData.prep_time_minutes || null,
                ingredients: Array.isArray(parsedData.ingredients)
                    ? parsedData.ingredients.map((ing: any) => ({ ...ing, id: crypto.randomUUID(), is_heading: ing.is_heading || false }))
                    : [],
                instructions: parsedData.instructions || '',
            };

            onImportSuccess(recipeData);
        } catch (e) {
            console.error("Error processing transcript with AI:", e);
            setError(`Não foi possível processar a receita. Erro: ${(e as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600">
                Pressione o botão do microfone e comece a ditar sua receita. Fale claramente o nome, os ingredientes e o modo de preparo. Quando terminar, clique novamente no botão e peça para a IA processar o texto.
            </p>
            
            <div className="w-full p-4 bg-slate-100 rounded-lg border border-slate-200 min-h-[200px]">
                <textarea 
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="O texto da sua receita aparecerá aqui..."
                    className="w-full h-full bg-transparent border-none focus:ring-0 resize-none"
                    rows={8}
                    disabled={isProcessing}
                />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 border-t">
                <Button 
                    type="button"
                    onClick={toggleListening}
                    disabled={isProcessing}
                    className={`!rounded-full !w-20 !h-20 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-primary'}`}
                >
                    <MicrophoneIcon className="w-8 h-8 text-white"/>
                </Button>
                
                <div className="text-center">
                    <p className="font-semibold text-lg">{isListening ? "Ouvindo..." : (transcript ? "Pronto para processar" : "Clique para começar")}</p>
                    <Button 
                        type="button" 
                        onClick={handleProcessTranscript} 
                        disabled={isProcessing || isListening || !transcript.trim()}
                        className="mt-2"
                        variant="accent"
                    >
                        {isProcessing ? (
                            <><SparklesIcon className="w-4 h-4 animate-spin"/> Processando...</>
                        ) : (
                            <><SparklesIcon className="w-4 h-4"/> Processar com IA</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default RecipeVoiceInputModal;
