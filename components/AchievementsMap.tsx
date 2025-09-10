import React, { useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Restaurant } from '../types';
import L from 'leaflet';
import 'leaflet.markercluster';

import { StarRatingDisplay } from './UIComponents';
import { averageRating } from '../utils/helpers';
import { GoogleIcon, StarIcon } from './Icons';

// FIX: Add module augmentation for leaflet.markercluster to provide missing types.
// This resolves errors related to MarkerClusterGroup and markerClusterGroup not being found on the Leaflet namespace.
declare module 'leaflet' {
    interface MarkerClusterGroupOptions extends L.LayerOptions {
        showCoverageOnHover?: boolean;
        zoomToBoundsOnClick?: boolean;
        spiderfyOnMaxZoom?: boolean;
        removeOutsideVisibleBounds?: boolean;
        animate?: boolean;
        animateAddingMarkers?: boolean;
        disableClusteringAtZoom?: number;
        maxClusterRadius?: number | ((zoom: number) => number);
        polygonOptions?: L.PolylineOptions;
        singleMarkerMode?: boolean;
        spiderfyDistanceMultiplier?: number;
        spiderLegPolylineOptions?: L.PolylineOptions;
        iconCreateFunction?: (cluster: MarkerCluster) => L.DivIcon;
        chunkedLoading?: boolean;
        chunkInterval?: number;
        chunkDelay?: number;
        chunkProgress?: (processed: number, total: number, time: number) => void;
    }

    interface MarkerCluster extends L.Marker {
        getChildCount(): number;
        getAllChildMarkers(): L.Marker[];
        getBounds(): L.LatLngBounds;
        getLatLng(): L.LatLng;
    }

    class MarkerClusterGroup extends L.FeatureGroup {
        constructor(options?: MarkerClusterGroupOptions);
        addLayer(layer: L.Layer): this;
        removeLayer(layer: L.Layer): this;
        clearLayers(): this;
        getAllChildMarkers(): L.Marker[];
        getChildCount(): number;
        zoomToShowLayer(layer: L.Layer, callback?: () => void): void;
        hasLayer(layer: L.Layer): boolean;
        getVisibleParent(marker: L.Marker): L.Marker | null;
    }

    function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}

interface AchievementsMapProps {
    restaurants: (Restaurant & { is_favorited: boolean })[];
    onSelectRestaurant: (restaurant: Restaurant & { is_favorited: boolean }) => void;
}

// Corrige o problema do ícone padrão do Leaflet no React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Um componente React para o conteúdo do popup, para que possamos lidar com os cliques facilmente
const PopupContent: React.FC<{ restaurant: Restaurant & { is_favorited: boolean }, onSelectRestaurant: (r: Restaurant & { is_favorited: boolean }) => void }> = ({ restaurant, onSelectRestaurant }) => {
    const ourRating = useMemo(() => averageRating(restaurant.reviews), [restaurant.reviews]);

    return (
        <div className="w-48 text-center font-sans">
            <img src={restaurant.image || `https://picsum.photos/seed/${restaurant.id}/200/100`} alt={restaurant.name} className="w-full h-24 object-cover rounded-t-md bg-slate-200" />
            <div className="p-2">
                <p className="font-bold text-base text-dark truncate mb-2">{restaurant.name}</p>
                <div className="flex flex-col items-center gap-1 text-xs">
                    {ourRating > 0 && (
                        <div className="flex items-center gap-1">
                            <StarRatingDisplay rating={ourRating} />
                            <span className="font-semibold text-slate-600">({ourRating.toFixed(1)})</span>
                        </div>
                    )}
                    {restaurant.google_rating && (
                         <div className="flex items-center gap-1">
                            <GoogleIcon className="w-3 h-3"/>
                            <StarIcon className="w-3 h-3 text-yellow-400" />
                            <span className="font-semibold text-slate-600">{restaurant.google_rating.toFixed(1)}</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation(); // Previne eventos de clique do mapa
                        onSelectRestaurant(restaurant);
                    }}
                    className="mt-3 w-full text-sm font-semibold text-white bg-primary hover:bg-primary-focus px-3 py-1 rounded-md transition-colors active:scale-95"
                >
                    Ver Detalhes
                </button>
            </div>
        </div>
    );
};

const getPinColorByRating = (rating: number | null | undefined): string => {
    if (rating === null || rating === undefined) return '#94a3b8'; // slate-400 for no rating
    if (rating >= 4.5) return '#16a34a'; // green-600
    if (rating >= 4.0) return '#65a30d'; // lime-600
    if (rating >= 3.5) return '#f59e0b'; // amber-500
    if (rating >= 3.0) return '#ea580c'; // orange-600
    return '#dc2626'; // red-600
};


const AchievementsMap: React.FC<AchievementsMapProps> = ({ restaurants, onSelectRestaurant }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.MarkerClusterGroup | null>(null);

    const restaurantsWithCoords = useMemo(() => {
        return restaurants.filter(r => 
            r.locations && r.locations.length > 0 && r.locations[0].latitude && r.locations[0].longitude
        );
    }, [restaurants]);
    
    // Efeito de inicialização do mapa
    useEffect(() => {
        if (mapRef.current === null && mapContainerRef.current) {
            mapRef.current = L.map(mapContainerRef.current, {
                scrollWheelZoom: true,
            });

            L.tileLayer(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
            ).addTo(mapRef.current);
            
            markersRef.current = L.markerClusterGroup().addTo(mapRef.current);
        }
        
        const map = mapRef.current;
        if (map) {
            const timer = setTimeout(() => {
                map.invalidateSize();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, []);

    // Atualiza marcadores e limites quando os dados mudam
    useEffect(() => {
        const map = mapRef.current;
        const markers = markersRef.current;
        if (!map || !markers) return;

        markers.clearLayers();
        
        if (restaurantsWithCoords.length === 0) {
            map.setView([-25.4284, -49.2733], 13);
            return;
        }
        
        restaurantsWithCoords.forEach(restaurant => {
            const { latitude, longitude } = restaurant.locations[0];
            if (latitude && longitude) {
                const color = getPinColorByRating(restaurant.google_rating);

                const iconHtml = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" style="width: 28px; height: 36px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                        <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z" fill="${color}"/>
                        <circle cx="192" cy="192" r="64" fill="white"/>
                    </svg>
                `;
                
                const customIcon = L.divIcon({
                    html: iconHtml,
                    className: 'custom-leaflet-icon',
                    iconSize: [28, 36],
                    iconAnchor: [14, 36],
                    popupAnchor: [0, -40],
                });
                
                const marker = L.marker([latitude, longitude], { icon: customIcon });

                const popupContainer = document.createElement('div');
                const root = createRoot(popupContainer);
                root.render(<PopupContent restaurant={restaurant} onSelectRestaurant={onSelectRestaurant} />);

                marker.bindPopup(popupContainer, {
                    minWidth: 200,
                });
                
                markers.addLayer(marker);
            }
        });

        const bounds = markers.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }, [restaurantsWithCoords, onSelectRestaurant]);


    return <div ref={mapContainerRef} className="w-full h-[calc(100vh-220px)] rounded-xl" />;
};

export default AchievementsMap;
