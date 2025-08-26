import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { UserProfile, Trip, TripStatus, ChecklistItem } from '../types';
import { Button, Modal } from './UIComponents';
import { PlusIcon, PaperAirplaneIcon, EllipsisVerticalIcon, PencilIcon, TrashIcon } from './Icons';
import TripForm from './TripForm';
import TripDetailView from './TripDetailView';
import { slugify } from '../utils/helpers';

const DEFAULT_CHECKLIST: ChecklistItem[] = [
    { id: crypto.randomUUID(), text: 'Documentos', is_done: false, is_heading: true },
    { id: crypto.randomUUID(), text: 'Passaportes e Vistos', is_done: false },
    { id: crypto.randomUUID(), text: 'RG ou CNH', is_done: false },
    { id: crypto.randomUUID(), text: 'Comprovantes de vacinação', is_done: false },
    { id: crypto.randomUUID(), text: 'Reservas e Passagens', is_done: false, is_heading: true },
    { id: crypto.randomUUID(), text: 'Passagens aéreas/ônibus/trem', is_done: false },
    { id: crypto.randomUUID(), text: 'Reservas de hotel/hospedagem', is_done: false },
    { id: crypto.randomUUID(), text: 'Aluguel de carro', is_done: false },
    { id: crypto.randomUUID(), text: 'Financeiro', is_done: false, is_heading: true },
    { id: crypto.randomUUID(), text: 'Dinheiro em espécie (moeda local)', is_done: false },
    { id: crypto.randomUUID(), text: 'Cartões de crédito/débito', is_done: false },
    { id: crypto.randomUUID(), text: 'Seguro viagem', is_done: false },
    { id: crypto.randomUUID(), text: 'Roupas e Acessórios', is_done: false, is_heading: true },
    { id: crypto.randomUUID(), text: 'Roupas adequadas para o clima', is_done: false },
    { id: crypto.randomUUID(), text: 'Calçados confortáveis', is_done: false },
    { id: crypto.randomUUID(), text: 'Óculos de sol e chapéu', is_done: false },
    { id: crypto.randomUUID(), text: 'Saúde e Higiene', is_done: false, is_heading: true },
    { id: crypto.randomUUID(), text: 'Itens de higiene pessoal', is_done: false },
    { id: crypto.randomUUID(), text: 'Remédios de uso contínuo', is_done: false },
    { id: crypto.randomUUID(), text: 'Kit de primeiros socorros', is_done: false },
    { id: crypto.randomUUID(), text: 'Protetor solar e repelente', is_done: false },
    { id: crypto.randomUUID(), text: 'Eletrônicos', is_done: false, is_heading: true },
    { id: crypto.randomUUID(), text: 'Celular e carregador', is_done: false },
    { id: crypto.randomUUID(), text: 'Carregador portátil (power bank)', is_done: false },
    { id: crypto.randomUUID(), text: 'Adaptador de tomada universal', is_done: false },
];

const TRAVEL_SETUP_SQL = `
-- SCRIPT DE CONFIGURAÇÃO PARA O MÓDULO DE VIAGENS
-- Este script cria todas as tabelas necessárias para o planejador de viagens e configura o armazenamento de imagens.
BEGIN;

-- 1. Tabela Principal de Viagens (trips)
CREATE TABLE IF NOT EXISTS public.trips (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL,
    destination text NULL,
    start_date date NULL,
    end_date date NULL,
    cover_image_url text NULL,
    status text NOT NULL DEFAULT 'planning', -- 'planning', 'upcoming', 'completed', 'cancelled'
    budget numeric NULL,
    couple_id text NOT NULL,
    checklist jsonb NULL,
    travelers smallint NOT NULL DEFAULT 2,
    CONSTRAINT trips_pkey PRIMARY KEY (id)
);
-- Adiciona colunas se não existirem, para garantir compatibilidade com schemas antigos.
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS checklist jsonb NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS travelers smallint NOT NULL DEFAULT 2;
ALTER TABLE public.trips DISABLE ROW LEVEL SECURITY;

-- 2. Tabela de Itens do Roteiro (trip_itinerary_items)
CREATE TABLE IF NOT EXISTS public.trip_itinerary_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    item_date date NOT NULL,
    start_time time NULL,
    end_time time NULL,
    category text NOT NULL, -- 'activity', 'flight', 'accommodation', 'food', 'transport'
    description text NOT NULL,
    details jsonb NULL, -- Para nº de reserva, endereço, etc.
    is_completed boolean NOT NULL DEFAULT false,
    cost numeric NULL,
    CONSTRAINT trip_itinerary_items_pkey PRIMARY KEY (id)
);
ALTER TABLE public.trip_itinerary_items DISABLE ROW LEVEL SECURITY;

-- 3. Tabela de Despesas da Viagem (trip_expenses)
CREATE TABLE IF NOT EXISTS public.trip_expenses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    description text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL, -- 'transport', 'accommodation', 'food', 'activities', 'shopping', 'other'
    payment_date date NOT NULL,
    user_email text NULL,
    itinerary_item_id uuid NULL,
    CONSTRAINT trip_expenses_pkey PRIMARY KEY (id)
);
ALTER TABLE public.trip_expenses DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'trip_expenses_itinerary_item_id_fkey' AND conrelid = 'public.trip_expenses'::regclass
    ) THEN
        ALTER TABLE public.trip_expenses 
        ADD CONSTRAINT trip_expenses_itinerary_item_id_fkey 
        FOREIGN KEY (itinerary_item_id) 
        REFERENCES public.trip_itinerary_items(id) 
        ON DELETE SET NULL;
    END IF;
END
$$;


-- 4. Tabela da Galeria de Imagens (trip_gallery_items)
CREATE TABLE IF NOT EXISTS public.trip_gallery_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    caption text NULL,
    is_inspiration boolean NOT NULL DEFAULT false, -- true para fotos de planejamento, false para fotos da viagem
    CONSTRAINT trip_gallery_items_pkey PRIMARY KEY (id)
);
ALTER TABLE public.trip_gallery_items DISABLE ROW LEVEL SECURITY;

-- --- CONFIGURAÇÃO DAS PERMISSÕES DO BUCKET DE IMAGENS ---
-- Estas políticas garantem que o aplicativo possa fazer upload e exibir imagens.

DROP POLICY IF EXISTS "Public Read for Trip Images" ON storage.objects;
CREATE POLICY "Public Read for Trip Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'trip-images');

DROP POLICY IF EXISTS "Public Upload for Trip Images" ON storage.objects;
CREATE POLICY "Public Upload for Trip Images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'trip-images');

DROP POLICY IF EXISTS "Public Update for Trip Images" ON storage.objects;
CREATE POLICY "Public Update for Trip Images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'trip-images');

DROP POLICY IF EXISTS "Public Delete for Trip Images" ON storage.objects;
CREATE POLICY "Public Delete for Trip Images"
ON storage.objects FOR DELETE
USING (bucket_id = 'trip-images');

COMMIT;
`;

const DatabaseErrorResolver: React.FC = () => (
    <div className="p-4 m-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg">
        <h4 className="font-semibold text-red-900">Configuração Necessária</h4>
        <p className="text-sm text-red-800 mt-1">
            A funcionalidade de 'Viagens' não pode ser carregada. Isso geralmente ocorre porque as tabelas do banco de dados ainda não foram criadas.
            O script abaixo criará tudo o que é necessário.
        </p>
        <div className="mt-4">
             <p className="text-xs text-slate-600 mb-2">
                Copie o código SQL, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase e clique em "RUN". Não se esqueça de criar um bucket público no Storage chamado `trip-images`.
            </p>
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{TRAVEL_SETUP_SQL.trim()}</code>
            </pre>
        </div>
    </div>
);

interface TravelAppProps {
    currentUser: UserProfile;
}

const TravelApp: React.FC<TravelAppProps> = ({ currentUser }) => {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dbError, setDbError] = useState(false);
    const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
    const [openMenuTripId, setOpenMenuTripId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuTripId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);


    const fetchTrips = useCallback(async () => {
        if (!currentUser.couple_id) {
             console.error("User does not have a couple_id.");
             setIsLoading(false);
             return;
        }

        setIsLoading(true);
        setDbError(false);
        try {
            const { data, error } = await supabase
                .from('trips')
                .select('*')
                .eq('couple_id', currentUser.couple_id);

            if (error) {
                if (error.code === '42P01') {
                    setDbError(true);
                } else {
                    throw error;
                }
            } else {
                setTrips(data as Trip[]);
            }
        } catch (error: any) {
            console.error('Error fetching trips:', error);
            alert(`Erro ao buscar viagens: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [currentUser.couple_id]);

    useEffect(() => {
        fetchTrips();
    }, [fetchTrips]);

    const handleSaveTrip = async (tripData: Omit<Trip, 'id' | 'created_at' | 'couple_id' | 'status' | 'checklist'>, imageFile: File | null) => {
        let imageUrl = tripData.cover_image_url;

        try {
            if (imageFile) {
                if (editingTrip?.cover_image_url) {
                    const oldImagePath = new URL(editingTrip.cover_image_url).pathname.split('/trip-images/')[1];
                    if (oldImagePath) await supabase.storage.from('trip-images').remove([oldImagePath]);
                }
                const fileName = `${slugify(tripData.name)}-${Date.now()}.jpg`;
                const { data: uploadData, error: uploadError } = await supabase.storage.from('trip-images').upload(fileName, imageFile);
                if (uploadError) throw uploadError;
                imageUrl = supabase.storage.from('trip-images').getPublicUrl(uploadData.path).data.publicUrl;
            } else if (!imageUrl && editingTrip?.cover_image_url) {
                 const oldImagePath = new URL(editingTrip.cover_image_url).pathname.split('/trip-images/')[1];
                 if (oldImagePath) await supabase.storage.from('trip-images').remove([oldImagePath]);
            }

            const dataToSave = { ...tripData, cover_image_url: imageUrl };

            if (editingTrip) {
                const { error } = await supabase.from('trips').update(dataToSave).eq('id', editingTrip.id);
                if (error) throw error;
                 if (selectedTrip?.id === editingTrip.id) {
                    setSelectedTrip(prev => prev ? { ...prev, ...dataToSave } : null);
                }
            } else {
                const { error } = await supabase.from('trips').insert([{ ...dataToSave, couple_id: currentUser.couple_id!, status: 'planning', checklist: DEFAULT_CHECKLIST }]);
                if (error) throw error;
            }

            await fetchTrips();

        } catch (error: any) {
            console.error("Error saving trip:", error);
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('column "checklist" does not exist') || msg.includes("could not find the 'checklist' column")) {
                setDbError(true);
            } else {
                alert(`Erro ao salvar viagem: ${error.message}`);
            }
        }
    };

    const handleEditTrip = (tripToEdit: Trip) => {
        setEditingTrip(tripToEdit);
        setIsModalOpen(true);
        setOpenMenuTripId(null);
    };

    const handleDeleteTrip = async (tripToDelete: Trip) => {
        if (!window.confirm(`Tem certeza que deseja apagar a viagem "${tripToDelete.name}"? Esta ação não pode ser desfeita.`)) return;

        try {
            if (tripToDelete.cover_image_url) {
                const oldImagePath = new URL(tripToDelete.cover_image_url).pathname.split('/trip-images/')[1];
                if (oldImagePath) {
                    await supabase.storage.from('trip-images').remove([oldImagePath]);
                }
            }
            const { error } = await supabase.from('trips').delete().eq('id', tripToDelete.id);
            if (error) throw error;

            setTrips(prev => prev.filter(t => t.id !== tripToDelete.id));
            if (selectedTrip?.id === tripToDelete.id) {
                setSelectedTrip(null);
            }
            setOpenMenuTripId(null);
        } catch (error: any) {
            console.error("Error deleting trip:", error);
            alert(`Erro ao apagar viagem: ${error.message}`);
        }
    };
    
    const sortedTrips = useMemo(() => {
        return [...trips].sort((a, b) => {
            const dateA = a.start_date ? new Date(a.start_date).getTime() : null;
            const dateB = b.start_date ? new Date(b.start_date).getTime() : null;
            const now = new Date().setHours(0, 0, 0, 0);

            if (dateA && dateA >= now) {
                if (dateB && dateB >= now) return dateA - dateB;
                return -1;
            }
            if (dateB && dateB >= now) return 1;

            if (!dateA && dateB) return 1;
            if (dateA && !dateB) return -1;
            if (!dateA && !dateB) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

            return dateB! - dateA!;
        });
    }, [trips]);

    if (isLoading) {
        return <div className="p-6 text-center text-slate-500">Carregando seus planos de viagem...</div>;
    }

    if (dbError) {
        return <DatabaseErrorResolver />;
    }
    
    const formatDateRange = (startDate: string | null, endDate: string | null) => {
        if (!startDate) return 'A definir';
        const start = new Date(startDate + 'T00:00:00');
        const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
        
        if (!endDate || startDate === endDate) {
            return start.toLocaleDateString('pt-BR', options);
        }
        
        const end = new Date(endDate + 'T00:00:00');
        return `${start.toLocaleDateString('pt-BR', options)} - ${end.toLocaleDateString('pt-BR', options)}`;
    };

    return (
        <>
            {selectedTrip ? (
                <TripDetailView 
                    trip={selectedTrip} 
                    onBack={() => setSelectedTrip(null)} 
                    onTripUpdate={(updatedTrip) => {
                        setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
                        setSelectedTrip(updatedTrip);
                    }}
                    onEdit={handleEditTrip}
                    onDelete={handleDeleteTrip}
                />
            ) : (
                <div className="p-4 sm:p-8">
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="text-4xl font-bold text-dark flex items-center gap-3">
                            <PaperAirplaneIcon className="w-8 h-8 text-primary"/>
                            Suas Viagens
                        </h1>
                        <Button onClick={() => { setEditingTrip(null); setIsModalOpen(true); }}>
                            <PlusIcon className="w-5 h-5" />
                            Planejar Nova Viagem
                        </Button>
                    </div>

                    {sortedTrips.length === 0 ? (
                        <div className="text-center p-12 bg-white rounded-2xl shadow-subtle border-2 border-dashed border-slate-200">
                            <h2 className="text-2xl font-bold text-dark">Nenhuma aventura no horizonte?</h2>
                            <p className="mt-2 max-w-lg mx-auto text-slate-600">
                                Sua próxima grande viagem começa com um simples plano. Clique no botão abaixo para começar a sonhar e organizar.
                            </p>
                            <Button onClick={() => { setEditingTrip(null); setIsModalOpen(true); }} className="mt-6">
                                <PlusIcon className="w-5 h-5"/>
                                Criar Minha Primeira Viagem
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {sortedTrips.map(trip => (
                                <div key={trip.id} className="bg-white rounded-2xl shadow-subtle transition-all duration-300 hover:shadow-subtle-hover group hover:-translate-y-1.5 flex flex-col relative">
                                    <div onClick={() => setSelectedTrip(trip)} className="cursor-pointer h-full flex flex-col">
                                        <div className="h-48 w-full overflow-hidden relative rounded-t-2xl bg-slate-200">
                                            <img src={trip.cover_image_url || `https://picsum.photos/seed/${trip.id}/400/300`} alt={trip.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                            <div className="absolute bottom-4 left-4 text-white">
                                                <h3 className="text-2xl font-bold drop-shadow-lg">{trip.name}</h3>
                                                <p className="text-sm drop-shadow-md">{trip.destination}</p>
                                            </div>
                                        </div>
                                        <div className="p-4 flex-grow flex flex-col justify-between">
                                            <div className="text-center text-sm font-semibold text-slate-600">
                                                <span>{formatDateRange(trip.start_date, trip.end_date)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="absolute top-3 right-3 z-10">
                                        <div ref={openMenuTripId === trip.id ? menuRef : null}>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="!rounded-full !p-2 !bg-black/40 !text-white hover:!bg-black/60"
                                                onClick={(e) => { e.stopPropagation(); setOpenMenuTripId(prev => prev === trip.id ? null : trip.id); }}
                                            >
                                                <EllipsisVerticalIcon className="w-5 h-5" />
                                            </Button>
                                            {openMenuTripId === trip.id && (
                                                <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg py-1 border border-slate-200 animate-fade-in">
                                                    <button onClick={() => handleEditTrip(trip)} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                                                        <PencilIcon className="w-4 h-4" /> Editar
                                                    </button>
                                                    <button onClick={() => handleDeleteTrip(trip)} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                                        <TrashIcon className="w-4 h-4" /> Apagar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

             <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingTrip ? "Editar Viagem" : "Planejar Nova Viagem"}
            >
                <TripForm 
                    onSave={handleSaveTrip}
                    onClose={() => { setIsModalOpen(false); setEditingTrip(null); }}
                    initialData={editingTrip}
                />
            </Modal>
        </>
    );
};

export default TravelApp;
