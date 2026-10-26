import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { store } from '../lib/store';
import type { MT5Account } from '../types';
import { 
  LayoutGrid, 
  Wrench, 
  Scan, 
  Zap, 
  BarChart3, 
  Upload, 
  Bot, 
  Radio, 
  Headphones, 
  Settings, 
  ChevronRight,
  Sparkles,
  Menu,
  X,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [accounts, setAccounts] = useState(store.getAccounts());
  const [activeAccount, setActiveAccount] = useState<MT5Account | undefined>(store.getActiveAccount());

  useEffect(() => {
    return store.subscribe(() => {
      setAccounts(store.getAccounts());
      setActiveAccount(store.getActiveAccount());
    });
  }, []);

  const navItems = [
    {
      title: 'Overview',
      to: '/dashboard',
      icon: LayoutGrid,
    },
  ];

  const quickAccessTools = [
    {
      title: 'Quantiq Trade Lens',
      to: '/lens',
      icon: Scan,
      badge: '💎',
    },
    {
      title: 'Auto Trading',
      to: '/bots',
      icon: Zap,
      badge: '💎',
    },
    {
      title: 'AI Trading',
      to: '/ai-trading',
      icon: BarChart3,
    },
    {
      title: 'Upload Chart',
      to: '/upload-chart',
      icon: Upload,
    },
    {
      title: 'Manage Bots',
      to: '/manage-bots',
      icon: Bot,
      badge: '💎',
    },
    {
      title: 'Pulse Signals',
      to: '/pulse-signals',
      icon: Radio,
      badge: '💎',
    },
  ];

  const bottomItems = [
    {
      title: 'Contact Support',
      to: '/support',
      icon: Headphones,
    },
    {
      title: 'Settings',
      to: '/settings',
      icon: Settings,
      hasArrow: true,
    },
  ];

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 rounded-xl border border-[#2a303d] bg-[#121418] p-2 text-slate-300 md:hidden shadow-lg"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 flex flex-col border-r border-[#1e222d] bg-[#0c0e14] transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Quantiq Brand Header */}
        <div className={`flex items-center justify-between px-5 py-5 border-b ${theme === 'light' ? 'border-slate-200 bg-white' : 'border-[#181b24]'}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-300 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`font-extrabold text-xl tracking-tight font-sans ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  quantiq
                </span>
                <span className="rounded bg-purple-500/20 px-1 py-0.2 text-[9px] font-bold text-purple-400 uppercase">
                  AI
                </span>
              </div>
              <span className="text-[10px] text-slate-500 tracking-wider">
                Autonomous MT5 System
              </span>
            </div>
          </div>

          {/* Theme Quick Toggle */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              theme === 'light'
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-[#141722] border-[#222736] text-amber-400 hover:bg-[#1a1f2c]'
            }`}
            title={`Toggle ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="h-3.5 w-3.5 text-indigo-600" /> : <Sun className="h-3.5 w-3.5 text-amber-400" />}
          </button>
        </div>

        {/* Navigation Body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Overview */}
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to || (item.to === '/dashboard' && location.pathname === '/');
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#181b24] text-white shadow-sm'
                      : 'text-slate-400 hover:bg-[#12151d] hover:text-slate-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </div>

          {/* Quick Access Tools Section */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-xl bg-purple-950/30 border border-purple-800/40 px-3.5 py-2 text-xs font-bold text-purple-300">
              <Wrench className="h-3.5 w-3.5 text-purple-400" />
              <span>Quick Access Tools</span>
            </div>

            <div className="pt-1 space-y-0.5">
              {quickAccessTools.map((tool) => {
                const Icon = tool.icon;
                const isActive = location.pathname === tool.to;
                return (
                  <Link
                    key={tool.to}
                    to={tool.to}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#181b24] text-white font-bold'
                        : 'text-slate-400 hover:bg-[#12151d] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${isActive ? 'text-[#c4f042]' : 'text-slate-500'}`} />
                      <span>{tool.title}</span>
                    </div>
                    {tool.badge && (
                      <span className="text-[11px] opacity-75">{tool.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Bottom Items (Subscription & How to Use removed as requested) */}
          <div className="space-y-0.5 border-t border-[#181b24] pt-4">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#181b24] text-white font-bold'
                      : 'text-slate-400 hover:bg-[#12151d] hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-slate-500" />
                    <span>{item.title}</span>
                  </div>
                  {item.hasArrow && <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Active Account Pill Footer */}
        <div className="p-3 border-t border-[#181b24] bg-[#090b0f]">
          <Link
            to="/settings"
            className="flex items-center justify-between rounded-xl border border-[#222734] bg-[#12151d] p-2.5 hover:border-[#303848] transition-colors"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="flex flex-col truncate">
                <span className="text-[11px] font-bold text-white truncate">
                  {activeAccount ? `${activeAccount.broker} (${activeAccount.accountNumber})` : 'No MT5 Connected'}
                </span>
                <span className="text-[10px] text-[#c4f042] font-mono font-bold">
                  ${activeAccount ? activeAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-purple-400 underline font-semibold">Change</span>
          </Link>
        </div>
      </aside>
    </>
  );
};
