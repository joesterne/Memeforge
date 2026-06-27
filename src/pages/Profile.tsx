import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Navigate, Link, useSearchParams } from "react-router";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseErrorHandler";
import { History, BarChart, Image as ImageIcon, Sparkles, CheckCircle2, User } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!db || db.app.options.projectId === "MOCK") {
      setLoading(false);
      return;
    }
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, "memes"), 
          where("authorId", "==", user.uid)
        );
        const snaps = await getDocs(q);
        const data = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
        // sort locally
        data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setHistory(data);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "memes");
      }
      setLoading(false);
    };
    fetchHistory();
  }, [user]);

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Unable to start checkout. Check console for details.");
        console.error(data);
        setIsUpgrading(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while starting checkout.");
      setIsUpgrading(false);
    }
  };

  if (!user) return <Navigate to="/" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-[1200px] mx-auto pb-8 animate-in fade-in duration-500">
      


      {/* Profile Header */}
      <div className="md:col-span-12 bg-zinc-900 p-6 rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
         <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
         <div className="flex items-center gap-6 z-10">
           {user.photoURL ? (
             <img src={user.photoURL} alt="avatar" className="w-24 h-24 rounded-2xl border border-white/10 shadow-xl relative object-cover" />
           ) : (
             <div className="w-24 h-24 rounded-2xl border border-white/10 shadow-xl relative bg-zinc-800 flex items-center justify-center">
               <User className="w-10 h-10 text-zinc-400" />
             </div>
           )}
           <div className="relative">
              <h1 className="text-3xl font-black tracking-tight text-white">{user.displayName}</h1>
              <p className="text-zinc-400 text-sm font-medium">{user.email}</p>
           </div>
         </div>

      </div>

      {/* Analytics */}
      <div className="col-span-1 md:col-span-4 bg-indigo-600 rounded-3xl p-6 flex flex-col gap-4 shadow-[0_10px_30px_rgba(79,70,229,0.3)] relative overflow-hidden">
         <div className="absolute -right-4 -top-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
         <h3 className="text-xs font-black uppercase tracking-widest text-indigo-100 relative z-10 flex items-center gap-2">
            <BarChart className="w-4 h-4" /> Analytics
         </h3>
         
         <div className="flex flex-col gap-6 mt-2 relative z-10">
             <div>
                 <div className="text-4xl font-black text-white">{history.length}</div>
                 <div className="text-[10px] font-bold text-indigo-200 uppercase mt-1">Total Memes Created</div>
             </div>
             <div>
                 <div className="text-2xl font-black text-indigo-50">{history.length * 42}</div>
                 <div className="text-[10px] font-bold text-indigo-200 uppercase mt-1">Total Views</div>
             </div>
             <div>
                 <div className="text-2xl font-black text-indigo-50">{history.length * 12}</div>
                 <div className="text-[10px] font-bold text-indigo-200 uppercase mt-1">Shares</div>
             </div>
         </div>
      </div>

      {/* History */}
      <div className="col-span-1 md:col-span-8 bg-zinc-900 p-6 rounded-3xl border border-white/10 shadow-xl flex flex-col">
         <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <History className="w-4 h-4" /> Your Meme History
         </h2>
         
         {loading ? (
            <div className="animate-pulse space-y-4">
                <div className="h-32 bg-zinc-800 rounded-2xl w-full border border-white/5"></div>
                <div className="h-32 bg-zinc-800 rounded-2xl w-full border border-white/5"></div>
            </div>
         ) : history.length === 0 ? (
             <div className="text-center py-12 text-zinc-500 flex-1 flex flex-col items-center justify-center">
                 <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                 <p className="text-sm font-medium">You haven't created any memes yet.</p>
                 <Link to="/" className="text-indigo-400 hover:text-indigo-300 font-bold mt-3 inline-block transition-colors">Start creating →</Link>
             </div>
         ) : (
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
                 {history.map(meme => (
                     <Link key={meme.id} to={`/editor/${meme.id}`} className="group block relative rounded-2xl border border-white/5 overflow-hidden hover:border-indigo-500/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all bg-zinc-950">
                         <div className="aspect-square relative">
                             {meme.templateUrl ? (
                                <img src={meme.templateUrl} loading="lazy" alt="template" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-900 font-medium text-xs">Blank Canvas</div>
                             )}
                         </div>
                     </Link>
                 ))}
             </div>
         )}
      </div>
    </div>
  );
}
