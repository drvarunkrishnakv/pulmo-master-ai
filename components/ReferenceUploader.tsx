import React, { useCallback, useState } from 'react';
import { parseMarkdown, saveBook, parseMarkdownWithSubTopics } from '../services/chunkService';
import { extractHeadings, suggestSubTopics } from '../services/geminiService';
import { Book, SubTopic, Chunk } from '../types';
import SubTopicReview from './SubTopicReview';

interface ReferenceUploaderProps {
    onBookUploaded: (book: Book) => void;
    onClose?: () => void;
}

type UploadStep = 'upload' | 'analyzing' | 'review' | 'saving';

interface ParsedData {
    content: string;
    bookName: string;
    headings: { level: number; text: string; lineIndex: number }[];
    suggestedTopics: { name: string; headingIndices: number[] }[];
}

const ReferenceUploader: React.FC<ReferenceUploaderProps> = ({ onBookUploaded, onClose }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [step, setStep] = useState<UploadStep>('upload');
    const [progress, setProgress] = useState<{ stage: string; detail?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);

    const processFile = async (file: File) => {
        if (!file.name.endsWith('.md')) {
            setError('Please upload a Markdown (.md) file');
            return;
        }

        setStep('analyzing');
        setError(null);
        setProgress({ stage: 'Reading file...' });

        try {
            const content = await file.text();
            const bookName = file.name.replace(/\.md$/i, '');

            setProgress({ stage: 'Extracting structure...', detail: `${content.length.toLocaleString()} characters` });

            // Extract headings
            const headings = extractHeadings(content);

            if (headings.length < 3) {
                // Not enough headings for sub-topic detection, use simple upload
                setProgress({ stage: 'Processing content...' });
                const { book, chunks } = parseMarkdown(content, bookName);
                saveBook(book, chunks);
                onBookUploaded(book);
                return;
            }

            setProgress({ stage: 'AI analyzing structure...', detail: `${headings.length} sections found` });

            // Get AI suggestions for sub-topics
            const suggestedTopics = await suggestSubTopics(headings, bookName);

            setParsedData({
                content,
                bookName,
                headings,
                suggestedTopics
            });

            setStep('review');

        } catch (err) {
            console.error('Error processing file:', err);
            setError('Failed to process file. Please try again.');
            setStep('upload');
        }
    };

    const handleConfirmSubTopics = async (confirmedTopics: { name: string; headingTexts: string[] }[]) => {
        if (!parsedData) return;

        setStep('saving');
        setProgress({ stage: 'Creating topic structure...' });

        try {
            // Map confirmed topics back to headings
            const subTopics: { name: string; headingIndices: number[] }[] = confirmedTopics.map(t => ({
                name: t.name,
                headingIndices: t.headingTexts.map(text =>
                    parsedData.headings.findIndex(h => h.text === text)
                ).filter(i => i !== -1)
            }));

            // Parse with sub-topics
            const { book, chunks } = parseMarkdownWithSubTopics(
                parsedData.content,
                parsedData.bookName,
                parsedData.headings,
                subTopics
            );

            setProgress({ stage: 'Saving...', detail: `${book.subTopics?.length || 0} sub-topics created` });
            await new Promise(resolve => setTimeout(resolve, 300));

            saveBook(book, chunks);

            setProgress({ stage: 'Done!', detail: `${book.name} uploaded successfully` });
            await new Promise(resolve => setTimeout(resolve, 500));

            onBookUploaded(book);

        } catch (err) {
            console.error('Error saving topic:', err);
            setError('Failed to save topic. Please try again.');
            setStep('review');
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    // Prepare topics with heading texts for review
    const topicsForReview = parsedData?.suggestedTopics.map(t => ({
        name: t.name,
        headingTexts: t.headingIndices.map(i => parsedData.headings[i]?.text || '').filter(Boolean)
    })) || [];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
                <div className="p-4 md:p-6 border-b flex items-center justify-between flex-shrink-0">
                    <h2 className="text-lg md:text-xl font-bold text-gray-800">
                        {step === 'review' ? 'Review Sub-Topics' : 'Upload Reference Guideline'}
                    </h2>
                    {onClose && step === 'upload' && (
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="p-4 md:p-6 overflow-y-auto flex-1">
                    {step === 'upload' && (
                        <>
                            <div
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                className={`
                                    border-2 border-dashed rounded-xl p-6 md:p-8 text-center transition-all cursor-pointer
                                    ${isDragging
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                                    }
                                `}
                            >
                                <input
                                    type="file"
                                    accept=".md"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    id="file-upload"
                                />
                                <label htmlFor="file-upload" className="cursor-pointer">
                                    <div className="text-4xl mb-3">📄</div>
                                    <p className="text-gray-700 font-medium mb-1">
                                        Drop your Markdown file here
                                    </p>
                                    <p className="text-gray-500 text-sm">
                                        or <span className="text-blue-600 hover:underline">browse</span> to upload
                                    </p>
                                </label>
                            </div>

                            {error && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                                <h4 className="font-medium text-gray-700 text-sm mb-2">💡 What's New</h4>
                                <ul className="text-xs text-gray-500 space-y-1">
                                    <li>• AI will analyze your guideline structure</li>
                                    <li>• Suggests sub-topics for better tracking</li>
                                    <li>• Track performance by topic area</li>
                                </ul>
                            </div>
                        </>
                    )}

                    {(step === 'analyzing' || step === 'saving') && (
                        <div className="text-center py-8 space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
                            <div>
                                <p className="text-blue-600 font-medium">{progress?.stage}</p>
                                {progress?.detail && (
                                    <p className="text-gray-500 text-sm mt-1">{progress.detail}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'review' && parsedData && (
                        <SubTopicReview
                            bookName={parsedData.bookName}
                            suggestedTopics={topicsForReview}
                            onConfirm={handleConfirmSubTopics}
                            onBack={() => setStep('upload')}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReferenceUploader;
