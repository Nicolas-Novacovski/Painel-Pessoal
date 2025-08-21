

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { User, Habit, HabitEntry, MoodEntry } from '../types';
import { USERS } from '../constants';
import { Button, Input, Modal } from './UIComponents';
import { PlusIcon, SparklesIcon, ClipboardCheckIcon, SunIcon, CheckIcon } from './Icons';
import { GoogleGenAI } from "@google/genai";

interface WellnessAppProps {
    currentUser: User;
}

const WELLNESS_TABLES_SQL = `-- This script reconfigures the tables for the "Bem-Estar" (Wellness) section.
-- It will remove the old gratitude journal and add mood tracking.
-- Run this once in your Supabase SQL Editor.

-- Drop the old gratitude table if it exists
DROP TABLE IF EXISTS public.gratitude_entries;

-- 1. Create/Re-create the 'habits' table
DROP TABLE IF EXISTS public.habits CASCADE; -- Use CASCADE to remove dependent entries
CREATE TABLE public.habits (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL,
    icon text NULL,
    users jsonb NOT NULL,
    CONSTRAINT habits_pkey PRIMARY KEY (id)
);
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all actions for all users on habits" ON public.habits FOR ALL USING (true) WITH CHECK (true);

-- 2. Create/Re-create the 'habit_entries' table
DROP TABLE IF EXISTS public.habit_entries;
CREATE TABLE public.habit_entries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    habit_id uuid NOT NULL,
    user_id text NOT NULL,
    entry_date date NOT NULL,
    CONSTRAINT habit_entries_pkey PRIMARY KEY (id),
    CONSTRAINT habit_entries_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
    CONSTRAINT habit_entries_unique_entry UNIQUE (habit_id, user_id, entry_date)
);
ALTER TABLE public.habit_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all actions for all users on habit_entries" ON public.habit_entries FOR ALL USING (true) WITH CHECK (true);

-- 3. Create the new 'mood_entries' table
DROP TABLE IF EXISTS public.mood_entries;
CREATE TABLE public.mood_entries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id text NOT NULL,
    mood smallint NOT NULL, -- 1 to 5 for mood
    entry_date date NOT NULL,
    CONSTRAINT mood_entries_pkey PRIMARY KEY (id),
    CONSTRAINT mood_entries_unique_entry UNIQUE (user_id, entry_date)
);
ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all actions for all users on mood_entries" ON public.mood_entries FOR ALL USING (true) WITH CHECK (true);
`;


const DatabaseErrorResolver: React.FC<{ title: string; instructions: string; sql: string }> = ({ title, instructions, sql }) => (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg my-4">
        <h4 className="font-semibold text-red-900">{title}</h4>
        <p className="text-sm text-red-800 mt-1">{instructions}</p>
        <div className="mt-4">
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{sql}</code>
            </pre>
            <p className="text-xs text-slate-600 mt-2">
                Copie este código e cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase. Depois, recarregue a página.
            </p>
        </div>
    </div>
);

const MOODS = [
    { value: 5, emoji: '😁', label: 'Ótimo', color: 'text-green-500' },
    { value: 4, emoji: '😊', label: 'Bem', color: 'text-lime-500' },
    { value: 3, emoji: '😐', label: 'Ok', color: 'text-yellow-500' },
    { value: 2, emoji: '😟', label: 'Mal', color: 'text-orange-500' },
    { value: 1, emoji: '😠', label: 'Péssimo', color: 'text-red-500' },
];

const MoodTracker: React.FC<{
    currentUser: User,
    partner: User | undefined,
    myMood: number | undefined,
    partnerMood: number | undefined,
    onSelectMood: (mood: number) => void
}> = ({ currentUser, partner, myMood, partnerMood, onSelectMood }) => {
    
    const partnerMoodData = partnerMood ? MOODS.find(m => m.value === partnerMood) : null;
    
    return (
        <div className="bg-white p-6 rounded-xl shadow-subtle">
            <h2 className="text-xl font-bold text-dark text-center mb-4">Como vocês estão se sentindo hoje?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* My Mood */}
                <div className="bg-slate-50 p-4 rounded-lg text-center border">
                    <p className="font-semibold text-slate-700 mb-3">{currentUser === 'Ana Beatriz Diva Linda' ? 'Ana' : currentUser}</p>
                    <div className="flex justify-center items-center gap-2">
                        {MOODS.map(mood => (
                            <button
                                key={mood.value}
                                onClick={() => onSelectMood(mood.value)}
                                className={`p-2 rounded-full transition-all duration-200 text-4xl leading-none ${myMood === mood.value ? 'bg-primary/20 scale-125' : 'hover:bg-slate-200'}`}
                                aria-label={mood.label}
                                title={mood.label}
                            >
                                {mood.emoji}
                            </button>
                        ))}
                    </div>
                </div>
                {/* Partner's Mood */}
                {partner && (
                     <div className="bg-slate-50 p-4 rounded-lg text-center border">
                        <p className="font-semibold text-slate-700 mb-3">{partner === 'Ana Beatriz Diva Linda' ? 'Ana' : partner}</p>
                        <div className="h-[60px] flex items-center justify-center">
                            {partnerMoodData ? (
                                <div className="flex flex-col items-center animate-pop-in">
                                    <span className="text-4xl">{partnerMoodData.emoji}</span>
                                    <span className={`text-sm font-semibold mt-1 ${partnerMoodData.color}`}>{partnerMoodData.label}</span>
                                </div>
                            ) : (
                                <p className="text-slate-500">Aguardando...</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
};

const HabitChecklist: React.FC<{
    currentUser: User,
    habits: Habit[],
    entries: HabitEntry[],
    onToggleHabit: (habitId: string) => void,
    onAddHabit: () => void
}> = ({ currentUser, habits, entries, onToggleHabit, onAddHabit }) => {
    const partner = useMemo(() => USERS.find(u => u !== currentUser && u !== 'Visitante'), [currentUser]);
    
    return (
         <div className="bg-white p-6 rounded-xl shadow-subtle h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-dark flex items-center gap-2"><ClipboardCheckIcon className="w-6 h-6 text-primary"/> Checklist de Hábitos</h2>
                <Button size="sm" onClick={onAddHabit}>
                    <PlusIcon className="w-4 h-4"/> Novo
                </Button>
            </div>
            
            <div className="space-y-3 flex-grow">
                {habits.map(habit => {
                    const myEntry = entries.find(e => e.habit_id === habit.id && e.user_id === currentUser);
                    const partnerEntry = partner ? entries.find(e => e.habit_id === habit.id && e.user_id === partner) : null;
                    
                    const isTrackedByMe = (habit.users as unknown as User[]).includes(currentUser);
                    const isTrackedByPartner = partner && (habit.users as unknown as User[]).includes(partner);

                    return (
                        <div key={habit.id} className="p-3 bg-slate-50 rounded-lg flex items-center gap-4">
                             <div className="flex-grow flex items-center gap-3">
                                <span className="text-xl">{habit.icon || '🎯'}</span>
                                <span className="font-semibold text-slate-800">{habit.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                               {isTrackedByMe && (
                                    <button 
                                        onClick={() => onToggleHabit(habit.id)}
                                        className={`w-9 h-9 rounded-full border-2 transition-all duration-200 flex items-center justify-center ${myEntry ? 'bg-primary border-primary text-white' : 'bg-white border-slate-300 text-slate-400 hover:border-primary'}`}
                                        title={currentUser}
                                    >
                                       <CheckIcon className="w-5 h-5"/>
                                    </button>
                                )}
                                {isTrackedByPartner && (
                                    <div 
                                        title={`${partner} ${partnerEntry ? 'completou' : 'não completou'} este hábito hoje.`}
                                        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${partnerEntry ? 'bg-partner border-partner text-white' : 'bg-white border-dashed border-slate-300 text-slate-300'}`}
                                    >
                                       <CheckIcon className="w-5 h-5"/>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
                 {habits.length === 0 && (
                     <p className="text-center text-slate-500 pt-8">Nenhum hábito criado. Adicione um para começar!</p>
                )}
            </div>
        </div>
    );
};

const SuggestionCard: React.FC<{
    suggestion: string | null,
    isLoading: boolean,
    onSuggest: () => void,
}> = ({ suggestion, isLoading, onSuggest }) => {
    return (
        <div className="bg-white p-6 rounded-xl shadow-subtle h-full flex flex-col items-center text-center">
             <h2 className="text-xl font-bold text-dark flex items-center justify-center gap-2"><SunIcon className="w-6 h-6 text-amber-500"/> Ideia para o Casal</h2>
             <p className="text-slate-600 my-3 flex-grow">Sem ideias do que fazer para relaxar e se conectar? Peça uma sugestão para a IA!</p>
             
            {suggestion && !isLoading && (
                <div className="text-left bg-blue-50 p-4 rounded-lg border border-blue-200 animate-fade-in w-full mb-4">
                    <p className="text-blue-800 whitespace-pre-wrap">{suggestion}</p>
                </div>
            )}
            
            <Button variant="accent" onClick={onSuggest} disabled={isLoading}>
                 <SparklesIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                 {isLoading ? 'Pensando...' : (suggestion ? 'Sugerir Outra' : 'Me dê uma ideia!')}
            </Button>
        </div>
    );
};

const WellnessApp: React.FC<WellnessAppProps> = ({ currentUser }) => {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [habitEntries, setHabitEntries] = useState<HabitEntry[]>([]);
    const [moodEntries, setMoodEntries] =useState<MoodEntry[]>([]);
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
    const [dbError, setDbError] = useState<any>(null);

    const todayString = useMemo(() => new Date().toISOString().split('T')[0], []);
    const partner = useMemo(() => USERS.find(u => u !== currentUser && u !== 'Visitante'), [currentUser]);

    const fetchData = useCallback(async () => {
        setDbError(null);
        try {
            const [habitsResult, habitEntriesResult, moodEntriesResult] = await Promise.all([
                supabase.from('habits').select('*').order('created_at'),
                supabase.from('habit_entries').select('*').eq('entry_date', todayString),
                supabase.from('mood_entries').select('*').eq('entry_date', todayString)
            ]);

            if (habitsResult.error) throw habitsResult.error;
            if (habitEntriesResult.error) throw habitEntriesResult.error;
            if (moodEntriesResult.error) throw moodEntriesResult.error;

            setHabits(habitsResult.data as any[] || []);
            setHabitEntries(habitEntriesResult.data as any[] || []);
            setMoodEntries(moodEntriesResult.data as any[] || []);

        } catch (error: any) {
            console.error("Error fetching wellness data", error);
             if (error?.code === '42P01') { // undefined_table
                setDbError(error);
            }
        }
    }, [todayString]);
    
    useEffect(() => {
        fetchData();
        const channel = supabase.channel('realtime-wellness-reformed')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_entries' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'mood_entries' }, fetchData)
            .subscribe();
        
        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    const myMood = useMemo(() => moodEntries.find(e => e.user_id === currentUser)?.mood, [moodEntries, currentUser]);
    const partnerMood = useMemo(() => partner ? moodEntries.find(e => e.user_id === partner)?.mood : undefined, [moodEntries, partner]);

    const handleToggleHabit = async (habitId: string) => {
        const existingEntry = habitEntries.find(e => e.habit_id === habitId && e.user_id === currentUser);
    
        // Optimistic UI update
        if (existingEntry) {
            setHabitEntries(prev => prev.filter(e => e.id !== existingEntry.id));
        } else {
            const newEntry: HabitEntry = {
                id: crypto.randomUUID(), // temporary ID
                habit_id: habitId,
                user_id: currentUser,
                entry_date: todayString,
                created_at: new Date().toISOString(),
            };
            setHabitEntries(prev => [...prev, newEntry]);
        }
    
        // Perform DB operation
        if (existingEntry) {
            const { error } = await supabase.from('habit_entries').delete().eq('id', existingEntry.id);
            if (error) {
                console.error("Error deleting habit entry", error);
                alert("Erro ao remover o hábito. A tela será atualizada.");
                fetchData(); // Revert on error
            }
        } else {
            const { error } = await supabase.from('habit_entries').insert([{ habit_id: habitId, user_id: currentUser, entry_date: todayString }]);
            if (error) {
                console.error("Error adding habit entry", error);
                alert("Erro ao adicionar o hábito. A tela será atualizada.");
                fetchData(); // Revert on error
            }
        }
    };
    
    const handleSelectMood = async (mood: number) => {
        const existingEntry = moodEntries.find(e => e.user_id === currentUser);
        const optimisticEntries = existingEntry
            ? moodEntries.map(e => e.user_id === currentUser ? {...e, mood} : e)
            : [...moodEntries, { id: crypto.randomUUID(), user_id: currentUser, mood, entry_date: todayString, created_at: new Date().toISOString() }];
        
        setMoodEntries(optimisticEntries);
    
        const { error } = await supabase.from('mood_entries').upsert({
            user_id: currentUser,
            entry_date: todayString,
            mood: mood
        }, { onConflict: 'user_id, entry_date' });
    
        if (error) {
            console.error("Error saving mood", error);
            alert("Não foi possível salvar seu humor. A tela será atualizada.");
            fetchData();
        }
    };

    const handleSuggest = async () => {
        setIsSuggesting(true);
        setSuggestion(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            const myMoodData = myMood ? MOODS.find(m => m.value === myMood) : null;
            const partnerMoodData = partner ? (partnerMood ? MOODS.find(m => m.value === partnerMood) : null) : null;

            let moodContext = "";
            if (myMoodData || partnerMoodData) {
                const myName = currentUser === 'Ana Beatriz Diva Linda' ? 'Ana' : currentUser;
                const partnerName = partner === 'Ana Beatriz Diva Linda' ? 'Ana' : partner;
                const myMoodText = myMoodData ? `Eu (${myName}) estou me sentindo "${myMoodData.label}".` : '';
                const partnerMoodText = partnerMoodData ? `Meu/minha parceiro(a) (${partnerName}) está se sentindo "${partnerMoodData.label}".` : '';
                moodContext = `Leve em consideração nosso humor de hoje: ${[myMoodText, partnerMoodText].filter(Boolean).join(' ')}`;
            }

            const prompt = `
Você é um especialista em atividades para casais, focado em bem-estar e conexão. Sua tarefa é sugerir uma atividade criativa para um casal em Curitiba.

${moodContext}

Diretrizes para a sugestão:
- **Seja Específico e Criativo:** Vá além do óbvio. Pense em categorias como gastronomia, arte, natureza, relaxamento em casa, etc.
- **PROIBIDO:** A sugestão "passeio sensorial" ou qualquer variação dela NÃO deve ser usada. O usuário quer ideias novas.
- **Adapte-se ao Humor:** Se o humor estiver positivo, sugira algo mais energético ou social. Se estiver mais baixo, sugira algo acolhedor e relaxante.
- **Formato:** A resposta deve ter um título curto e chamativo em negrito, seguido por um parágrafo explicando a atividade e por que ela é uma boa ideia para o casal.

Gere uma sugestão agora.
`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    temperature: 0.9,
                }
            });
            setSuggestion(response.text);
        } catch (err) {
            console.error("Error suggesting activity:", err);
            alert("Ocorreu um erro ao gerar a sugestão. Por favor, tente novamente.");
        } finally {
            setIsSuggesting(false);
        }
    };
    
    if (dbError) {
        return (
            <div className="container mx-auto p-4 sm:p-6">
                <DatabaseErrorResolver
                    title="Erro de Configuração do Banco de Dados"
                    instructions="A seção 'Bem-Estar' não pode ser carregada porque uma ou mais tabelas (`habits`, `habit_entries`, `mood_entries`) não foram encontradas. Para corrigir, execute o seguinte código SQL no seu painel Supabase."
                    sql={WELLNESS_TABLES_SQL}
                />
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 space-y-6">
            <div className="animate-fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="lg:col-span-2">
                        <MoodTracker
                            currentUser={currentUser}
                            partner={partner}
                            myMood={myMood}
                            partnerMood={partnerMood}
                            onSelectMood={handleSelectMood}
                        />
                    </div>
                    <HabitChecklist
                        currentUser={currentUser}
                        habits={habits}
                        entries={habitEntries}
                        onToggleHabit={handleToggleHabit}
                        onAddHabit={() => setIsHabitModalOpen(true)}
                    />
                    <SuggestionCard 
                        suggestion={suggestion}
                        isLoading={isSuggesting}
                        onSuggest={handleSuggest}
                    />
                </div>
            </div>
             <Modal isOpen={isHabitModalOpen} onClose={() => setIsHabitModalOpen(false)} title="Novo Hábito">
                <HabitForm onClose={() => setIsHabitModalOpen(false)} currentUser={currentUser} onSaveSuccess={fetchData}/>
            </Modal>
        </div>
    );
};


const HabitForm: React.FC<{onClose: () => void, currentUser: User, onSaveSuccess: () => void}> = ({onClose, currentUser, onSaveSuccess}) => {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('');
    const [assignedTo, setAssignedTo] = useState<User[]>([currentUser]);
    const [isSaving, setIsSaving] = useState(false);

    const handleToggleAssignee = (user: User) => {
        setAssignedTo(prev => 
            prev.includes(user) ? prev.filter(u => u !== user) : [...prev, user]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!name || assignedTo.length === 0) {
            alert("Nome e ao menos uma pessoa são obrigatórios.");
            return;
        }
        setIsSaving(true);
        const { error } = await supabase.from('habits').insert([{name, icon, users: assignedTo}]);
        if(error) {
            console.error(error);
            alert("Erro ao salvar hábito.");
        } else {
            onSaveSuccess();
            onClose();
        }
        setIsSaving(false);
    }
    
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="text" placeholder="Nome do hábito (Ex: Exercício Físico)" value={name} onChange={e => setName(e.target.value)} required />
            <Input type="text" placeholder="Ícone (opcional, ex: 💪)" value={icon} onChange={e => setIcon(e.target.value)} />
            <div>
                <label className="font-medium text-slate-700">Quem vai rastrear este hábito?</label>
                <div className="flex gap-2 mt-1">
                    {USERS.filter(u => u !== 'Visitante').map(user => (
                        <button key={user} type="button" onClick={() => handleToggleAssignee(user)} className={`px-3 py-1 text-sm font-semibold rounded-full border-2 transition-colors ${assignedTo.includes(user) ? 'bg-primary border-primary text-white' : 'bg-white/50 border-slate-300 hover:border-primary'}`}>
                            {user === 'Ana Beatriz Diva Linda' ? 'Ana' : user}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...': 'Salvar Hábito'}</Button>
            </div>
        </form>
    );
}

export default WellnessApp;
