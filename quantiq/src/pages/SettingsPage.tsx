import React, { useState, useEffect } from 'react';
import { store } from '../lib/store';
import type { MT5Account } from '../types';
import { MT5ConnectModal } from '../components/MT5ConnectModal';
import { 
  Server, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  RefreshCw, 
  ShieldCheck, 
  Cpu, 
  Check,
  AlertCircle
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<MT5Account[]>(store.getAccounts());
  const [activeId, setActiveId] = useState<string>(store.getActiveAccountId());
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editServer, setEditServer] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editLogin, setEditLogin] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  useEffect(() => {
    return store.subscribe(() => {
      setAccounts(store.getAccounts());
      setActiveId(store.getActiveAccountId());
    });
  }, []);

  const handleSetActive = (id: string) => {
    store.setActiveAccountId(id);
    setActiveId(id);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to disconnect this MT5 account?')) {
      await store.deleteAccount(id);
    }
  };

  const handleStartEdit = (acc: MT5Account) => {
    setEditingAccountId(acc.id);
    setEditServer(acc.server);
    setEditName(acc.accountName);
    setEditLogin(acc.accountNumber);
  };

  const handleSaveEdit = async (id: string) => {
    await store.updateAccount(id, {
      server: editServer,
      accountName: editName,
      accountNumber: editLogin,
    });
    setEditingAccountId(null);
  };

  const handleSync = async (id: string) => {
    setIsSyncing(id);
    try {
      await store.syncLiveAccount(id);
    } finally {
      setIsSyncing(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b0d] p-4 sm:p-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1c202a] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">
            <span>QUANTIQ AI TERMINAL / SETTINGS</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Connected MT5 Accounts</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time MetaTrader 5 broker bridges. Account balance, equity, and margin are synchronized directly from your broker terminal.
          </p>
        </div>
        <button
          onClick={() => setIsConnectModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#c4f042] px-4 py-2.5 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_15px_rgba(196,240,66,0.25)]"
        >
          <Plus className="h-4 w-4" />
          <span>Connect New MT5 Account</span>
        </button>
      </div>

      {/* Connected Accounts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-[#c4f042]" />
            <h2 className="text-base font-bold text-white">Connected MT5 Terminals ({accounts.length})</h2>
          </div>
          <span className="text-xs text-slate-400">Click "Set Active" to switch account across the entire platform</span>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#242938] bg-[#0d1015] p-10 text-center">
            <Server className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white">No MT5 Accounts Connected</h3>
            <p className="text-xs text-slate-400 mt-1">
              Connect your broker account (Exness, IC Markets, FTMO, etc.) to start trading.
            </p>
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="mt-4 rounded-xl bg-[#c4f042] px-4 py-2 text-xs font-bold text-[#0a0b0d]"
            >
              Connect MT5 Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc) => {
              const isActive = acc.id === activeId;
              const isEditing = acc.id === editingAccountId;

              return (
                <div
                  key={acc.id}
                  className={`rounded-2xl border p-5 transition-all relative ${
                    isActive
                      ? 'border-[#c4f042]/50 bg-[#12161f] shadow-[0_0_25px_rgba(196,240,66,0.1)]'
                      : 'border-[#202532] bg-[#101217] hover:border-[#2a3242]'
                  }`}
                >
                  {/* Top Bar of Card */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#1c202a]">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                          isActive
                            ? 'bg-[#c4f042] text-[#0a0b0d]'
                            : 'bg-[#181d28] text-slate-300'
                        }`}
                      >
                        MT5
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{acc.accountName || acc.broker}</h4>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Login: <strong className="text-white">{acc.accountNumber}</strong> • {acc.server}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3" />
                          ACTIVE
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetActive(acc.id)}
                          className="rounded-lg border border-[#2c3344] bg-[#161a24] px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white hover:border-[#c4f042] transition-colors"
                        >
                          Set Active
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Account Metrics (Auto-pulled from Broker) or Edit Form */}
                  {isEditing ? (
                    <div className="py-4 space-y-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 font-bold mb-1">Account Login ID</label>
                        <input
                          type="text"
                          value={editLogin}
                          onChange={(e) => setEditLogin(e.target.value)}
                          className="w-full rounded-lg border border-[#2b3242] bg-[#0c0e12] px-3 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 font-bold mb-1">Broker Server Name</label>
                        <input
                          type="text"
                          value={editServer}
                          onChange={(e) => setEditServer(e.target.value)}
                          className="w-full rounded-lg border border-[#2b3242] bg-[#0c0e12] px-3 py-1.5 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 font-bold mb-1">Friendly Label</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-[#2b3242] bg-[#0c0e12] px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveEdit(acc.id)}
                          className="rounded-lg bg-[#c4f042] px-3 py-1.5 text-xs font-bold text-[#0a0b0d]"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => setEditingAccountId(null)}
                          className="rounded-lg border border-[#2c3344] px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 grid grid-cols-3 gap-2 font-mono text-center">
                      <div className="rounded-xl bg-[#0b0d11] p-2.5 border border-[#1a1e28]">
                        <span className="block text-[10px] text-slate-400 font-sans">BALANCE</span>
                        <span className="text-sm font-extrabold text-white">
                          ${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#0b0d11] p-2.5 border border-[#1a1e28]">
                        <span className="block text-[10px] text-slate-400 font-sans">EQUITY</span>
                        <span className="text-sm font-extrabold text-[#c4f042]">
                          ${acc.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#0b0d11] p-2.5 border border-[#1a1e28]">
                        <span className="block text-[10px] text-slate-400 font-sans">FREE MARGIN</span>
                        <span className="text-sm font-extrabold text-slate-300">
                          ${acc.freeMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#1c202a] text-xs">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {acc.metaapiAccountId ? 'MetaApi Cloud Terminal (Active)' : 'Direct Broker Bridge (Active)'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSync(acc.id)}
                        disabled={isSyncing === acc.id}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1a1e28] hover:text-white transition-colors"
                        title="Sync live metrics directly from MT5"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isSyncing === acc.id ? 'animate-spin text-[#c4f042]' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleStartEdit(acc)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1a1e28] hover:text-white transition-colors"
                        title="Edit Account Details"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(acc.id)}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Disconnect Account"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* System & AI Infrastructure */}
      <div className="rounded-2xl border border-[#202532] bg-[#101217] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-purple-400" />
          <h2 className="text-base font-bold text-white">System & AI Infrastructure</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl bg-[#0c0e12] p-4 border border-[#1d222e]">
            <span className="text-slate-400 font-bold block mb-1">Google Gemini Vision API</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected & Active
            </span>
            <p className="text-[11px] text-slate-500 mt-1">Trish Assistant SMC chart vision analysis</p>
          </div>

          <div className="rounded-xl bg-[#0c0e12] p-4 border border-[#1d222e]">
            <span className="text-slate-400 font-bold block mb-1">MetaApi Cloud Engine</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              REST Client Bridge Ready
            </span>
            <p className="text-[11px] text-slate-500 mt-1">Direct MT5 terminal dispatch</p>
          </div>

          <div className="rounded-xl bg-[#0c0e12] p-4 border border-[#1d222e]">
            <span className="text-slate-400 font-bold block mb-1">Licensing & Tier</span>
            <span className="text-[#c4f042] font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Open Source / 100% Free
            </span>
            <p className="text-[11px] text-slate-500 mt-1">Zero credit walls, unrestricted bots</p>
          </div>
        </div>
      </div>

      {/* Modal */}
      <MT5ConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        onAccountAdded={() => {
          setAccounts(store.getAccounts());
          setActiveId(store.getActiveAccountId());
        }}
      />
    </div>
  );
};
