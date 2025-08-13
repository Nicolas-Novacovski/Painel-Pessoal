import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { User, Reminder, ReminderColor, Subtask } from '../types';
import { REMINDER_COLORS, USERS } from '../constants';
import { Button, Input, SegmentedControl, Modal } from './UIComponents';
import { PlusIcon, CheckIcon, CalendarIcon, TrashIcon, ChevronDownIcon, XMarkIcon } from './Icons';

interface RemindersAppProps {
    currentUser: User;
}

// --- Helper to get random rotation for post-its ---
const useRandomRotation = () => {
    return useMemo(() => {
        const rotations = ['-2deg', '1deg', '-1deg', '2.5deg', '-1.5deg', '1.5deg'];
        return rotations[Math.floor(Math.random() * rotations.length)];
    }, []);
};

// --- ReminderCard Component ---
const ReminderCard: React.FC<{
    reminder: Reminder;
    onMarkDone: (id: string) => Promise<void>;
    onUpdateSubtasks: (id: string, subtasks: Subtask[]) => Promise<void>;
}> = ({ reminder, onMarkDone, onUpdateSubtasks }) => {
    const [isUnsticking, setIsUnsticking] = useState(false);
    const rotation = useRandomRotation();

    const colorClasses = {
        yellow: 'bg-postit-yellow text-postit-yellow-text',
        pink: 'bg-postit-pink text-postit-pink-text',
        blue: 'bg-postit-blue text-postit-blue-text',
        green: 'bg-postit-green text-postit-green-text',
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = reminder.due_date ? new Date(reminder.due_date + 'T00:00:00') : null;

    let urgencyClass = '';
    if (dueDate) {
        if (dueDate < today) {
            urgencyClass = 'animate-shake'; // Overdue
        } else if (dueDate.getTime() === today.getTime()) {
            urgencyClass = 'animate-glow'; // Due today
        }
    }

    const allSubtasksDone = useMemo(() => {
        if (!reminder.subtasks || reminder.subtasks.length === 0) return true;
        return reminder.subtasks.every(st => st.is_done);
    }, [reminder.subtasks]);

    const handleDoneClick = () => {
        if (!allSubtasksDone) return;
        setIsUnsticking(true);
    };

    const handleAnimationEnd = () => {
        if (isUnsticking) {
            onMarkDone(reminder.id);
        }
    };
    
    const handleToggleSubtask = (subtaskId: string) => {
        const updatedSubtasks = (reminder.subtasks || []).map(st => 
            st.id === subtaskId ? { ...st, is_done: !st.is_done } : st
        );
        onUpdateSubtasks(reminder.id, updatedSubtasks);
    };

    const progress = useMemo(() => {
        if (!reminder.subtasks || reminder.subtasks.length === 0) return 0;
        const doneCount = reminder.subtasks.filter(st => st.is_done).length;
        return (doneCount / reminder.subtasks.length) * 100;
    }, [reminder.subtasks]);
    
    const getInitials = (user: User) => {
        if (user === 'Ana Beatriz Diva Linda') return 'A';
        return user.charAt(0);
    }
    
    const getAvatarColor = (user: User) => {
        return user === 'Nicolas' ? 'bg-primary' : 'bg-partner';
    }

    return (
        <div
            className={`w-64 h-72 p-4 flex flex-col font-hand shadow-postit transition-all duration-300 hover:scale-110 hover:!rotate-0 hover:z-10 rounded-sm ${
                colorClasses[reminder.color]
            } ${isUnsticking ? 'animate-unstick' : ''} ${urgencyClass}`}
            style={{ '--rotation': rotation, transform: `rotate(var(--rotation))` } as React.CSSProperties}
            onAnimationEnd={handleAnimationEnd}
        >
            <div className="flex-grow overflow-y-auto pr-2">
                 <h4 className="text-3xl font-bold mb-2 border-b border-current/20 pb-1 break-words">{reminder.title}</h4>
                 {reminder.content && <p className="text-xl whitespace-pre-wrap break-words">{reminder.content}</p>}
                 
                 {reminder.subtasks && reminder.subtasks.length > 0 && (
                     <div className="mt-2 space-y-1 font-sans text-sm">
                         {reminder.subtasks.map(st => (
                             <div key={st.id} className="flex items-center gap-2 cursor-pointer" onClick={() => handleToggleSubtask(st.id)}>
                                 <div className={`w-4 h-4 border-2 rounded-sm flex-shrink-0 flex items-center justify-center ${st.is_done ? 'bg-current border-current' : 'border-current/50'}`}>
                                     {st.is_done && <CheckIcon className="w-3 h-3 text-white" style={{color: 'var(--tw-bg-opacity)'}}/>}
                                 </div>
                                 <span className={`${st.is_done ? 'line-through opacity-60' : ''}`}>{st.text}</span>
                             </div>
                         ))}
                     </div>
                 )}
            </div>
            
            {reminder.subtasks && reminder.subtasks.length > 0 && (
                <div className="flex-shrink-0 mt-2">
                    <div className="w-full bg-black/10 rounded-full h-1.5">
                        <div className="bg-current h-1.5 rounded-full transition-all" style={{width: `${progress}%`}}></div>
                    </div>
                </div>
            )}
            
            <div className="flex justify-between items-end mt-2 pt-2 border-t border-current/10">
                <div className="flex flex-col gap-1">
                     <div className="flex -space-x-2">
                        {(reminder.assigned_to || []).map(user => (
                            <div key={user} title={`Atribuído a: ${user}`} className={`w-6 h-6 rounded-full border-2 border-white/80 shadow-sm flex items-center justify-center text-white font-sans font-bold text-xs ${getAvatarColor(user)}`}>
                                {getInitials(user)}
                            </div>
                        ))}
                    </div>
                    {dueDate && (
                        <div className="flex items-center gap-1.5 text-sm font-sans font-semibold opacity-70">
                           <CalendarIcon className="w-4 h-4"/>
                           <span>{dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={handleDoneClick}
                    className={`p-2 rounded-full transition-colors ${allSubtasksDone ? 'hover:bg-black/10' : 'opacity-40 cursor-not-allowed'}`}
                    aria-label="Marcar como feito"
                    disabled={!allSubtasksDone}
                    title={!allSubtasksDone ? "Conclua todas as sub-tarefas primeiro" : "Marcar como feito"}
                >
                    <CheckIcon className="w-6 h-6 stroke-2" />
                </button>
            </div>
        </div>
    );
};

const CalendarView: React.FC<{ reminders: Reminder[] }> = ({ reminders }) => {
    const [displayDate, setDisplayDate] = useState(new Date());

    const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calendarGrid = useMemo(() => {
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        
        const grid = [];
        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(startDate.getDate() - startDate.getDay());

        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            date.setHours(0, 0, 0, 0);
            
            const dateString = date.toISOString().split('T')[0];
            const dayReminders = reminders.filter(r => r.due_date === dateString);

            grid.push({
                date,
                dayReminders,
                isCurrentMonth: date.getMonth() === month,
                isToday: date.getTime() === today.getTime()
            });
        }
        return grid;
    }, [displayDate, reminders]);
    
    const changeMonth = (amount: number) => {
        setDisplayDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + amount);
            return newDate;
        });
    };

    const colorClasses = {
        yellow: 'bg-postit-yellow/80 border-postit-yellow',
        pink: 'bg-postit-pink/80 border-postit-pink',
        blue: 'bg-postit-blue/80 border-postit-blue',
        green: 'bg-postit-green/80 border-postit-green',
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-subtle">
            <div className="flex justify-between items-center mb-4">
                <Button variant="ghost" onClick={() => changeMonth(-1)}>&lt; Anterior</Button>
                <h3 className="text-xl font-bold text-dark capitalize">
                    {displayDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                </h3>
                <Button variant="ghost" onClick={() => changeMonth(1)}>Próximo &gt;</Button>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {daysOfWeek.map(day => (
                    <div key={day} className="text-center font-semibold text-slate-500 text-sm pb-2">{day}</div>
                ))}
                {calendarGrid.map(({ date, dayReminders, isCurrentMonth, isToday }, index) => (
                    <div key={index} className={`h-32 border border-slate-200 rounded-lg p-1.5 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50'}`}>
                        <span className={`text-sm font-semibold ${isToday ? 'bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center' : (isCurrentMonth ? 'text-slate-700' : 'text-slate-400')}`}>
                            {date.getDate()}
                        </span>
                        <div className="space-y-1 mt-1 overflow-y-auto max-h-24">
                            {dayReminders.map(r => (
                                <div key={r.id} title={r.title} className={`text-xs p-1 rounded-md border ${colorClasses[r.color]}`}>
                                    <p className="truncate font-semibold">{r.title}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const RLS_CREATE_SQL = `
-- Este script cria a tabela 'reminders' com as colunas necessárias.
-- Execute este script se a tabela 'reminders' não existir.

-- 1. Create the table for reminders
CREATE TABLE public.reminders (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    content text NULL,
    due_date date NULL,
    color text NOT NULL,
    is_done boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    assigned_to jsonb NOT NULL,
    subtasks jsonb NULL,
    CONSTRAINT reminders_pkey PRIMARY KEY (id)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- 3. Create policies to allow access for all users.
CREATE POLICY "Enable all actions for all users"
ON public.reminders
FOR ALL
USING (true)
WITH CHECK (true);
`;

const RLS_UPDATE_SQL = `
-- Este script adiciona as colunas 'created_by', 'assigned_to' e 'subtasks' à sua tabela 'reminders' existente.
-- É seguro executar este script, ele não apagará nenhum dado.
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'Nicolas'::text;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS assigned_to jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS subtasks jsonb NULL;
`;

const DatabaseSetupGuide: React.FC<{ errorType: 'table_missing' | 'column_missing' }> = ({ errorType }) => {
    const isTableMissing = errorType === 'table_missing';
    const title = isTableMissing ? 'Ação Necessária: Criar Tabela de Lembretes' : 'Ação Necessária: Atualizar Tabela de Lembretes';
    const instructions = isTableMissing
        ? "A funcionalidade de Lembretes não pode ser carregada porque a tabela 'reminders' não foi encontrada. Para corrigir, execute o seguinte código SQL no seu painel Supabase."
        : "Sua tabela 'reminders' está desatualizada. Faltam colunas importantes como 'created_by', 'assigned_to' ou 'subtasks'. Execute o código SQL abaixo para adicionar as colunas que faltam sem perder dados.";
    const sql = isTableMissing ? RLS_CREATE_SQL : RLS_UPDATE_SQL;
    
    return (
         <div className="max-w-2xl mx-auto p-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg my-8">
            <h3 className="text-xl font-bold text-red-900">{title}</h3>
            <p className="text-red-800 mt-2 text-sm">{instructions}</p>
             <p className="text-slate-600 mt-4 text-sm">
                Copie o código SQL abaixo, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu projeto e clique em "RUN". Depois que executar, <strong>recarregue esta página</strong>.
            </p>
            <div className="mt-4">
                <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                    <code>{sql.trim()}</code>
                </pre>
            </div>
        </div>
    );
};


const RemindersApp: React.FC<RemindersAppProps> = ({ currentUser }) => {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [filter, setFilter] = useState<'me' | 'other' | 'all'>('me');
    const [view, setView] = useState<'board' | 'calendar'>('board');
    
    // Form State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newDueDate, setNewDueDate] = useState('');
    const [newColor, setNewColor] = useState<ReminderColor>('yellow');
    const [assignedTo, setAssignedTo] = useState<User[]>([currentUser]);
    const [subtasks, setSubtasks] = useState<Subtask[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [dbErrorType, setDbErrorType] = useState<'table_missing' | 'column_missing' | null>(null);

    const fetchReminders = useCallback(async () => {
        setIsLoading(true);
        setDbErrorType(null);
        try {
            // Fetch all non-done reminders, filtering will be done client-side
            const { data, error } = await supabase
                .from('reminders')
                .select('*')
                .eq('is_done', false)
                .order('created_at', { ascending: true });
    
            if (error) throw error;
    
            setReminders(data as any[] || []);

        } catch (error: any) {
            console.error('Error fetching reminders:', error.message);
            const msg = (error.message || '').toLowerCase();
            if(error?.code === '42P01') {
                setDbErrorType('table_missing');
            } else if (
                msg.includes('column "assigned_to" does not exist') ||
                msg.includes('column "subtasks" does not exist') ||
                msg.includes('column "created_by" does not exist') ||
                msg.includes("could not find the 'assigned_to' column") ||
                msg.includes("could not find the 'subtasks' column") ||
                msg.includes("could not find the 'created_by' column")
            ) {
                 setDbErrorType('column_missing');
            } else {
                alert(`Ocorreu um erro ao carregar os lembretes: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReminders();
    }, [fetchReminders]);

    useEffect(() => {
        // Reset assigned users when current user changes
        setAssignedTo([currentUser]);
    }, [currentUser]);

    useEffect(() => {
        const channel = supabase.channel('realtime-reminders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => {
                fetchReminders();
            })
            .subscribe();
        
        return () => {
            supabase.removeChannel(channel);
        }

    }, [fetchReminders]);

    const handleAddReminder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newTitle.trim() === '') {
            alert("O título do lembrete é obrigatório.");
            return;
        }

        try {
            const { error } = await supabase
                .from('reminders')
                .insert([{ 
                    title: newTitle, 
                    content: newContent, 
                    due_date: newDueDate || null,
                    color: newColor, 
                    created_by: currentUser,
                    assigned_to: assignedTo,
                    subtasks: subtasks.filter(st => st.text.trim()),
                    is_done: false 
                }]);
    
            if (error) {
                const msg = (error.message || '').toLowerCase();
                if (
                    msg.includes('column "assigned_to" does not exist') ||
                    msg.includes('column "subtasks" does not exist') ||
                    msg.includes('column "created_by" does not exist') ||
                    msg.includes("could not find the 'assigned_to' column") ||
                    msg.includes("could not find the 'subtasks' column") ||
                    msg.includes("could not find the 'created_by' column")
                ) {
                    setDbErrorType('column_missing');
                    return;
                }
                throw error;
            }
            
            closeAndResetForm();

        } catch (error: any) {
            console.error('Error adding reminder:', error.message);
            alert(`Erro ao adicionar lembrete: ${error.message}`);
        }
    };
    
    const handleUpdateSubtasks = async (id: string, newSubtasks: Subtask[]) => {
        // Optimistic update
        setReminders(prev => prev.map(r => r.id === id ? {...r, subtasks: newSubtasks} : r));
        
        const { error } = await supabase
            .from('reminders')
            .update({ subtasks: newSubtasks })
            .eq('id', id);

        if (error) {
            console.error('Error updating subtasks:', error.message);
            // Revert on error
            fetchReminders();
        }
    };

    const handleMarkDone = async (id: string) => {
        try {
            const { error } = await supabase
                .from('reminders')
                .update({ is_done: true })
                .eq('id', id);

            if (error) throw error;
            
            setReminders(prev => prev.filter(r => r.id !== id));

        } catch (error: any) {
            console.error('Error updating reminder:', error.message);
            alert(`Erro ao marcar lembrete como feito: ${error.message}`);
        }
    };
    
    const filteredAndSortedReminders = useMemo(() => {
        const otherUser = USERS.find(u => u !== currentUser && u !== 'Visitante');

        const filtered = reminders.filter(r => {
            const assignedUsers = Array.isArray(r.assigned_to) ? r.assigned_to : [];
            switch(filter) {
                case 'me':
                    return assignedUsers.includes(currentUser);
                case 'other':
                    return !!otherUser && assignedUsers.includes(otherUser) && !assignedUsers.includes(currentUser);
                case 'all':
                default:
                    return true;
            }
        });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return [...filtered].sort((a, b) => {
            const aDate = a.due_date ? new Date(a.due_date + 'T00:00:00') : null;
            const bDate = b.due_date ? new Date(b.due_date + 'T00:00:00') : null;
            
            const getScore = (date: Date | null): number => {
                if (!date) return 3;
                if (date < today) return 0;
                if (date.getTime() === today.getTime()) return 1;
                return 2;
            };

            const aScore = getScore(aDate);
            const bScore = getScore(bDate);

            if (aScore !== bScore) return aScore - bScore;
            if (aDate && bDate) return aDate.getTime() - bDate.getTime();
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
    }, [reminders, filter, currentUser]);

    // Form handlers
    const closeAndResetForm = () => {
        setIsFormOpen(false);
        setNewTitle('');
        setNewContent('');
        setNewDueDate('');
        setNewColor('yellow');
        setAssignedTo([currentUser]);
        setSubtasks([]);
    }

    const handleToggleAssignee = (user: User) => {
        setAssignedTo(prev => 
            prev.includes(user) ? prev.filter(u => u !== user) : [...prev, user]
        );
    };
    
    const handleSubtaskChange = (id: string, text: string) => {
        setSubtasks(prev => prev.map(st => st.id === id ? { ...st, text } : st));
    };
    
    const handleAddSubtask = () => {
        setSubtasks(prev => [...prev, {id: crypto.randomUUID(), text: '', is_done: false}]);
    };

    const handleRemoveSubtask = (id: string) => {
        setSubtasks(prev => prev.filter(st => st.id !== id));
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 space-y-8">
            {dbErrorType ? (
                <DatabaseSetupGuide errorType={dbErrorType} />
            ) : (
                <>
                    <div className="flex justify-center items-center gap-4">
                        <SegmentedControl
                            value={view}
                            onChange={(value) => setView(value)}
                            options={[
                                {label: 'Post-its', value: 'board'},
                                {label: 'Calendário', value: 'calendar'}
                            ]}
                        />
                        <Button onClick={() => setIsFormOpen(true)}>
                            <PlusIcon className="w-5 h-5"/> Novo Lembrete
                        </Button>
                    </div>

                    {view === 'board' && (
                        <>
                        <div className="flex justify-center">
                             <SegmentedControl<typeof filter>
                                value={filter}
                                onChange={(value) => setFilter(value)}
                                options={[
                                    { label: 'Meus Lembretes', value: 'me' },
                                    { label: 'Dele/Dela', value: 'other' },
                                    { label: 'Todos', value: 'all' },
                                ]}
                            />
                        </div>
                        
                        <div className="flex flex-wrap gap-8 justify-center min-h-[50vh] pt-8">
                            {isLoading ? (
                                <p className="text-slate-500">Carregando lembretes...</p>
                            ) : (
                                filteredAndSortedReminders.map(reminder => (
                                    <ReminderCard key={reminder.id} reminder={reminder} onMarkDone={handleMarkDone} onUpdateSubtasks={handleUpdateSubtasks}/>
                                ))
                            )}
                             {!isLoading && filteredAndSortedReminders.length === 0 && (
                                <div className="text-center text-slate-500 font-hand text-3xl mt-16">
                                    <p>Nenhum lembrete por aqui!</p>
                                    <p>
                                        {filter === 'me' ? "Adicione um para você." : "Mude o filtro para ver outros lembretes."}
                                    </p>
                                </div>
                             )}
                        </div>
                        </>
                    )}

                    {view === 'calendar' && <CalendarView reminders={reminders} />}

                    <Modal isOpen={isFormOpen} onClose={closeAndResetForm} title="Novo Lembrete">
                         <form onSubmit={handleAddReminder} className="max-w-xl mx-auto">
                            <div className={`p-6 rounded-lg space-y-4 bg-postit-${newColor}`}>
                                <Input id="reminder-title" type="text" placeholder="Título *" value={newTitle} onChange={e => setNewTitle(e.target.value)} required className="!bg-white/50 text-xl font-bold font-sans" />
                                <textarea id="reminder-content" value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Detalhes (opcional)..." rows={2} className="w-full p-2 bg-white/50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition resize-y font-sans text-base" />
                                
                                <div className="space-y-2">
                                    {subtasks.map((st, index) => (
                                        <div key={st.id} className="flex items-center gap-2">
                                            <Input type="text" placeholder={`Sub-tarefa ${index + 1}`} value={st.text} onChange={e => handleSubtaskChange(st.id, e.target.value)} className="!bg-white/50" />
                                            <button type="button" onClick={() => handleRemoveSubtask(st.id)} className="p-2 text-red-500/80 hover:text-red-500 hover:bg-black/10 rounded-full">
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    ))}
                                    <Button type="button" size="sm" variant="secondary" onClick={handleAddSubtask}>
                                        <PlusIcon className="w-4 h-4"/> Adicionar sub-tarefa
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="font-sans font-semibold text-sm">Atribuir para:</label>
                                        <div className="flex gap-2 mt-1">
                                            {USERS.filter(u => u !== 'Visitante').map(user => (
                                                <button key={user} type="button" onClick={() => handleToggleAssignee(user)} className={`px-3 py-1 text-sm font-semibold rounded-full border-2 transition-colors ${assignedTo.includes(user) ? 'bg-primary border-primary text-white' : 'bg-white/50 border-slate-300 hover:border-primary'}`}>
                                                    {user === 'Ana Beatriz Diva Linda' ? 'Ana' : user}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="font-sans font-semibold text-sm">Cor:</label>
                                        <div className="flex gap-2 mt-1">
                                            {REMINDER_COLORS.map(color => (
                                                <button type="button" key={color} onClick={() => setNewColor(color)} className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${newColor === color ? 'border-primary scale-110' : 'border-black/20'} bg-postit-${color}`} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="!bg-white/50 w-auto" />
                            </div>
                             <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button type="button" variant="secondary" onClick={closeAndResetForm}>Cancelar</Button>
                                <Button type="submit" variant="primary">
                                    Adicionar
                                </Button>
                            </div>
                        </form>
                    </Modal>
                </>
            )}
        </div>
    );
};

export default RemindersApp;