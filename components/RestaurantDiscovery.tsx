import React, { useState, useRef, useMemo } from 'react';
import { Restaurant, User } from '../types';
import { Button } from './UIComponents';
import { XMarkIcon, HeartIcon, GoogleIcon, StarIcon } from './Icons';
import { PriceRatingDisplay, StarRatingDisplay } from './UIComponents';
import { averageRating } from '../utils/helpers';

const DiscoveryCard: React.FC<{ 
    restaurant: Restaurant, 
    deltaX: number 
}> = ({ restaurant, deltaX }) => {
    const rating = useMemo(() => averageRating(restaurant.reviews), [restaurant.reviews]);
    
    const showYes = deltaX > 50;
    const showNo = deltaX < -50;

    return (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden w-full h-full flex flex-col relative">
            <div className="h-3/5 w-full overflow-hidden relative bg-slate-200">
                <img src={restaurant.image || `https://picsum.photos/seed/${restaurant.id}/400/300`} alt={restaurant.name} className="w-full h-full object-cover" />
                {showYes && (
                    <div className="absolute top-8 left-8 transform -rotate-12 border-4 border-green-400 text-green-400 font-bold text-4xl p-2 rounded-lg bg-white/50 backdrop-blur-sm">
                        SIM
                    </div>
                )}
                {showNo && (
                    <div className="absolute top-8 right-8 transform rotate-12 border-4 border-red-400 text-red-400 font-bold text-4xl p-2 rounded-lg bg-white/50 backdrop-blur-sm">
                        NÃO
                    </div>
                )}
            </div>
            <div className="p-5 flex-grow flex flex-col justify-between">
                <div>
                    <h3 className="text-2xl font-bold text-dark truncate">{restaurant.name}</h3>
                    {restaurant.cuisine && <p className="text-md font-semibold text-primary">{restaurant.cuisine}</p>}
                     <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                        <p className="text-sm text-slate-500 font-medium">{restaurant.category}</p>
                        <PriceRatingDisplay rating={restaurant.price_range || 0} />
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                     <div className="flex items-center gap-1">
                        <StarRatingDisplay rating={rating} />
                        <span className="font-semibold text-sm text-slate-500 ml-1">({rating.toFixed(1)})</span>
                    </div>
                    {restaurant.google_rating && (
                         <div className="flex items-center gap-1.5 mt-1.5">
                            <GoogleIcon className="w-4 h-4"/>
                            <StarIcon className="w-4 h-4 text-yellow-400" />
                            <span className="font-semibold text-sm text-slate-600">{restaurant.google_rating.toFixed(1)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


interface RestaurantDiscoveryProps {
    restaurants: Restaurant[];
    onClose: () => void;
    onInterest: (restaurantId: string) => Promise<void>;
    onDislike: (restaurantId: string) => Promise<void>;
    currentUser: User;
}

export const RestaurantDiscovery: React.FC<RestaurantDiscoveryProps> = ({ restaurants, onClose, onInterest, onDislike, currentUser }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const currentPos = useRef({ x: 0, y: 0 });
    const [deltaX, setDeltaX] = useState(0);
    
    const resetCardPosition = () => {
        if (cardRef.current) {
            cardRef.current.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            cardRef.current.style.transform = '';
            setDeltaX(0);
            setTimeout(() => {
                if(cardRef.current) cardRef.current.style.transition = '';
            }, 300);
        }
    };
    
    const swipeCard = (direction: 'left' | 'right') => {
        if (currentIndex >= restaurants.length) return;
        
        const restaurant = restaurants[currentIndex];
        
        if (direction === 'right') {
            onInterest(restaurant.id);
        } else {
            onDislike(restaurant.id);
        }

        const rotation = direction === 'right' ? 20 : -20;
        const xTranslate = direction === 'right' ? window.innerWidth : -window.innerWidth;
        
        if (cardRef.current) {
             cardRef.current.style.transition = 'transform 0.5s ease-in';
             cardRef.current.style.transform = `translate(${xTranslate}px, -100px) rotate(${rotation}deg)`;
        }
        
        setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
            if(cardRef.current) {
                 cardRef.current.style.transition = '';
                 cardRef.current.style.transform = '';
                 setDeltaX(0);
            }
        }, 500);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        isDragging.current = true;
        startPos.current = { x: e.clientX, y: e.clientY };
        cardRef.current?.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging.current || !cardRef.current) return;
        currentPos.current = { x: e.clientX, y: e.clientY };
        const dx = currentPos.current.x - startPos.current.x;
        const dy = currentPos.current.y - startPos.current.y;
        setDeltaX(dx);
        cardRef.current.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`;
    };
    
    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        
        const dx = currentPos.current.x - startPos.current.x;

        if (Math.abs(dx) > 100) { // Threshold for swipe
            swipeCard(dx > 0 ? 'right' : 'left');
        } else {
            resetCardPosition();
        }
        
        cardRef.current?.releasePointerCapture(e.pointerId);
    };
    
    const currentRestaurant = currentIndex < restaurants.length ? restaurants[currentIndex] : null;
    const nextRestaurant = currentIndex + 1 < restaurants.length ? restaurants[currentIndex + 1] : null;

    if (restaurants.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
                <h2 className="text-2xl font-bold text-dark">Tudo em dia!</h2>
                <p className="text-slate-600 mt-2">Você já viu todos os restaurantes disponíveis. Volte mais tarde para novas descobertas!</p>
                <Button onClick={onClose} className="mt-6">Voltar</Button>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 overflow-hidden relative">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 absolute top-6">Modo Descoberta</h2>
            
            <div className="relative w-full max-w-sm h-[500px] mb-6 flex items-center justify-center">
                {currentRestaurant ? (
                    <>
                        {nextRestaurant && (
                            <div className="absolute inset-0 transform scale-95 opacity-70">
                                <DiscoveryCard restaurant={nextRestaurant} deltaX={0} />
                            </div>
                        )}
                        <div 
                            ref={cardRef}
                            className="absolute inset-0 cursor-grab active:cursor-grabbing"
                            style={{ touchAction: 'none' }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                        >
                            <DiscoveryCard restaurant={currentRestaurant} deltaX={deltaX} />
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-white rounded-2xl shadow-xl animate-fade-in">
                        <h2 className="text-2xl font-bold text-dark">Fim da Descoberta!</h2>
                        <p className="text-slate-600 mt-2">Você já viu todas as sugestões por enquanto. Dê uma olhada na sua lista de "Quero Ir" para decidir o próximo destino!</p>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-8">
                <Button onClick={() => swipeCard('left')} disabled={!currentRestaurant} className="!rounded-full !p-4 !w-20 !h-20 shadow-lg !bg-white hover:!bg-red-100" title="Não, obrigado">
                    <XMarkIcon className="w-10 h-10 text-red-500" />
                </Button>
                <Button onClick={() => swipeCard('right')} disabled={!currentRestaurant} className="!rounded-full !p-4 !w-20 !h-20 shadow-lg !bg-white hover:!bg-green-100" title="Quero Ir!">
                    <HeartIcon className="w-10 h-10 text-green-500" />
                </Button>
            </div>
            
            <button onClick={onClose} className="absolute top-4 right-4 bg-black/30 p-2 rounded-full text-white hover:bg-black/50 transition-colors">
                <XMarkIcon className="w-5 h-5"/>
            </button>
        </div>
    );
};
