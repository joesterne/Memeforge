import { X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useState } from "react";

export function AuthModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApple = async () => {
    setLoading("apple");
    await signInWithApple();
    setLoading(null);
    onClose();
  };

  const handleGoogle = async () => {
    setLoading("google");
    await signInWithGoogle();
    setLoading(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-sm relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center gap-2 mb-8 mt-2">
          <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            <span className="text-2xl font-black italic tracking-tighter text-white">M!</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white mt-2">
            Welcome to MemeForge
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
            Sign in to save templates and access AI generation
          </p>
        </div>
        
        <div className="flex flex-col gap-3">
          <button
            disabled={!!loading}
            onClick={handleGoogle}
            className="flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white px-4 py-3 rounded-xl font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all disabled:opacity-50"
          >
            {loading === "google" ? (
              <span className="animate-pulse">Connecting...</span>
            ) : (
              <>
                <img
                  src="https://www.google.com/favicon.ico"
                  alt="Google"
                  className="w-5 h-5"
                />
                Continue with Google
              </>
            )}
          </button>
          
          <button
            disabled={!!loading}
            onClick={handleApple}
            className="flex items-center justify-center gap-3 bg-black dark:bg-white text-white dark:text-black px-4 py-3 rounded-xl font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-md disabled:opacity-50"
          >
            {loading === "apple" ? (
              <span className="animate-pulse">Connecting...</span>
            ) : (
              <>
                <svg viewBox="0 0 384 512" className="w-5 h-5 fill-current">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"></path>
                </svg>
                Continue with Apple
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
