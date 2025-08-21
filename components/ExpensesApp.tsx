

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { User, Expense, PaymentSource, RecurringExpense, MonthlyClosing, Goal, AIAnalysis, BarChartData, UserProfile } from '../types';
import { PAYMENT_SOURCES } from '../constants';
import { Button, Input, Modal, SegmentedControl, CurrencyInput } from './UIComponents';
import { PlusIcon, TrashIcon, CalendarIcon, PencilIcon, ArrowPathIcon, SparklesIcon, TargetIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon, CreditCardIcon } from './Icons';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);


interface ExpensesAppProps {
    currentUser: UserProfile;
    googleAuthToken: string | null;
    onAuthError: () => void;
}

const formatCurrency = (value: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const COUPLE_ID_MIGRATION_SQL = `-- Este script adiciona a coluna 'couple_id' às tabelas financeiras.
-- É seguro executá-lo múltiplas vezes.

-- 1. Adiciona a coluna, se ela não existir, em cada tabela.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS couple_id TEXT NULL;
ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS couple_id TEXT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS couple_id TEXT NULL;
ALTER TABLE public.monthly_closings ADD COLUMN IF NOT EXISTS couple_id TEXT NULL;

-- 2. Atualiza a restrição de unicidade para fechamentos mensais.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'monthly_closings_month_year_key' AND conrelid = 'public.monthly_closings'::regclass
    ) THEN
        ALTER TABLE public.monthly_closings DROP CONSTRAINT monthly_closings_month_year_key;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'monthly_closings_month_year_couple_id_key' AND conrelid = 'public.monthly_closings'::regclass
    ) THEN
        ALTER TABLE public.monthly_closings ADD CONSTRAINT monthly_closings_month_year_couple_id_key UNIQUE (month_year, couple_id);
    END IF;
END $$;
`;

const DATA_MIGRATION_SQL = (coupleId: string) => `-- Este script atualiza seus registros financeiros antigos com o ID do seu casal ('${coupleId}').
-- Execute este script uma única vez para ver seus dados antigos novamente.

UPDATE public.expenses
SET couple_id = '${coupleId}'
WHERE couple_id IS NULL;

UPDATE public.recurring_expenses
SET couple_id = '${coupleId}'
WHERE couple_id IS NULL;

UPDATE public.goals
SET couple_id = '${coupleId}'
WHERE couple_id IS NULL;

UPDATE public.monthly_closings
SET couple_id = '${coupleId}'
WHERE couple_id IS NULL;
`;

const DataMigrationResolver: React.FC<{ coupleId: string | null }> = ({ coupleId }) => (
    <div className="p-4 bg-amber-50 border-2 border-dashed border-amber-300 rounded-lg my-4">
        <h4 className="font-semibold text-amber-900">Ação Necessária: Migrar Dados Antigos</h4>
        <p className="text-sm text-amber-800 mt-1">Detectamos que você possui despesas e recorrências antigas que precisam ser associadas ao seu perfil de casal para que voltem a aparecer. É um passo único e rápido.</p>
        <div className="mt-4">
             <p className="text-xs text-slate-600 mb-2">
                Copie o código SQL abaixo. Depois, vá para o 
                <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline"> Editor SQL do Supabase</a>, cole o código e clique em "RUN". Assim que executar, recarregue esta página.
            </p>
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{DATA_MIGRATION_SQL(coupleId || 'c1')}</code>
            </pre>
        </div>
    </div>
);


const DatabaseErrorResolver: React.FC<{ title: string; instructions: string; sql: string }> = ({ title, instructions, sql }) => (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg my-4">
        <h4 className="font-semibold text-red-900">{title}</h4>
        <p className="text-sm text-red-800 mt-1">{instructions}</p>
        <div className="mt-4">
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{sql}</code>
            </pre>
            <p className="text-xs text-slate-600 mt-2">
                Copie este código, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase e recarregue a página.
            </p>
        </div>
    </div>
);

// Form components will be defined here to keep the main component cleaner.

const ExpenseForm: React.FC<{ onSave: (data: Omit<Expense, 'id' | 'is_paid' | 'couple_id'>) => Promise<void>, onClose: () => void, initialData?: Expense, initialDate: Date }> = ({ onSave, onClose, initialData, initialDate }) => {
    const [description, setDescription] = useState(initialData?.description || '');
    const [amount, setAmount] = useState(initialData?.amount || 0);
    const [dueDate, setDueDate] = useState(initialData?.due_date || initialDate.toISOString().split('T')[0]);
    const [paymentSource, setPaymentSource] = useState<PaymentSource>(initialData?.payment_source || 'Conta Pessoal');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({ description, amount, due_date: dueDate, payment_source: paymentSource });
            onClose();
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar despesa.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input autoFocus value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição da Despesa" required />
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="R$ 0,00" />
            <div className="grid grid-cols-2 gap-4">
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
                <SegmentedControl value={paymentSource} onChange={val => setPaymentSource(val as PaymentSource)} options={PAYMENT_SOURCES.map(s => ({label: s, value: s}))} />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Despesa'}</Button>
            </div>
        </form>
    );
};

const GoalForm: React.FC<{ onSave: (data: Omit<Goal, 'id' | 'current_amount' | 'created_by' | 'created_at' | 'is_archived' | 'couple_id'>) => Promise<void>, onClose: () => void, initialData?: Goal }> = ({ onSave, onClose, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [targetAmount, setTargetAmount] = useState(initialData?.target_amount || 0);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({ name, target_amount: targetAmount });
            onClose();
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar meta.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nome da Meta (Ex: Viagem para o Japão)" required />
            <CurrencyInput value={targetAmount} onValueChange={setTargetAmount} placeholder="Valor Alvo" />
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Meta'}</Button>
            </div>
        </form>
    );
};

const GoalTransactionForm: React.FC<{ goal: Goal, onSave: (goalId: string, amount: number) => Promise<void>, onArchive: (goalId: string) => void, onClose: () => void }> = ({ goal, onSave, onArchive, onClose }) => {
    const [amount, setAmount] = useState(0);
    const [transactionType, setTransactionType] = useState<'deposit' | 'withdraw'>('deposit');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        const finalAmount = transactionType === 'deposit' ? amount : -amount;
        try {
            await onSave(goal.id, finalAmount);
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="space-y-4">
             <div className="text-center">
                <p className="font-bold text-dark text-xl">{goal.name}</p>
                <p className="text-slate-500">{formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}</p>
                <div className="w-full bg-slate-200 rounded-full h-2.5 mt-2">
                    <div className="bg-primary h-2.5 rounded-full" style={{ width: `${Math.min((goal.current_amount / goal.target_amount) * 100, 100)}%` }}></div>
                </div>
            </div>
            <SegmentedControl value={transactionType} onChange={(v) => setTransactionType(v as 'deposit' | 'withdraw')} options={[{label: 'Depositar', value: 'deposit'}, {label: 'Retirar', value: 'withdraw'}]} />
            <CurrencyInput value={amount} onValueChange={setAmount} />
            <div className="flex justify-between items-center gap-3 pt-4 border-t">
                 <Button type="button" variant="danger" size="sm" onClick={() => { if(window.confirm('Deseja arquivar esta meta?')) { onArchive(goal.id); onClose(); }}}>
                    <TrashIcon className="w-4 h-4" /> Arquivar Meta
                </Button>
                <div className="flex gap-3">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                    <Button type="button" variant="primary" onClick={handleSave} disabled={isSaving || amount === 0}>
                        {isSaving ? 'Salvando...' : 'Confirmar'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

const RecurringExpenseForm: React.FC<{
    onSave: (data: Omit<RecurringExpense, 'id' | 'couple_id' | 'created_at' | 'last_generated_date' | 'is_active'>, createCalendarEvent: boolean) => Promise<void>,
    onClose: () => void,
    initialData?: RecurringExpense
}> = ({ onSave, onClose, initialData }) => {
    const [description, setDescription] = useState(initialData?.description || '');
    const [amount, setAmount] = useState(initialData?.amount || 0);
    const [dayOfMonth, setDayOfMonth] = useState(initialData?.day_of_month || 1);
    const [paymentSource, setPaymentSource] = useState<PaymentSource>(initialData?.payment_source || 'Conta Pessoal');
    const [startDate, setStartDate] = useState(initialData?.start_date || new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(initialData?.end_date || '');
    const [createCalendarEvent, setCreateCalendarEvent] = useState(!!initialData?.google_calendar_event_id);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({ 
                description, 
                amount, 
                day_of_month: dayOfMonth, 
                payment_source: paymentSource,
                start_date: startDate,
                end_date: endDate || null,
                google_calendar_event_id: initialData?.google_calendar_event_id || null
            }, createCalendarEvent);
            onClose();
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar despesa recorrente.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (Ex: Aluguel)" required />
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="Valor Mensal" />
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium">Dia do Vencimento</label>
                    <Input type="number" min="1" max="31" value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} required />
                </div>
                <SegmentedControl value={paymentSource} onChange={val => setPaymentSource(val as PaymentSource)} options={PAYMENT_SOURCES.map(s => ({label: s, value: s}))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium">Início</label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
                <div>
                    <label className="text-sm font-medium">Fim (opcional)</label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
            </div>
             <div className="flex items-center gap-2">
                <input id="google-calendar-sync" type="checkbox" checked={createCalendarEvent} onChange={e => setCreateCalendarEvent(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <label htmlFor="google-calendar-sync" className="font-medium text-slate-700">Criar evento recorrente no Google Calendar</label>
             </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Recorrência'}</Button>
            </div>
        </form>
    );
};

const MonthlyClosingForm: React.FC<{ onSave: (data: Omit<MonthlyClosing, 'id' | 'analysis' | 'couple_id'> & { analysis: AIAnalysis | null }) => void; onClose: () => void; initialData?: MonthlyClosing | null; goals: Goal[]; }> = ({ onSave, onClose, initialData, goals }) => {
    const [incomeNicolas, setIncomeNicolas] = useState(initialData?.income_nicolas || 0);
    const [incomeAna, setIncomeAna] = useState(initialData?.income_ana || 0);
    const [notes, setNotes] = useState(initialData?.notes || '');
    const [goalAllocations, setGoalAllocations] = useState<Record<string, number>>(initialData?.goal_allocations || {});
    const [isSaving, setIsSaving] = useState(false);

    const handleAllocationChange = (goalId: string, value: number) => {
        setGoalAllocations(prev => ({ ...prev, [goalId]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({ month_year: initialData?.month_year || '', income_nicolas: incomeNicolas, income_ana: incomeAna, notes, goal_allocations: goalAllocations, shared_goal: null, analysis: initialData?.analysis || null, });
            onClose();
        } catch (error: any) { alert(`Erro ao salvar fechamento: ${error.message}`); } finally { setIsSaving(false); }
    };

    const totalAllocated = Object.values(goalAllocations).reduce((sum, val) => sum + val, 0);

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div> <label htmlFor="income-nicolas" className="font-medium text-slate-700 block mb-1">Renda (Nicolas)</label> <CurrencyInput id="income-nicolas" value={incomeNicolas} onValueChange={setIncomeNicolas} /> </div>
                <div> <label htmlFor="income-ana" className="font-medium text-slate-700 block mb-1">Renda (Ana)</label> <CurrencyInput id="income-ana" value={incomeAna} onValueChange={setIncomeAna} /> </div>
            </div>
            <div>
                <h4 className="font-bold text-lg text-slate-800 mb-2">Distribuição para Metas</h4>
                <div className="space-y-2 p-4 bg-slate-50 rounded-lg border">
                    {goals.filter(g => !g.is_archived).length > 0 ? goals.filter(g => !g.is_archived).map(goal => (
                        <div key={goal.id} className="grid grid-cols-3 gap-2 items-center">
                            <label htmlFor={`goal-${goal.id}`} className="font-medium text-slate-700 col-span-2">{goal.name}</label>
                            <CurrencyInput id={`goal-${goal.id}`} value={goalAllocations[goal.id] || 0} onValueChange={(val) => handleAllocationChange(goal.id, val)} />
                        </div>
                    )) : <p className="text-slate-500 text-sm">Nenhuma meta ativa para distribuir.</p>}
                     <div className="text-right font-semibold text-dark pt-2 border-t mt-2"> Total Alocado: {formatCurrency(totalAllocated)} </div>
                </div>
            </div>
            <div> <label htmlFor="closing-notes" className="font-medium text-slate-700 block mb-1">Anotações do Mês</label> <textarea id="closing-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"></textarea> </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Fechamento'}</Button>
            </div>
        </form>
    );
};


export const ExpensesApp: React.FC<ExpensesAppProps> = ({ currentUser, googleAuthToken, onAuthError }) => {
    // Data states
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [monthlyClosing, setMonthlyClosing] = useState<MonthlyClosing | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date());

    // UI states
    const [modal, setModal] = useState<null | 'expense' | 'recurring' | 'goal' | 'closing' | 'goal_transaction'>(null);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
    const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

    const [dbError, setDbError] = useState<'couple_id_missing' | null>(null);
    const [dataMigrationNeeded, setDataMigrationNeeded] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const isGeneratingRef = useRef(false);
    const monthScrollerRef = useRef<HTMLDivElement>(null);

    const fetchData = useCallback(async (coupleId: string) => {
        setIsLoading(true);
        setDbError(null);
        setDataMigrationNeeded(false);
        try {
            const { data: testData, error: testError } = await supabase.from('expenses').select('couple_id').limit(1).maybeSingle();
            if (testError || testData?.couple_id === undefined) {
                setDbError('couple_id_missing');
                setIsLoading(false);
                return;
            }

            const { data: legacyExpenses, error: legacyExpensesError } = await supabase.from('expenses').select('id').is('couple_id', null).limit(1);
            if (legacyExpensesError) throw legacyExpensesError;

            const { data: legacyRecurring, error: legacyRecurringError } = await supabase.from('recurring_expenses').select('id').is('couple_id', null).limit(1);
            if (legacyRecurringError) throw legacyRecurringError;

            if ((legacyExpenses && legacyExpenses.length > 0) || (legacyRecurring && legacyRecurring.length > 0)) {
                setDataMigrationNeeded(true);
                setIsLoading(false);
                return;
            }
            
            const [expensesRes, recurringRes, goalsRes, closingRes] = await Promise.all([
                supabase.from('expenses').select('*').eq('couple_id', coupleId),
                supabase.from('recurring_expenses').select('*').eq('couple_id', coupleId),
                supabase.from('goals').select('*').eq('couple_id', coupleId),
                supabase.from('monthly_closings').select('*').eq('couple_id', coupleId).eq('month_year', `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`).maybeSingle(),
            ]);

            if(expensesRes.error) throw expensesRes.error;
            if(recurringRes.error) throw recurringRes.error;
            if(goalsRes.error) throw goalsRes.error;
            if(closingRes.error) throw closingRes.error;
            
            setExpenses(expensesRes.data || []);
            setRecurringExpenses(recurringRes.data || []);
            setGoals(goalsRes.data || []);
            setMonthlyClosing(closingRes.data);

        } catch (error) {
            console.error("Error fetching data:", error);
            alert("Falha ao carregar dados financeiros.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        if (currentUser.couple_id) {
            fetchData(currentUser.couple_id);
        } else {
             setDbError('couple_id_missing'); // Treat as error if user has no couple_id
        }
    }, [currentUser.couple_id, fetchData]);
    
    // --- Data Handlers ---

    const handleSaveExpense = async (data: Omit<Expense, 'id' | 'is_paid' | 'couple_id'>) => {
        const dataToSave = { ...data, couple_id: currentUser.couple_id };
        const { error } = editingExpense
            ? await supabase.from('expenses').update(dataToSave).eq('id', editingExpense.id)
            : await supabase.from('expenses').insert([{ ...dataToSave, is_paid: false }]);
        if (error) throw error;
        await fetchData(currentUser.couple_id!);
    };

    const handleDeleteExpense = async (id: string) => {
        if(window.confirm("Apagar esta despesa?")) {
            await supabase.from('expenses').delete().eq('id', id);
            await fetchData(currentUser.couple_id!);
        }
    }

    const handleTogglePaid = async (expense: Expense) => {
        await supabase.from('expenses').update({ is_paid: !expense.is_paid }).eq('id', expense.id);
        await fetchData(currentUser.couple_id!);
    }

    const handleSaveGoal = async (data: Omit<Goal, 'id' | 'current_amount' | 'created_by' | 'created_at' | 'is_archived' | 'couple_id'>) => {
        const dataToSave = { ...data, couple_id: currentUser.couple_id, created_by: currentUser.name };
        const { error } = editingGoal
            ? await supabase.from('goals').update(dataToSave).eq('id', editingGoal.id)
            : await supabase.from('goals').insert([{ ...dataToSave, current_amount: 0, is_archived: false }]);
        if(error) throw error;
        await fetchData(currentUser.couple_id!);
    }
    
    const handleGoalTransaction = async (goalId: string, amount: number) => {
        const goal = goals.find(g => g.id === goalId);
        if(!goal) return;
        const newAmount = Math.max(0, goal.current_amount + amount);
        const { error } = await supabase.from('goals').update({ current_amount: newAmount }).eq('id', goalId);
        if(error) throw error;
        await fetchData(currentUser.couple_id!);
    }
    
    const handleArchiveGoal = async (goalId: string) => {
        const { error } = await supabase.from('goals').update({ is_archived: true }).eq('id', goalId);
        if(error) throw error;
        await fetchData(currentUser.couple_id!);
    }

    const handleSaveRecurring = async (data: Omit<RecurringExpense, 'id'|'couple_id'|'created_at'|'last_generated_date'|'is_active'>, createCalendarEvent: boolean) => {
        const { google_calendar_event_id, ...restData } = data;
        let finalEventId = google_calendar_event_id;

        if (createCalendarEvent && googleAuthToken) {
            const event = {
                summary: restData.description,
                description: `Despesa recorrente: ${formatCurrency(restData.amount)}`,
                start: { date: restData.start_date },
                end: { date: restData.start_date },
                recurrence: [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${restData.day_of_month}` + (restData.end_date ? `;UNTIL=${new Date(restData.end_date).toISOString().replace(/[-:.]/g, '').split('T')[0]}` : '')]
            };
            try {
                const method = finalEventId ? 'PUT' : 'POST';
                const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events` + (finalEventId ? `/${finalEventId}` : '');
                const response = await fetch(url, { method, headers: { 'Authorization': `Bearer ${googleAuthToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
                if (response.status === 401) { onAuthError(); throw new Error("Sessão Google expirada."); }
                if (!response.ok) throw new Error(await response.text());
                const result = await response.json();
                finalEventId = result.id;
            } catch (err) { alert(`Erro ao criar evento no Google Calendar: ${(err as Error).message}`); }
        } else if (!createCalendarEvent && finalEventId && googleAuthToken) {
            // Delete existing event
             try {
                const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${finalEventId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${googleAuthToken}` }});
                if (response.status === 401) { onAuthError(); throw new Error("Sessão Google expirada."); }
                if (!response.ok && response.status !== 410 && response.status !== 404) throw new Error(await response.text());
                finalEventId = null;
            } catch(err) { alert(`Erro ao apagar evento no Google Calendar: ${(err as Error).message}`); return; }
        }

        const dataToSave = { ...restData, google_calendar_event_id: finalEventId, couple_id: currentUser.couple_id };
        const { error } = editingRecurring
            ? await supabase.from('recurring_expenses').update(dataToSave).eq('id', editingRecurring.id)
            : await supabase.from('recurring_expenses').insert([{ ...dataToSave, is_active: true }]);
        if(error) throw error;
        await fetchData(currentUser.couple_id!);
    };

    const handleDeleteRecurring = async (expense: RecurringExpense) => {
        if(window.confirm("Apagar esta recorrência? O evento no Google Calendar também será removido.")) {
             if (expense.google_calendar_event_id && googleAuthToken) {
                try {
                    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${expense.google_calendar_event_id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${googleAuthToken}` }});
                    if (response.status === 401) { onAuthError(); throw new Error("Sessão Google expirada."); }
                    if (!response.ok && response.status !== 410 && response.status !== 404) throw new Error(await response.text());
                } catch(err) { alert(`Erro ao apagar evento no Google Calendar: ${(err as Error).message}`); return; }
            }
            await supabase.from('recurring_expenses').delete().eq('id', expense.id);
            await fetchData(currentUser.couple_id!);
        }
    }
    
    const handleSaveClosing = async (data: Omit<MonthlyClosing, 'id'|'couple_id'|'analysis'> & { analysis: AIAnalysis | null }) => {
        // ... (Logic from previous implementation)
        const previousAllocations = monthlyClosing?.goal_allocations || {};
        const { goal_allocations: newAllocations, ...restData } = data;

        const { error } = monthlyClosing?.id
            ? await supabase.from('monthly_closings').update({ ...restData, goal_allocations: newAllocations, couple_id: currentUser.couple_id }).eq('id', monthlyClosing.id)
            : await supabase.from('monthly_closings').insert([{ ...restData, goal_allocations: newAllocations, month_year: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`, couple_id: currentUser.couple_id }]);
        
        if (error) throw error;

        // Update goal amounts
        const allGoalIds = new Set([...Object.keys(previousAllocations), ...Object.keys(newAllocations || {})]);
        for(const goalId of allGoalIds) {
            const goal = goals.find(g => g.id === goalId);
            if(!goal) continue;
            const delta = (newAllocations?.[goalId] || 0) - (previousAllocations[goalId] || 0);
            if(delta !== 0) {
                await supabase.from('goals').update({ current_amount: goal.current_amount + delta }).eq('id', goalId);
            }
        }

        await fetchData(currentUser.couple_id!);
    };

    const monthTabs = useMemo(() => {
        const tabs = [];
        const start = new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1);
        const end = new Date();
        end.setMonth(end.getMonth() + 3);
        let current = start;
        while (current <= end) {
            tabs.push(new Date(current));
            current.setMonth(current.getMonth() + 1);
        }
        return tabs;
    }, []);

    const { personalPaid, personalUnpaid, personalTotal, cardPaid, cardUnpaid, cardTotal } = useMemo(() => {
        const monthExpenses = expenses.filter(e => {
            const d = new Date(e.due_date + 'T12:00:00Z');
            return d.getUTCFullYear() === selectedDate.getFullYear() && d.getUTCMonth() === selectedDate.getMonth();
        });
        const personal = monthExpenses.filter(e => e.payment_source === 'Conta Pessoal');
        const card = monthExpenses.filter(e => e.payment_source === 'Cartão');
        return {
            personalPaid: personal.filter(e => e.is_paid),
            personalUnpaid: personal.filter(e => !e.is_paid),
            personalTotal: personal.reduce((s, e) => s + e.amount, 0),
            cardPaid: card.filter(e => e.is_paid),
            cardUnpaid: card.filter(e => !e.is_paid),
            cardTotal: card.reduce((s, e) => s + e.amount, 0),
        };
    }, [expenses, selectedDate]);


    const handleScrollMonths = (direction: 'left' | 'right') => {
        if(monthScrollerRef.current) {
            monthScrollerRef.current.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
        }
    }
    
    if (dbError === 'couple_id_missing') {
        return <div className="p-6"><DatabaseErrorResolver title="Ação Necessária: Atualizar Banco de Dados" instructions="As tabelas financeiras precisam ser atualizadas para suportar finanças por casal. Execute o script abaixo para adicionar a coluna 'couple_id'." sql={COUPLE_ID_MIGRATION_SQL} /></div>;
    }

    if (dataMigrationNeeded) {
        return <div className="p-6"><DataMigrationResolver coupleId={currentUser.couple_id} /></div>;
    }

    if (isLoading) {
        return <div className="text-center p-8">Carregando planejamento...</div>;
    }
    
    return (
        <div className="container mx-auto p-4 sm:p-6 space-y-6">
            <div className="relative flex items-center">
                 <Button onClick={() => handleScrollMonths('left')} variant="ghost" className="!p-2 !rounded-full absolute left-0 z-10 bg-white/50 hover:bg-white backdrop-blur-sm"><ChevronLeftIcon className="w-6 h-6"/></Button>
                 <div ref={monthScrollerRef} className="month-selector-container scroll-mask flex items-center space-x-2 py-2 overflow-x-auto">
                    {monthTabs.map(date => (
                        <button key={date.toISOString()} onClick={() => setSelectedDate(date)} className={`px-4 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-colors ${date.getMonth() === selectedDate.getMonth() && date.getFullYear() === selectedDate.getFullYear() ? 'bg-primary text-white shadow' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>
                            {date.toLocaleString('pt-BR', { month: 'long' })} '{date.getFullYear().toString().slice(-2)}
                        </button>
                    ))}
                </div>
                 <Button onClick={() => handleScrollMonths('right')} variant="ghost" className="!p-2 !rounded-full absolute right-0 z-10 bg-white/50 hover:bg-white backdrop-blur-sm"><ChevronRightIcon className="w-6 h-6"/></Button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Left Column: Expenses & Recurring */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-subtle">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-dark">Despesas do Mês</h3>
                            <Button onClick={() => { setEditingExpense(null); setModal('expense'); }}><PlusIcon className="w-5 h-5"/> Nova Despesa</Button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <h4 className="flex items-center gap-2 text-xl font-bold text-dark border-b pb-2 mb-4">
                                    <HomeIcon className="w-6 h-6 text-slate-600"/>
                                    Conta Pessoal ({formatCurrency(personalTotal)})
                                </h4>
                                <ExpenseList title="A Pagar" expenses={personalUnpaid} total={personalUnpaid.reduce((s, e) => s + e.amount, 0)} onEdit={(e) => {setEditingExpense(e); setModal('expense')}} onDelete={handleDeleteExpense} onTogglePaid={handleTogglePaid} />
                                <ExpenseList title="Pago" expenses={personalPaid} total={personalPaid.reduce((s, e) => s + e.amount, 0)} onEdit={(e) => {setEditingExpense(e); setModal('expense')}} onDelete={handleDeleteExpense} onTogglePaid={handleTogglePaid} />
                            </div>
                             <div className="mt-8">
                                <h4 className="flex items-center gap-2 text-xl font-bold text-dark border-b pb-2 mb-4">
                                    <CreditCardIcon className="w-6 h-6 text-slate-600"/>
                                    Cartão ({formatCurrency(cardTotal)})
                                </h4>
                                <ExpenseList title="Aberto" expenses={cardUnpaid} total={cardUnpaid.reduce((s, e) => s + e.amount, 0)} onEdit={(e) => {setEditingExpense(e); setModal('expense')}} onDelete={handleDeleteExpense} onTogglePaid={handleTogglePaid} />
                                <ExpenseList title="Pago" expenses={cardPaid} total={cardPaid.reduce((s, e) => s + e.amount, 0)} onEdit={(e) => {setEditingExpense(e); setModal('expense')}} onDelete={handleDeleteExpense} onTogglePaid={handleTogglePaid} />
                            </div>
                        </div>
                    </div>
                     <div className="bg-white p-6 rounded-xl shadow-subtle">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-dark">Pagamentos Recorrentes</h3>
                            <Button onClick={() => { setEditingRecurring(null); setModal('recurring'); }}><PlusIcon className="w-5 h-5"/> Adicionar</Button>
                        </div>
                         <div className="space-y-2">
                             {recurringExpenses.map(exp => (
                                 <div key={exp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                     <div><span className={`font-semibold ${!exp.is_active && 'line-through text-slate-400'}`}>{exp.description}</span> <span className="text-sm text-slate-500 ml-2">({formatCurrency(exp.amount)})</span> </div>
                                     <div className="flex items-center gap-1">
                                         {exp.google_calendar_event_id && <span title="Sincronizado com Google Calendar"><CalendarIcon className="w-4 h-4 text-blue-500"/></span>}
                                         <Button variant="ghost" size="sm" onClick={() => {setEditingRecurring(exp); setModal('recurring');}}><PencilIcon className="w-4 h-4"/></Button>
                                         <Button variant="ghost" size="sm" onClick={() => handleDeleteRecurring(exp)}><TrashIcon className="w-4 h-4 text-red-500"/></Button>
                                     </div>
                                 </div>
                             ))}
                         </div>
                    </div>
                </div>
                {/* Right Column: Goals & Closing */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-subtle">
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-dark flex items-center gap-2"><TargetIcon className="w-6 h-6 text-primary"/> Nossos Objetivos</h3>
                            <Button onClick={() => { setEditingGoal(null); setModal('goal'); }}><PlusIcon className="w-5 h-5"/> Nova Meta</Button>
                        </div>
                        <div className="space-y-3">
                            {goals.filter(g => !g.is_archived).map(goal => (
                                <div key={goal.id} className="p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100" onClick={() => { setEditingGoal(goal); setModal('goal_transaction'); }}>
                                    <div className="flex justify-between items-center"><span className="font-bold">{goal.name}</span><span>{formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}</span></div>
                                    <div className="w-full bg-slate-200 rounded-full h-2 mt-1"><div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min((goal.current_amount / goal.target_amount) * 100, 100)}%` }}></div></div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-subtle">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-dark">Fechamento do Mês</h3>
                            <Button variant="secondary" onClick={() => setModal('closing')}><PencilIcon className="w-4 h-4"/> Editar</Button>
                        </div>
                        <p className="text-xs text-slate-500 -mt-3 mb-4 italic">(Considera apenas despesas da conta pessoal)</p>
                        <div className="space-y-2 text-lg">
                            <div className="flex justify-between"><span className="text-slate-600">Renda Total:</span><span className="font-bold text-green-600">{formatCurrency((monthlyClosing?.income_nicolas || 0) + (monthlyClosing?.income_ana || 0))}</span></div>
                            <div className="flex justify-between"><span className="text-slate-600">Total Despesas:</span><span className="font-bold text-red-600">{formatCurrency(personalTotal)}</span></div>
                            <div className="flex justify-between border-t pt-2 mt-2"><span className="font-bold">Saldo Final:</span><span className="font-bold text-blue-600">{formatCurrency((monthlyClosing?.income_nicolas || 0) + (monthlyClosing?.income_ana || 0) - personalTotal)}</span></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={modal === 'expense'} onClose={() => setModal(null)} title={editingExpense ? "Editar Despesa" : "Nova Despesa"}>
                <ExpenseForm onSave={handleSaveExpense} onClose={() => setModal(null)} initialData={editingExpense!} initialDate={selectedDate}/>
            </Modal>
             <Modal isOpen={modal === 'recurring'} onClose={() => setModal(null)} title={editingRecurring ? "Editar Recorrência" : "Nova Recorrência"}>
                <RecurringExpenseForm onSave={handleSaveRecurring} onClose={() => setModal(null)} initialData={editingRecurring!} />
            </Modal>
             <Modal isOpen={modal === 'goal'} onClose={() => setModal(null)} title={editingGoal ? "Editar Meta" : "Nova Meta"}>
                <GoalForm onSave={handleSaveGoal} onClose={() => setModal(null)} initialData={editingGoal!} />
            </Modal>
            <Modal isOpen={modal === 'goal_transaction' && !!editingGoal} onClose={() => setModal(null)} title="Depositar / Retirar">
                <GoalTransactionForm goal={editingGoal!} onSave={handleGoalTransaction} onArchive={handleArchiveGoal} onClose={() => setModal(null)}/>
            </Modal>
             <Modal isOpen={modal === 'closing'} onClose={() => setModal(null)} title="Editar Fechamento do Mês">
                <MonthlyClosingForm onSave={handleSaveClosing} onClose={() => setModal(null)} initialData={monthlyClosing} goals={goals} />
            </Modal>
        </div>
    );
};

// Internal component for ExpenseList to avoid re-rendering issues
const ExpenseList: React.FC<{ title: string; expenses: Expense[]; total: number; onEdit: (expense: Expense) => void; onDelete: (id: string) => void; onTogglePaid: (expense: Expense) => void; }> = ({ title, expenses, total, onEdit, onDelete, onTogglePaid }) => (
    <div className="mt-4">
        <div className="flex justify-between items-center bg-slate-100 p-2 rounded-md mb-2">
            <h4 className="font-bold text-dark">{title}</h4>
            <span className="font-bold text-dark">{formatCurrency(total)}</span>
        </div>
        <div className="space-y-1 text-sm">
            {expenses.length > 0 ? expenses.map(exp => (
                <div key={exp.id} className="group flex items-center justify-between p-2 hover:bg-slate-100 rounded-md">
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                        <button onClick={() => onTogglePaid(exp)} className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${exp.is_paid ? 'bg-green-500 border-green-500 text-white' : 'border-slate-400 hover:border-primary'}`}>
                            {exp.is_paid && <CheckIcon className="w-3 h-3"/>}
                        </button>
                        <span className={`truncate ${exp.is_paid ? 'line-through text-slate-400' : 'text-slate-800'}`}>{exp.description}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                         <span className={`font-semibold text-sm ${exp.is_paid ? 'text-slate-400' : 'text-dark'}`}>{formatCurrency(exp.amount)}</span>
                         <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={() => onEdit(exp)} className="!p-1"><PencilIcon className="w-4 h-4"/></Button>
                            <Button variant="ghost" size="sm" onClick={() => onDelete(exp.id)} className="!p-1"><TrashIcon className="w-4 h-4 text-red-500"/></Button>
                        </div>
                    </div>
                </div>
            )) : <p className="text-slate-400 p-2 text-center">Nenhuma despesa aqui.</p>}
        </div>
    </div>
);
