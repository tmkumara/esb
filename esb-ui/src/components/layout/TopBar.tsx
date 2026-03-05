import { Zap, Search, Bell, HelpCircle } from 'lucide-react';

export function TopBar() {
  return (
    <header className="bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] h-14 flex items-center px-6 gap-4 shadow-lg z-30 relative">
      {/* Brand Logo */}
      <div className="flex items-center gap-2 flex-shrink-0 min-w-[180px]">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
        </div>
        <div>
          <span className="text-white font-extrabold text-lg tracking-wide leading-none">FINEXA</span>
          <span className="text-blue-200 font-medium text-sm ml-1.5 leading-none">ESB</span>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-200" />
          <input
            type="text"
            placeholder="Search routes, transforms..."
            className="w-full pl-9 pr-4 py-2 bg-white/10 text-white placeholder-blue-200 rounded-lg text-sm border border-white/20 focus:outline-none focus:bg-white/20 focus:border-white/40 transition-all"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button className="w-8 h-8 flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
          <Bell className="w-4.5 h-4.5 w-5 h-5" />
        </button>
        <button className="w-8 h-8 flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
          <HelpCircle className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-blue-400 border-2 border-white/40 flex items-center justify-center cursor-pointer hover:bg-blue-300 transition-colors">
          <span className="text-white text-sm font-bold">S</span>
        </div>
      </div>
    </header>
  );
}
