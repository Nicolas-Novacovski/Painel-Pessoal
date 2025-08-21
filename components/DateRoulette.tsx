import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Restaurant, User } from '../types';
import { Button } from './UIComponents';
import { RestaurantCard } from './RestaurantCard';

interface DateRouletteProps {
    restaurants: (Restaurant & { is_favorited: boolean })[];
    currentUser: User;
    onClose: () => void;
    onSelectRestaurant: (restaurant: Restaurant & { is_favorited: boolean }) => void;
    onToggleFavorite: (id: string, currentState: boolean) => Promise<void>;
    onRemoveFromList: (id: string) => Promise<void>;
}

const RouletteItem: React.FC<{ restaurant: Restaurant }> = ({ restaurant }) => (
    <div className="roulette-item">
        <img src={restaurant.image || `https://picsum.photos/seed/${restaurant.id}/300/200`} alt={restaurant.name} />
        <p className="truncate text-dark">{restaurant.name}</p>
    </div>
);

const DateRoulette: React.FC<DateRouletteProps> = ({ restaurants, currentUser, onClose, onSelectRestaurant, onToggleFavorite, onRemoveFromList }) => {
    const [stage, setStage] = useState<'select' | 'spinning' | 'result'>('select');
    const [listToSpin, setListToSpin] = useState<(Restaurant & { is_favorited: boolean })[]>([]);
    const [result, setResult] = useState<(Restaurant & { is_favorited: boolean }) | null>(null);
    const wheelRef = useRef<HTMLDivElement>(null);
    const [spinningList, setSpinningList] = useState<(Restaurant & { is_favorited: boolean })[]>([]);

    const favorites = useMemo(() => restaurants.filter(r => r.is_favorited), [restaurants]);
    const wantToGo = useMemo(() => {
        return restaurants.filter(r => !r.reviews.some(rev => rev.user === currentUser));
    }, [restaurants, currentUser]);

    const startSpinning = (list: (Restaurant & { is_favorited: boolean })[]) => {
        if (list.length === 0) return;
        setListToSpin(list);
        setStage('spinning');

        // 1. Escolhe o restaurante do resultado aleatoriamente da lista de origem.
        const finalResultIndexInSource = Math.floor(Math.random() * list.length);
        const finalResult = list[finalResultIndexInSource];
        setResult(finalResult);

        // 2. Cria uma lista embaralhada para ser usada tanto para girar quanto como segmento final.
        const shuffled = [...list].sort(() => Math.random() - 0.5);
        
        // 3. Garante que a lista seja longa o suficiente para um bom efeito de giro. Pelo menos 50 itens.
        const repeatedShuffled = Array(Math.ceil(50 / shuffled.length)).fill(shuffled).flat();

        // 4. Encontra o índice do nosso resultado escolhido na lista embaralhada.
        const finalResultIndexInShuffled = shuffled.findIndex(r => r.id === finalResult.id);

        // 5. Constrói a lista de giro final. É a longa lista repetida,
        // mas substituímos o segmento final pela nossa lista embaralhada original para garantir
        // que o resultado apareça em uma posição previsível.
        const finalSpinningList = [
            ...repeatedShuffled.slice(0, repeatedShuffled.length - shuffled.length),
            ...shuffled
        ];
        setSpinningList(finalSpinningList);
        
        // 6. Calcula a posição final para parar.
        // Está no último segmento da lista, que é uma cópia de `shuffled`.
        const resultPositionInList = finalSpinningList.length - shuffled.length + finalResultIndexInShuffled;
        
        // Reseta a posição antes de girar para permitir novos giros
        if (wheelRef.current) {
            wheelRef.current.style.transition = 'none';
            wheelRef.current.style.transform = 'translateY(0px)';
        }

        setTimeout(() => {
            if (wheelRef.current) {
                const itemHeight = 200; // como definido no CSS
                const targetY = -(resultPositionInList * itemHeight);
                wheelRef.current.style.transition = 'transform 3s cubic-bezier(0.25, 1, 0.5, 1)';
                wheelRef.current.style.transform = `translateY(${targetY}px)`;
            }
        }, 100);

        setTimeout(() => {
            setStage('result');
        }, 4000); // 3s para animação + 1s de buffer
    };
    
    const handleViewDetails = () => {
        if (result) {
            onSelectRestaurant(result);
            onClose();
        }
    };
    
    return (
        <div className="flex flex-col items-center justify-center p-4 min-h-[60vh] sm:min-h-[auto] w-full max-w-lg mx-auto">
            {stage === 'select' && (
                <div className="text-center animate-fade-in">
                    <h2 className="text-3xl font-bold text-dark mb-2">Roleta do Date</h2>
                    <p className="text-slate-600 mb-8">Não conseguem decidir? Deixem a sorte escolher!</p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button 
                            onClick={() => startSpinning(favorites)} 
                            disabled={favorites.length === 0}
                            size="lg"
                            className="w-full sm:w-auto"
                        >
                            Girar Favoritos ({favorites.length})
                        </Button>
                        <Button 
                            onClick={() => startSpinning(wantToGo)} 
                            disabled={wantToGo.length === 0}
                            variant="accent"
                            size="lg"
                            className="w-full sm:w-auto"
                        >
                            Girar "Quero Ir" ({wantToGo.length})
                        </Button>
                    </div>
                    {favorites.length === 0 && wantToGo.length === 0 && (
                        <p className="text-red-500 mt-4">Nenhum restaurante encontrado nas listas de "Favoritos" ou "Quero Ir".</p>
                    )}
                </div>
            )}
            {(stage === 'spinning' || (stage === 'result' && !result)) && (
                 <div className="text-center animate-fade-in space-y-4">
                     <h2 className="text-2xl font-semibold text-dark">Sorteando...</h2>
                    <div className="roulette-container">
                        <div ref={wheelRef} className="roulette-wheel">
                            {spinningList.map((r, i) => (
                                <RouletteItem key={`${r.id}-${i}`} restaurant={r} />
                            ))}
                        </div>
                        <div className="roulette-shadow-top"></div>
                        <div className="roulette-shadow-bottom"></div>
                        <div className="roulette-highlight"></div>
                    </div>
                 </div>
            )}
            {stage === 'result' && result && (
                <div className="text-center animate-pop-in w-full max-w-md">
                     <h2 className="text-2xl font-bold text-dark mb-1">E o escolhido foi...</h2>
                     <p className="text-slate-500 mb-6">🎉🎉🎉</p>
                     <div className="mb-6">
                        <RestaurantCard 
                            restaurant={result} 
                            onSelect={handleViewDetails}
                            onToggleFavorite={onToggleFavorite}
                            onRemoveFromList={onRemoveFromList}
                            currentUser={currentUser}
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button onClick={() => startSpinning(listToSpin)} variant="secondary" size="lg" className="w-full">Girar Novamente</Button>
                        <Button onClick={handleViewDetails} size="lg" className="w-full">Ver Detalhes</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRoulette;