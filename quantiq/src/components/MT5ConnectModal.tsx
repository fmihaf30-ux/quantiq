import React, { useState } from 'react';
import { store } from '../lib/store';
import { normalizeServerName } from '../lib/metaapi';
import { X, Server, AlertCircle, Loader2, Cpu, Cloud, Check, Sparkles } from 'lucide-react';

interface MT5ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountAdded?: () => void;
}

const POPULAR_BROKERS = [
  { name: 'Exness', defaultServer: 'ExnessKE-Trial10' },
  { name: 'IC Markets Global', defaultServer: 'ICMarketsSC-Live02' },
  { name: 'FTMO Prop', defaultServer: 'FTMO-Server01' },
  { name: 'Pepperstone', defaultServer: 'Pepperstone-Live01' },
  { name: 'Deriv MT5', defaultServer: 'Deriv-Server' },
  { name: 'Other / Custom Broker', defaultServer: '' },
];

export const MT5ConnectModal: React.FC<MT5ConnectModalProps> = ({
  isOpen,
  onClose,
  onAccountAdded,
}) => {
  const [connectionType, setConnectionType] = useState<'local' | 'cloud'>('local');
  const [broker, setBroker] = useState(POPULAR_BROKERS[0].name);
  const [server, setServer] = useState(POPULAR_BROKERS[0].defaultServer);
  const [accountNumber, setAccountNumber] = useState('71905835');
  const [password, setPassword] = useState('');
  const [accountName, setAccountName] = useState('Exness Primary');
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const resolvedServerCluster = normalizeServerName(server);
  const isServerAliased = resolvedServerCluster.toLowerCase() !== server.trim().toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setIsLoading(true);

    if (!accountNumber) {
      setNotice('Please provide your MT5 login number.');
      setIsLoading(false);
      return;
    }

    try {
      const { provisionMetaApiAccount, fetchLiveAccountInfo } = await import('../lib/metaapi');

      let liveBalance: number | null = null;
      let liveEquity: number | null = null;
      let liveMargin: number = 0;
      let liveLeverage: number = 2000;
      let liveCurrency: string = 'USD';
      let metaapiAccountId: string = `mt5-${accountNumber}`;

      // 1. Attempt connection
      const metaRes = await provisionMetaApiAccount({
        broker,
        server,
        login: accountNumber,
        password,
        accountName,
        connectionType,
      });

      if (metaRes?.id) metaapiAccountId = metaRes.id;
      if (typeof metaRes?.balance === 'number') {
        liveBalance = metaRes.balance;
        liveEquity = metaRes.equity ?? metaRes.balance;
      }

      // If local, re-verify with live info from bridge
      if (connectionType === 'local') {
        const liveInfo = await fetchLiveAccountInfo();
        if (liveInfo && typeof liveInfo.balance === 'number') {
          liveBalance = liveInfo.balance;
          liveEquity = liveInfo.equity;
          liveMargin = liveInfo.freeMargin;
          liveLeverage = liveInfo.leverage;
          liveCurrency = liveInfo.currency;
        }
      }

      // Check if real account metrics were obtained
      if (liveBalance === null) {
        throw new Error(
          `Unable to authenticate MT5 Account #${accountNumber} on server "${server}". Please verify your Login ID, Trading Password, and Server Name.`
        );
      }

      // Save real account to store
      const created = await store.addAccount({
        accountNumber,
        broker,
        server,
        accountName: accountName || `${broker} ${accountNumber}`,
        currency: liveCurrency,
        balance: liveBalance,
        equity: liveEquity ?? liveBalance,
        freeMargin: liveMargin || liveBalance,
        leverage: liveLeverage,
        status: 'connected',
        isSimulated: false,
        metaapiAccountId,
      });

      if (created?.id) {
        store.setActiveAccountId(created.id);
      }

      setIsLoading(false);
      if (onAccountAdded) onAccountAdded();
      onClose();
    } catch (err: any) {
      console.error('MT5 Connection Error:', err);
      setNotice(err.message || 'Authentication failed. Please verify your credentials.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-3xl border border-[#2a303e] bg-[#121418] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222630] px-6 py-4 bg-[#161921]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c4f042]/20 text-[#c4f042]">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Connect MT5 Broker Account</h3>
              <p className="text-xs text-slate-400">Sync real-time balance and execute trades</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#202532] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {notice && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span className="leading-relaxed">{notice}</span>
            </div>
          )}

          {/* Connection Engine Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">Connection Engine</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConnectionType('local')}
                className={`flex flex-col items-start p-3 rounded-2xl border transition-all text-left ${
                  connectionType === 'local'
                    ? 'border-[#c4f042] bg-[#c4f042]/10 text-white shadow-[0_0_15px_rgba(196,240,66,0.15)]'
                    : 'border-[#252c3c] bg-[#0d1016] text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1.5">
                    <Cpu className={`h-4 w-4 ${connectionType === 'local' ? 'text-[#c4f042]' : 'text-slate-500'}`} />
                    <span className="text-xs font-extrabold">Desktop MT5 Bridge</span>
                  </div>
                  {connectionType === 'local' && <Check className="h-3.5 w-3.5 text-[#c4f042]" />}
                </div>
                <span className="text-[11px] leading-relaxed text-slate-400">
                  Connects directly to your open Windows terminal (Zero latency, 100% free).
                </span>
              </button>

              <button
                type="button"
                onClick={() => setConnectionType('cloud')}
                className={`flex flex-col items-start p-3 rounded-2xl border transition-all text-left ${
                  connectionType === 'cloud'
                    ? 'border-purple-500 bg-purple-500/10 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                    : 'border-[#252c3c] bg-[#0d1016] text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1.5">
                    <Cloud className={`h-4 w-4 ${connectionType === 'cloud' ? 'text-purple-400' : 'text-slate-500'}`} />
                    <span className="text-xs font-extrabold">MetaApi Cloud</span>
                  </div>
                  {connectionType === 'cloud' && <Check className="h-3.5 w-3.5 text-purple-400" />}
                </div>
                <span className="text-[11px] leading-relaxed text-slate-400">
                  Runs 24/7 headless on AWS cloud servers. No desktop MT5 or PC needed!
                </span>
              </button>
            </div>
          </div>

          {/* Broker Selector (One Exness entry that supports all Exness accounts & servers) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Broker</label>
            <select
              value={broker}
              onChange={(e) => {
                const val = e.target.value;
                setBroker(val);
                const match = POPULAR_BROKERS.find((b) => b.name === val);
                if (match && match.defaultServer) setServer(match.defaultServer);
              }}
              className="w-full rounded-xl border border-[#2a303e] bg-[#0c0e12] px-3.5 py-2.5 text-xs text-white focus:border-[#c4f042] focus:outline-none"
            >
              {POPULAR_BROKERS.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Server Name (Allows ALL Exness servers like ExnessKE-Trial10, Exness-MT5Trial9, etc.) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-300">Server Name</label>
              {isServerAliased && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <Sparkles className="h-3 w-3" />
                  Cluster Match: {resolvedServerCluster}
                </span>
              )}
            </div>
            <input
              type="text"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="e.g. ExnessKE-Trial10, Exness-MT5Trial9, or ICMarketsSC-Live02"
              required
              className="w-full rounded-xl border border-[#2a303e] bg-[#0c0e12] px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:border-[#c4f042] focus:outline-none"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Enter your exact broker server from your account details (e.g. <code className="text-slate-300 font-mono">ExnessKE-Trial10</code>).
            </span>
          </div>

          {/* Account Login ID */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Account Login ID</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 71905835"
              required
              className="w-full rounded-xl border border-[#2a303e] bg-[#0c0e12] px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:border-[#c4f042] focus:outline-none"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Trading Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your MT5 trading password"
              required
              className="w-full rounded-xl border border-[#2a303e] bg-[#0c0e12] px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:border-[#c4f042] focus:outline-none"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Required to authorize with your broker and retrieve your real account balance and equity.
            </span>
          </div>

          {/* Friendly Account Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Friendly Account Label</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Exness Real Trading"
              className="w-full rounded-xl border border-[#2a303e] bg-[#0c0e12] px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:border-[#c4f042] focus:outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#c4f042] py-3 text-xs font-extrabold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all shadow-[0_0_20px_rgba(196,240,66,0.3)] disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Authenticating with MT5...</span>
              </>
            ) : (
              <span>Connect & Auto-Sync MT5</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
