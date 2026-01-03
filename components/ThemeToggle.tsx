import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
    size?: 'sm' | 'md' | 'lg';
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ size = 'md' }) => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    // Size configurations
    const sizes = {
        sm: { container: 'w-12 h-6', knob: 'w-5 h-5', translate: 'translate-x-6', icon: 'w-3 h-3' },
        md: { container: 'w-14 h-7', knob: 'w-6 h-6', translate: 'translate-x-7', icon: 'w-3.5 h-3.5' },
        lg: { container: 'w-16 h-8', knob: 'w-7 h-7', translate: 'translate-x-8', icon: 'w-4 h-4' },
    };

    const s = sizes[size];

    // Haptic feedback
    const vibrate = (pattern: number | number[] = 10) => {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    };

    return (
        <button
            onClick={() => { vibrate(5); toggleTheme(); }}
            className={`
        relative ${s.container} rounded-full p-0.5
        transition-all duration-500 ease-in-out
        ${isDark
                    ? 'bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                    : 'bg-gradient-to-r from-amber-200 via-orange-200 to-yellow-300 shadow-[0_0_15px_rgba(251,191,36,0.4)]'
                }
        focus:outline-none focus:ring-2 focus:ring-offset-2 
        ${isDark ? 'focus:ring-purple-500' : 'focus:ring-amber-400'}
      `}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {/* Stars (visible in dark mode) */}
            <div className={`absolute inset-0 overflow-hidden rounded-full transition-opacity duration-500 ${isDark ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-1 left-1.5 w-1 h-1 bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="absolute top-2.5 left-3 w-0.5 h-0.5 bg-white/80 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                <div className="absolute bottom-1.5 left-2 w-0.5 h-0.5 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
            </div>

            {/* Clouds (visible in light mode) */}
            <div className={`absolute inset-0 overflow-hidden rounded-full transition-opacity duration-500 ${isDark ? 'opacity-0' : 'opacity-100'}`}>
                <div className="absolute top-1 right-3 w-2 h-1 bg-white/60 rounded-full" />
                <div className="absolute bottom-1 right-2 w-1.5 h-0.5 bg-white/40 rounded-full" />
            </div>

            {/* Toggle Knob */}
            <div
                className={`
          ${s.knob} rounded-full
          transform transition-all duration-500 ease-in-out
          ${isDark ? s.translate : 'translate-x-0'}
          flex items-center justify-center
          ${isDark
                        ? 'bg-gradient-to-br from-slate-100 to-slate-300 shadow-[0_0_10px_rgba(255,255,255,0.5)]'
                        : 'bg-gradient-to-br from-yellow-300 to-orange-400 shadow-[0_0_15px_rgba(251,191,36,0.8)]'
                    }
        `}
            >
                {/* Sun Icon */}
                <div className={`absolute transition-all duration-500 ${isDark ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'}`}>
                    <svg className={s.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5" className="fill-yellow-500 stroke-orange-500" />
                        {/* Sun rays */}
                        <line x1="12" y1="1" x2="12" y2="3" className="stroke-orange-400" />
                        <line x1="12" y1="21" x2="12" y2="23" className="stroke-orange-400" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" className="stroke-orange-400" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" className="stroke-orange-400" />
                        <line x1="1" y1="12" x2="3" y2="12" className="stroke-orange-400" />
                        <line x1="21" y1="12" x2="23" y2="12" className="stroke-orange-400" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" className="stroke-orange-400" />
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" className="stroke-orange-400" />
                    </svg>
                </div>

                {/* Moon Icon */}
                <div className={`absolute transition-all duration-500 ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}`}>
                    <svg className={s.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" className="fill-slate-200 stroke-slate-400" />
                    </svg>
                </div>
            </div>
        </button>
    );
};

export default ThemeToggle;
