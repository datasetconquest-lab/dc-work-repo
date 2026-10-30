import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Mail, Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-100 dark:bg-blue-900/40 rounded-full opacity-20 animate-pulse" style={{ animationDuration: '4s' }}></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-blue-200 dark:bg-blue-800/40 rounded-full opacity-20 animate-pulse" style={{ animationDuration: '6s' }}></div>
      </div>

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg relative z-10">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 transform transition-all hover:scale-[1.01] duration-300">
          <div className="flex justify-center mb-8">
            <Logo className="w-full h-auto px-2" />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome Back</h1>
            <p className="text-gray-600 dark:text-gray-300 dark:text-gray-400">Sign in to your organization workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-500/80 dark:border-red-600 p-4 rounded-xl text-sm animate-shake shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <p className="font-bold text-red-900 dark:text-red-100 text-sm">
                      Access Denied: Unauthorized Network
                    </p>
                    <p className="text-red-800 dark:text-red-300 text-xs leading-relaxed">
                      {error}
                    </p>
                    {detectedIp && (
                      <div className="mt-2.5 p-3 bg-red-100/90 dark:bg-red-900/60 rounded-lg border border-red-300 dark:border-red-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-red-900 dark:text-red-200">
                            Your Connected IP:
                          </span>
                          <span className="font-mono font-extrabold text-sm text-red-800 dark:text-red-100 bg-white dark:bg-gray-900 px-2.5 py-1 rounded border border-red-300 dark:border-red-700 shadow-sm">
                            {detectedIp}
                          </span>
                        </div>
                        <p className="text-[11px] text-red-700 dark:text-red-300 mt-2">
                          Your current IP does not start with <b>223.185.</b> and has not been authorized. Contact your system administrator to allocate this IP for WFH access.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 dark:text-gray-300">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="you@organization.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200 dark:text-gray-300">
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 dark:hover:text-gray-200 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200 dark:text-gray-300">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
                  disabled={loading}
                />
                Remember me
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Auto-login on next visit</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg font-medium hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300 dark:text-gray-400">
              Contact your administrator for account access
            </p>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Secure workspace for your organization</p>
        </div>
      </div>
    </div>
  );
}
