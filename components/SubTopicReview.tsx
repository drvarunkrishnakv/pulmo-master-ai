import React, { useState } from 'react';
import { SubTopic } from '../types';

interface SubTopicReviewProps {
    bookName: string;
    suggestedTopics: { name: string; headingTexts: string[] }[];
    onConfirm: (subTopics: { name: string; headingTexts: string[] }[]) => void;
    onBack: () => void;
    isLoading?: boolean;
}

const SubTopicReview: React.FC<SubTopicReviewProps> = ({
    bookName,
    suggestedTopics,
    onConfirm,
    onBack,
    isLoading = false
}) => {
    const [topics, setTopics] = useState(suggestedTopics);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleEditStart = (index: number) => {
        setEditingIndex(index);
        setEditValue(topics[index].name);
    };

    const handleEditSave = () => {
        if (editingIndex !== null && editValue.trim()) {
            setTopics(prev => prev.map((t, i) =>
                i === editingIndex ? { ...t, name: editValue.trim() } : t
            ));
        }
        setEditingIndex(null);
        setEditValue('');
    };

    const handleDelete = (index: number) => {
        if (topics.length <= 1) {
            alert('You need at least one sub-topic');
            return;
        }
        setTopics(prev => prev.filter((_, i) => i !== index));
    };

    if (isLoading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-blue-600 font-medium">Analyzing content structure...</p>
                <p className="text-sm text-gray-500 mt-1">AI is suggesting sub-topics for better tracking</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="text-center">
                <h3 className="text-lg font-bold text-gray-800">Review Sub-Topics</h3>
                <p className="text-sm text-gray-500">
                    AI suggested {topics.length} sub-topics for "{bookName}". You can rename or remove them.
                </p>
            </div>

            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-2">
                {topics.map((topic, index) => (
                    <div
                        key={index}
                        className="bg-gray-50 rounded-lg p-3 border hover:border-blue-200 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                                {index + 1}
                            </span>

                            {editingIndex === index ? (
                                <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
                                    onBlur={handleEditSave}
                                    autoFocus
                                    className="flex-1 px-2 py-1 border rounded text-sm"
                                />
                            ) : (
                                <span
                                    className="flex-1 font-medium text-gray-800 cursor-pointer hover:text-blue-600"
                                    onClick={() => handleEditStart(index)}
                                >
                                    {topic.name}
                                </span>
                            )}

                            <span className="text-xs text-gray-400">
                                {topic.headingTexts.length} sections
                            </span>

                            <button
                                onClick={() => handleEditStart(index)}
                                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Rename"
                            >
                                ✏️
                            </button>

                            <button
                                onClick={() => handleDelete(index)}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                title="Remove"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Show first few section titles */}
                        <div className="mt-2 pl-8 text-xs text-gray-500 line-clamp-2">
                            {topic.headingTexts.slice(0, 3).join(' • ')}
                            {topic.headingTexts.length > 3 && ` • +${topic.headingTexts.length - 3} more`}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-between pt-4 border-t">
                <button
                    onClick={onBack}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    ← Back
                </button>
                <button
                    onClick={() => onConfirm(topics)}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Confirm & Save Topic
                </button>
            </div>
        </div>
    );
};

export default SubTopicReview;
