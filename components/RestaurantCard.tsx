import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, User } from '../types';
import { averageRating } from '../utils/helpers';
import { HeartIcon, MapPinIcon, StarIcon, GoogleIcon, ClipboardCheckIcon, EllipsisVerticalIcon, TrashIcon } from './Icons';
import { PriceRatingDisplay, StarRatingDisplay } from './UIComponents';

interface RestaurantCardProps {
    restaurant: Restaurant & { is_favorited: boolean };
    onSelect: (restaurant: Restaurant & { is_favorited: boolean }) => void;
    onToggleFavorite: (id: string, currentState: boolean) => Promise<void>;
    onRemoveFromList: (id: string) => Promise<void>;
    currentUser: User;
    distance?: number;
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({ restaurant, onSelect, onToggleFavorite, onRemoveFromList, currentUser, distance }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const rating = useMemo(() => averageRating(restaurant.reviews), [restaurant.reviews]);
    const hasVisited = useMemo(() => restaurant.reviews.some(r => r.user === currentUser && r.rating > 0), [restaurant.reviews, currentUser]);

    const isNew = useMemo(() => {
        const createdAt = new Date(restaurant.created_at);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        return createdAt > threeDaysAgo;
    }, [restaurant.created_at]);

    const lastVisitedDate = useMemo(() => {
        if (!hasVisited || !restaurant.memories || restaurant.memories.length === 0) {
            return null;
        }
        const userMemories = restaurant.memories
            .filter(m => m.created_by_user === currentUser)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        if (userMemories.length === 0) return null;
    
        return new Date(userMemories[0].created_at);
    }, [hasVisited, restaurant.memories, currentUser]);
    
    const addedByInfo = useMemo(() => {
        switch(restaurant.addedBy) {
            case 'Nicolas':
                return { initial: 'N', color: 'bg-primary' };
            case 'Ana Beatriz Diva Linda':
                return { initial: 'A', color: 'bg-partner' };
            case 'Visitante':
                return { initial: 'V', color: 'bg-slate-500' };
            default:
                return { initial: '?', color: 'bg-gray-400' };
        }
    }, [restaurant.addedBy]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuRef]);

    const handleFavoriteClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await onToggleFavorite(restaurant.id, restaurant.is_favorited);
    };

    const handleMenuToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(prev => !prev);
    };
    
    const primaryLocation = restaurant.locations && restaurant.locations.length > 0 ? restaurant.locations[0].address : 'Endereço não informado';
    
    const handleMapClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryLocation)}`, '_blank');
        setIsMenuOpen(false);
    };
    
    const handleCopyClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(primaryLocation);
        alert('Endereço copiado!');
        setIsMenuOpen(false);
    };
    
    const handleShareClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const shareUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryLocation)}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: restaurant.name,
                    text: `Vamos neste restaurante? ${restaurant.name}, ${primaryLocation}`,
                    url: shareUrl,
                });
            } catch (error) {
                console.error('Error sharing:', error);
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    alert('Ocorreu um erro ao tentar compartilhar.');
                }
            }
        } else {
            alert('A função de compartilhar não é suportada neste navegador.');
        }
        setIsMenuOpen(false);
    };

    const handleRemoveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Tem certeza que deseja remover "${restaurant.name}" da sua lista?`)) {
            onRemoveFromList(restaurant.id);
        }
        setIsMenuOpen(false);
    };

    return (
        <div 
            className="bg-white rounded-2xl shadow-subtle transition-all duration-300 hover:shadow-subtle-hover group hover:-translate-y-1.5 relative" 
        >
             <div className="cursor-pointer" onClick={() => onSelect(restaurant)}>
                <div className="h-48 w-full overflow-hidden relative rounded-t-2xl">
                    {isNew && (
                        <div className="ribbon">Novo!</div>
                    )}
                    <img src={restaurant.image || `https://picsum.photos/seed/${restaurant.id}/400/300`} alt={restaurant.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    
                    {hasVisited && (
                        <div title="Você já visitou!" className="absolute bottom-3 left-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full border-2 border-white shadow-lg flex items-center gap-1">
                            <ClipboardCheckIcon className="w-4 h-4"/>
                            {lastVisitedDate ? `VISITADO ${lastVisitedDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')}` : 'VISITADO'}
                        </div>
                    )}
                    <div title={`Adicionado por: ${restaurant.addedBy || 'Desconhecido'}`} className={`absolute bottom-3 right-3 w-7 h-7 rounded-full border-2 border-white shadow flex items-center justify-center text-white font-bold text-sm ${addedByInfo.color}`}>
                        {addedByInfo.initial}
                    </div>
                </div>
                <div className="p-5 flex-grow flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xl font-bold text-dark truncate pr-2 flex-grow">{restaurant.name}</h3>
                        {restaurant.vibe && (
                            <span className="text-xs flex-shrink-0 font-semibold text-pink-700 bg-pink-100 px-2 py-1 rounded-full whitespace-nowrap">{restaurant.vibe}</span>
                        )}
                    </div>
                    {restaurant.cuisine && <p className="text-sm font-semibold text-primary">{restaurant.cuisine}</p>}
                    <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                        <p className="text-sm text-slate-500 font-medium">{restaurant.category}</p>
                        <PriceRatingDisplay rating={restaurant.price_range || 0} />
                        {restaurant.inTourOqfc && (
                            <span className="text-xs font-bold text-accent-focus bg-amber-100 px-2 py-0.5 rounded-full">
                                TOUR OQFC
                            </span>
                        )}
                    </div>
                    <div className="flex items-center mt-3 text-slate-600">
                        <MapPinIcon className="w-4 h-4 mr-1.5 flex-shrink-0" />
                        <p className="text-sm truncate flex-grow">
                            {primaryLocation}
                            {restaurant.city !== 'Curitiba' && <span className="font-bold"> - {restaurant.city}</span>}
                        </p>
                        {distance !== undefined && distance !== Infinity && (
                            <span className="text-sm font-bold text-primary flex-shrink-0 ml-2 whitespace-nowrap">
                                ~{distance.toFixed(1)} km
                            </span>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex-grow flex flex-col justify-end">
                        <div className="flex items-center gap-1">
                            <StarRatingDisplay rating={rating} />
                            <span className="font-semibold text-sm text-slate-500 ml-1">({rating.toFixed(1)})</span>
                            <span className="text-xs text-slate-400">({restaurant.reviews.length})</span>
                        </div>
                        {restaurant.google_rating && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <GoogleIcon className="w-4 h-4"/>
                                <StarIcon className="w-4 h-4 text-yellow-400" />
                                <span className="font-semibold text-sm text-slate-600">{restaurant.google_rating.toFixed(1)}</span>
                                <span className="text-xs text-slate-400">({restaurant.google_rating_count})</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- Buttons overlaying the card --- */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                    onClick={handleFavoriteClick}
                    className={`p-2 rounded-full transition-all duration-200 ${restaurant.is_favorited ? 'text-red-500 bg-red-100/80' : 'text-slate-500 bg-white/80 hover:bg-slate-100'}`}
                    aria-label={restaurant.is_favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                >
                    <HeartIcon className="w-6 h-6" />
                </button>
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={handleMenuToggle}
                        className="p-2 rounded-full transition-colors duration-200 text-white bg-black/40 hover:bg-black/60"
                        aria-label="Mais opções"
                    >
                        <EllipsisVerticalIcon className="w-6 h-6" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg z-20 py-1 border border-slate-200 animate-fade-in" onClick={e => e.stopPropagation()}>
                            <a onClick={handleMapClick} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer">Ver no Mapa</a>
                            <a onClick={handleCopyClick} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer">Copiar Endereço</a>
                            <a onClick={handleShareClick} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer">Compartilhar</a>
                            <div className="my-1 border-t border-slate-100"></div>
                            <a onClick={handleRemoveClick} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100 hover:text-red-700 cursor-pointer transition-colors">
                                <TrashIcon className="w-4 h-4" />
                                Remover da Lista
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
