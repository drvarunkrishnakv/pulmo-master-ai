import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import XPDisplay from './XPDisplay';
import PowerupShop from './PowerupShop';

type TabType = 'dashboard' | 'practice' | 'analytics' | 'mcq-bank' | 'flashcards' | 'forecast' | 'habits';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onUploadClick?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onUploadClick, isOpen = false, onClose }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showShop, setShowShop] = useState(false);

  // Tabs that are ONLY in sidebar (not in mobile bottom navbar)
  const sidebarOnlyTabs = [
    { id: 'forecast', label: 'Exam Forecast', icon: '🔮' },
  ];

  // Tabs that are in BOTH sidebar and mobile navbar (show on desktop only)
  const desktopTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'practice', label: 'Practice Mode', icon: '📝' },
    { id: 'mcq-bank', label: 'MCQ Bank', icon: '🗃️' },
    { id: 'habits', label: 'Habits', icon: '✅' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`
        w-64 h-full overflow-y-auto border-r transition-transform duration-300 ease-spring
        fixed left-0 top-0 z-50
        md:sticky md:top-0 md:translate-x-0 md:flex-shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}
      `}>
        <div className="p-6">
          <h1 className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-blue-400' : 'text-blue-600'
            }`}>
            <span>🫁</span> Pulmo-Master AI <span className={`text-[10px] px-1 rounded ${isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
              }`}>v2.1</span>
          </h1>
          <p className={`text-xs mt-1 uppercase tracking-wider font-semibold ${isDark ? 'text-slate-500' : 'text-gray-500'
            }`}>NEET-SS / INI-SS Prep</p>
        </div>

        {/* XP Display */}
        <div className="px-3 mb-4">
          <XPDisplay onShopClick={() => setShowShop(true)} />
        </div>

        <nav className="px-3 space-y-1">
          {/* Desktop-only tabs (hidden on mobile since they're in bottom nav) */}
          {desktopTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                if (onClose) onClose();
              }}
              className={`hidden md:flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${activeTab === tab.id
                ? isDark
                  ? 'bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                  : 'bg-blue-50 text-blue-700 font-medium'
                : isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <span className="text-xl">{tab.icon}</span>
              {tab.label}
            </button>
          ))}

          {/* Sidebar-only tabs (shown on both mobile and desktop) */}
          {sidebarOnlyTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                if (onClose) onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${activeTab === tab.id
                ? isDark
                  ? 'bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                  : 'bg-blue-50 text-blue-700 font-medium'
                : isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <span className="text-xl">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Quick Actions */}
        <div className="mt-6 px-3">
          <p className={`text-xs uppercase font-semibold px-4 mb-2 ${isDark ? 'text-slate-600' : 'text-gray-400'
            }`}>Quick Actions</p>

          {/* Shop Button */}
          <button
            onClick={() => setShowShop(true)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isDark
              ? 'text-slate-400 hover:bg-purple-900/20 hover:text-purple-400'
              : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700'
              }`}
          >
            <span className="text-lg">🛒</span>
            Powerup Shop
          </button>

          {onUploadClick && (
            <button
              onClick={onUploadClick}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isDark
                ? 'text-slate-400 hover:bg-green-900/20 hover:text-green-400'
                : 'text-gray-600 hover:bg-green-50 hover:text-green-700'
                }`}
            >
              <span className="text-lg">📤</span>
              Upload Book
            </button>
          )}
        </div>

      </aside>

      {/* Powerup Shop Modal */}
      <PowerupShop isOpen={showShop} onClose={() => setShowShop(false)} />
    </>
  );
};

export default Sidebar;

