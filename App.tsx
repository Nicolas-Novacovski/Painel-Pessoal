
import React, { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { View, UserProfile, User, Role } from './types';
import { supabase } from './utils/supabase';

import RestaurantsApp from './components/RestaurantsApp';
import { ExpensesApp } from './components/ExpensesApp';
import RecipesApp from './components/RecipesApp';
import RemindersApp from './components/RemindersApp';
import WellnessApp from './components/WellnessApp';
import Dashboard from './components/Dashboard';
import Navigation from './components/Navigation';
import LoginScreen from './components/LoginScreen';
import ListsApp from './components/ListsApp';
import StudyNotesApp from './components/ApplicationsApp';
import AdminApp from './components/AdminApp';
import AIRecommenderApp from './components/AIRecommenderApp';
import TravelApp from './components/TravelApp';
import { GoogleGenAI, Type } from '@google/genai';

const GOOGLE_CLIENT_ID = '541449375636-vth3bki95hgg0n3mnt950loi6tu17gh2.apps.googleusercontent.com';

const App: React.FC = () => {
    const [view, setView] = useLocalStorage<View>('currentView', 'dashboard');
    const [currentUser, setCurrentUser] = useLocalStorage<UserProfile | null>('currentUserProfile', null);
    const [googleAuthToken, setGoogleAuthToken] = useLocalStorage<string | null>('googleAuthToken', null);
    const [tokenClient, setTokenClient] = useState<any>(null);
    const [isGsiReady, setIsGsiReady] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const handleLogout = useCallback(() => {
        if (googleAuthToken && window.google?.accounts?.oauth2) {
            window.google.accounts.oauth2.revoke(googleAuthToken, () => {});
        }
        setGoogleAuthToken(null);
        setCurrentUser(null);
        setView('dashboard');
    }, [googleAuthToken, setGoogleAuthToken, setCurrentUser, setView]);

    useEffect(() => {
        const initializeGsi = () => {
             if (window.google && window.google.accounts) {
                 try {
                    const client = window.google.accounts.oauth2.initTokenClient({
                        client_id: GOOGLE_CLIENT_ID,
                        scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
                        callback: async (response: any) => {
                            if (response.error) {
                                console.error('Google Auth Error:', response.error, response.error_description);
                                handleLogout();
                                return;
                            }
                            if (response.access_token) {
                                 try {
                                    setGoogleAuthToken(response.access_token);
                                    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                        headers: { 'Authorization': `Bearer ${response.access_token}` }
                                    });
                                    if (!userInfoResponse.ok) { throw new Error(`Failed to fetch user info, status: ${userInfoResponse.status}`); }
                                    
                                    const gUser = await userInfoResponse.json();

                                    // Fetch profile from our DB
                                    const { data: userProfiles, error: profileError } = await supabase
                                        .from('user_profiles')
                                        .select('*')
                                        .eq('email', gUser.email);
                                    
                                    if (profileError) {
                                        // Throw the error to be handled by the catch block
                                        throw profileError;
                                    }

                                    if (userProfiles && userProfiles.length > 0) {
                                        const dbProfile = userProfiles[0];
                                        if (userProfiles.length > 1) {
                                            console.warn(`[Login] Multiple profiles found for email ${gUser.email}. Using the first one found.`);
                                        }
                                        
                                        const userProfile: UserProfile = {
                                            email: dbProfile.email,
                                            name: dbProfile.name,
                                            picture: gUser.picture,
                                            role: dbProfile.role as Role,
                                            couple_id: dbProfile.couple_id,
                                            allowed_views: dbProfile.allowed_views as View[] | null,
                                            address: dbProfile.address,
                                            latitude: dbProfile.latitude,
                                            longitude: dbProfile.longitude
                                        };

                                        setCurrentUser(userProfile);
                                        setAuthError(null); // Clear any previous errors on successful login
                                    } else {
                                        // User not in our DB, deny access
                                        setAuthError('Acesso negado. Seu e-mail não está cadastrado no sistema.');
                                        handleLogout();
                                    }
                                } catch (error: any) {
                                    console.error('Error during login process:', error);
                                    const msg = (error.message || '').toLowerCase();
                                    if (error?.code === '42P01' || msg.includes('does not exist')) {
                                        setAuthError('CONFIG_ERROR'); // Table missing
                                    } else if (error?.code === '42501' || msg.includes('permission denied')) {
                                        setAuthError('CONFIG_ERROR'); // RLS error
                                    } else {
                                        setAuthError(`Algo deu errado: ${error.message || 'Tente novamente.'}`);
                                    }
                                    handleLogout();
                                }
                            }
                        },
                    });
                    setTokenClient(client);
                 } catch (error) {
                    console.error("GSI Init Error:", error);
                    setAuthError("Não foi possível iniciar a autenticação do Google. Verifique sua conexão e tente recarregar a página.");
                 } finally {
                    setIsGsiReady(true);
                 }
             }
        }
        
        const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        if (script) {
            if (window.google?.accounts) {
                 initializeGsi();
            } else {
                 script.addEventListener('load', initializeGsi);
            }
            return () => script.removeEventListener('load', initializeGsi);
        } else {
             setIsGsiReady(true); // Assume it's already loaded if script tag not found
        }
    }, [handleLogout, setCurrentUser, setGoogleAuthToken, setView]);
    
    // View access control
    useEffect(() => {
        if (currentUser) {
            const allowedViews = currentUser.allowed_views || [];
            
            // Fallback for users migrated from role-based system without allowed_views yet
            if (allowedViews.length === 0) {
                 const legacyAllowed: Record<UserProfile['role'], View[]> = {
                    admin: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists', 'study-notes', 'admin'],
                    partner: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists', 'study-notes'],
                    parent: ['study-notes'],
                    visitor: ['restaurants'],
                };
                const fallbackViews = legacyAllowed[currentUser.role] || ['restaurants'];
                 if (!fallbackViews.includes(view)) {
                    setView(fallbackViews[0]);
                }
                return;
            }

            if (!allowedViews.includes(view)) {
                 setView(allowedViews[0] || 'restaurants'); // default to a safe page
            }
        }
    }, [view, currentUser, setView]);
    
    const handleLogin = () => {
        if(tokenClient) {
            tokenClient.requestAccessToken();
        }
    };
    
    const updateCurrentUser = (updatedFields: Partial<UserProfile>) => {
        setCurrentUser(prev => (prev ? { ...prev, ...updatedFields } : null));
    };

    const renderView = () => {
        if (!currentUser) return null; // Should be handled by LoginScreen, but as a safeguard

        const allowedViews = currentUser.allowed_views || [];

        // Re-check access before rendering
        if (allowedViews.length === 0) {
             const legacyAllowed: Record<UserProfile['role'], View[]> = {
                admin: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists', 'study-notes', 'admin'],
                partner: ['dashboard', 'restaurants', 'ai-recommender', 'travel', 'expenses', 'recipes', 'reminders', 'wellness', 'lists', 'study-notes'],
                parent: ['study-notes'],
                visitor: ['restaurants'],
            };
            if (!legacyAllowed[currentUser.role].includes(view)) {
                 return <div className="p-8 text-center">Acesso negado a esta página.</div>;
            }
        } else if (!allowedViews.includes(view)) {
            return <div className="p-8 text-center">Acesso negado a esta página.</div>;
        }

        switch (view) {
            case 'dashboard':
                return <Dashboard currentUser={currentUser.name as User} setView={setView} />;
            case 'restaurants':
                return <RestaurantsApp currentUser={currentUser} onProfileUpdate={updateCurrentUser} />;
            case 'ai-recommender':
                return <AIRecommenderApp currentUser={currentUser} />;
            case 'travel':
                return <TravelApp currentUser={currentUser} />;
            case 'expenses':
                return <ExpensesApp currentUser={currentUser} googleAuthToken={googleAuthToken} onAuthError={handleLogout} />;
            case 'recipes':
                return <RecipesApp currentUser={currentUser.name as User} />;
            case 'reminders':
                return <RemindersApp currentUser={currentUser.name as User} />;
            case 'wellness':
                return <WellnessApp currentUser={currentUser.name as User} />;
            case 'lists':
                return <ListsApp currentUser={currentUser} />;
            case 'study-notes':
                return <StudyNotesApp currentUser={currentUser} />;
            case 'admin':
                return <AdminApp currentUser={currentUser} />;
            default:
                return <Dashboard currentUser={currentUser.name as User} setView={setView} />;
        }
    };
    
    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} isInitializing={!isGsiReady} error={authError} />;
    }

    return (
        <div className="h-screen w-full font-sans antialiased flex flex-col sm:flex-row">
            <Navigation
                activeView={view}
                setActiveView={setView}
                currentUser={currentUser}
                onLogout={handleLogout}
            />
            
            <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
                 <main className="flex-1">
                    <div key={view} className="animate-fade-in">
                        {renderView()}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;