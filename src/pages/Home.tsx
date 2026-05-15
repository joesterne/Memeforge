import { useEffect, useState, useMemo, useCallback, useDeferredValue } from "react";
import { Link } from "react-router";
import { Search, TrendingUp, Upload, History, Trash2, Edit2, Image as ImageIcon, RefreshCw, Filter, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseErrorHandler";

interface MemeTemplate {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
  dateAdded?: string;
}

type SortOption = 'trending' | 'recent' | 'new' | 'date_added';

export default function Home() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MemeTemplate[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [loading, setLoading] = useState(true);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [webResultFetched, setWebResultFetched] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('trending');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  
  const [userMemes, setUserMemes] = useState<any[]>([]);
  const [memesLoading, setMemesLoading] = useState(false);

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

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    let trendsList: string[] = [];
    try {
        const trendsRes = await fetch("/api/trending-searches");
        const trendsData = await trendsRes.json();
        if (trendsData.success && trendsData.terms) {
            trendsList = trendsData.terms;
        }
    } catch(e) {
        console.error("Failed to fetch Google Trends", e);
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
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: `A meme template about: ${search}. High quality, typical meme format, blank ready for text.` }]
            },
            config: {
                imageConfig: {
                    aspectRatio: "1:1"
                }
            }
        });
        
        let imageUrl = "";
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                break;
            }
        }
        
        if (imageUrl) {
            const aiMeme = {
                id: `ai_${Date.now()}`,
                name: `AI: ${search}`,
                url: imageUrl,
                width: 800,
                height: 800,
                box_count: 2,
                dateAdded: new Date().toISOString()
            };
            setTemplates(prev => [aiMeme, ...prev]);
            setRecentIds(prev => [aiMeme.id, ...prev]);
        } else {
            alert("Could not generate image.");
        }
    } catch (e) {
        console.error("AI Generation failed", e);
        alert("Failed to generate image.");
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
      return;
    }
    setMemesLoading(true);
    const fetchUserMemes = async () => {
      try {
        const q = query(
          collection(db, "memes"), 
          where("authorId", "==", user.uid)
        );
        const snaps = await getDocs(q);
        const data = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setUserMemes(data);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "memes");
      }
      setMemesLoading(false);
    };
    fetchUserMemes();
  }, [user]);

  const handleDeleteMeme = useCallback(async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to delete this template/meme?")) return;
    try {
      await deleteDoc(doc(db, "memes", id));
      setUserMemes(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `memes/${id}`);
      alert("Failed to delete.");
    }
  }, []);

  const sortedAndFilteredTemplates = useMemo(() => {
    let result = templates.filter(t => t.name.toLowerCase().includes(deferredSearch.toLowerCase()));
    
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
    return result;
  }, [templates, deferredSearch, sortBy, recentIds]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="text-center space-y-4 max-w-2xl mx-auto py-8">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white">
          Create Epic Memes <span className="text-indigo-400">Together</span>
        </h1>
        <p className="text-lg text-zinc-400">
          Start from a trending template, search for the perfect reaction, or upload your own image.
        </p>
        
        <div className="relative max-w-lg mx-auto mt-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search templates..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-white/10 rounded-full pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>

      <div className="w-full bg-zinc-900 border border-dashed border-white/10 text-zinc-600 p-4 text-center rounded-2xl text-sm italic shadow-inner">
          --- Advertisement Space ---
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
                     <option value="recent">Recently Clicked</option>
                     <option value="new">New</option>
                     <option value="date_added">Date Added</option>
                 </select>
             </div>
             
             <button 
                 onClick={fetchTrending}
                 className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg hover:bg-zinc-700 text-xs font-bold uppercase tracking-wider transition-colors text-zinc-300"
                 title="Refresh Trending"
             >
                 <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                 <span className="hidden sm:inline">Refresh</span>
             </button>

             <button className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:brightness-110 font-bold text-[11px] uppercase tracking-wider shadow-lg transition-all border border-orange-500/50">
                👑 Pro
             </button>
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
          {sortedAndFilteredTemplates.map(t => (
            <Link 
              key={t.id} 
              to={`/editor/template_${t.id}`}
              state={{ template: t }}
              onClick={() => markRecent(t.id)}
              className="group relative rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 bg-zinc-900 border border-white/10 flex flex-col hover:border-indigo-500/50"
            >
              <div className="aspect-square w-full overflow-hidden bg-zinc-950">
                <img 
                  src={t.url} 
                  alt={t.name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-4 bg-zinc-900 flex-grow flex items-center justify-center border-t border-white/5">
                 <p className="text-[10px] font-bold text-zinc-300 line-clamp-1 uppercase tracking-widest text-center">{t.name}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
