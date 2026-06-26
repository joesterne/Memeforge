import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { LogIn, LogOut, Menu, X, Home, Paintbrush, User, Sun, Moon } from "lucide-react";
import { useState } from "react";
import { AuthModal } from "./AuthModal";

export default function Navbar() {
  const { user, logOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <>
      <nav className="h-16 flex flex-shrink-0 items-center justify-between px-6 bg-white/70 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/5 rounded-2xl shadow-xl backdrop-blur-md sticky top-0 z-50 mx-4 mt-4 md:mx-6 md:mt-6 mb-2 transition-colors duration-300">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="p-2 -ml-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" className="flex items-center gap-4 text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)] hidden sm:flex">
                 <span className="text-xl font-black italic tracking-tighter text-white">M!</span>
              </div>
              <div>MEMEFORGE</div>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <button
               onClick={toggleTheme}
               className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-300 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
               aria-label="Toggle theme"
            >
               {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {user ? (
              <>
                 <Link to="/editor/new" className="text-sm font-semibold hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-zinc-700 dark:text-zinc-300 hidden sm:block">
                   Create
                 </Link>
                 <Link to="/profile" className="flex items-center gap-2 text-sm font-medium hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors bg-black/5 dark:bg-white/5 pr-3 pl-1 py-1 rounded-full border border-transparent hover:border-black/10 dark:hover:border-white/10">
                   {user.photoURL ? (
                     <img src={user.photoURL} alt={user.displayName || "User"} className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 object-cover" />
                   ) : (
                     <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                       <User className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
                     </div>
                   )}
                   <span className="hidden sm:inline-block font-semibold">
                      {user.displayName ? user.displayName.split(' ')[0] : 'Profile'}
                   </span>
                 </Link>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setIsAuthModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-500 transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] text-sm">
                  Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Navigation Drawer Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          onClick={closeMenu}
        />
      )}

        {/* Navigation Drawer */}
      <div className={`fixed inset-y-0 left-0 w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-white/10 z-[101] transform transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/5">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.5)]">
               <span className="text-lg font-black italic tracking-tighter text-white">M!</span>
             </div>
             <span className="font-bold tracking-tight text-zinc-900 dark:text-white">Navigation</span>
          </div>
          <button 
            onClick={closeMenu}
            className="p-2 -mr-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-2">
          <Link to="/" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all">
            <Home className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span className="font-medium px-1">Home</span>
          </Link>
          
          <Link to="/editor/new" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all">
            <Paintbrush className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span className="font-medium px-1">Create Meme</span>
          </Link>

          {user && (
            <Link to="/profile" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all">
              <User className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              <span className="font-medium px-1">Profile</span>
            </Link>
          )}
        </div>

        {user && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-zinc-200 dark:border-white/5">
            <button onClick={() => { logOut(); closeMenu(); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-zinc-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-white/5 rounded-xl transition-all font-medium">
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        )}
      </div>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
}
