import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { LogIn, LogOut, Menu, X, Home, Paintbrush, User } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const { user, signInWithGoogle, signInWithApple, logOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <>
      <nav className="h-16 flex flex-shrink-0 items-center justify-between px-6 bg-zinc-900/50 border border-white/5 rounded-2xl shadow-xl backdrop-blur-md sticky top-0 z-50 mx-4 mt-4 md:mx-6 md:mt-6 mb-2">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="p-2 -ml-2 text-zinc-400 hover:text-white rounded-md hover:bg-white/5 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link to="/" className="flex items-center gap-4 text-xl font-bold tracking-tight text-white">
              <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)] hidden sm:flex">
                 <span className="text-xl font-black italic tracking-tighter text-white">M!</span>
              </div>
              <div>MEMEFORGE <span className="text-indigo-400">PRO</span></div>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                 <Link to="/editor/new" className="text-sm font-semibold hover:text-indigo-400 transition-colors text-zinc-300 hidden sm:block">
                   Create
                 </Link>
                 <Link to="/profile" className="flex items-center gap-2 text-sm font-medium hover:text-indigo-400 transition-colors">
                   {user.photoURL ? (
                     <img src={user.photoURL} alt={user.displayName || "User"} className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-zinc-800 object-cover" />
                   ) : (
                     <div className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center">
                       <User className="w-4 h-4 text-zinc-400" />
                     </div>
                   )}
                 </Link>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={signInWithGoogle} className="flex items-center gap-2 bg-zinc-800 border border-white/10 text-white px-3 py-2 rounded-lg font-semibold hover:bg-zinc-700 transition-all text-sm">
                  Google
                </button>
                <button onClick={signInWithApple} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg font-semibold hover:bg-indigo-500 transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] text-sm">
                  Apple
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
      <div className={`fixed inset-y-0 left-0 w-72 bg-zinc-950 border-r border-white/10 z-[101] transform transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.5)]">
               <span className="text-lg font-black italic tracking-tighter text-white">M!</span>
             </div>
             <span className="font-bold tracking-tight text-white">Navigation</span>
          </div>
          <button 
            onClick={closeMenu}
            className="p-2 -mr-2 text-zinc-400 hover:text-white rounded-md hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-2">
          <Link to="/" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-zinc-300 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Home className="w-5 h-5 text-indigo-400" />
            <span className="font-medium px-1">Home</span>
          </Link>
          
          <Link to="/editor/new" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-zinc-300 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <Paintbrush className="w-5 h-5 text-indigo-400" />
            <span className="font-medium px-1">Create Meme</span>
          </Link>

          {user && (
            <Link to="/profile" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-zinc-300 hover:text-white hover:bg-white/5 rounded-xl transition-all">
              <User className="w-5 h-5 text-indigo-400" />
              <span className="font-medium px-1">Profile</span>
            </Link>
          )}
        </div>

        {user && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/5">
            <button onClick={() => { logOut(); closeMenu(); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-zinc-400 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all font-medium">
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
