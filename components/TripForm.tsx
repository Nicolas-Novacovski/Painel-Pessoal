import React, { useState, useEffect } from 'react';
import { Trip } from '../types';
import { Input, Button, CurrencyInput, SegmentedControl } from './UIComponents';
import { CameraIcon, XMarkIcon } from './Icons';
import { compressImage } from '../utils/helpers';

interface TripFormProps {
    onSave: (trip: Omit<Trip, 'id' | 'created_at' | 'couple_id' | 'status' | 'checklist'>, imageFile: File | null) => Promise<void>;
    onClose: () => void;
    initialData?: Trip | null;
}

const TripForm: React.FC<TripFormProps> = ({ onSave, onClose, initialData = null }) => {
    const isEditMode = !!initialData;
    const [name, setName] = useState('');
    const [destination, setDestination] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [budget, setBudget] = useState<number | null>(null);
    const [travelers, setTravelers] = useState(2);
    
    // Image state
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);

    // Loading states
    const [isSaving, setIsSaving] = useState(false);
    const [isCompressing, setIsCompressing] = useState(false);

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setDestination(initialData.destination || '');
            setStartDate(initialData.start_date || '');
            setEndDate(initialData.end_date || '');
            setBudget(initialData.budget || null);
            setTravelers(initialData.travelers || 2);
            setCurrentImageUrl(initialData.cover_image_url || null);
            setImagePreview(initialData.cover_image_url || null);
        }
    }, [initialData]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsCompressing(true);
            setImageFile(null);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file); // Show original for speed
            try {
                const compressedFile = await compressImage(file, 1280, 0.7);
                setImageFile(compressedFile);
                setCurrentImageUrl(null); // Clear existing URL if a file is chosen
            } catch (error) {
                console.error("Error compressing image:", error);
                alert("Houve um problema ao processar a imagem.");
                removeImage();
            } finally {
                setIsCompressing(false);
            }
        }
    };
    
    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
        setCurrentImageUrl(null);
        const fileInput = document.getElementById('trip-cover-image') as HTMLInputElement;
        if(fileInput) fileInput.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) { 
            alert('O nome da viagem é obrigatório.'); 
            return; 
        }
        setIsSaving(true);
    
        const tripData: Omit<Trip, 'id' | 'created_at' | 'couple_id' | 'status' | 'checklist'> = {
            name,
            destination: destination || null,
            start_date: startDate || null,
            end_date: endDate || null,
            cover_image_url: currentImageUrl, // Pass current URL for replacement logic
            budget: budget,
            travelers,
        };
    
        await onSave(tripData, imageFile);
        
        setIsSaving(false);
        onClose();
    };

    const isBusy = isSaving || isCompressing;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label htmlFor="trip-name" className="font-medium text-slate-700">Nome da Viagem *</label>
                <Input id="trip-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Aventura na Patagônia" required disabled={isBusy} />
            </div>
             <div>
                <label htmlFor="trip-destination" className="font-medium text-slate-700">Destino</label>
                <Input id="trip-destination" type="text" value={destination} onChange={e => setDestination(e.target.value)} placeholder="Ex: El Calafate, Argentina" disabled={isBusy} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="trip-start" className="font-medium text-slate-700">Data de Início</label>
                    <Input id="trip-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={isBusy} />
                </div>
                 <div>
                    <label htmlFor="trip-end" className="font-medium text-slate-700">Data de Fim</label>
                    <Input id="trip-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isBusy} />
                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                    <label htmlFor="trip-budget" className="font-medium text-slate-700">Orçamento Total (opcional)</label>
                    <CurrencyInput id="trip-budget" value={budget || 0} onValueChange={(value) => setBudget(value > 0 ? value : null)} disabled={isBusy} />
                </div>
                 <div>
                    <label className="font-medium text-slate-700 block mb-1">Viajantes</label>
                    <SegmentedControl
                        value={travelers === 1 ? '1' : '2'}
                        onChange={(value) => setTravelers(Number(value))}
                        options={[
                            { label: '1 Pessoa', value: '1' },
                            { label: '2 Pessoas', value: '2' },
                        ]}
                    />
                </div>
            </div>


            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Foto de Capa</label>
                <label htmlFor="trip-cover-image" className="w-full cursor-pointer justify-center px-4 py-2 text-base font-semibold transition-all duration-200 ease-in-out bg-slate-200 text-slate-800 hover:bg-slate-300 rounded-lg flex items-center gap-2">
                    <CameraIcon className="w-5 h-5" />
                    <span>Escolher arquivo</span>
                    <input id="trip-cover-image" type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isBusy} />
                </label>
            </div>
             {(imagePreview || isCompressing) && (
                <div className="relative group mt-2 w-full h-40 bg-slate-100 rounded-lg flex items-center justify-center">
                    {imagePreview && <img src={imagePreview} alt="Pré-visualização da capa" className="w-full h-full object-cover rounded-lg"/>}
                    <button type="button" onClick={removeImage} className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600" disabled={isBusy} title="Remover Imagem">
                        <XMarkIcon className="w-4 h-4"/>
                    </button>
                    {isCompressing && (
                         <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                            <p className="font-semibold text-primary">Otimizando...</p>
                         </div>
                    )}
                </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isBusy}>
                    {isSaving ? 'Salvando...' : (isEditMode ? 'Salvar Alterações' : 'Criar Viagem')}
                </Button>
            </div>
        </form>
    );
};

export default TripForm;