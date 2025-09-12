import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { UserProfile, StudyNote, ConfidenceLevel } from '../types';
import { Button, Input, Modal } from './UIComponents';
import { PlusIcon, TrashIcon, PencilIcon, CodeBracketIcon, CameraIcon, XMarkIcon } from './Icons';
import { compressImage, slugify } from '../utils/helpers';

const STUDY_NOTES_SETUP_SQL = `
-- SCRIPT DE ATUALIZAÇÃO PARA 'study_notes'
-- Garante que a tabela está atualizada para múltiplos snippets de código e imagens.
-- É seguro executá-lo múltiplas vezes.

-- --- ATUALIZAÇÃO DE COLUNAS ---
-- 1. Apaga a coluna antiga 'code_snippet' (singular) se ela existir.
ALTER TABLE public.study_notes DROP COLUMN IF EXISTS code_snippet;
-- 2. Adiciona a nova coluna 'code_snippets' (plural, JSONB) se ela não existir.
ALTER TABLE public.study_notes ADD COLUMN IF NOT EXISTS code_snippets jsonb NULL;
-- 3. Adiciona a coluna 'image_urls' (JSONB) para imagens se ela não existir.
ALTER TABLE public.study_notes ADD COLUMN IF NOT EXISTS image_urls jsonb NULL;

-- --- CONFIGURAÇÃO DO BUCKET DE IMAGENS ---
-- 4. CRIE MANUALMENTE um bucket PÚBLICO no Supabase Storage chamado 'study-note-images'.

-- 5. Execute este SQL para configurar as permissões de acesso público do bucket.
DROP POLICY IF EXISTS "Public Read for Study Note Images" ON storage.objects;
CREATE POLICY "Public Read for Study Note Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'study-note-images');

DROP POLICY IF EXISTS "Public Upload for Study Note Images" ON storage.objects;
CREATE POLICY "Public Upload for Study Note Images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'study-note-images');

DROP POLICY IF EXISTS "Public Delete for Study Note Images" ON storage.objects;
CREATE POLICY "Public Delete for Study Note Images"
ON storage.objects FOR DELETE
USING (bucket_id = 'study-note-images');
`;


const DatabaseErrorResolver: React.FC = () => (
    <div className="p-4 m-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg text-slate-800">
        <h4 className="font-semibold text-red-900">Configuração Necessária</h4>
        <p className="text-sm text-red-800 mt-1">
            Sua tabela 'study_notes' está desatualizada. O script abaixo irá atualizá-la para suportar as funcionalidades mais recentes (como múltiplos snippets de código e imagens) sem apagar seus dados.
        </p>
        <div className="mt-4">
            <pre className="bg-slate-800 text-white p-4 rounded-lg text-xs overflow-x-auto">
                <code>{STUDY_NOTES_SETUP_SQL.trim()}</code>
            </pre>
            <p className="text-xs text-slate-600 mt-2">
                Copie o código, cole no <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Editor SQL</a> do seu painel Supabase, clique em "RUN" e, em seguida, <strong>recarregue esta página</strong>.
            </p>
        </div>
    </div>
);

const NoteForm: React.FC<{
    onSave: (note: Omit<StudyNote, 'id' | 'created_at' | 'user_email'>, imageFiles: File[], remainingImageUrls: string[]) => Promise<void>;
    onClose: () => void;
    initialData?: StudyNote | null;
}> = ({ onSave, onClose, initialData }) => {
    const [title, setTitle] = useState(initialData?.title || '');
    const [language, setLanguage] = useState(initialData?.language || '');
    const [tags, setTags] = useState((initialData?.tags || []).join(', '));
    const [content, setContent] = useState(initialData?.content || '');
    const [codeSnippets, setCodeSnippets] = useState<string[]>(initialData?.code_snippets || ['']);
    const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel | null>(initialData?.confidence_level || null);
    
    // Image State
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
    
    const [isSaving, setIsSaving] = useState(false);
    const [isCompressing, setIsCompressing] = useState(false);

    useEffect(() => {
        if (initialData) {
            setExistingImageUrls(initialData.image_urls || []);
        }
        return () => {
            // Cleanup object URLs on unmount
            imagePreviews.forEach(url => URL.revokeObjectURL(url));
        };
    }, [initialData]);

    const handleSnippetChange = (index: number, value: string) => {
        const newSnippets = [...codeSnippets];
        newSnippets[index] = value;
        setCodeSnippets(newSnippets);
    };

    const addSnippet = () => setCodeSnippets([...codeSnippets, '']);
    const removeSnippet = (index: number) => setCodeSnippets(codeSnippets.filter((_, i) => i !== index));

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setIsCompressing(true);
        const compressedFiles: File[] = [];
        const previews: string[] = [];
        for (const file of files) {
            try {
                const compressed = await compressImage(file, 1280, 0.8);
                compressedFiles.push(compressed);
                previews.push(URL.createObjectURL(compressed));
            } catch (err) { console.error("Error compressing file:", err); }
        }
        setImageFiles(prev => [...prev, ...compressedFiles]);
        setImagePreviews(prev => [...prev, ...previews]);
        setIsCompressing(false);
        e.target.value = ''; // Allow re-selecting same files
    };

    const removeNewImage = (index: number) => {
        URL.revokeObjectURL(imagePreviews[index]);
        setImageFiles(prev => prev.filter((_, i) => i !== index));
        setImagePreviews(prev => prev.filter((_, i) => i !== index));
    };
    
    const removeExistingImage = (url: string) => {
        setExistingImageUrls(prev => prev.filter(u => u !== url));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            alert('Título e Conteúdo são obrigatórios.');
            return;
        }
        setIsSaving(true);
        await onSave({
            title: title.trim(),
            language: language.trim() || null,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            content: content.trim(),
            code_snippets: codeSnippets.map(s => s.trim()).filter(Boolean),
            confidence_level: confidenceLevel,
            image_urls: [], // Placeholder, will be managed in parent
        }, imageFiles, existingImageUrls);
        setIsSaving(false);
        onClose();
    };
    
    const isBusy = isSaving || isCompressing;
    
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do Conceito (Ex: React Hooks)" required disabled={isBusy} />
            <div className="grid grid-cols-2 gap-4">
                <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="Linguagem/Tech (Ex: javascript)" disabled={isBusy} />
                <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (separadas por vírgula)" disabled={isBusy} />
            </div>
            <div>
                <label className="text-sm font-medium text-slate-700">Nível de Confiança</label>
                <div className="flex justify-between mt-1">
                    {[1, 2, 3, 4, 5].map(level => (
                        <button key={level} type="button" onClick={() => setConfidenceLevel(level as ConfidenceLevel)} className={`w-1/5 h-8 rounded-md transition-all ${confidenceLevel === level ? 'bg-cyan-400' : 'bg-slate-200 hover:bg-slate-300'}`} disabled={isBusy}>
                            {level}
                        </button>
                    ))}
                </div>
            </div>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Sua anotação aqui... use quebras de linha para formatar." rows={6} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary font-sans" disabled={isBusy} />
            
            <div className="space-y-2">
                <h4 className="font-medium text-sm text-slate-700">Imagens/Diagramas</h4>
                <label htmlFor="note-images" className={`w-full cursor-pointer justify-center p-3 text-base font-semibold transition-all duration-200 ease-in-out bg-slate-200 text-slate-800 hover:bg-slate-300 rounded-lg flex items-center gap-2 ${isBusy ? 'opacity-50' : ''}`}>
                    <CameraIcon className="w-5 h-5"/>
                    <span>{isCompressing ? 'Processando...' : 'Adicionar Imagens'}</span>
                </label>
                <input id="note-images" type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} disabled={isBusy} />

                <div className="grid grid-cols-3 gap-2">
                    {existingImageUrls.map(url => (
                        <div key={url} className="relative group"><img src={url} className="w-full h-24 object-cover rounded" alt="Diagrama existente"/><button type="button" onClick={() => removeExistingImage(url)} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white opacity-0 group-hover:opacity-100"><XMarkIcon className="w-3 h-3"/></button></div>
                    ))}
                    {imagePreviews.map((previewUrl, index) => (
                        <div key={previewUrl} className="relative group"><img src={previewUrl} className="w-full h-24 object-cover rounded" alt={`Nova imagem ${index + 1}`}/><button type="button" onClick={() => removeNewImage(index)} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white opacity-0 group-hover:opacity-100"><XMarkIcon className="w-3 h-3"/></button></div>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <h4 className="font-medium text-sm text-slate-700">Snippets de Código</h4>
                {codeSnippets.map((snippet, index) => (
                    <div key={index} className="flex items-start gap-2">
                        <textarea value={snippet} onChange={e => handleSnippetChange(index, e.target.value)} placeholder={`Trecho de código #${index + 1}`} rows={4} className="flex-grow p-2 bg-slate-800 text-slate-200 border border-slate-600 rounded-lg focus:ring-2 focus:ring-primary font-mono" disabled={isBusy} />
                        <Button type="button" variant="danger" size="sm" onClick={() => removeSnippet(index)} disabled={(codeSnippets.length <= 1 && index === 0) || isBusy}><TrashIcon className="w-4 h-4" /></Button>
                    </div>
                ))}
                 <Button type="button" variant="secondary" size="sm" onClick={addSnippet} disabled={isBusy}><PlusIcon className="w-4 h-4"/> Adicionar Snippet</Button>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isBusy}>{isSaving ? 'Salvando...' : 'Salvar Anotação'}</Button>
            </div>
        </form>
    );
};

const getHighlightLanguage = (lang: string | null | undefined): string => {
    if (!lang) return 'plaintext';
    const lowerLang = lang.toLowerCase().trim();
    switch (lowerLang) {
        case 'c#': return 'csharp';
        case 'js': return 'javascript';
        case 'ts': return 'typescript';
        case 'py': return 'python';
        case 'html': return 'xml';
        default: return lowerLang;
    }
};

const StudyNotesApp: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
    const [notes, setNotes] = useState<StudyNote[]>([]);
    const [selectedNote, setSelectedNote] = useState<StudyNote | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<StudyNote | null>(null);
    const [dbError, setDbError] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState<number | null>(null);
    const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);

    useEffect(() => {
        if (selectedNote && window.hljs) {
            setTimeout(() => { window.hljs.highlightAll(); }, 0);
        }
    }, [selectedNote]);

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedSnippet(index);
        setTimeout(() => setCopiedSnippet(null), 2000);
    };

    const fetchNotes = useCallback(async () => {
        setIsLoading(true);
        setDbError(false);
        const { data, error } = await supabase.from('study_notes').select('*').order('created_at', { ascending: false });
        if (error) {
            const msg = error.message.toLowerCase();
            if (error.code === '42P01' || (msg.includes("column") && msg.includes("does not exist"))) { 
                setDbError(true); 
            } else { alert(`Erro: ${error.message}`); }
        } else {
            if (data && data.length > 0 && data[0].image_urls === undefined) {
                setDbError(true);
            } else {
                setNotes(data || []);
            }
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchNotes();
        const channel = supabase.channel('realtime-study-notes').on('postgres_changes', { event: '*', schema: 'public', table: 'study_notes' }, fetchNotes).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchNotes]);

    const handleSave = async (noteData: Omit<StudyNote, 'id' | 'created_at' | 'user_email'>, imageFiles: File[], remainingImageUrls: string[]) => {
        try {
            const deletedUrls = editingNote?.image_urls?.filter(url => !remainingImageUrls.includes(url)) || [];
            if (deletedUrls.length > 0) {
                const paths = deletedUrls.map(url => url.split('/study-note-images/')[1]);
                await supabase.storage.from('study-note-images').remove(paths);
            }

            const newImageUrls = await Promise.all(
                imageFiles.map(async file => {
                    const fileName = `${currentUser.email.split('@')[0]}-${slugify(noteData.title)}-${Date.now()}.jpg`;
                    const { data, error } = await supabase.storage.from('study-note-images').upload(fileName, file);
                    if (error) throw error;
                    return supabase.storage.from('study-note-images').getPublicUrl(data.path).data.publicUrl;
                })
            );

            const finalImageUrls = [...remainingImageUrls, ...newImageUrls];
            const dataToSave = { ...noteData, user_email: currentUser.email, image_urls: finalImageUrls };

            if (editingNote) {
                const { data: updatedNote, error } = await supabase.from('study_notes').update(dataToSave).eq('id', editingNote.id).select().single();
                if (error) throw error;
                const updatedNotes = notes.map(n => n.id === updatedNote.id ? updatedNote : n);
                setNotes(updatedNotes);
                if (selectedNote?.id === updatedNote.id) {
                    setSelectedNote(updatedNote);
                }
            } else {
                const { data: newNote, error } = await supabase.from('study_notes').insert([dataToSave]).select().single();
                if (error) throw error;
                setNotes([newNote, ...notes]);
                setSelectedNote(newNote);
            }
        } catch (err: any) {
            const msg = (err.message || '').toLowerCase();
            if (msg.includes("column") && msg.includes("does not exist") || msg.includes('bucket not found')) {
                 setDbError(true);
            } else {
                alert(`Erro ao salvar: ${err.message}`);
            }
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Apagar esta anotação?')) {
            const noteToDelete = notes.find(n => n.id === id);
            if (noteToDelete?.image_urls && noteToDelete.image_urls.length > 0) {
                const paths = noteToDelete.image_urls.map(url => url.split('/study-note-images/')[1]);
                await supabase.storage.from('study-note-images').remove(paths);
            }
            await supabase.from('study_notes').delete().eq('id', id);
            if (selectedNote?.id === id) setSelectedNote(notes.length > 1 ? notes.find(n => n.id !== id) || null : null);
            fetchNotes();
        }
    };

    if (dbError) return <DatabaseErrorResolver />;

    return (
        <div className="h-screen w-full flex bg-slate-900 text-slate-300 font-mono">
            <aside className="w-1/3 max-w-sm flex-shrink-0 bg-slate-800/50 flex flex-col h-full border-r border-slate-700">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Anotações</h2>
                    <Button onClick={() => { setEditingNote(null); setIsModalOpen(true); }} size="sm" variant="primary" className="!bg-cyan-500 hover:!bg-cyan-600 !text-black">
                        <PlusIcon className="w-5 h-5"/> Novo
                    </Button>
                </div>
                <div className="flex-grow overflow-y-auto">
                    {isLoading && <p className="p-4 text-slate-400">Carregando...</p>}
                    {notes.map(note => (
                        <button key={note.id} onClick={() => setSelectedNote(note)} className={`w-full text-left p-4 border-b border-slate-700/50 transition-colors ${selectedNote?.id === note.id ? 'bg-slate-700/50' : 'hover:bg-slate-800'}`}>
                            <h3 className="font-bold text-white truncate">{note.title}</h3>
                            <p className="text-sm text-cyan-400 truncate">{note.language}</p>
                        </button>
                    ))}
                </div>
            </aside>
            <main className="flex-grow p-8 overflow-y-auto">
                {selectedNote ? (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-4xl font-bold text-white mb-2">{selectedNote.title}</h1>
                                <div className="flex items-center gap-4">
                                    <span className="text-cyan-400 font-semibold">{selectedNote.language}</span>
                                    <div className="flex gap-2">
                                        {(selectedNote.tags || []).map(tag => <span key={tag} className="px-2 py-0.5 text-xs font-semibold text-pink-300 bg-pink-900/50 rounded-full">{tag}</span>)}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => { setEditingNote(selectedNote); setIsModalOpen(true); }} variant="secondary"><PencilIcon className="w-4 h-4"/> Editar</Button>
                                <Button onClick={() => handleDelete(selectedNote.id)} variant="danger"><TrashIcon className="w-4 h-4"/></Button>
                            </div>
                        </div>
                        {selectedNote.confidence_level && (
                            <div className="mt-4">
                                <label className="text-sm text-slate-400">Confiança:</label>
                                <div className="flex gap-1 mt-1">
                                    {[...Array(5)].map((_, i) => <div key={i} className={`h-2 w-full rounded-full ${i < selectedNote.confidence_level! ? 'bg-cyan-400' : 'bg-slate-700'}`}></div>)}
                                </div>
                            </div>
                        )}
                        <div className="mt-8">
                            <h2 className="text-lg font-semibold text-slate-400 mb-2">// Anotações</h2>
                            <pre className="text-slate-300 whitespace-pre-wrap bg-slate-800/50 p-4 rounded-md font-sans">{selectedNote.content}</pre>
                        </div>
                        {selectedNote.image_urls && selectedNote.image_urls.length > 0 && (
                            <div className="mt-6">
                                <h2 className="text-lg font-semibold text-slate-400 mb-2">// Imagens</h2>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {selectedNote.image_urls.map(url => (
                                        <div key={url} className="group relative aspect-video bg-slate-800 rounded-lg overflow-hidden cursor-pointer" onClick={() => setViewingImageUrl(url)}>
                                            <img src={url} alt="Diagrama" className="w-full h-full object-contain transition-transform group-hover:scale-105" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                         {selectedNote.code_snippets && selectedNote.code_snippets.length > 0 && (
                            <div className="mt-6 space-y-4">
                                <h2 className="text-lg font-semibold text-slate-400">// Código</h2>
                                {selectedNote.code_snippets.map((snippet, index) => (
                                    <div key={index} className="relative group">
                                         <Button
                                            size="sm"
                                            variant="secondary"
                                            className="!absolute !top-2 !right-2 !py-1 !px-2 !text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleCopy(snippet, index)}
                                        >
                                            {copiedSnippet === index ? 'Copiado!' : 'Copiar'}
                                        </Button>
                                        <pre className="text-sm whitespace-pre-wrap bg-slate-950 p-4 rounded-md border border-slate-700 overflow-x-auto">
                                            <code className={`language-${getHighlightLanguage(selectedNote.language)}`}>
                                                {snippet}
                                            </code>
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                        <CodeBracketIcon className="w-16 h-16 mb-4"/>
                        <h2 className="text-2xl font-bold text-slate-300">Seu Caderno Digital</h2>
                        <p>Selecione uma anotação na lista ou crie uma nova para começar.</p>
                    </div>
                )}
            </main>
            {isModalOpen && (
                 <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingNote ? "Editar Anotação" : "Nova Anotação de Estudo"}>
                    <NoteForm onSave={handleSave} onClose={() => setIsModalOpen(false)} initialData={editingNote} />
                </Modal>
            )}
            <Modal isOpen={!!viewingImageUrl} onClose={() => setViewingImageUrl(null)} title="Visualizar Imagem">
                {viewingImageUrl && <img src={viewingImageUrl} alt="Visualização ampliada" className="w-full h-auto max-h-[85vh] object-contain"/>}
            </Modal>
        </div>
    );
};

export default StudyNotesApp;