import { useState, useCallback, useRef, TouchEvent } from 'react';

/**
 * Hook for pull-to-refresh functionality on mobile
 * 
 * Usage:
 * const { pullDistance, isPulling, isRefreshing, handlers, shouldTrigger } = usePullToRefresh(onRefresh);
 * 
 * <div {...handlers}>
 *   {isRefreshing && <RefreshIndicator />}
 *   {children}
 * </div>
 */

interface UsePullToRefreshOptions {
    threshold?: number;      // Distance to trigger refresh (default: 80px)
    maxPull?: number;        // Max pull distance (default: 120px)
    resistance?: number;     // Pull resistance factor (default: 2.5)
}

interface UsePullToRefreshReturn {
    pullDistance: number;
    isPulling: boolean;
    isRefreshing: boolean;
    shouldTrigger: boolean;
    handlers: {
        onTouchStart: (e: TouchEvent) => void;
        onTouchMove: (e: TouchEvent) => void;
        onTouchEnd: () => void;
    };
}

export const usePullToRefresh = (
    onRefresh: () => Promise<void> | void,
    options: UsePullToRefreshOptions = {}
): UsePullToRefreshReturn => {
    const { threshold = 80, maxPull = 120, resistance = 2.5 } = options;

    const [pullDistance, setPullDistance] = useState(0);
    const [isPulling, setIsPulling] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const startY = useRef(0);
    const currentY = useRef(0);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        // Only activate if at top of scroll
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        if (scrollTop > 5 || isRefreshing) return;

        startY.current = e.touches[0].clientY;
        setIsPulling(true);
    }, [isRefreshing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isPulling || isRefreshing) return;

        currentY.current = e.touches[0].clientY;
        const diff = currentY.current - startY.current;

        // Only track downward pulls
        if (diff > 0) {
            // Apply resistance
            const actualPull = Math.min(diff / resistance, maxPull);
            setPullDistance(actualPull);
        }
    }, [isPulling, isRefreshing, resistance, maxPull]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling || isRefreshing) return;

        if (pullDistance >= threshold) {
            // Trigger refresh
            setIsRefreshing(true);
            setPullDistance(40); // Keep some indicator visible

            try {
                await onRefresh();
            } catch (error) {
                console.error('Refresh failed:', error);
            }

            setIsRefreshing(false);
        }

        setPullDistance(0);
        setIsPulling(false);
    }, [isPulling, isRefreshing, pullDistance, threshold, onRefresh]);

    return {
        pullDistance,
        isPulling,
        isRefreshing,
        shouldTrigger: pullDistance >= threshold,
        handlers: {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd
        }
    };
};

export default usePullToRefresh;
