import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { User, Reminder, Recipe, Restaurant, MoodEntry, Goal, MonthlyClosing, Location, View, DatePlan } from '../types';
import { HeartPulseIcon, BellIcon, CreditCardIcon, BookOpenIcon, HeartIcon, TargetIcon, LocationArrowIcon, CalendarDaysIcon, CheckIcon, XMarkIcon, PencilIcon } from './Icons';
import { USERS } from '../constants';
import { calculateDistance } from '../utils/helpers';
import { Button, Modal } from './UIComponents';
import DatePlannerForm from './DatePlannerForm';

const formatCurrency = (value: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const MOODS = [
    { value: 5, emoji: '😁', label: 'Ótimo', color: 'text-green-500' },
    { value: 4, emoji: '😊', label: 'Bem', color: 'text-lime-500' },
    { value: 3, emoji: '😐', label: 'Ok', color: 'text-yellow-500' },
    { value: 2, emoji: '😟', label: 'Mal', color: 'text-orange-500' },
    { value: 1, emoji: '😠', label: 'Péssimo', color: 'text-red-500' },
];

interface DashboardProps {
    currentUser: User;
    setView: (view: View) => void;
}

// Helper: A generic widget wrapper
const Widget: React.FC<{
    icon: React.FC<any>;
    title: string;
    onClick: () => void;
    className?: string;
    children: React.ReactNode;
}> = ({ icon: Icon, title, onClick, className, children }) => (
    <div
        onClick={onClick}
        className={`bg-white p-6 rounded-2xl shadow-subtle flex flex-col h-full cursor-pointer hover:shadow-subtle-hover hover:-translate-y-1 transition-all ${className}`}
    >
        <div className="flex items-center gap-2 mb-2">
            <Icon className="w-6 h-6 text-primary" />
            <h3 className="font-bold text-lg text-dark">{title}</h3>
        </div>
        <div className="flex-grow flex flex-col justify-center">{children}</div>
    </div>
);


const Dashboard: React.FC<DashboardProps> = ({ currentUser, setView }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [upcomingReminder, setUpcomingReminder] = useState<Reminder | null>(null);
    const [dinnerSuggestion, setDinnerSuggestion] = useState<Recipe | null>(null);
    const [coupleRestaurant, setCoupleRestaurant] = useState<Restaurant | null>(null);
    const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
    const [monthlyBalance, setMonthlyBalance] = useState<{ income: number, expenses: number, balance: number } | null>(null);
    const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
    const [datePlans, setDatePlans] = useState<DatePlan[]>([]);

    // Compass State
    const [compassState, setCompassState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
    const [compassError, setCompassError] = useState<string | null>(null);
    const [nearbyRestaurants, setNearbyRestaurants] = useState<(Restaurant & { distance: number })[]>([]);

    const todayString = useMemo(() => new Date().toISOString().split('T')[0], []);
    const partner = useMemo(() => USERS.find(u => u !== currentUser && u !== 'Visitante'), [currentUser]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const today = new Date();
            const currentMonthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            const startOfMonth = `${currentMonthYear}-01`;
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);

            const [remindersRes, recipesRes, restaurantsRes, moodsRes, goalsRes, closingRes, expensesRes, datePlansRes] = await Promise.all([
                supabase.from('reminders').select('*').eq('is_done', false).order('due_date', { ascending: true, nullsFirst: false }).limit(1).maybeSingle(),
                supabase.from('recipes').select('id, name, image_url'),
                supabase.from('restaurants').select('*').contains('wants_to_go', ['Nicolas', 'Ana Beatriz Diva Linda']),
                supabase.from('mood_entries').select('*').eq('entry_date', todayString),
                supabase.from('goals').select('*').eq('is_archived', false).order('created_at').limit(1).maybeSingle(),
                supabase.from('monthly_closings').select('*').eq('month_year', currentMonthYear).maybeSingle(),
                supabase.from('expenses').select('amount').eq('payment_source', 'Conta Pessoal').gte('due_date', startOfMonth).lte('due_date', endOfMonth),
                supabase.from('date_plans').select('*').in('status', ['pending', 'confirmed']).order('created_at', { ascending: false })
            ]);

            // Error handling for all promises
            if (remindersRes.error) throw remindersRes.error;
            if (recipesRes.error) throw recipesRes.error;
            if (restaurantsRes.error) throw restaurantsRes.error;
            if (moodsRes.error) throw moodsRes.error;
            if (goalsRes.error) throw goalsRes.error;
            if (closingRes.error) throw closingRes.error;
            if (expensesRes.error) throw expensesRes.error;
            if (datePlansRes.error) {
                // Ignore "table not found" errors gracefully
                if(datePlansRes.error.code !== '42P01') throw datePlansRes.error;
            }

            // Process reminders
            setUpcomingReminder(remindersRes.data as Reminder | null);

            // Process recipes
            const allRecipes = recipesRes.data || [];
            if (allRecipes.length > 0) {
                setDinnerSuggestion(allRecipes[Math.floor(Math.random() * allRecipes.length)]);
            }

            // Process restaurants
            const coupleRestaurants = restaurantsRes.data || [];
            if (coupleRestaurants.length > 0) {
                setCoupleRestaurant(coupleRestaurants[Math.floor(Math.random() * coupleRestaurants.length)]);
            }
            
            // Process moods
            setMoodEntries(moodsRes.data as MoodEntry[]);

            // Process goals
            setActiveGoal(goalsRes.data as Goal | null);

             // Process date plans
            const allPlans = (datePlansRes.data as DatePlan[]) || [];
            const filteredPlans = allPlans.filter(plan => {
                // Keep all pending plans
                if (plan.status === 'pending') return true;
                // Keep confirmed plans from the last 24 hours
                if (plan.status === 'confirmed') {
                    const planDate = new Date(plan.created_at);
                    return planDate > oneDayAgo;
                }
                return false;
            });
            setDatePlans(filteredPlans);

            // Process monthly balance
            const closingData = closingRes.data as MonthlyClosing | null;
            const totalExpenses = (expensesRes.data || []).reduce((sum, e) => sum + e.amount, 0);
            if(closingData) {
                setMonthlyBalance({
                    income: closingData.income_nicolas + closingData.income_ana,
                    expenses: totalExpenses,
                    balance: (closingData.income_nicolas + closingData.income_ana) - totalExpenses
                });
            } else {
                 setMonthlyBalance({ income: 0, expenses: totalExpenses, balance: -totalExpenses });
            }

        } catch (error: any) {
            console.error("Error fetching dashboard data:", error.message);
        } finally {
            setIsLoading(false);
        }
    }, [todayString, currentUser]);
    
    useEffect(() => {
        fetchData();
        const channel = supabase.channel('realtime-dashboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'date_plans' }, fetchData)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    const handleFindNearby = () => {
        setCompassState('loading');
        setCompassError(null);
        setNearbyRestaurants([]);

        if (!navigator.geolocation) {
            setCompassError("Geolocalização não é suportada por este navegador.");
            setCompassState('error');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude: userLat, longitude: userLon } = position.coords;

                const processResults = (restaurants: Restaurant[] | null) => {
                    if (!restaurants) return [];
                    return restaurants
                        .map(r => {
                            const locationWithCoords = (r.locations as Location[])?.find((l: Location) => l.latitude && l.longitude);
                            if (!locationWithCoords) return null;

                            const distance = calculateDistance(userLat, userLon, locationWithCoords.latitude!, locationWithCoords.longitude!);
                            return { ...r, distance };
                        })
                        .filter((r): r is Restaurant & { distance: number } => r !== null)
                        .sort((a, b) => a.distance - b.distance);
                };

                try {
                    let nearby: (Restaurant & { distance: number })[] = [];

                    // Step 1: Try finding mutual interest restaurants
                    if (partner) {
                        const { data: mutualRestaurants, error: mutualError } = await supabase
                            .from('restaurants')
                            .select('*')
                            .contains('wants_to_go', [currentUser, partner]);
                        
                        if (mutualError) throw mutualError;
                        nearby = processResults(mutualRestaurants);
                    }

                    // Step 2: If no mutual restaurants found, search for user's own interests
                    if (nearby.length === 0) {
                         const { data: userRestaurants, error: userError } = await supabase
                            .from('restaurants')
                            .select('*')
                            .contains('wants_to_go', [currentUser]);

                        if (userError) throw userError;
                        nearby = processResults(userRestaurants);
                    }
                    
                    setNearbyRestaurants(nearby.slice(0, 3));
                    setCompassState('success');

                } catch (dbError) {
                    console.error("Error fetching or processing restaurants:", dbError);
                    setCompassError("Não foi possível buscar os restaurantes.");
                    setCompassState('error');
                }
            },
            (error) => {
                let message = "Ocorreu um erro desconhecido ao obter a localização.";
                if (error.code === error.PERMISSION_DENIED) message = "Você negou o pedido de Geolocalização.";
                if (error.code === error.POSITION_UNAVAILABLE) message = "A informação de localização não está disponível.";
                if (error.code === error.TIMEOUT) message = "O pedido para obter a localização expirou.";
                setCompassError(message);
                setCompassState('error');
            }
        );
    };

    const myMood = useMemo(() => moodEntries.find(e => e.user_id === currentUser)?.mood, [moodEntries, currentUser]);
    const partnerMood = useMemo(() => partner ? moodEntries.find(e => e.user_id === partner)?.mood : undefined, [moodEntries, partner]);
    const myMoodData = myMood ? MOODS.find(m => m.value === myMood) : null;
    const partnerMoodData = partner ? (partnerMood ? MOODS.find(m => m.value === partnerMood) : null) : null;
    
    const CompassWidget = () => (
        <div className="bg-white p-6 rounded-2xl shadow-subtle flex flex-col justify-between h-full col-span-1 md:col-span-2">
            <div>
                <h3 className="font-bold text-lg text-dark flex items-center gap-2">
                    <LocationArrowIcon className="w-6 h-6 text-primary"/>
                    Bússola do Casal
                </h3>
                <p className="text-sm text-slate-500 mt-1 mb-4">Descubra restaurantes que ambos querem ir e que estão perto de você agora!</p>
            </div>
            
            {compassState === 'idle' && (
                <div className="flex-grow flex items-center justify-center">
                    <Button onClick={handleFindNearby} variant="primary">
                        <LocationArrowIcon className="w-5 h-5"/>
                        Encontrar Perto de Mim
                    </Button>
                </div>
            )}
            
            {compassState === 'loading' && (
                 <div className="flex-grow flex flex-col items-center justify-center text-slate-500">
                    <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-3 font-semibold">Buscando sua localização...</p>
                 </div>
            )}
            
            {compassState === 'error' && (
                <div className="flex-grow flex flex-col items-center justify-center text-center p-4 bg-red-50 rounded-lg">
                    <p className="font-semibold text-red-700">Erro!</p>
                    <p className="text-sm text-red-600">{compassError}</p>
                    <Button onClick={handleFindNearby} variant="secondary" size="sm" className="mt-3">Tentar Novamente</Button>
                </div>
            )}
            
            {compassState === 'success' && (
                <div className="flex-grow">
                    {nearbyRestaurants.length > 0 ? (
                        <div className="space-y-3">
                            {nearbyRestaurants.map(r => {
                                const location = (r.locations as Location[])?.find(l => l.latitude && l.longitude);
                                if (!location) return null;
                                const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
                                return (
                                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" key={r.id} className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                                        <p className="font-semibold text-dark">{r.name}</p>
                                        <p className="text-sm text-primary font-bold">~{r.distance.toFixed(1)} km de distância</p>
                                    </a>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex-grow flex flex-col items-center justify-center text-center p-4 bg-blue-50 rounded-lg">
                            <p className="font-semibold text-blue-700">Nada por perto...</p>
                            <p className="text-sm text-blue-600">Nenhum restaurante da sua lista 'Quero Ir' foi encontrado próximo da sua localização atual.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
    
    if (isLoading) {
        return <div className="p-6 text-center text-slate-500">Carregando painel...</div>;
    }
    
    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h1 className="text-3xl font-bold text-dark">Olá, {currentUser === 'Ana Beatriz Diva Linda' ? 'Ana' : currentUser}!</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in">

                <Widget icon={HeartPulseIcon} title="Nosso Humor Hoje" onClick={() => setView('wellness')} className="lg:col-span-2">
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="font-semibold">{currentUser === 'Ana Beatriz Diva Linda' ? 'Você (Ana)' : 'Você (Nicolas)'}</p>
                             {myMoodData ? (
                                <div className="text-4xl mt-2">{myMoodData.emoji}</div>
                             ) : (
                                <div className="text-slate-400 mt-2 text-sm">Não registrado</div>
                             )}
                        </div>
                        <div>
                             <p className="font-semibold">{partner === 'Ana Beatriz Diva Linda' ? 'Ana' : partner}</p>
                             {partnerMoodData ? (
                                <div className="text-4xl mt-2">{partnerMoodData.emoji}</div>
                             ) : (
                                <div className="text-slate-400 mt-2 text-sm">Aguardando...</div>
                             )}
                        </div>
                    </div>
                </Widget>
                
                <DatePlannerWidget 
                    currentUser={currentUser}
                    partner={partner}
                    plans={datePlans}
                    refetch={fetchData}
                    setView={setView}
                />

                <Widget icon={BellIcon} title="Próximo Lembrete" onClick={() => setView('reminders')}>
                    {upcomingReminder ? (
                        <div>
                            <p className="font-bold text-dark text-xl">{upcomingReminder.title}</p>
                            {upcomingReminder.due_date && <p className="text-slate-500">Vence em: {new Date(upcomingReminder.due_date + 'T00:00:00').toLocaleDateString()}</p>}
                        </div>
                    ) : <p className="text-slate-500">Nenhum lembrete futuro.</p>}
                </Widget>
                
                <Widget icon={CreditCardIcon} title="Balanço do Mês" onClick={() => setView('expenses')}>
                    {monthlyBalance ? (
                        <div className="text-center">
                            <p className={`text-3xl font-bold ${monthlyBalance.balance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {formatCurrency(monthlyBalance.balance)}
                            </p>
                            <p className="text-sm text-slate-500">Saldo atual</p>
                        </div>
                    ) : <p className="text-slate-500">Nenhum fechamento para este mês.</p>}
                </Widget>
                
                 <CompassWidget />
                
                 <Widget icon={TargetIcon} title="Meta Ativa" onClick={() => setView('expenses')}>
                    {activeGoal ? (
                        <div>
                             <p className="font-bold text-dark text-xl">{activeGoal.name}</p>
                             <div className="w-full bg-slate-200 rounded-full h-2 my-2">
                                <div className="bg-primary h-2 rounded-full" style={{width: `${Math.min((activeGoal.current_amount / activeGoal.target_amount) * 100, 100)}%`}}></div>
                            </div>
                            <p className="text-sm text-slate-600">{formatCurrency(activeGoal.current_amount)} / {formatCurrency(activeGoal.target_amount)}</p>
                        </div>
                    ) : <p className="text-slate-500">Nenhuma meta ativa.</p>}
                 </Widget>
                
                 <Widget icon={HeartIcon} title="Sugestão de Date" onClick={() => setView('restaurants')}>
                     {coupleRestaurant ? (
                        <div className="text-center">
                            <p className="font-bold text-dark text-xl">{coupleRestaurant.name}</p>
                            <p className="text-slate-500">Que tal revisitar um favorito?</p>
                        </div>
                    ) : <p className="text-slate-500">Nenhuma sugestão encontrada.</p>}
                 </Widget>

                 <Widget icon={BookOpenIcon} title="Sugestão de Jantar" onClick={() => setView('recipes')}>
                    {dinnerSuggestion ? (
                        <div className="text-center">
                            <p className="font-bold text-dark text-xl">{dinnerSuggestion.name}</p>
                            <p className="text-slate-500">Uma ideia para cozinhar em casa.</p>
                        </div>
                    ) : <p className="text-slate-500">Nenhuma sugestão encontrada.</p>}
                 </Widget>
            </div>
        </div>
    );
};


const DatePlannerWidget: React.FC<{
    currentUser: User,
    partner: User | undefined,
    plans: DatePlan[],
    refetch: () => void,
    setView: (view: View) => void,
}> = ({ currentUser, partner, plans, refetch, setView }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [planToReschedule, setPlanToReschedule] = useState<DatePlan | null>(null);

    const activePlan = useMemo(() => {
        const pending = plans.find(p => p.status === 'pending');
        if (pending) return pending;
        const confirmed = plans.find(p => p.status === 'confirmed');
        if (confirmed) return confirmed;
        return null;
    }, [plans]);

    const handlePlanUpdate = async (plan: DatePlan, newStatus: DatePlan['status'], newParticipantsStatus: DatePlan['participants_status']) => {
        setIsSaving(true);
        try {
            const { data: updatedPlan, error } = await supabase.from('date_plans')
                .update({ status: newStatus, participants_status: newParticipantsStatus })
                .eq('id', plan.id)
                .select()
                .single();
            
            if (error) throw error;
            
            // If confirmed, create a reminder
            if (updatedPlan?.status === 'confirmed') {
                const reminderDueDate = new Date(updatedPlan.proposed_datetime);
                // Set reminder for one day before the date, or today if the date is tomorrow
                reminderDueDate.setDate(reminderDueDate.getDate() - 1);

                const reminder = {
                    title: `Fazer reserva no ${updatedPlan.restaurant_name}`,
                    due_date: reminderDueDate.toISOString().split('T')[0],
                    created_by: updatedPlan.created_by as User,
                    assigned_to: [updatedPlan.created_by as User],
                    color: 'blue' as const,
                    is_done: false,
                    subtasks: [],
                };
                await supabase.from('reminders').insert([reminder]);
            }
            refetch();

        } catch (error: any) {
            console.error('Error updating plan:', error);
            alert(`Erro ao atualizar o plano: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleCancel = (plan: DatePlan) => {
        if (window.confirm("Tem certeza que deseja cancelar esta proposta de date?")) {
            const newParticipantsStatus = { ...plan.participants_status, [currentUser]: 'rejected' as const };
            handlePlanUpdate(plan, 'rejected', newParticipantsStatus);
        }
    };

    const handleAccept = (plan: DatePlan) => {
        if (!partner) return;
        const newParticipantsStatus = { ...plan.participants_status, [currentUser]: 'accepted' as const };
        handlePlanUpdate(plan, 'confirmed', newParticipantsStatus);
    };

    const handleReject = (plan: DatePlan) => {
        const newParticipantsStatus = { ...plan.participants_status, [currentUser]: 'rejected' as const };
        handlePlanUpdate(plan, 'rejected', newParticipantsStatus);
    };
    
    const handleOpenReschedule = (plan: DatePlan) => {
        setPlanToReschedule(plan);
        setIsRescheduleModalOpen(true);
    };

    const handleReschedule = async (datetime: string) => {
        if (!planToReschedule || !partner) return;
        setIsSaving(true);
        try {
            const newParticipantsStatus = {
                [currentUser]: 'accepted' as const,
                [partner]: 'pending' as const,
            };
            const { error } = await supabase.from('date_plans')
                .update({ 
                    proposed_datetime: datetime, 
                    participants_status: newParticipantsStatus,
                    created_by: currentUser, // The proposer is now the one rescheduling
                    status: 'pending' as const,
                })
                .eq('id', planToReschedule.id);

            if (error) throw error;

            setIsRescheduleModalOpen(false);
            setPlanToReschedule(null);
            refetch();
        } catch (error: any) {
             console.error('Error rescheduling plan:', error);
            alert(`Erro ao reagendar: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const renderContent = () => {
        if (!activePlan) {
            return (
                <div className="text-center text-slate-500">
                    <p>Nenhum date sendo planejado.</p>
                    <p className="text-sm">Que tal escolher um restaurante e propor um encontro?</p>
                </div>
            );
        }
        
        const proposedTime = new Date(activePlan.proposed_datetime).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        const isMyProposal = activePlan.created_by === currentUser;
        
        // Confirmed state
        if (activePlan.status === 'confirmed') {
            return (
                <div className="text-center animate-pop-in relative">
                    <HeartIcon className="w-6 h-6 text-red-300 absolute -top-2 -left-2 transform -rotate-12 animate-pop-in" style={{animationDelay: '100ms'}} />
                    <HeartIcon className="w-5 h-5 text-pink-300 absolute -bottom-4 right-8 transform rotate-45 animate-pop-in" style={{animationDelay: '200ms'}} />
                    <HeartIcon className="w-8 h-8 text-red-200 absolute -top-4 right-0 transform rotate-12 animate-pop-in" style={{animationDelay: '300ms'}} />
                    <p className="text-2xl mb-2">🎉</p>
                    <p className="font-bold text-green-700">Date Confirmado!</p>
                    <p className="text-slate-600 font-semibold">{activePlan.restaurant_name}</p>
                    <p className="text-slate-500">{proposedTime}</p>
                </div>
            );
        }

        // Pending state, and I'm the one who needs to respond
        if (!isMyProposal) {
            return (
                <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                        <HeartIcon className="w-5 h-5 text-pink-400 animate-pulse" />
                        <p className="font-bold text-dark">{partner === 'Ana Beatriz Diva Linda' ? 'Ana' : partner} te convidou para um date!</p>
                    </div>
                    <p className="text-slate-600 font-semibold">{activePlan.restaurant_name}</p>
                    <p className="text-slate-500 mb-4">{proposedTime}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                         <Button onClick={() => handleAccept(activePlan)} disabled={isSaving} size="sm" className="!bg-green-500 hover:!bg-green-600">
                            <CheckIcon className="w-4 h-4"/> Aceitar
                         </Button>
                         <Button onClick={() => handleOpenReschedule(activePlan)} disabled={isSaving} size="sm" variant="secondary">
                            <PencilIcon className="w-4 h-4"/> Sugerir outro
                         </Button>
                         <Button onClick={() => handleReject(activePlan)} disabled={isSaving} size="sm" variant="danger">
                            <XMarkIcon className="w-4 h-4"/> Recusar
                         </Button>
                    </div>
                </div>
            )
        }
        
        // Pending state, and I made the proposal
        if (isMyProposal) {
             return (
                <div className="text-center">
                    <p className="font-bold text-dark">Aguardando resposta de {partner === 'Ana Beatriz Diva Linda' ? 'Ana' : partner}...</p>
                    <p className="text-slate-600 font-semibold">{activePlan.restaurant_name}</p>
                    <p className="text-slate-500 mb-4">{proposedTime}</p>
                    <Button onClick={() => handleCancel(activePlan)} disabled={isSaving} size="sm" variant="secondary">
                        <XMarkIcon className="w-4 h-4"/> Cancelar Proposta
                    </Button>
                </div>
            )
        }

        return null;
    }

    return (
        <>
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-subtle flex flex-col h-full transition-all relative overflow-hidden">
                <div 
                    className="absolute inset-0 bg-cover bg-center opacity-40" 
                    style={{ backgroundImage: `url('https://img.freepik.com/vetores-gratis/padrao-de-coracoes-esbocado_23-2147498284.jpg?semt=ais_hybrid&w=740&q=80')` }}
                ></div>
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm"></div>
                
                <div className="relative z-10 p-6 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-2">
                        <CalendarDaysIcon className="w-6 h-6 text-primary" />
                        <h3 className="font-bold text-lg text-dark">Planejador de Dates</h3>
                    </div>
                    <div className="flex-grow flex flex-col justify-center min-h-[100px]">
                        {renderContent()}
                    </div>
                </div>
            </div>
            {planToReschedule && (
                <Modal isOpen={isRescheduleModalOpen} onClose={() => setIsRescheduleModalOpen(false)} title="Sugerir novo horário">
                    <DatePlannerForm
                        onSave={handleReschedule}
                        onClose={() => setIsRescheduleModalOpen(false)}
                        isSaving={isSaving}
                        initialDateTime={planToReschedule.proposed_datetime}
                    />
                </Modal>
            )}
        </>
    );
};

export default Dashboard;