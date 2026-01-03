import React, { useState, useEffect } from 'react';
import { Bell, X, ExternalLink, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import {
    ExamNotification,
    checkForExamUpdates,
    markAllAsRead,
    forceCheckForUpdates,
    getOfficialLinks,
    getLastCheckedTime
} from '../services/examNotificationService';

interface ExamNotificationBannerProps {
    onNotificationClick?: () => void;
}

const ExamNotificationBanner: React.FC<ExamNotificationBannerProps> = ({ onNotificationClick }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [notifications, setNotifications] = useState<ExamNotification[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [isChecking, setIsChecking] = useState(true); // Start as checking
    const [hasChecked, setHasChecked] = useState(false);
    const [lastCheckedTime, setLastCheckedTime] = useState<number>(0);

    // Format time for display
    const formatLastChecked = (timestamp: number): string => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    // Check for updates on mount
    useEffect(() => {
        const checkUpdates = async () => {
            setIsChecking(true);
            try {
                const unread = await checkForExamUpdates();
                setNotifications(unread);
                setLastCheckedTime(getLastCheckedTime());
            } catch (e) {
                console.error('Failed to check exam updates:', e);
            } finally {
                setIsChecking(false);
                setHasChecked(true);
            }
        };
        checkUpdates();
    }, []);

    const handleRefresh = async () => {
        setIsChecking(true);
        try {
            const unread = await forceCheckForUpdates();
            setNotifications(unread);
            setLastCheckedTime(getLastCheckedTime());
        } catch (e) {
            console.error('Failed to refresh:', e);
        } finally {
            setIsChecking(false);
        }
    };

    const handleOpenModal = () => {
        setShowModal(true);
        onNotificationClick?.();
    };

    const handleCloseModal = () => {
        setShowModal(false);
        if (notifications.length > 0) {
            markAllAsRead();
            setNotifications([]);
        }
    };

    // Mark all as seen directly from banner (without modal)
    const handleMarkAsSeen = (e: React.MouseEvent) => {
        e.stopPropagation();
        markAllAsRead();
        setNotifications([]);
    };

    const officialLinks = getOfficialLinks();
    const hasUpdates = notifications.length > 0;

    return (
        <>
            {/* Banner - Always visible */}
            <div
                className={`
                    relative overflow-hidden rounded-xl mb-4 p-3 cursor-pointer
                    transition-all duration-300 hover:scale-[1.01]
                    ${hasUpdates
                        ? isDark
                            ? 'bg-gradient-to-r from-rose-900/40 via-orange-900/40 to-amber-900/40 border border-rose-500/30'
                            : 'bg-gradient-to-r from-rose-100 via-orange-100 to-amber-100 border border-rose-200'
                        : isDark
                            ? 'bg-gradient-to-r from-emerald-900/30 via-teal-900/30 to-cyan-900/30 border border-emerald-500/20'
                            : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200'
                    }
                `}
                onClick={handleOpenModal}
            >
                {/* Animated pulse background for updates */}
                {hasUpdates && (
                    <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 via-orange-500/10 to-amber-500/10 animate-pulse" />
                )}

                <div className="relative flex items-center gap-3">
                    {/* Bell icon with badge */}
                    <div className="relative">
                        <div className={`
                            p-2 rounded-lg
                            ${hasUpdates
                                ? isDark ? 'bg-rose-500/20' : 'bg-rose-500/10'
                                : isDark ? 'bg-emerald-500/20' : 'bg-emerald-500/10'
                            }
                        `}>
                            <Bell className={`w-5 h-5 ${hasUpdates
                                ? isDark ? 'text-rose-400' : 'text-rose-600'
                                : isDark ? 'text-emerald-400' : 'text-emerald-600'
                                }`} />
                        </div>
                        {hasUpdates && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                                {notifications.length}
                            </span>
                        )}
                    </div>

                    {/* Message */}
                    <div className="flex-1 min-w-0">
                        {isChecking ? (
                            <>
                                <p className={`text-sm font-bold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                    🔍 Checking for exam updates...
                                </p>
                                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    NBE (NEET-SS) • AIIMS (INI-SS)
                                </p>
                            </>
                        ) : hasUpdates ? (
                            <>
                                <p className={`text-sm font-bold ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                                    📢 Exam Update Available!
                                </p>
                                <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {notifications[0]?.title || 'New notification from NBE/AIIMS'}
                                    {lastCheckedTime > 0 && <span className="opacity-60"> • Checked {formatLastChecked(lastCheckedTime)}</span>}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className={`text-sm font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                    ✓ All Clear - No New Updates
                                </p>
                                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                    NEET-SS • INI-SS{lastCheckedTime > 0 ? ` • Last checked ${formatLastChecked(lastCheckedTime)}` : ' — Tap to check'}
                                </p>
                            </>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                        {/* Refresh button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRefresh();
                            }}
                            disabled={isChecking}
                            className={`
                                p-2 rounded-lg transition-colors
                                ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}
                                ${isChecking ? 'opacity-50' : ''}
                            `}
                            title="Check for updates"
                        >
                            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''} ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                        </button>

                        {/* Mark as Seen button (only show when there are updates) */}
                        {hasUpdates && (
                            <button
                                onClick={handleMarkAsSeen}
                                className={`
                                    p-2 rounded-lg transition-colors
                                    ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}
                                `}
                                title="Mark as seen"
                            >
                                <X className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Scrolling ticker for multiple notifications */}
                {hasUpdates && notifications.length > 1 && (
                    <div className={`mt-2 pt-2 border-t ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                        <div className="flex gap-4 overflow-x-auto scrollbar-hide">
                            {notifications.map((n) => (
                                <span
                                    key={n.id}
                                    className={`
                                        text-xs whitespace-nowrap px-2 py-1 rounded-full
                                        ${n.examType === 'NEET-SS'
                                            ? isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
                                            : isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
                                        }
                                    `}
                                >
                                    {n.examType}: {n.year}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in"
                    onClick={handleCloseModal}
                >
                    <div
                        className={`
              relative max-w-md w-full rounded-2xl p-6 shadow-2xl animate-pop
              ${isDark
                                ? 'bg-slate-900 border border-slate-700'
                                : 'bg-white border border-gray-200'
                            }
            `}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                                <Bell className="w-5 h-5 text-rose-500" />
                                Exam Notifications
                            </h2>
                            <button
                                onClick={handleCloseModal}
                                className={`p-2 rounded-lg ${isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Notifications List */}
                        <div className="space-y-3 mb-4 max-h-[50vh] overflow-y-auto">
                            {notifications.length > 0 ? (
                                notifications.map((n) => (
                                    <div
                                        key={n.id}
                                        className={`
                      rounded-xl p-4 border
                      ${isDark
                                                ? 'bg-slate-800 border-slate-700'
                                                : 'bg-gray-50 border-gray-200'
                                            }
                    `}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <span className={`
                        text-xs px-2 py-1 rounded-full font-bold
                        ${n.examType === 'NEET-SS'
                                                    ? 'bg-blue-500/20 text-blue-500'
                                                    : 'bg-purple-500/20 text-purple-500'
                                                }
                      `}>
                                                {n.examType} {n.year}
                                            </span>
                                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                {new Date(n.detectedAt).toLocaleDateString()}
                                            </span>
                                        </div>

                                        <p className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                            {n.title}
                                        </p>

                                        {/* Links */}
                                        <div className="flex flex-wrap gap-2">
                                            {n.links.informationBulletin && (
                                                <a
                                                    href={n.links.informationBulletin}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`
                            text-xs px-3 py-1.5 rounded-lg flex items-center gap-1
                            ${isDark
                                                            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                                        }
                          `}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    Bulletin
                                                </a>
                                            )}
                                            {n.links.applicationLink && (
                                                <a
                                                    href={n.links.applicationLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`
                            text-xs px-3 py-1.5 rounded-lg flex items-center gap-1
                            ${isDark
                                                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                                            : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                                                        }
                          `}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    Apply
                                                </a>
                                            )}
                                            {n.links.results && (
                                                <a
                                                    href={n.links.results}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`
                            text-xs px-3 py-1.5 rounded-lg flex items-center gap-1
                            ${isDark
                                                            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                                                            : 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                                                        }
                          `}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    Results
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className={`text-center py-8 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                    <p>No new notifications</p>
                                </div>
                            )}
                        </div>

                        {/* Quick Links */}
                        <div className={`pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                            <p className={`text-xs mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                Check official websites:
                            </p>
                            <div className="flex gap-2">
                                <a
                                    href={officialLinks.NEET_SS}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`
                    flex-1 text-center text-xs py-2 px-3 rounded-lg font-medium
                    ${isDark
                                            ? 'bg-slate-800 text-blue-400 hover:bg-slate-700'
                                            : 'bg-gray-100 text-blue-600 hover:bg-gray-200'
                                        }
                  `}
                                >
                                    NBE (NEET-SS)
                                </a>
                                <a
                                    href={officialLinks.INI_SS}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`
                    flex-1 text-center text-xs py-2 px-3 rounded-lg font-medium
                    ${isDark
                                            ? 'bg-slate-800 text-purple-400 hover:bg-slate-700'
                                            : 'bg-gray-100 text-purple-600 hover:bg-gray-200'
                                        }
                  `}
                                >
                                    AIIMS (INI-SS)
                                </a>
                            </div>
                        </div>

                        {/* Refresh button */}
                        <button
                            onClick={handleRefresh}
                            disabled={isChecking}
                            className={`
                w-full mt-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2
                transition-all duration-300
                ${isDark
                                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                }
                ${isChecking ? 'opacity-50 cursor-not-allowed' : ''}
              `}
                        >
                            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                            {isChecking ? 'Checking...' : 'Check for Updates'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default ExamNotificationBanner;
