import React, { useState, useEffect } from 'react';
import { getAllSubTopicStats } from '../services/mcqBankService';
import { useTheme } from '../contexts/ThemeContext';

interface SubTopicDetailsProps {
    bookId: string;
}

const SubTopicDetails: React.FC<SubTopicDetailsProps> = ({ bookId }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [subTopics, setSubTopics] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);

        // Defer calculation to next tick to keep UI responsive
        const timer = setTimeout(() => {
            // Use requestIdleCallback if available for extra safety
            const idleCallback = (window as any).requestIdleCallback || ((cb: Function) => cb());

            idleCallback(() => {
                if (!isMounted) return;

                // Perform heavy calculation
                const stats = getAllSubTopicStats(bookId);

                if (isMounted) {
                    setSubTopics(stats);
                    setIsLoading(false);
                }
            });
        }, 50);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [bookId]);

    if (isLoading) {
        return (
            <div className="mt-1 ml-4 md:ml-6 py-4 flex items-center gap-2 animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
            </div>
        );
    }

    if (subTopics.length === 0) {
        return (
            <div className="mt-1 ml-4 md:ml-6 py-2 text-xs text-gray-400 italic">
                No subtopic data available
            </div>
        );
    }

    return (
        <div className="mt-1 ml-4 md:ml-6 space-y-1 animate-in slide-in-from-top-2 duration-200">
            {subTopics.map((sub) => (
                <div
                    key={sub.subTopicId}
                    className={`rounded-lg p-2 md:p-3 flex items-center gap-2 ${sub.isWeak ? 'border-l-2 border-red-400' : ''} ${isDark ? 'bg-slate-800' : 'bg-gray-50'
                        }`}
                >
                    <div className={`w-1.5 h-1.5 rounded-full ${sub.accuracy === -1 ? 'bg-gray-300' :
                        sub.accuracy >= 70 ? 'bg-green-500' :
                            sub.accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`} />
                    <span className={`flex-1 text-[10px] md:text-xs truncate ${isDark ? 'text-gray-200' : 'text-gray-700'
                        }`}>{sub.name}</span>
                    <span className={`text-[10px] md:text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'
                        }`}>{sub.attempted}/{sub.total}</span>
                    {sub.accuracy >= 0 && (
                        <span className={`text-[10px] md:text-xs font-medium ${sub.accuracy >= 70 ?
                            (isDark ? 'text-green-400' : 'text-green-600') :
                            sub.accuracy >= 50 ?
                                (isDark ? 'text-yellow-400' : 'text-yellow-600') :
                                (isDark ? 'text-red-400' : 'text-red-600')
                            }`}>{sub.accuracy}%</span>
                    )}
                </div>
            ))}
        </div>
    );
};

export default SubTopicDetails;
