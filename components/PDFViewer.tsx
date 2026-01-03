import React from 'react';

interface PDFViewerProps {
    isOpen: boolean;
    onClose: () => void;
    sourceName: string;
}

// Map source names to actual PDF file paths
const SOURCE_TO_PDF: Record<string, string> = {
    'GINA-2025-Update-25_11_08-WMS.pdf': '/data/guidelines/GINA-2025-Update-25_11_08-WMS.pdf',
    'GOLD-REPORT-2026-v1.3-8Dec2025_WMV.pdf': '/data/guidelines/GOLD-REPORT-2026-v1.3-8Dec2025_WMV.pdf',
    'National-Guidance-on-Differential-TB-Care_Final_March-2025-3.pdf': '/data/guidelines/National-Guidance-on-Differential-TB-Care_Final_March-2025-3.pdf',
    'STANDARD TREATMENT GUIDELINES MEDICINE (RESPIRATORY DISEASES).pdf': '/data/guidelines/STANDARD TREATMENT GUIDELINES MEDICINE (RESPIRATORY DISEASES).pdf',
    'spirometry-guidelines-ics-nccp-2018.pdf': '/data/guidelines/spirometry-guidelines-ics-nccp-2018.pdf',
};

const PDFViewer: React.FC<PDFViewerProps> = ({ isOpen, onClose, sourceName }) => {
    if (!isOpen) return null;

    const pdfPath = SOURCE_TO_PDF[sourceName] || null;

    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">📄</span>
                        <div>
                            <h2 className="font-bold text-lg leading-tight">Source Document</h2>
                            <p className="text-purple-200 text-xs truncate max-w-[300px] md:max-w-none">{sourceName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-white/10 hover:bg-white/20 p-2 px-4 rounded-lg backdrop-blur transition-all font-bold"
                    >
                        ✕ Close
                    </button>
                </div>

                {/* PDF Content */}
                <div className="flex-1 bg-gray-100 overflow-hidden">
                    {pdfPath ? (
                        <iframe
                            src={pdfPath}
                            className="w-full h-full border-0"
                            title={`PDF Viewer - ${sourceName}`}
                        />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8">
                            <span className="text-6xl mb-4 opacity-30">📄</span>
                            <h3 className="text-lg font-bold mb-2">PDF Not Found</h3>
                            <p className="text-sm text-center max-w-sm">
                                The source file "{sourceName}" is not available in the guidelines folder.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PDFViewer;
