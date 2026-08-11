import { useCallback, useEffect, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router";
import {
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { BarChart, History, Image as ImageIcon, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseErrorHandler";
import { apiFetch } from "../lib/api";
import { getUserMemePage } from "../lib/userContent";

const PAGE_SIZE = 24;

export default function Profile() {
  const { user, entitlement, entitlementLoading, refreshEntitlement } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const canManageBilling = Boolean(entitlement && !["inactive", "canceled"].includes(entitlement.status));

  useEffect(() => {
    const status = searchParams.get("checkout");
    if (!status) return;
    if (status === "success") {
      toast.success("Checkout completed. Your Pro status will update after Stripe confirms it.");
      void refreshEntitlement();
    } else if (status === "cancelled") {
      toast.info("Checkout cancelled. No changes were made.");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
  }, [refreshEntitlement, searchParams, setSearchParams]);

  const fetchHistory = useCallback(async (reset: boolean) => {
    if (!user || !db || db.app.options.projectId === "MOCK") {
      setLoading(false);
      return;
    }
    reset ? setLoading(true) : setLoadingMore(true);
    setHistoryUnavailable(false);
    try {
      const page = await getUserMemePage(user.uid, reset ? null : cursor, PAGE_SIZE);
      setHistory((previous) => reset ? page.rows : [...previous, ...page.rows]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (error) {
      setHistoryUnavailable(true);
      handleFirestoreError(error, OperationType.LIST, "memes");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor, user]);

  useEffect(() => {
    setCursor(null);
    void fetchHistory(true);
    // Cursor intentionally resets when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const openBilling = async () => {
    if (!user) return;
    setBillingLoading(true);
    try {
      const endpoint = canManageBilling ? "/api/create-portal-session" : "/api/create-checkout-session";
      const data = await apiFetch<{ url: string }>(endpoint, { method: "POST" }, { user });
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open billing.");
      setBillingLoading(false);
    }
  };

  if (!user) return <Navigate to="/" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-[1200px] mx-auto pb-8 animate-in fade-in duration-500">
      <div className="md:col-span-12 bg-zinc-900 p-6 rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="flex items-center gap-6 z-10">
          {user.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-24 h-24 rounded-2xl border border-white/10 shadow-xl object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-2xl border border-white/10 bg-zinc-800 flex items-center justify-center">
              <User className="w-10 h-10 text-zinc-400" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">{user.displayName || "Memeforge creator"}</h1>
            <p className="text-zinc-400 text-sm font-medium">{user.email}</p>
          </div>
        </div>
        <button
          onClick={openBilling}
          disabled={billingLoading || entitlementLoading}
          className="z-10 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
        >
          {billingLoading ? "Opening billing…" : canManageBilling ? "Manage Pro" : "Upgrade to Pro"}
        </button>
      </div>

      <section className="col-span-1 md:col-span-4 bg-indigo-600 rounded-3xl p-6 flex flex-col gap-5 shadow-[0_10px_30px_rgba(79,70,229,0.3)]">
        <h2 className="text-xs font-black uppercase tracking-widest text-indigo-100 flex items-center gap-2">
          <BarChart className="w-4 h-4" /> Account summary
        </h2>
        <div>
          <div className="text-4xl font-black text-white">{historyUnavailable ? "—" : history.length}</div>
          <div className="text-[10px] font-bold text-indigo-200 uppercase mt-1">Memes loaded</div>
        </div>
        <div>
          <div className="text-2xl font-black text-indigo-50 capitalize">
            {entitlementLoading ? "Checking…" : entitlement?.plan || "Unavailable"}
          </div>
          <div className="text-[10px] font-bold text-indigo-200 uppercase mt-1">Verified plan</div>
          {entitlement && <div className="text-[10px] text-indigo-200/70 capitalize mt-1">{entitlement.status}</div>}
        </div>
        <p className="text-xs text-indigo-100/80">Views and shares are hidden until real event tracking is available.</p>
      </section>

      <section className="col-span-1 md:col-span-8 bg-zinc-900 p-6 rounded-3xl border border-white/10 shadow-xl flex flex-col">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <History className="w-4 h-4" /> Your meme history
        </h2>
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-zinc-800 rounded-2xl" />
            <div className="h-32 bg-zinc-800 rounded-2xl" />
          </div>
        ) : historyUnavailable ? (
          <div className="text-center py-12 text-zinc-400">
            History is unavailable right now.
            <button onClick={() => void fetchHistory(true)} className="block mx-auto mt-3 text-indigo-400 font-bold">Retry</button>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 flex-1 flex flex-col items-center justify-center">
            <ImageIcon className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">You haven't created any memes yet.</p>
            <Link to="/" className="text-indigo-400 hover:text-indigo-300 font-bold mt-3">Start creating →</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
              {history.map((meme) => (
                <Link key={meme.id} to={`/editor/${meme.id}`} className="group block rounded-2xl border border-white/5 overflow-hidden hover:border-indigo-500/50 bg-zinc-950">
                  <div className="aspect-square relative">
                    {meme.templateUrl ? (
                      <img src={meme.templateUrl} loading="lazy" alt="Meme background" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-900 text-xs">Blank canvas</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            {hasMore && (
              <button onClick={() => void fetchHistory(false)} disabled={loadingMore} className="mt-6 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold disabled:opacity-50">
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
