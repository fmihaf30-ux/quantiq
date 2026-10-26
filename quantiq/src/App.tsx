import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { TradeLensPage } from './pages/TradeLensPage';
import { AITradingPage } from './pages/AITradingPage';
import { BotsPage } from './pages/BotsPage';
import { UploadChartPage } from './pages/UploadChartPage';
import { PulseSignalsPage } from './pages/PulseSignalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupportPage } from './pages/SupportPage';
import { MT5ConnectModal } from './components/MT5ConnectModal';
import { store } from './lib/store';
import { Server, Sparkles, Sun, Moon } from 'lucide-react';
import { useTheme } from './context/ThemeContext';

export const App: React.FC = () => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [accounts, setAccounts] = useState(store.getAccounts());
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const activeAccount = store.getActiveAccount();

  useEffect(() => {
    return store.subscribe(() => {
      setAccounts(store.getAccounts());
    });
  }, []);

  // For /ai-trading or /chart, hide the global sidebar if user wants the full desk view as in Screenshot 2
  const isAIDesk = location.pathname === '/ai-trading' || location.pathname === '/chart';

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-[#f8fafc] text-slate-800' : 'bg-[#07090e] text-slate-100'} flex font-sans`}>
      {/* Quantiq Left Sidebar (Fixed on Desktop, unless full AI Desk) */}
      {!isAIDesk && <Sidebar />}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${!isAIDesk ? 'md:pl-64' : ''}`}>
        {/* Top Header Bar (Only shown on pages other than full AI Desk) */}
        {!isAIDesk && (
          <header className={`sticky top-0 z-30 h-16 border-b ${theme === 'light' ? 'border-slate-200 bg-white/90' : 'border-[#181d28] bg-[#0c0f16]/90'} backdrop-blur-md px-4 sm:px-8 flex items-center justify-between`}>
            <div className="flex items-center gap-2 pl-12 md:pl-0">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider hidden sm:inline">
                Quantiq Terminal
              </span>
              <span className="text-slate-400 hidden sm:inline">/</span>
              <span className={`text-xs font-extrabold uppercase tracking-wide ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>
                {location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/overview'
                  ? 'Overview'
                  : location.pathname.replace('/', '').replace('-', ' ')}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                  theme === 'light'
                    ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm'
                    : 'bg-[#12151d] border-[#222735] text-amber-400 hover:bg-[#1a1f2c]'
                }`}
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Dark</span>
                  </>
                ) : (
                  <>
                    <Sun className="h-3.5 w-3.5 text-amber-400" />
                    <span>Light</span>
                  </>
                )}
              </button>
              {activeAccount ? (
                <div className="flex items-center gap-2 bg-[#12151d] border border-[#222735] px-3 py-1.5 rounded-xl text-xs font-mono">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-slate-400 hidden sm:inline">{activeAccount.broker}:</span>
                  <span className="font-bold text-white">{activeAccount.accountNumber}</span>
                  <span className="text-[#c4f042] font-extrabold ml-1">
                    ${activeAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <Link
                    to="/settings"
                    className="ml-1 text-[10px] text-purple-400 hover:text-purple-300 font-sans font-bold underline"
                    title="Switch or Edit Account"
                  >
                    Switch
                  </Link>
                </div>
              ) : (
                <button
                  onClick={() => setIsConnectModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  <Server className="h-3.5 w-3.5" />
                  <span>Connect MT5</span>
                </button>
              )}

              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Unlimited Free AI</span>
              </div>
            </div>
          </header>
        )}

        {/* Dynamic Route View */}
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/overview" element={<DashboardPage />} />
            <Route path="/lens" element={<TradeLensPage />} />
            <Route path="/trade-lens" element={<TradeLensPage />} />
            <Route path="/chart" element={<AITradingPage />} />
            <Route path="/ai-trading" element={<AITradingPage />} />
            <Route path="/bots" element={<BotsPage />} />
            <Route path="/auto-trading" element={<BotsPage />} />
            <Route path="/manage-bots" element={<BotsPage />} />
            <Route path="/upload-chart" element={<UploadChartPage />} />
            <Route path="/pulse-signals" element={<PulseSignalsPage />} />
            <Route path="/signals" element={<PulseSignalsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        </main>
      </div>

      {/* Connect Modal */}
      <MT5ConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onAccountAdded={() => setAccounts(store.getAccounts())}
      />
    </div>
  );
};
