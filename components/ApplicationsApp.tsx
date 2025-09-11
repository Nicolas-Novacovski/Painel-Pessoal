import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../utils/supabase';
import { UserProfile, StudyNote, ConfidenceLevel } from '../types';
import { Button, Input, Modal } from './UIComponents';
import { PlusIcon, TrashIcon, PencilIcon, CodeBracketIcon } from './Icons';

const STUDY_NOTES_SETUP_SQL = `
-- SCRIPT DE ATUALIZAÇÃO PARA A TABELA 'study_notes'
-- Este script garante que sua tabela está atualizada para suportar múltiplos snippets de código, sem apagar seus dados.
-- É seguro executá-lo múltiplas vezes.

-- 1. Apaga a coluna antiga 'code_snippet' (singular, tipo TEXT) se ela existir.
ALTER TABLE public.study_notes DROP COLUMN IF EXISTS code_snippet;

-- 2. Adiciona a nova coluna 'code_snippets' (plural, tipo JSONB) se ela não existir.
ALTER TABLE public.study_notes ADD COLUMN IF NOT EXISTS code_snippets jsonb NULL;
`;

const DatabaseErrorResolver: React.FC = () => (
    <div className="p-4 m-6 bg-red-50 border-2 border-dashed border-red-200 rounded-lg text-slate-800">
        <h4 className="font-semibold text-red-900">Configuração Necessária</h4>
        <p className="text-sm text-red-800 mt-1">
            Sua tabela 'study_notes' está desatualizada. O script abaixo irá atualizá-la para suportar as funcionalidades mais recentes (como múltiplos snippets de código) sem apagar seus dados.
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
    onSave: (note: Omit<StudyNote, 'id' | 'created_at' | 'user_email'>) => Promise<void>;
    onClose: () => void;
    initialData?: StudyNote | null;
}> = ({ onSave, onClose, initialData }) => {
    const [title, setTitle] = useState(initialData?.title || '');
    const [language, setLanguage] = useState(initialData?.language || '');
    const [tags, setTags] = useState((initialData?.tags || []).join(', '));
    const [content, setContent] = useState(initialData?.content || '');
    const [codeSnippets, setCodeSnippets] = useState<string[]>(initialData?.code_snippets || ['']);
    const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel | null>(initialData?.confidence_level || null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSnippetChange = (index: number, value: string) => {
        const newSnippets = [...codeSnippets];
        newSnippets[index] = value;
        setCodeSnippets(newSnippets);
    };

    const addSnippet = () => setCodeSnippets([...codeSnippets, '']);
    const removeSnippet = (index: number) => setCodeSnippets(codeSnippets.filter((_, i) => i !== index));

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
        });
        setIsSaving(false);
        onClose();
    };
    
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do Conceito (Ex: React Hooks)" required />
            <div className="grid grid-cols-2 gap-4">
                <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="Linguagem/Tech (Ex: javascript)" />
                <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (separadas por vírgula)" />
            </div>
            <div>
                <label className="text-sm font-medium text-slate-700">Nível de Confiança</label>
                <div className="flex justify-between mt-1">
                    {[1, 2, 3, 4, 5].map(level => (
                        <button key={level} type="button" onClick={() => setConfidenceLevel(level as ConfidenceLevel)} className={`w-1/5 h-8 rounded-md transition-all ${confidenceLevel === level ? 'bg-cyan-400' : 'bg-slate-200 hover:bg-slate-300'}`}>
                            {level}
                        </button>
                    ))}
                </div>
            </div>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Sua anotação aqui... use quebras de linha para formatar." rows={6} className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary font-sans" />
            
            <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Snippets de Código</label>
                {codeSnippets.map((snippet, index) => (
                    <div key={index} className="flex items-start gap-2">
                        <textarea value={snippet} onChange={e => handleSnippetChange(index, e.target.value)} placeholder={`Trecho de código #${index + 1}`} rows={4} className="flex-grow p-2 bg-slate-800 text-slate-200 border border-slate-600 rounded-lg focus:ring-2 focus:ring-primary font-mono" />
                        <Button type="button" variant="danger" size="sm" onClick={() => removeSnippet(index)} disabled={codeSnippets.length <= 1 && index === 0}>
                            <TrashIcon className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
                 <Button type="button" variant="secondary" size="sm" onClick={addSnippet}>
                    <PlusIcon className="w-4 h-4"/> Adicionar Snippet
                </Button>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Anotação'}</Button>
            </div>
        </form>
    );
};

const StudyNotesApp: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
    const [notes, setNotes] = useState<StudyNote[]>([]);
    const [selectedNote, setSelectedNote] = useState<StudyNote | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<StudyNote | null>(null);
    const [dbError, setDbError] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState<number | null>(null);

    useEffect(() => {
        if (selectedNote && window.hljs) {
            // Use a timeout to ensure the DOM has updated before highlighting
            setTimeout(() => {
                window.hljs.highlightAll();
            }, 0);
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
        } else { setNotes(data || []); }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchNotes();
        const channel = supabase.channel('realtime-study-notes').on('postgres_changes', { event: '*', schema: 'public', table: 'study_notes' }, fetchNotes).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchNotes]);

    const handleSave = async (noteData: Omit<StudyNote, 'id' | 'created_at' | 'user_email'>) => {
        const dataToSave = { ...noteData, user_email: currentUser.email };
        
        const result = editingNote
            ? await supabase.from('study_notes').update(dataToSave).eq('id', editingNote.id)
            : await supabase.from('study_notes').insert([dataToSave]);

        if (result.error) {
            const msg = result.error.message.toLowerCase();
            if (msg.includes("column") && msg.includes("does not exist")) {
                 setDbError(true);
            } else {
                alert(`Erro ao salvar: ${result.error.message}`);
            }
        } else {
            fetchNotes();
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Apagar esta anotação?')) {
            await supabase.from('study_notes').delete().eq('id', id);
            if (selectedNote?.id === id) setSelectedNote(null);
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
                                            <code className={`language-${selectedNote.language?.toLowerCase() || 'plaintext'}`}>
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
        </div>
    );
};

export default StudyNotesApp;
