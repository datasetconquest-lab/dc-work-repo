import { useAuth } from '../contexts/AuthContext';
import { usePortal } from '../contexts/PortalContext';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { LogOut, ArrowRight, Layers, Database, Sparkles, CheckCircle2 } from 'lucide-react';

export function PortalChooser() {
  const { profile, signOut } = useAuth();
  const { choosePortal } = usePortal();

  return (
    <div className="min-h-screen bg-[#F5F7FB] dark:bg-[#101827] flex flex-col justify-between p-4 md:p-8 relative overflow-hidden transition-colors duration-300">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-600/15 blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-96 h-96 rounded-full bg-purple-500/10 dark:bg-purple-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04] bg-[radial-gradient(#2563EB_1px,transparent_1px)] [background-size:24px_24px]"
        />
      </div>

      {/* Top Bar */}
      <header className="relative z-20 w-full flex items-center justify-between max-w-5xl mx-auto">
        <div className="h-8 flex items-center">
          <Logo className="h-8 w-auto object-contain" />
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white dark:bg-[#1B273B] border border-slate-200 dark:border-slate-700/80 rounded-xl p-1 shadow-xs">
            <ThemeToggle className="p-1.5" />
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#1B273B] border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-[#243249] transition-colors shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Central Content */}
      <main className="relative z-10 w-full max-w-4xl mx-auto my-auto py-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            Unified Research & Operations
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#172033] dark:text-[#F1F5F9]">
            Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-[#A8B4C7] mt-2 max-w-md mx-auto">
            Select the designated workspace you wish to launch
          </p>
        </div>

        {/* Portals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* User Portal Card */}
          <button
            type="button"
            onClick={() => choosePortal('user')}
            className="group text-left bg-white dark:bg-[#1B273B] border border-slate-200/90 dark:border-[#2E3D56] hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-7 shadow-card hover:shadow-card-hover dark:shadow-dark-card transition-all duration-300 transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between min-h-[300px]"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                  <Layers className="w-7 h-7" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50">
                  Core Portal
                </span>
              </div>

              <h2 className="text-xl font-bold text-[#172033] dark:text-[#F1F5F9] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                User & Admin Portal
              </h2>
              <p className="text-sm text-slate-500 dark:text-[#A8B4C7] mt-2 leading-relaxed">
                Primary team workspace for tasks, project tracking, messaging, calendar schedules, attendance, and member administration.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {['Tasks & Sprint', 'Attendance Analytics', 'Team Messages', 'Groups'].map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#243249] px-2.5 py-1 rounded-md"
                  >
                    <CheckCircle2 className="w-3 h-3 text-blue-500" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-sm font-semibold text-blue-600 dark:text-blue-400">
              <span>Enter Workspace</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
            </div>
          </button>

          {/* EDA Portal Card */}
          <button
            type="button"
            onClick={() => choosePortal('eda')}
            className="group text-left bg-white dark:bg-[#1B273B] border border-slate-200/90 dark:border-[#2E3D56] hover:border-purple-500 dark:hover:border-purple-500 rounded-2xl p-7 shadow-card hover:shadow-card-hover dark:shadow-dark-card transition-all duration-300 transform hover:-translate-y-1 cursor-pointer flex flex-col justify-between min-h-[300px]"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-14 h-14 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200/60 dark:border-purple-800/60 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                  <Database className="w-7 h-7" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50">
                  AI & Analysis
                </span>
              </div>

              <h2 className="text-xl font-bold text-[#172033] dark:text-[#F1F5F9] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                EDA Research Assistant
              </h2>
              <p className="text-sm text-slate-500 dark:text-[#A8B4C7] mt-2 leading-relaxed">
                Dedicated research suite for dataset exploration, scientific literature analysis, automated research gap extraction, and insights.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {['Paper Gaps', 'Dataset EDA', 'Automated Synthesis', 'ML Models'].map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#243249] px-2.5 py-1 rounded-md"
                  >
                    <CheckCircle2 className="w-3 h-3 text-purple-500" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-sm font-semibold text-purple-600 dark:text-purple-400">
              <span>Launch Research Suite</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
            </div>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
        Data Conquest Enterprise Environment • High-Performance Research Node
      </footer>
    </div>
  );
}
