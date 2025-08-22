import React, { useMemo, useState, useRef, useEffect } from 'react';
import { UserProfile, View } from '../types';
import { HomeIcon, RestaurantIcon, CreditCardIcon, BookOpenIcon, BellIcon, HeartPulseIcon, ArrowLeftOnRectangleIcon, BookmarkIcon, BriefcaseIcon, ShieldCheckIcon, SparklesIcon, PaperAirplaneIcon, XMarkIcon, Bars3Icon } from './Icons';
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
                <div className="text-center text-xs text-slate-400 pt-2">
                    <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        Privacidade
                    </a>
                    <span className="mx-1">·</span>
                    <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        Termos
                    </a>
                </div>
            </div>
        </aside>
    );
};

const MobileSidebar: React.FC<Omit<NavigationProps, 'activeView' | 'setActiveView'> & { isOpen: boolean; onClose: () => void; setActiveView: (view: View) => void; activeView: View }> = ({ isOpen, onClose, currentUser, onLogout, setActiveView, activeView }) => {
    const navItemsFiltered = useMemo(() => {
        const allowed = currentUser.allowed_views || [];
        if (allowed.length > 0) {
            return navItems.filter(item => allowed.includes(item.view));
        }
        const legacyAllowed: Record<UserProfile['role'], View[]> = {
           admin: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists', 'applications', 'admin'],
           partner: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists'],
           parent: ['applications'],
           visitor: ['restaurants'],
        };
        return navItems.filter(item => (legacyAllowed[currentUser.role] || []).includes(item.view));
    }, [currentUser]);

    const handleLinkClick = (view: View) => {
        setActiveView(view);
        onClose();
    };

    return (
        <>
            <div
                className={`sm:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            ></div>
            <aside
                className={`sm:hidden fixed top-0 left-0 bottom-0 w-72 bg-white z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-primary">Painel Pessoal</h1>
                    <button onClick={onClose} className="p-2 -mr-2 text-slate-500 hover:bg-slate-100 rounded-full">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
                    {navItemsFiltered.map(item => (
                        <button
                            key={item.view}
                            onClick={() => handleLinkClick(item.view)}
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
                <div className="p-4 border-t border-slate-200 space-y-2 flex-shrink-0">
                    <div className="w-full flex items-center gap-3 p-2 border border-slate-200 bg-slate-50 rounded-lg text-slate-700 font-medium text-sm">
                        <img src={currentUser.picture} alt={currentUser.name} className="w-8 h-8 rounded-full" />
                        <span className="truncate">{currentUser.name}</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={onLogout} className="w-full">
                        <ArrowLeftOnRectangleIcon className="w-5 h-5"/>
                        <span>Sair</span>
                    </Button>
                </div>
            </aside>
        </>
    );
};

const MobileTopBar: React.FC<Pick<NavigationProps, 'activeView' | 'currentUser' | 'onLogout'> & { onMenuClick: () => void }> = ({ activeView, currentUser, onLogout, onMenuClick }) => {
    const currentViewLabel = navItems.find(item => item.view === activeView)?.label || 'Painel Pessoal';
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <header className="sm:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-lg py-2 px-4 border-b border-slate-200 flex justify-between items-center h-16">
             <div className="flex items-center gap-2">
                <button onClick={onMenuClick} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
                    <Bars3Icon className="w-6 h-6" />
                </button>
                <h1 className="text-lg font-bold text-dark">{currentViewLabel}</h1>
             </div>
             <div className="relative" ref={profileMenuRef}>
                 <button onClick={() => setIsProfileMenuOpen(prev => !prev)} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                    <img src={currentUser.picture} alt={currentUser.name} className="w-9 h-9 rounded-full" />
                 </button>
                 {isProfileMenuOpen && (
                     <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg z-40 py-1 border border-slate-200 animate-fade-in">
                        <div className="px-4 py-2 border-b border-slate-100">
                             <p className="font-semibold text-dark truncate">{currentUser.name}</p>
                             <p className="text-sm text-slate-500 truncate">{currentUser.email}</p>
                        </div>
                         <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                             <ArrowLeftOnRectangleIcon className="w-5 h-5"/>
                             <span>Sair</span>
                         </button>
                     </div>
                 )}
             </div>
        </header>
    );
};

const Navigation: React.FC<NavigationProps> = (props) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <>
            <DesktopSidebar {...props} />
            
            {/* Mobile Navigation */}
            <MobileTopBar {...props} onMenuClick={() => setIsMobileMenuOpen(true)} />
            <MobileSidebar 
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
                currentUser={props.currentUser}
                onLogout={props.onLogout}
                setActiveView={props.setActiveView}
                activeView={props.activeView}
            />
        </>
    );
};

export default Navigation;
