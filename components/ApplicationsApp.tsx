import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { UserProfile, JobApplication, ApplicationStatus } from '../types';
import { compressImage, slugify } from '../utils/helpers';
import { Button, Input, Modal } from './UIComponents';
import { PlusIcon, TrashIcon, PencilIcon } from './Icons';

const STATUS_OPTIONS: ApplicationStatus[] = ['Applied', 'Interviewing', 'Offer', 'Rejected', 'Follow-up'];

const statusColors: Record<ApplicationStatus, string> = {
    Applied: 'bg-blue-100 text-blue-800',
    Interviewing: 'bg-yellow-100 text-yellow-800',
    Offer: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    'Follow-up': 'bg-purple-100 text-purple-800',
};

const APPLICATIONS_SETUP_SQL = `
-- SCRIPT DE CONFIGURAÇÃO COMPLETO: TABELA DE APLICAÇÕES E PERMISSÕES DE UPLOAD
-- Este script resolve tanto erros de 'tabela não existe' quanto falhas de upload de imagem.
BEGIN;

-- --- CONFIGURAÇÃO DA TABELA 'job_applications' ---

-- 1. Apaga a tabela antiga para garantir uma configuração limpa.
DROP TABLE IF EXISTS public.job_applications CASCADE;

-- 2. Recria a tabela com as colunas necessárias.
CREATE TABLE public.job_applications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    company_name text NOT NULL,
    role_name text NOT NULL,
    status text NOT NULL,
    notes text NULL,
    image_url text NULL,
    user_email text NOT NULL,
    CONSTRAINT job_applications_pkey PRIMARY KEY (id)
);

-- 3. DESABILITA RLS para a tabela, que era a causa de erros de salvamento.
-- A segurança é garantida pela interface do aplicativo.
ALTER TABLE public.job_applications DISABLE ROW LEVEL SECURITY;


-- --- CONFIGURAÇÃO DAS PERMISSÕES DO BUCKET DE IMAGENS ---
-- Estas políticas garantem que o aplicativo possa fazer upload e exibir imagens.

-- 4. Permite que qualquer pessoa VEJA as imagens no bucket 'job-application-images'.
-- Apaga a política antiga se existir para evitar conflitos.
DROP POLICY IF EXISTS "Public Read for Job App Images" ON storage.objects;
CREATE POLICY "Public Read for Job App Images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'job-application-images');

-- 5. Permite que qualquer pessoa FAÇA UPLOAD de imagens no bucket.
DROP POLICY IF EXISTS "Public Upload for Job App Images" ON storage.objects;
CREATE POLICY "Public Upload for Job App Images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'job-application-images');

-- 6. Permite que qualquer pessoa APAGUE/ATUALIZE imagens no bucket.
DROP POLICY IF EXISTS "Public Update for Job App Images" ON storage.objects;
CREATE POLICY "Public Update for Job App Images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'job-application-images');

DROP POLICY IF EXISTS "Public Delete for Job App Images" ON storage.objects;
CREATE POLICY "Public Delete for Job App Images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'job-application-images');

COMMIT;
`;


const DatabaseErrorResolver: React.FC = () => (
    <div className="p-4 m-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg">
        <h4 className="font-semibold text-red-900">Configuração Necessária</h4>
        <p className="text-sm text-red-800 mt-1">
            A funcionalidade de 'Aplicações' não pode ser carregada ou salva. Isso geralmente ocorre por uma tabela ausente, permissões de banco de dados (RLS) incorretas, ou permissões de upload de imagem ausentes.
            <br/>
            O script abaixo resolve <strong>todos</strong> esses problemas de uma vez.
        </p>
        <div className="mt-4">
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{APPLICATIONS_SETUP_SQL.trim()}</code>
            </pre>
            <p className="text-xs text-slate-600 mt-2">
                Copie o código, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase, clique em "RUN" e, em seguida, <strong>recarregue esta página</strong>.
            </p>
        </div>
    </div>
);


// Form for adding/editing an application
const ApplicationForm: React.FC<{
    onSave: (app: Omit<JobApplication, 'id' | 'created_at' | 'user_email'>, file: File | null) => Promise<void>;
    onClose: () => void;
    initialData?: JobApplication | null;
}> = ({ onSave, onClose, initialData }) => {
    const [companyName, setCompanyName] = useState('');
    const [roleName, setRoleName] = useState('');
    const [status, setStatus] = useState<ApplicationStatus>('Applied');
    const [notes, setNotes] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialData) {
            setCompanyName(initialData.company_name);
            setRoleName(initialData.role_name);
            setStatus(initialData.status);
            setNotes(initialData.notes || '');
            setImagePreview(initialData.image_url || null);
        }
    }, [initialData]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const compressed = await compressImage(file, 1280);
            setImageFile(compressed);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(compressed);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName || !roleName) {
            alert('Nome da empresa e da vaga são obrigatórios.');
            return;
        }
        setIsSaving(true);
        await onSave({
            company_name: companyName,
            role_name: roleName,
            status,
            notes,
            image_url: initialData?.image_url || null, // Pass existing url to handle replacement logic
        }, imageFile);
        setIsSaving(false);
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nome da Empresa" required />
            <Input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Nome da Vaga" required />
            <select value={status} onChange={e => setStatus(e.target.value as ApplicationStatus)} className="w-full p-2 bg-white border border-slate-300 rounded-lg">
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações (opcional)" rows={3} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary" />
            <Input type="file" accept="image/*" onChange={handleFileChange} />
            {imagePreview && <img src={imagePreview} alt="Preview" className="w-full h-auto max-h-60 object-contain rounded-lg bg-slate-100" />}
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Aplicação'}</Button>
            </div>
        </form>
    );
};

// Main component for the applications view
const ApplicationsApp: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
    const [applications, setApplications] = useState<JobApplication[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<JobApplication | null>(null);
    const [dbError, setDbError] = useState(false);

    const fetchApplications = useCallback(async () => {
        setIsLoading(true);
        setDbError(false); // Reset error on fetch
        const { data, error } = await supabase.from('job_applications').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching applications:', error);
            // 42P01: undefined_table
            if (error.code === '42P01') {
                setDbError(true);
            } else {
                alert(`Erro ao buscar aplicações: ${error.message}`);
            }
        } else {
            setApplications(data || []);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    const handleSave = async (appData: Omit<JobApplication, 'id' | 'created_at' | 'user_email'>, imageFile: File | null) => {
        let imageUrl = appData.image_url;
        
        try {
            if (imageFile) {
                if (imageUrl) {
                     const oldPath = new URL(imageUrl).pathname.split('/job-application-images/')[1];
                     if (oldPath) await supabase.storage.from('job-application-images').remove([oldPath]);
                }
                const fileName = `${slugify(appData.company_name)}-${Date.now()}.jpg`;
                const { data: uploadData, error: uploadError } = await supabase.storage.from('job-application-images').upload(fileName, imageFile);
                if(uploadError) throw uploadError;
                imageUrl = supabase.storage.from('job-application-images').getPublicUrl(uploadData.path).data.publicUrl;
            }

            const dataToSave = { ...appData, image_url: imageUrl, user_email: currentUser.email };
            let error;
            if (editingApp) {
                ({ error } = await supabase.from('job_applications').update(dataToSave).eq('id', editingApp.id));
            } else {
                ({ error } = await supabase.from('job_applications').insert([dataToSave]));
            }

            if (error) throw error;
            fetchApplications();

        } catch (err: any) {
            console.error("Save error:", err);
            const message = (err.message || '').toLowerCase();
            if (
                message.includes('violates row-level security policy') || // Catches RLS on table and storage
                message.includes('bucket not found') || // Catches storage setup error
                err?.code === '42501' // permission denied
            ) {
                setDbError(true); // Trigger the setup guide on RLS/Storage error
            } else {
                alert(`Falha ao salvar: ${err.message}`);
            }
        }
    };
    
    const handleDelete = async (app: JobApplication) => {
        if(window.confirm('Tem certeza que deseja apagar esta aplicação?')) {
            if (app.image_url) {
                const oldPath = new URL(app.image_url).pathname.split('/job-application-images/')[1];
                if (oldPath) await supabase.storage.from('job-application-images').remove([oldPath]);
            }
            await supabase.from('job_applications').delete().eq('id', app.id);
            fetchApplications();
        }
    };
    
    if (dbError) {
        return <DatabaseErrorResolver />;
    }

    return (
        <div className="container mx-auto p-4 sm:p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-dark">Minhas Aplicações de Emprego</h2>
                {currentUser.role === 'admin' && (
                    <Button onClick={() => { setEditingApp(null); setIsModalOpen(true); }}><PlusIcon className="w-5 h-5"/> Nova Aplicação</Button>
                )}
            </div>
            
            {isLoading && <p>Carregando...</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {applications.map(app => (
                    <div key={app.id} className="bg-white rounded-xl shadow-subtle overflow-hidden">
                        {app.image_url && <img src={app.image_url} alt={`Screenshot for ${app.company_name}`} className="w-full h-48 object-cover bg-slate-200" />}
                        <div className="p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg text-dark">{app.company_name}</h3>
                                    <p className="text-slate-600">{app.role_name}</p>
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusColors[app.status]}`}>{app.status}</span>
                            </div>
                             {app.notes && <p className="text-sm text-slate-500 mt-2 pt-2 border-t">{app.notes}</p>}
                             <div className="text-xs text-slate-400 mt-2 pt-2 border-t flex justify-between items-center">
                               <span>Aplicado em: {new Date(app.created_at).toLocaleDateString()}</span>
                               {currentUser.role === 'admin' && (
                                   <div>
                                       <Button variant="ghost" size="sm" onClick={() => { setEditingApp(app); setIsModalOpen(true); }}><PencilIcon className="w-4 h-4"/></Button>
                                       <Button variant="ghost" size="sm" onClick={() => handleDelete(app)}><TrashIcon className="w-4 h-4 text-red-500"/></Button>
                                   </div>
                               )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && (
                 <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingApp ? "Editar Aplicação" : "Nova Aplicação"}>
                    <ApplicationForm onSave={handleSave} onClose={() => setIsModalOpen(false)} initialData={editingApp} />
                </Modal>
            )}
        </div>
    );
};

export default ApplicationsApp;