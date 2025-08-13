import React, { useState } from 'react';
import { Input, Button } from './UIComponents';

interface DatePlannerFormProps {
    onSave: (datetime: string) => void;
    onClose: () => void;
    initialDateTime?: string | null;
    isSaving: boolean;
}

const DatePlannerForm: React.FC<DatePlannerFormProps> = ({ onSave, onClose, initialDateTime, isSaving }) => {
    const getInitialDate = () => {
        if (initialDateTime) {
            return initialDateTime.split('T')[0];
        }
        const today = new Date();
        today.setDate(today.getDate() + 1); // Default to tomorrow
        return today.toISOString().split('T')[0];
    };
    
    const getInitialTime = () => {
        if (initialDateTime) {
            return initialDateTime.split('T')[1].substring(0, 5);
        }
        return '20:00'; // Default to 8 PM
    }

    const [date, setDate] = useState(getInitialDate());
    const [time, setTime] = useState(getInitialTime());

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !time) {
            alert('Por favor, selecione data e hora.');
            return;
        }
        // Combine date and time into a full ISO string
        // We assume local timezone is desired for the proposal
        const localDateTime = new Date(`${date}T${time}`);
        onSave(localDateTime.toISOString());
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="date-proposal" className="font-medium text-slate-700">Data</label>
                    <Input 
                        id="date-proposal" 
                        type="date" 
                        value={date} 
                        onChange={e => setDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]} // Can't select past dates
                        required 
                        className="mt-1"
                    />
                </div>
                <div>
                    <label htmlFor="time-proposal" className="font-medium text-slate-700">Hora</label>
                    <Input 
                        id="time-proposal" 
                        type="time" 
                        value={time} 
                        onChange={e => setTime(e.target.value)} 
                        required 
                        className="mt-1"
                    />
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                    {isSaving ? 'Enviando...' : 'Propor Date'}
                </Button>
            </div>
        </form>
    );
};

export default DatePlannerForm;
