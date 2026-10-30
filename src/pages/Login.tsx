import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Mail, Loader2, Eye, EyeOff, ShieldAlert, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const { signIn } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setDetectedIp(null);
    setLoading(true);

    const { error } = await signIn(email, password, rememberMe);

    if (error) {
      setError(error.message);
      let ip = (error as any).detectedIp || null;
      if (!ip) {
        const match = error.message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        if (match) ip = match[0];
      }
      setDetectedIp(ip);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] dark:bg-[#101827] flex flex-col justify-between relative overflow-hidden transition-colors duration-300">
      {/* Ambient background lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-400/10 dark:bg-blue-600/15 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[30rem] h-[30rem] rounded-full bg-cyan-400/10 dark:bg-cyan-500/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-[28rem] h-[28rem] rounded-full bg-indigo-500/10 dark:bg-indigo-600/10 blur-3xl" />
        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04] bg-[radial-gradient(#2563EB_1px,transparent_1px)] [background-size:24px_24px]"
        />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 w-full px-6 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-9 w-auto flex items-center">
            <Logo className="h-8 md:h-9 w-auto object-contain" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-[#1B273B]/80 border border-slate-200/80 dark:border-slate-700/80 shadow-xs backdrop-blur-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Strict IP Gateway</span>
          </div>
          <div className="bg-white dark:bg-[#1B273B] border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-xs p-1">
            <ThemeToggle className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#243249]" />
          </div>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[460px]">
          {/* Card Wrapper */}
          <div className="bg-white dark:bg-[#1B273B] rounded-2xl shadow-card dark:shadow-dark-card border border-slate-200/90 dark:border-[#2E3D56] p-8 md:p-10 transition-all duration-300">
            {/* Header / Brand in card */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60 mb-3">
                <Sparkles className="w-3 h-3 text-blue-500" />
                Research Hub Platform
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#172033] dark:text-[#F1F5F9]">
                Welcome Back
              </h1>
              <p className="text-sm text-slate-500 dark:text-[#A8B4C7] mt-1.5">
                Sign in to your organization workspace
              </p>
            </div>

            {/* Error & Detected IP Alert Box */}
            {error && (
              <div className="mb-6 bg-red-50/90 dark:bg-red-950/40 border border-red-300 dark:border-red-800/80 rounded-xl p-4 text-sm animate-shake shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg text-red-600 dark:text-red-400 shrink-0 mt-0.5">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <p className="font-semibold text-red-900 dark:text-red-200 text-sm">
                      Access Denied: Unauthorized Network
                    </p>
                    <p className="text-red-800 dark:text-red-300/90 text-xs leading-relaxed">
                      {error}
                    </p>

                    {detectedIp && (
                      <div className="mt-3 p-3 bg-white/80 dark:bg-[#101827]/80 rounded-lg border border-red-200 dark:border-red-900/60">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            Connected IP:
                          </span>
                          <span className="font-mono font-bold text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2.5 py-0.5 rounded border border-red-200 dark:border-red-800/60">
                            {detectedIp}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-normal">
                          Only Airtel network (<span className="font-semibold text-slate-800 dark:text-slate-200">223.185.*.*</span>) or authorized WFH IPs can access this workspace. Contact your administrator to allocate this IP.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Work Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-[#151F32] border border-slate-300/80 dark:border-slate-700 text-[#172033] dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:bg-white dark:focus:bg-[#151F32] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-blue-500 outline-none transition-all duration-200 shadow-xs"
                    placeholder="name@dataconquest.com"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 dark:bg-[#151F32] border border-slate-300/80 dark:border-slate-700 text-[#172033] dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:bg-white dark:focus:bg-[#151F32] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-blue-500 outline-none transition-all duration-200 shadow-xs"
                    placeholder="••••••••••••"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/30 focus:ring-offset-0 bg-slate-50 dark:bg-[#151F32] cursor-pointer"
                    disabled={loading}
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Remember my session
                  </span>
                </label>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  30 days persistent
                </span>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full relative group overflow-hidden bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-3 rounded-xl font-medium text-sm transition-all duration-200 shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/30 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Hub</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </div>
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authorized Personnel Only • Contact Administrator for Credentials
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Enterprise Security Footer */}
      <footer className="relative z-20 py-4 px-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>© {new Date().getFullYear()} Data Conquest Research Lab. All rights reserved.</span>
        <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
          End-to-End Encrypted Session
        </span>
      </footer>
    </div>
  );
}
