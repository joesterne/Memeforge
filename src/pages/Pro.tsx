import { useState } from "react";
import { Link } from "react-router";
import { Check, Sparkles, Gem, ImagePlus, AlertCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../lib/api";

export default function Pro() {
  const { user, entitlement, entitlementLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canManageBilling = Boolean(entitlement && !["inactive", "canceled"].includes(entitlement.status));

  const subscribe = async () => {
    if (!user) {
      setErrorMsg("Please login first to subscribe");
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);
    try {
      const endpoint = canManageBilling ? "/api/create-portal-session" : "/api/create-checkout-session";
      const data = await apiFetch<{ url: string }>(endpoint, { method: "POST" }, { user });
      if (data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg("Billing session generation failed");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Error initiating checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center max-w-4xl mx-auto py-12 px-6">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 text-orange-400 font-bold tracking-widest text-xs uppercase mb-6 border border-orange-500/20">
          <Sparkles className="w-4 h-4" /> Memeforge Pro
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Level Up Your Meme Game</h1>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto">Unlock authenticated AI generation with predictable usage limits and self-service subscription management.</p>
        {entitlement && (
          <p className="mt-3 text-xs text-zinc-500">Verified billing status: <span className="capitalize text-zinc-300">{entitlement.status}</span></p>
        )}
      </div>

      {errorMsg && (
        <div className="w-full max-w-3xl mb-8 flex flex-col items-center justify-center bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-3xl">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 flex flex-col items-start relative">
          <h3 className="text-2xl font-bold mb-2">Free Starter</h3>
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-4xl font-black">$0</span>
            <span className="text-zinc-500">/ forever</span>
          </div>
          
          <ul className="space-y-4 mb-8 w-full flex-1">
            <li className="flex items-center gap-3 text-zinc-300">
              <Check className="w-5 h-5 text-zinc-500" /> Browse trending templates
            </li>
            <li className="flex items-center gap-3 text-zinc-300">
              <Check className="w-5 h-5 text-zinc-500" /> Basic text editing
            </li>
            <li className="flex items-center gap-3 text-zinc-300">
              <Check className="w-5 h-5 text-zinc-500" /> Local and cloud save workflows
            </li>
          </ul>
          
          <Link to="/" className="w-full text-center px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all border border-white/10">
            Current Plan
          </Link>
        </div>

        <div className="bg-gradient-to-b from-[#1a1a24] to-[#0f0f14] border border-indigo-500/30 rounded-2xl p-8 flex flex-col items-start relative overflow-hidden shadow-2xl shadow-indigo-500/10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-[50px] -mr-16 -mt-16 rounded-full pointer-events-none" />
          
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />

          <h3 className="text-2xl font-bold mb-2 text-white flex items-center gap-2">
            Memeforge Pro <Gem className="w-5 h-5 text-indigo-400" />
          </h3>
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-4xl font-black text-indigo-100">$9.99</span>
            <span className="text-indigo-300/60">/ month</span>
          </div>
          
          <ul className="space-y-4 mb-8 w-full flex-1 relative z-10">
            <li className="flex items-center gap-3 text-indigo-100">
              <Sparkles className="w-5 h-5 text-indigo-400" /> AI layouts and images (usage limits apply)
            </li>
            <li className="flex items-center gap-3 text-indigo-100">
              <ImagePlus className="w-5 h-5 text-indigo-400" /> Image, GIF, and native-share exports
            </li>
            <li className="flex items-center gap-3 text-indigo-100">
              <Check className="w-5 h-5 text-indigo-400" /> Self-service billing portal
            </li>
            <li className="flex items-center gap-3 text-indigo-100">
              <Check className="w-5 h-5 text-indigo-400" /> Everything in Free Starter
            </li>
          </ul>
          
          <button 
            onClick={subscribe}
            disabled={loading || entitlementLoading}
            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 relative z-10"
          >
            {loading
              ? "Opening billing..."
              : canManageBilling
                ? "Manage subscription"
                : "Upgrade to Pro"}
          </button>
        </div>
      </div>
    </div>
  );
}
