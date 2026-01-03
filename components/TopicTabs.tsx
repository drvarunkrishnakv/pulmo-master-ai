import React from 'react';
import { Book } from '../types';
import { getBookMCQStats } from '../services/mcqBankService';

interface TopicTabsProps {
    books: Book[];
    selectedBookId: string | null;
    onSelectBook: (book: Book) => void;
    onAddBook: () => void;
    onDeleteBook?: (bookId: string) => void;
}

const TopicTabs: React.FC<TopicTabsProps> = ({
    books,
    selectedBookId,
    onSelectBook,
    onAddBook,
    onDeleteBook
}) => {
    if (books.length === 0) {
        return (
            <div className="bg-white rounded-xl border p-6 md:p-8 text-center">
                <div className="text-5xl mb-4">📚</div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">No Topics Yet</h3>
                <p className="text-gray-500 mb-4 text-sm md:text-base">Upload your first topic or guideline to start generating quizzes</p>
                <button
                    onClick={onAddBook}
                    className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all"
                >
                    + Upload Topic
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Tab Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 md:mx-0 md:px-0">
                {books.map(book => {
                    const stats = getBookMCQStats(book.id);
                    const isSelected = book.id === selectedBookId;

                    return (
                        <div
                            key={book.id}
                            onClick={() => onSelectBook(book)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && onSelectBook(book)}
                            className={`
                flex-shrink-0 px-3 py-2 md:px-4 md:py-3 rounded-xl border-2 transition-all group relative cursor-pointer
                ${isSelected
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-white border-gray-200 hover:border-blue-400 text-gray-700'
                                }
              `}
                        >
                            <div className="flex items-center gap-3">
                                <span className="font-medium text-xs md:text-sm max-w-[100px] md:max-w-[150px] truncate">
                                    {book.name}
                                </span>
                                {stats.total > 0 && (
                                    <span className={`
                    px-2 py-0.5 rounded-full text-xs font-bold
                    ${isSelected ? 'bg-white/20' : 'bg-blue-100 text-blue-700'}
                  `}>
                                        {stats.total} MCQs
                                    </span>
                                )}
                            </div>

                            {/* Delete button */}
                            {onDeleteBook && !isSelected && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Delete "${book.name}" and all its MCQs?`)) {
                                            onDeleteBook(book.id);
                                        }
                                    }}
                                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    );
                })}


                {/* Add Topic Button */}
                <button
                    onClick={onAddBook}
                    className="flex-shrink-0 px-3 py-2 md:px-4 md:py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all text-sm"
                >
                    + Add Topic
                </button>
            </div>

            {/* Selected Topic Info */}
            {selectedBookId && (
                <SelectedTopicInfo
                    book={books.find(b => b.id === selectedBookId)!}
                    onDelete={onDeleteBook}
                />
            )}
        </div>
    );
};

interface SelectedTopicInfoProps {
    book: Book;
    onDelete?: (bookId: string) => void;
}

const SelectedTopicInfo: React.FC<SelectedTopicInfoProps> = ({ book, onDelete }) => {
    const stats = getBookMCQStats(book.id);

    return (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 md:p-4 border border-blue-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800 truncate">{book.name}</h3>
                    <p className="text-xs md:text-sm text-gray-500">
                        {book.totalChunks} sections • {(book.totalCharacters / 1000).toFixed(1)}K chars
                    </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 md:gap-4">
                    <div className="flex gap-3 md:gap-4 text-center">
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-blue-600">{stats.total}</p>
                            <p className="text-[10px] md:text-xs text-gray-500 uppercase">MCQs</p>
                        </div>
                        {stats.attempted > 0 && (
                            <div>
                                <p className="text-xl md:text-2xl font-bold text-green-600">{stats.accuracy}%</p>
                                <p className="text-[10px] md:text-xs text-gray-500 uppercase">Accuracy</p>
                            </div>
                        )}
                    </div>
                    {onDelete && (
                        <button
                            onClick={() => {
                                if (confirm(`Delete "${book.name}" and all its MCQs?`)) {
                                    onDelete(book.id);
                                }
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete topic"
                        >
                            🗑️
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TopicTabs;
