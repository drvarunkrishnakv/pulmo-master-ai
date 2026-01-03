import React from 'react';

/**
 * Skeleton Loading Component
 * Provides visual placeholders while content loads
 */

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rectangular',
    width,
    height
}) => {
    const baseClass = 'animate-pulse bg-gray-200 dark:bg-gray-700';

    const variantClass = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-xl'
    }[variant];

    const style: React.CSSProperties = {
        width: width || '100%',
        height: height || (variant === 'text' ? '1em' : '100%')
    };

    return (
        <div
            className={`${baseClass} ${variantClass} ${className}`}
            style={style}
        />
    );
};

/**
 * Dashboard Loading Skeleton
 * Shows while dashboard data loads
 */
export const DashboardSkeleton: React.FC = () => {
    return (
        <div className="max-w-2xl mx-auto space-y-5 md:space-y-6 animate-fade-in p-4">
            {/* Rio + Greeting skeleton */}
            <div className="flex items-center gap-4 mb-6">
                <Skeleton variant="circular" width={48} height={48} />
                <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="60%" height={20} />
                    <Skeleton variant="text" width="40%" height={14} />
                </div>
            </div>

            {/* Streak + Exam skeleton */}
            <div className="grid grid-cols-2 gap-3">
                <Skeleton height={80} className="rounded-xl" />
                <Skeleton height={80} className="rounded-xl" />
            </div>

            {/* Quick Stats skeleton */}
            <div className="grid grid-cols-3 gap-3">
                <Skeleton height={70} className="rounded-xl" />
                <Skeleton height={70} className="rounded-xl" />
                <Skeleton height={70} className="rounded-xl" />
            </div>

            {/* Practice Modes skeleton */}
            <div className="space-y-3">
                <Skeleton height={24} width={120} className="rounded mb-4" />
                <Skeleton height={80} className="rounded-xl" />
                <Skeleton height={80} className="rounded-xl" />
                <Skeleton height={80} className="rounded-xl" />
            </div>

            {/* Books skeleton */}
            <div className="space-y-3">
                <Skeleton height={24} width={100} className="rounded mb-4" />
                <Skeleton height={100} className="rounded-xl" />
                <Skeleton height={100} className="rounded-xl" />
            </div>
        </div>
    );
};

/**
 * Quiz Loading Skeleton
 * Shows while quiz question loads
 */
export const QuizSkeleton: React.FC = () => {
    return (
        <div className="max-w-3xl mx-auto p-4 animate-fade-in">
            {/* Topic badge */}
            <div className="mb-4">
                <Skeleton width={100} height={24} className="rounded-full" />
            </div>

            {/* Question card */}
            <div className="bg-white rounded-2xl border shadow-md overflow-hidden">
                {/* Question */}
                <div className="p-6 border-b bg-gray-50">
                    <Skeleton variant="text" width="90%" height={20} className="mb-2" />
                    <Skeleton variant="text" width="75%" height={20} className="mb-2" />
                    <Skeleton variant="text" width="60%" height={20} />
                </div>

                {/* Options */}
                <div className="p-6 space-y-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex items-center gap-3">
                            <Skeleton variant="circular" width={32} height={32} />
                            <Skeleton variant="text" height={16} className="flex-1" />
                        </div>
                    ))}
                </div>

                {/* Submit button */}
                <div className="p-6 border-t">
                    <Skeleton height={48} className="rounded-xl" />
                </div>
            </div>
        </div>
    );
};

/**
 * Analytics Loading Skeleton
 * Shows while analytics data processes
 */
export const AnalyticsSkeleton: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in p-4">
            {/* Header with Rio */}
            <div className="flex items-center gap-4 mb-6">
                <Skeleton variant="circular" width={60} height={60} />
                <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="50%" height={24} />
                    <Skeleton variant="text" width="70%" height={16} />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <Skeleton height={90} className="rounded-xl" />
                <Skeleton height={90} className="rounded-xl" />
                <Skeleton height={90} className="rounded-xl" />
            </div>

            {/* Chart Area */}
            <div className="bg-white rounded-2xl border p-6">
                <Skeleton variant="text" width={120} height={20} className="mb-4" />
                <Skeleton height={200} className="rounded-xl" />
            </div>

            {/* Topic List */}
            <div className="space-y-3">
                <Skeleton variant="text" width={150} height={20} className="mb-4" />
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white rounded-xl border p-4 flex items-center gap-4">
                        <Skeleton variant="circular" width={40} height={40} />
                        <div className="flex-1 space-y-2">
                            <Skeleton variant="text" width="60%" height={16} />
                            <Skeleton variant="text" width="40%" height={12} />
                        </div>
                        <Skeleton width={60} height={24} className="rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Skeleton;
