import React, { useMemo } from 'react';
import { UserProfile, View } from '../types';
import { USERS } from '../constants';
import { HomeIcon, RestaurantIcon, CreditCardIcon, BookOpenIcon, BellIcon, HeartPulseIcon, ArrowLeftOnRectangleIcon, BookmarkIcon, BriefcaseIcon, ShieldCheckIcon, SparklesIcon, PaperAirplaneIcon } from './Icons';
import { Button } from './UIComponents';

interface NavigationProps {
    activeView: View;
    setActiveView: (view: View) => void;
    currentUser: UserProfile;
    onLogout: () => void;
}

const navItems: { label: string; view: View; icon: React.FC<any> }[] = [
    { label: 'Painel', view: 'dashboard', icon: HomeIcon },
    { label: 'Restaurantes', view: 'restaurants', icon: RestaurantIcon },
    { label: 'Recomendador IA', view: 'ai-recommender', icon: SparklesIcon },
    { label: 'Viagens', view: 'travel', icon: PaperAirplaneIcon },
    { label: 'Listas', view: 'lists', icon: BookmarkIcon },
    { label: 'Planejamento', view: 'expenses', icon: CreditCardIcon },
    { label: 'Receitas', view: 'recipes', icon: BookOpenIcon },
    { label: 'Lembretes', view: 'reminders', icon: BellIcon },
    { label: 'Bem-Estar', view: 'wellness', icon: HeartPulseIcon },
    { label: 'Aplicações', view: 'applications', icon: BriefcaseIcon },
    { label: 'Admin', view: 'admin', icon: ShieldCheckIcon },
];

const DesktopSidebar: React.FC<NavigationProps> = ({ activeView, setActiveView, currentUser, onLogout }) => {
    
    const navItemsFiltered = useMemo(() => {
        const allowed = currentUser.allowed_views || [];
        if (allowed.length > 0) {
            return navItems.filter(item => allowed.includes(item.view));
        }
        // Fallback for non-migrated users
        const legacyAllowed: Record<UserProfile['role'], View[]> = {
           admin: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists', 'applications', 'admin'],
           partner: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists'],
           parent: ['applications'],
           visitor: ['restaurants'],
        };
        return navItems.filter(item => (legacyAllowed[currentUser.role] || []).includes(item.view));
    }, [currentUser]);


    return (
        <aside className="hidden sm:flex flex-col w-64 bg-white border-r border-slate-200">
            <div className="p-4 border-b border-slate-200">
                <h1 className="text-xl sm:text-2xl font-bold text-primary">Painel Pessoal</h1>
            </div>
            <nav className="flex-grow p-4 space-y-2">
                {navItemsFiltered.map(item => (
                    <button
                        key={item.view}
                        onClick={() => setActiveView(item.view)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-base font-semibold rounded-lg transition-colors duration-200 ${
                            activeView === item.view
                                ? 'bg-primary/10 text-primary'
                                : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        <item.icon className="w-6 h-6" />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-2">
                 <div className="w-full flex items-center gap-3 p-2 border border-slate-200 bg-slate-50 rounded-lg text-slate-700 font-medium text-sm sm:text-base">
                    <img src={currentUser.picture} alt={currentUser.name} className="w-8 h-8 rounded-full" />
                    <span className="truncate">{currentUser.name}</span>
                 </div>
                <Button variant="secondary" size="sm" onClick={onLogout} className="w-full">
                    <ArrowLeftOnRectangleIcon className="w-5 h-5"/>
                    <span>Sair</span>
                </Button>
            </div>
        </aside>
    );
};

const MobileTopBar: React.FC<Pick<NavigationProps, 'activeView' | 'currentUser' | 'onLogout'>> = ({ activeView, currentUser, onLogout }) => {
    const currentViewLabel = navItems.find(item => item.view === activeView)?.label || 'Painel Pessoal';

    return (
        <header className="sm:hidden sticky top-0 z-20 bg-white/80 backdrop-blur-lg py-2 px-4 border-b border-slate-200 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <img src={currentUser.picture} alt={currentUser.name} className="w-8 h-8 rounded-full" />
                <h1 className="text-lg font-bold text-dark">{currentViewLabel}</h1>
             </div>
             <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onLogout} className="!p-2">
                    <ArrowLeftOnRectangleIcon className="w-6 h-6"/>
                </Button>
             </div>
        </header>
    );
};

const MobileBottomNav: React.FC<Pick<NavigationProps, 'activeView' | 'setActiveView' | 'currentUser'>> = ({ activeView, setActiveView, currentUser }) => {
     const navItemsFiltered = useMemo(() => {
        const allowed = currentUser.allowed_views || [];
         if (allowed.length > 0) {
            return navItems.filter(item => allowed.includes(item.view));
        }
        // Fallback for non-migrated users
        const legacyAllowed: Record<UserProfile['role'], View[]> = {
           admin: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists', 'applications', 'admin'],
           partner: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists'],
           parent: ['applications'],
           visitor: ['restaurants'],
        };
        return navItems.filter(item => (legacyAllowed[currentUser.role] || []).includes(item.view));
    }, [currentUser]);
    
    // Create chunks of 6 for potential multi-row navigation if needed
    const navChunks = [];
    for (let i = 0; i < navItemsFiltered.length; i += 6) {
        navChunks.push(navItemsFiltered.slice(i, i + 6));
    }

    if (currentUser.role === 'visitor') {
        return null; 
    }

    return (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-20">
            {navChunks.map((chunk, index) => (
                 <div key={index} className="grid" style={{gridTemplateColumns: `repeat(${chunk.length}, minmax(0, 1fr))`}}>
                    {chunk.map(item => (
                        <button
                            key={item.view}
                            onClick={() => setActiveView(item.view)}
                            className={`flex flex-col items-center justify-center gap-1 py-2 transition-colors duration-200 ${
                                activeView === item.view ? 'text-primary' : 'text-slate-500 hover:bg-slate-100'
                            }`}
                        >
                            <item.icon className="w-6 h-6" />
                            <span className="text-[10px] font-semibold">{item.label}</span>
                        </button>
                    ))}
                </div>
            ))}
        </nav>
    );
};

const Navigation: React.FC<NavigationProps> = (props) => {
    return (
        <>
            <DesktopSidebar {...props} />
            <MobileTopBar {...props} />
            <MobileBottomNav {...props} />
        </>
    );
};

export default Navigation;