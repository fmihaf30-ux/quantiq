import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Zap, Mail, Lock, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { isLiveMode, supabase } from '../lib/supabase';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isLiveMode && supabase) {
      try {
        if (isSignUp) {
          const { error: err } = await supabase.auth.signUp({ email, password });
          if (err) throw err;
        } else {
          const { error: err } = await supabase.auth.signInWithPassword({ email, password });
          if (err) throw err;
        }
      } catch (err: any) {
        setError(err.message || 'Authentication error');
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    navigate('/dashboard');
  };

  const handleDemoAccess = () => {
    navigate('/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d] p-4 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-[#222734] bg-[#121418] p-8 shadow-2xl space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#c4f042] text-[#0a0b0d] font-bold shadow-[0_0_20px_rgba(196,240,66,0.3)] mb-2">
            <Zap className="h-6 w-6 fill-[#0a0b0d]" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">
            {isSignUp ? 'Create your Quantiq Account' : 'Welcome back to Quantiq'}
          </h2>
          <p className="text-xs text-slate-400">
            {isSignUp
              ? 'Start running automated MT5 cloud bots in minutes'
              : 'Sign in to access your cloud bots and MT5 bridges'}
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@quantiq.ai"
                className="w-full rounded-xl border border-[#262c38] bg-[#0c0e12] pl-10 pr-3 py-2.5 text-white placeholder-slate-600 focus:border-[#c4f042] focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-[#262c38] bg-[#0c0e12] pl-10 pr-3 py-2.5 text-white placeholder-slate-600 focus:border-[#c4f042] focus:outline-none"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#c4f042] py-3 text-xs font-bold text-[#0a0b0d] hover:bg-[#d4f85e] transition-all disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Demo button */}
        <div className="border-t border-[#1e2330] pt-4">
          <button
            onClick={handleDemoAccess}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#283040] bg-[#161a22] py-2.5 text-xs font-semibold text-slate-300 hover:bg-[#1d222e] transition-colors"
          >
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span>Instant Demo Access (No password needed)</span>
          </button>
        </div>

        {/* Toggle sign in / sign up */}
        <div className="text-center text-[11px] text-slate-400">
          {isSignUp ? (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="text-[#c4f042] hover:underline font-bold"
              >
                Sign In
              </button>
            </span>
          ) : (
            <span>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className="text-[#c4f042] hover:underline font-bold"
              >
                Create Account
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
