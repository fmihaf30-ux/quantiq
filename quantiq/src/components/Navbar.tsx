import React from 'react';
import { Link, useLocation } from 'react-router';
import { store, type GlobalRiskSettings } from '../lib/store';
import { GlobalRiskModal } from './GlobalRiskModal';
import { isLiveMode } from '../lib/supabase';
import { 
  Bot, 
  BarChart2, 
  LayoutDashboard, 
  CreditCard, 
  Sparkles,
  Zap,
  LogIn,
  Sliders
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const [user, setUser] = React.useState(store.getUser());
  const [accounts, setAccounts] = React.useState(store.getAccounts());
  const [activeAccount, setActiveAccount] = React.useState(store.getActiveAccount());
  const [riskSettings, setRiskSettings] = React.useState<GlobalRiskSettings>(store.getRiskSettings());
  const [isRiskModalOpen, setIsRiskModalOpen] = React.useState(false);

  React.useEffect(() => {
    return store.subscribe(() => {
      setUser(store.getUser());
      setAccounts(store.getAccounts());
      setActiveAccount(store.getActiveAccount());
      setRiskSettings(store.getRiskSettings());
    });
  }, []);

  const connectedAccount = activeAccount || accounts.find((a) => a.status === 'connected');

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/chart', label: 'Chart & AI', icon: BarChart2 },
    { to: '/bots', label: 'Cloud Bots', icon: Bot },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#222630] bg-[#0a0b0d]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c4f042] text-[#0a0b0d] font-bold shadow-[0_0_15px_rgba(196,240,66,0.25)] transition-transform group-hover:scale-105">
              <Zap className="h-5 w-5 fill-[#0a0b0d]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-white">Quantiq</span>
                <span className="rounded bg-[#c4f042]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-[#c4f042] uppercase">
                  OPEN SOURCE
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                100% Free Algorithmic Trading
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1b1f27] text-white border border-[#2a303d]'
                      : 'text-slate-400 hover:bg-[#12151b] hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[#c4f042]' : 'text-slate-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Info / Account / Credit */}
        <div className="flex items-center gap-2.5">
          {/* Global Risk & Position Limits Pill */}
          <button
            onClick={() => setIsRiskModalOpen(true)}
            title="Configure global risk % and trade execution limits"
            className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-300 hover:bg-purple-500/20 hover:border-purple-400 transition-all font-mono"
          >
            <Sliders className="h-3.5 w-3.5 text-purple-400" />
            <span className="font-bold">
              {riskSettings.mode === 'RISK_PCT' ? `${riskSettings.riskPercent}% Risk` : `${riskSettings.fixedLot} Lots`}
            </span>
            <span className="text-[10px] text-purple-400/80">• {riskSettings.maxTrades} Max</span>
          </button>

          {/* MT5 Status Pill */}
          <Link
            to="/settings"
            title="Click to manage MT5 accounts"
            className="hidden sm:flex items-center gap-2 rounded-full border border-[#222630] bg-[#121418] px-3 py-1 text-xs hover:border-[#c4f042]/50 transition-colors cursor-pointer"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                connectedAccount ? 'bg-[#c4f042] animate-pulse shadow-[0_0_8px_#c4f042]' : 'bg-amber-400'
              }`}
            />
            <span className="font-mono text-slate-300">
              {connectedAccount ? (
                <>
                  <span className="text-slate-400">MT5: </span>
                  <span className="font-semibold">{connectedAccount.accountNumber}</span>
                  <span className="ml-1 text-[#c4f042] font-semibold">
                    ${connectedAccount.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </>
              ) : (
                <span className="text-amber-400 font-medium">MT5 Disconnected</span>
              )}
            </span>
          </Link>

          {/* Free & Open Source Pill */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Unlimited AI</span>
          </div>

          {/* User profile / Demo switch */}
          <div className="flex items-center gap-2">
            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-2 rounded-lg border border-[#262c37] bg-[#151921] px-2.5 py-1 text-xs hover:border-[#384152] transition-colors"
              >
                <img
                  src={user.avatarUrl}
                  alt="Avatar"
                  className="h-6 w-6 rounded-full object-cover ring-1 ring-[#c4f042]/50"
                />
                <span className="hidden sm:inline font-medium text-slate-200">{user.fullName}</span>
              </Link>
            ) : (
              <Link
                to="/auth"
                className="rounded-lg bg-[#c4f042] px-3 py-1.5 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Global Risk Settings Modal */}
      <GlobalRiskModal
        isOpen={isRiskModalOpen}
        onClose={() => setIsRiskModalOpen(false)}
      />
    </header>
  );
};
