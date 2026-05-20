import { useEffect, useState, useMemo, useCallback, useDeferredValue } from "react";
import { Link } from "react-router";
import { Search, TrendingUp, Upload, History, Trash2, Edit2, Image as ImageIcon, RefreshCw, Filter, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { collection, query, where, getDocs, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseErrorHandler";
import SearchBar from "../components/SearchBar";
import TemplateCard from "../components/TemplateCard";
import { toast } from "sonner";

interface MemeTemplate {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
  dateAdded?: string;
}

type SortOption = 'trending' | 'recent' | 'new' | 'date_added' | 'favorites';

// Simple memory cache for memes
let cachedMemes: MemeTemplate[] | null = null;
let cachedTrends: string[] | null = null;

export default function Home() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MemeTemplate[]>(cachedMemes || []);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(!cachedMemes);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [webResultFetched, setWebResultFetched] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('trending');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  
  const [userMemes, setUserMemes] = useState<any[]>([]);
  const [memesLoading, setMemesLoading] = useState(false);
  
  const [favorites, setFavorites] = useState<Record<string, any>>({});
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  useEffect(() => {
     const saved = localStorage.getItem('recent_templates');
     if (saved) {
         try {
             setRecentIds(JSON.parse(saved));
         } catch(e) {}
     }
  }, []);

  const markRecent = useCallback((id: string) => {
     setRecentIds(prev => {
        const next = [id, ...prev.filter(x => x !== id)].slice(0, 50);
        localStorage.setItem('recent_templates', JSON.stringify(next));
        return next;
     });
  }, []);

  const fetchTrending = useCallback(async (force = false) => {
    if (cachedMemes && !force) {
        setTemplates(cachedMemes);
        setLoading(false);
        return;
    }
    
    setLoading(true);
    let trendsList: string[] = cachedTrends || [];
    
    if (!cachedTrends || force) {
        try {
            const trendsRes = await fetch("/api/trending-searches");
            const trendsData = await trendsRes.json();
            if (trendsData.success && trendsData.terms) {
                trendsList = trendsData.terms;
                cachedTrends = trendsList;
            }
        } catch(e) {
            console.error("Failed to fetch Google Trends", e);
        }
    }
    
    fetch("https://api.imgflip.com/get_memes")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          let memes = data.data.memes.map((m: any) => ({
             ...m,
             dateAdded: new Date(Date.now() - Math.random() * 10000000000).toISOString()
          }));
          
          if (trendsList.length > 0) {
              const boostScore = (name: string) => {
                  let matchCount = 0;
                  const lowerName = name.toLowerCase();
                  for (const term of trendsList) {
                      if (lowerName.includes(term.toLowerCase())) matchCount++;
                  }
                  return matchCount;
              };
              memes.sort((a: any, b: any) => boostScore(b.name) - boostScore(a.name));
          }

          cachedMemes = memes;
          setTemplates(memes);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const searchWeb = async () => {
      if (!search) return;
      setSearchingWeb(true);
      setWebResultFetched(false);
      try {
          const res = await fetch(`/api/search-memes?q=${encodeURIComponent(search)}`);
          const data = await res.json();
          if (data.success && data.memes) {
              setTemplates(prev => {
                  const newTemps = data.memes.filter((m: any) => !prev.some((p: any) => p.id === m.id));
                  return [...newTemps, ...prev]; // put new templates at front
              });
          }
      } catch (e) {
          console.error("Web search failed", e);
      } finally {
          setSearchingWeb(false);
          setWebResultFetched(true);
      }
  };

  const generateMemeAI = async () => {
    if (!search) return;
    setGeneratingAI(true);
    try {
        const res = await fetch("/api/generate-meme", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: search })
        });
        const data = await res.json();
        
        if (data.success && data.imageUrl) {
            const aiMeme = {
                id: `ai_${Date.now()}`,
                name: `AI: ${search}`,
                url: data.imageUrl,
                width: 800,
                height: 800,
                box_count: 2, 
                dateAdded: new Date().toISOString()
            };
            setTemplates(prev => [aiMeme, ...prev]);
            setRecentIds(prev => [aiMeme.id, ...prev]);
        } else {
            toast.error(data.error?.includes("API key") 
              ? "Gemini API key is required. Please add it to your settings." 
              : (data.error || "Could not generate image."));
        }
    } catch (e) {
        console.error("AI Gen request failed", e);
        toast.error("Failed to generate image. Ensure API connections are active.");
    } finally {
        setGeneratingAI(false);
    }
  };

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  useEffect(() => {
    if (!user) {
      setUserMemes([]);
      setFavorites({});
      return;
    }
    
    const fetchUserData = async () => {
      setMemesLoading(true);
      setFavoritesLoading(true);
      try {
        const qMemes = query(collection(db, "memes"), where("authorId", "==", user.uid));
        const snapsMemes = await getDocs(qMemes);
        const dataMemes = snapsMemes.docs.map(d => ({ id: d.id, ...d.data() }));
        dataMemes.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setUserMemes(dataMemes);
        
        const qFavs = query(collection(db, "favorites"), where("userId", "==", user.uid));
        const snapsFavs = await getDocs(qFavs);
        const favsMap: Record<string, any> = {};
        snapsFavs.docs.forEach(d => {
            favsMap[d.data().templateId] = { id: d.id, ...d.data() };
        });
        setFavorites(favsMap);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "userdata");
      }
      setMemesLoading(false);
      setFavoritesLoading(false);
    };
    fetchUserData();
  }, [user]);

  const handleDeleteMeme = useCallback(async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to delete this template/meme?")) return;
    try {
      await deleteDoc(doc(db, "memes", id));
      setUserMemes(prev => prev.filter(m => m.id !== id));
      toast.success("Meme deleted successfully.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `memes/${id}`);
    }
  }, []);
  
  const toggleFavorite = useCallback(async (e: React.MouseEvent, template: MemeTemplate, isFavorited: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      if (!user) {
          toast.error("You must be logged in to favorite templates.");
          return;
      }
      
      const docId = `${user.uid}_${template.id}`;
      
      try {
          if (isFavorited) {
              await deleteDoc(doc(db, "favorites", docId));
              setFavorites(prev => {
                  const next = { ...prev };
                  delete next[template.id];
                  return next;
              });
              toast.success("Removed from favorites");
          } else {
              const newFav = {
                  userId: user.uid,
                  templateId: template.id,
                  url: template.url,
                  name: template.name,
                  createdAt: new Date().toISOString()
              };
              await setDoc(doc(db, "favorites", docId), newFav);
              setFavorites(prev => ({ ...prev, [template.id]: { id: docId, ...newFav } }));
              toast.success("Added to favorites");
          }
      } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `favorites/${docId}`);
      }
  }, [user]);

  const sortedAndFilteredTemplates = useMemo(() => {
    let result = templates.filter(t => t.name.toLowerCase().includes(deferredSearch.toLowerCase()));
    
    // Inject favorites that might not be in the current templates pool
    if (sortBy === 'favorites') {
        const favoriteTemplates = Object.values(favorites).map(f => ({
            id: f.templateId,
            name: f.name,
            url: f.url,
            width: 800,
            height: 800,
            box_count: 2
        }));
        
        result = favoriteTemplates.filter(t => t.name.toLowerCase().includes(deferredSearch.toLowerCase()));
    } else {
        switch (sortBy) {
            case 'recent':
                result.sort((a, b) => {
                    const idxA = recentIds.indexOf(a.id);
                    const idxB = recentIds.indexOf(b.id);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return 0; // fallback to trending order
                });
                break;
            case 'new':
                result.sort((a, b) => parseInt(b.id) - parseInt(a.id));
                break;
            case 'date_added':
                result.sort((a, b) => new Date(b.dateAdded!).getTime() - new Date(a.dateAdded!).getTime());
                break;
            case 'trending':
            default:
                // imgflip default order is trending
                break;
        }
    }
    return result;
  }, [templates, deferredSearch, sortBy, recentIds, favorites]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="text-center space-y-4 max-w-2xl mx-auto py-8">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white">
          Create Epic Memes <span className="text-indigo-400">Together</span>
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Start from a trending template, search for the perfect reaction, or upload your own image.
        </p>
        
        <SearchBar 
          value={search} 
          onChange={setSearch} 
          placeholder="Search templates..." 
        />
      </div>

      {user && (
        <>
          <div className="flex items-center justify-between pt-4">
             <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100 tracking-tight">
                <History className="text-indigo-400 w-5 h-5" /> Your Templates
             </h2>
          </div>
          
          {memesLoading ? (
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
               {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-square bg-zinc-900 rounded-3xl animate-pulse border border-white/5"></div>
               ))}
             </div>
          ) : userMemes.length === 0 ? (
             <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 text-center text-zinc-500">
                 <ImageIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
                 <p className="text-sm font-medium">You haven't saved any templates yet.</p>
             </div>
          ) : (
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                 {userMemes.map(meme => (
                     <div key={meme.id} className="group relative rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-zinc-900 border border-white/10 flex flex-col hover:border-indigo-500/50">
                         <Link to={`/editor/${meme.id}`} className="block aspect-square relative bg-zinc-950">
                             {meme.templateUrl ? (
                                <img src={meme.templateUrl} alt="template" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-900 font-medium text-xs">Blank Canvas</div>
                             )}
                         </Link>
                         <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <Link to={`/editor/${meme.id}`} className="p-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-colors text-xs flex items-center justify-center">
                                 <Edit2 className="w-3 h-3" />
                             </Link>
                             <button onClick={(e) => handleDeleteMeme(e, meme.id)} className="p-2 bg-red-600/90 hover:bg-red-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-colors text-xs flex items-center justify-center">
                                 <Trash2 className="w-3 h-3" />
                             </button>
                         </div>
                     </div>
                 ))}
             </div>
          )}
        </>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-4">
         <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100 tracking-tight">
            <TrendingUp className="text-indigo-400 w-5 h-5" /> Trending Templates
         </h2>
         <div className="flex flex-wrap items-center gap-2 sm:gap-3">
             <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-lg p-1">
                 <Filter className="w-4 h-4 text-zinc-500 ml-2" />
                 <select 
                     value={sortBy} 
                     onChange={(e) => setSortBy(e.target.value as SortOption)}
                     className="bg-transparent text-xs text-zinc-300 font-medium p-1 mr-2 outline-none cursor-pointer"
                 >
                     <option value="trending">Trending</option>
                     {user && <option value="favorites">Favorites</option>}
                     <option value="recent">Recently Clicked</option>
                     <option value="new">New</option>
                     <option value="date_added">Date Added</option>
                 </select>
             </div>
             
             <button 
                 onClick={() => fetchTrending(true)}
                 className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg hover:bg-zinc-700 text-xs font-bold uppercase tracking-wider transition-colors text-zinc-300"
                 title="Refresh Trending"
             >
                 <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                 <span className="hidden sm:inline">Refresh</span>
             </button>

             <Link to="/pro" className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:brightness-110 font-bold text-[11px] uppercase tracking-wider shadow-lg transition-all border border-orange-500/50">
                👑 Pro
             </Link>
             <Link to="/editor/new" className="hidden lg:flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-white/10 rounded-lg hover:bg-zinc-700 font-bold text-[11px] uppercase tracking-wider transition-colors text-zinc-300">
                <Upload className="w-4 h-4" /> Use Blank
             </Link>
         </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[...Array(10)].map((_, i) => (
             <div key={i} className="aspect-square bg-zinc-900 rounded-3xl animate-pulse border border-white/5"></div>
          ))}
        </div>
      ) : sortedAndFilteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-zinc-900 border border-white/10 rounded-3xl gap-4 col-span-full mt-4">
              <Search className="w-12 h-12 text-zinc-500 mb-4" />
              <h3 className="text-xl font-bold text-white text-center">No local templates found for "{search}"</h3>
              <p className="text-zinc-400 text-center max-w-md">Search the wider web or create one instantly with AI.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 mt-6">
                  <button 
                      onClick={searchWeb} 
                      disabled={searchingWeb || generatingAI}
                      className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all border border-white/10 disabled:opacity-50"
                  >
                      {searchingWeb ? "Searching Web..." : "Search Web for Templates"}
                  </button>
                  {webResultFetched && (
                      <button 
                          onClick={generateMemeAI} 
                          disabled={generatingAI || searchingWeb}
                          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                      >
                          <Sparkles className="w-5 h-5" />
                          {generatingAI ? "Generating..." : "Generate with AI"}
                      </button>
                  )}
              </div>
          </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {sortedAndFilteredTemplates.map((t) => (
            <TemplateCard 
              key={t.id} 
              template={t} 
              isFavorited={!!favorites[t.id]} 
              user={user} 
              onFavorite={toggleFavorite} 
              onMarkRecent={markRecent} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
