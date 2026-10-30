import { useState, useEffect, useRef, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Lock,
  Mail,
  Loader2,
  Eye,
  EyeOff,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Cpu,
  Activity,
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

// Dynamic interactive particle constellation background
function MotionParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Mouse tracking for subtle interactive attraction
    const mouse = { x: width / 2, y: height / 2, radius: 120 };
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Particle nodes
    const particleCount = Math.min(Math.floor((width * height) / 16000), 65);
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      baseColor: string;
    }> = [];

    const colors = [
      'rgba(37, 99, 235, ',   // Blue
      'rgba(14, 165, 233, ',  // Cyan
      'rgba(147, 51, 234, ',  // Purple / Violet
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        radius: Math.random() * 2 + 1.2,
        baseColor: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Connect particles within distance
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        p1.x += p1.vx;
        p1.y += p1.vy;

        // Bounce off canvas boundaries
        if (p1.x < 0 || p1.x > width) p1.vx *= -1;
        if (p1.y < 0 || p1.y > height) p1.vy *= -1;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${p1.baseColor} 0.7)`;
        ctx.fill();

        // Connect lines between nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0 opacity-60 dark:opacity-40"
    />
  );
}

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

    try {
      const { error: signInError } = await signIn(email, password, rememberMe);

      if (signInError) {
        setError(signInError.message || 'Authentication failed');
        let ip = (signInError as any).detectedIp || null;
        if (!ip) {
          const match = signInError.message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
          if (match) ip = match[0];
        }
        setDetectedIp(ip);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to authentication server');
    } finally {
      setLoading(false);
    }
  };

  const isIpError =
    detectedIp !== null ||
    error.toLowerCase().includes('ip') ||
    error.toLowerCase().includes('unauthorized network') ||
    error.toLowerCase().includes('223.185');

  return (
    <div className="min-h-screen bg-[#F5F7FB] dark:bg-[#0E1524] text-slate-800 dark:text-slate-100 relative flex flex-col justify-between overflow-x-hidden selection:bg-blue-500/20 selection:text-blue-600 transition-colors duration-300">
      {/* Dynamic interactive particle constellation */}
      <MotionParticleBackground />

      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full bg-blue-500/15 dark:bg-blue-600/20 blur-[120px]" />
        <div className="absolute top-1/2 -right-32 w-[32rem] h-[32rem] rounded-full bg-cyan-400/15 dark:bg-cyan-500/15 blur-[120px]" />
        <div className="absolute -bottom-32 left-1/3 w-[30rem] h-[30rem] rounded-full bg-purple-500/10 dark:bg-purple-600/15 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04] bg-[radial-gradient(#2563EB_1.5px,transparent_1.5px)] [background-size:24px_24px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-20 w-full px-6 py-5 max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Plaque */}
        <div className="flex items-center gap-3">
          <div className="h-10 px-3 py-1 bg-white dark:bg-white/95 rounded-xl border border-slate-200 dark:border-white/20 flex items-center">
            <img
              src="/dc_solution_logo.jpg"
              alt="Data Conquest Solution"
              className="h-7 w-auto object-contain"
            />
          </div>
        </div>

        {/* Status Indicators & Theme Switcher */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1B273B] border border-slate-200 dark:border-[#2E3D56]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px]">Strict IP Gateway: 223.185.*.*</span>
          </div>

          <div className="bg-white dark:bg-[#1B273B] border border-slate-200 dark:border-[#2E3D56] rounded-xl p-1">
            <ThemeToggle className="p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" />
          </div>
        </div>
      </header>

      {/* Main Content Area: Motion Hero & Auth Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 md:py-12 max-w-7xl w-full mx-auto">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* ========================================================= */}
          {/* LEFT COLUMN: HERO SHOWCASE WITH OFFICIAL LOGO             */}
          {/* ========================================================= */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-cyan-400 bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800/80 animate-float">
              <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-spin" style={{ animationDuration: '6s' }} />
              <span>Next-Gen Research & Operations Hub</span>
            </div>

            {/* Official Logo Hero Plaque */}
            <div className="inline-block p-4 sm:p-5 bg-white dark:bg-white/95 rounded-2xl border border-slate-200 dark:border-white/30">
              <img
                src="/dc_solution_logo.jpg"
                alt="Data Conquest Solution — Data • Ideas • Impact"
                className="max-h-20 sm:max-h-24 w-auto object-contain mx-auto"
              />
            </div>

            {/* Headings */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                Intelligent Research & <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 bg-clip-text text-transparent">
                  Enterprise Data Workspace
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-[#A8B4C7] max-w-lg mx-auto lg:mx-0 leading-relaxed">
                Seamless collaboration, AI research synthesis, dataset exploration, task execution, and work telemetry in one secure platform.
              </p>
            </div>

            {/* Floating Capability Badges */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white dark:bg-[#151F32] border border-slate-200 dark:border-[#243249] animate-float">
                <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 mb-1">
                  <Cpu className="w-4 h-4" />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">AI Synthesis</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Automated paper gap discovery</p>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-[#151F32] border border-slate-200 dark:border-[#243249] animate-float-slow">
                <div className="flex items-center gap-2.5 text-cyan-500 mb-1">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Work Telemetry</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">10h daily analytics tracking</p>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-[#151F32] border border-slate-200 dark:border-[#243249] animate-float-reverse">
                <div className="flex items-center gap-2.5 text-emerald-500 mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Strict IP Access</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Office & authorized WFH nodes</p>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: CLEAN BORDER AUTHENTICATION FORM CARD        */}
          {/* ========================================================= */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end">
            <div className="w-full max-w-[460px]">
              {/* Main Card (No outer glow, no shadows, no hover transitions) */}
              <div className="bg-white dark:bg-[#1B273B] rounded-2xl border border-slate-200 dark:border-[#2E3D56] p-7 sm:p-9">
                {/* Header */}
                <div className="text-center mb-7">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Sign In to Hub
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                    Enter your organization credentials to access the workspace
                  </p>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="mb-6 bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800/80 rounded-xl p-4 text-sm animate-shake">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg text-red-600 dark:text-red-400 shrink-0 mt-0.5">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <p className="font-semibold text-red-900 dark:text-red-200 text-sm">
                          {isIpError ? 'Access Denied: Unauthorized Network' : 'Authentication Error'}
                        </p>
                        <p className="text-red-800 dark:text-red-300/90 text-xs leading-relaxed">
                          {error}
                        </p>

                        {/* Monospace Detected IP Pill */}
                        {detectedIp && (
                          <div className="mt-3 p-3 bg-white dark:bg-[#101827] rounded-lg border border-red-200 dark:border-red-900/60">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                Connected IP:
                              </span>
                              <span className="font-mono font-bold text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2.5 py-0.5 rounded border border-red-200 dark:border-red-800/60">
                                {detectedIp}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-normal">
                              Your current network IP does not start with <span className="font-semibold text-slate-800 dark:text-slate-200">223.185.</span> and is not in the approved WFH list. Contact your system administrator to allocate this IP.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="email"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      Work Email
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 dark:group-focus-within:text-cyan-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-[#151F32] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:bg-white dark:focus:bg-[#151F32] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-cyan-400 outline-none"
                        placeholder="kabil.dataconquest@outlook.com"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="password"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      Password
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 dark:group-focus-within:text-cyan-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-11 py-2.5 bg-slate-50 dark:bg-[#151F32] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-sm focus:bg-white dark:focus:bg-[#151F32] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-cyan-400 outline-none"
                        placeholder="••••••••••••"
                        required
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/30 bg-slate-50 dark:bg-[#151F32] cursor-pointer"
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

                  {/* Clean Submit Button (No shadows, no shimmer sweep, no hover shifts) */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying & Connecting...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Hub</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Footer note in card */}
                <div className="mt-7 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Protected by Enterprise Network Security • Authorized Personnel Only
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 py-4 px-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>© {new Date().getFullYear()} Data Conquest Solution. All rights reserved.</span>
        <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
        <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
          End-to-End TLS Encrypted Session
        </span>
      </footer>
    </div>
  );
}
