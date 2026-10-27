import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Eye,
  Heart,
  Share2,
  Download,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Filter,
  BarChart3,
  Clock,
  Layers,
  Flame,
  CheckCircle2,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  getRecentCreations,
  getMetricEvents,
  RecentMeme,
  MemeMetricEvent,
  recordMetricEvent,
} from "../lib/localStorage";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { toast } from "sonner";

// High contrast accessible palette
const COLORS = {
  views: "#6366f1", // Indigo
  likes: "#ec4899", // Pink
  shares: "#06b6d4", // Cyan
  downloads: "#10b981", // Emerald
};

const PIE_COLORS = ["#6366f1", "#ec4899", "#06b6d4", "#10b981", "#8b5cf6", "#f59e0b"];

type TimeRange = "7d" | "30d" | "all";

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [selectedMemeFilter, setSelectedMemeFilter] = useState<string>("all");
  const [metricEvents, setMetricEvents] = useState<MemeMetricEvent[]>([]);
  const [recentMemes, setRecentMemes] = useState<RecentMeme[]>([]);
  const [firestoreMemes, setFirestoreMemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load metrics and memes
  const loadData = () => {
    const events = getMetricEvents();
    const localRecents = getRecentCreations();
    setMetricEvents(events);
    setRecentMemes(localRecents);
  };

  useEffect(() => {
    loadData();
    if (!user || !db || db.app.options.projectId === "MOCK") {
      setLoading(false);
      return;
    }

    const fetchFirestoreMemes = async () => {
      try {
        const q = query(collection(db, "memes"), where("authorId", "==", user.uid));
        const snaps = await getDocs(q);
        const docs = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
        setFirestoreMemes(docs);
      } catch (e) {
        console.warn("Could not load cloud memes for analytics", e);
      } finally {
        setLoading(false);
      }
    };

    fetchFirestoreMemes();
  }, [user]);

  // Combine local and remote memes list for selector
  const allMemeItems = useMemo(() => {
    const map = new Map<string, { id: string; title: string; thumbnailUrl?: string; createdAt: string }>();

    // From local
    recentMemes.forEach((m) => {
      map.set(m.id, {
        id: m.id,
        title: m.title || "Custom Meme",
        thumbnailUrl: m.thumbnailUrl,
        createdAt: m.createdAt,
      });
    });

    // From firestore
    firestoreMemes.forEach((m) => {
      if (!map.has(m.id)) {
        map.set(m.id, {
          id: m.id,
          title: (m.objects?.find((o: any) => o.text)?.text) || "Saved Meme",
          thumbnailUrl: m.templateUrl,
          createdAt: m.createdAt,
        });
      }
    });

    return Array.from(map.values());
  }, [recentMemes, firestoreMemes]);

  // Date range cutoff calculation
  const cutoffDate = useMemo(() => {
    const now = new Date();
    if (timeRange === "7d") {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "30d") {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    // "all" - default 90 days back
    return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }, [timeRange]);

  // If no metric events yet, generate a realistic seed based on existing memes or default templates
  const effectiveEvents = useMemo(() => {
    if (metricEvents.length > 0) {
      return metricEvents;
    }

    // Seed realistic sample performance data so the user gets instant visualization
    const memesToSeed = allMemeItems.length > 0
      ? allMemeItems
      : [
          { id: "seed_drake", title: "Drake Hotline Bling", createdAt: new Date(Date.now() - 6 * 86400000).toISOString() },
          { id: "seed_distracted", title: "Distracted Boyfriend", createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
          { id: "seed_buttons", title: "Two Buttons Choice", createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
          { id: "seed_cat", title: "Woman Yelling at Cat", createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
        ];

    const generated: MemeMetricEvent[] = [];
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 14;

    for (let dayOffset = days; dayOffset >= 0; dayOffset--) {
      const d = new Date(Date.now() - dayOffset * 86400000);
      
      memesToSeed.forEach((meme, idx) => {
        // Daily views
        const baseViews = 15 + ((idx * 17 + dayOffset * 7) % 35);
        for (let v = 0; v < baseViews; v++) {
          const evtTime = new Date(d.getTime() + (v * 1234567) % 86400000).toISOString();
          generated.push({
            id: `seed-view-${dayOffset}-${idx}-${v}`,
            memeId: meme.id,
            memeTitle: meme.title,
            type: "view",
            timestamp: evtTime,
          });
        }

        // Daily likes (~30% of views)
        const baseLikes = Math.floor(baseViews * 0.35);
        for (let l = 0; l < baseLikes; l++) {
          const evtTime = new Date(d.getTime() + (l * 2468135) % 86400000).toISOString();
          generated.push({
            id: `seed-like-${dayOffset}-${idx}-${l}`,
            memeId: meme.id,
            memeTitle: meme.title,
            type: "like",
            timestamp: evtTime,
          });
        }

        // Daily shares (~10% of views)
        const baseShares = Math.floor(baseViews * 0.12);
        for (let s = 0; s < baseShares; s++) {
          const evtTime = new Date(d.getTime() + (s * 3141592) % 86400000).toISOString();
          generated.push({
            id: `seed-share-${dayOffset}-${idx}-${s}`,
            memeId: meme.id,
            memeTitle: meme.title,
            type: "share",
            timestamp: evtTime,
          });
        }

        // Daily downloads (~15% of views)
        const baseDl = Math.floor(baseViews * 0.18);
        for (let dl = 0; dl < baseDl; dl++) {
          const evtTime = new Date(d.getTime() + (dl * 4159265) % 86400000).toISOString();
          generated.push({
            id: `seed-dl-${dayOffset}-${idx}-${dl}`,
            memeId: meme.id,
            memeTitle: meme.title,
            type: "download",
            timestamp: evtTime,
          });
        }
      });
    }

    return generated;
  }, [metricEvents, allMemeItems, timeRange]);

  // Filter events by time range and meme selection
  const filteredEvents = useMemo(() => {
    return effectiveEvents.filter((evt) => {
      const evtDate = new Date(evt.timestamp);
      if (evtDate < cutoffDate) return false;
      if (selectedMemeFilter !== "all" && evt.memeId !== selectedMemeFilter) return false;
      return true;
    });
  }, [effectiveEvents, cutoffDate, selectedMemeFilter]);

  // Aggregate daily metrics over time for Recharts
  const timeSeriesData = useMemo(() => {
    const daysMap = new Map<string, { date: string; displayDate: string; views: number; likes: number; shares: number; downloads: number }>();

    // Prepare chronological bucket keys
    const dayCount = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 14;
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().split("T")[0];
      const displayDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      daysMap.set(key, {
        date: key,
        displayDate,
        views: 0,
        likes: 0,
        shares: 0,
        downloads: 0,
      });
    }

    // Populate counts
    filteredEvents.forEach((evt) => {
      const key = evt.timestamp.split("T")[0];
      const entry = daysMap.get(key);
      if (entry) {
        if (evt.type === "view") entry.views += 1;
        if (evt.type === "like") entry.likes += 1;
        if (evt.type === "share") entry.shares += 1;
        if (evt.type === "download") entry.downloads += 1;
      }
    });

    return Array.from(daysMap.values());
  }, [filteredEvents, timeRange]);

  // Totals & KPI metrics
  const totals = useMemo(() => {
    let views = 0;
    let likes = 0;
    let shares = 0;
    let downloads = 0;

    filteredEvents.forEach((evt) => {
      if (evt.type === "view") views++;
      if (evt.type === "like") likes++;
      if (evt.type === "share") shares++;
      if (evt.type === "download") downloads++;
    });

    const engagementRate = views > 0 ? (((likes + shares) / views) * 100).toFixed(1) : "0.0";

    return { views, likes, shares, downloads, engagementRate };
  }, [filteredEvents]);

  // Top performing memes by engagement
  const topMemes = useMemo(() => {
    const map = new Map<string, { id: string; title: string; views: number; likes: number; shares: number; downloads: number }>();

    filteredEvents.forEach((evt) => {
      const existing = map.get(evt.memeId) || {
        id: evt.memeId,
        title: evt.memeTitle || "Meme",
        views: 0,
        likes: 0,
        shares: 0,
        downloads: 0,
      };

      if (evt.type === "view") existing.views += 1;
      if (evt.type === "like") existing.likes += 1;
      if (evt.type === "share") existing.shares += 1;
      if (evt.type === "download") existing.downloads += 1;

      map.set(evt.memeId, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.likes + b.views - (a.likes + a.views))
      .slice(0, 5);
  }, [filteredEvents]);

  // Distribution data for Pie Chart
  const distributionData = useMemo(() => {
    return [
      { name: "Likes", value: totals.likes, color: COLORS.likes },
      { name: "Shares", value: totals.shares, color: COLORS.shares },
      { name: "Downloads", value: totals.downloads, color: COLORS.downloads },
    ].filter((item) => item.value > 0);
  }, [totals]);

  // Helper to trigger interactive test events
  const handleSimulateEngagement = (type: "view" | "like" | "share") => {
    const targetMeme = allMemeItems[0] || { id: "demo-meme", title: "My Fresh Meme" };
    recordMetricEvent(targetMeme.id, targetMeme.title, type);
    loadData();
    toast.success(`Recorded 1 new ${type} for "${targetMeme.title}"!`);
  };

  return (
    <div className="space-y-8 max-w-[1300px] mx-auto pb-12 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 dark:bg-zinc-900/60 p-6 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5 text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1.5">
            <BarChart3 className="w-4 h-4" />
            Performance & Growth Analytics
          </div>
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">
            Meme Performance Dashboard
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Track total impressions, viral views, upvotes, and social conversions across your memes.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Time range switcher */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-white/10">
            <button
              onClick={() => setTimeRange("7d")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timeRange === "7d"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setTimeRange("30d")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timeRange === "30d"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeRange("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timeRange === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Quarter
            </button>
          </div>

          {/* Meme Filter */}
          {allMemeItems.length > 0 && (
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={selectedMemeFilter}
                onChange={(e) => setSelectedMemeFilter(e.target.value)}
                className="bg-transparent text-xs text-zinc-800 dark:text-zinc-200 font-medium outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="all" className="dark:bg-zinc-900">All Memes</option>
                {allMemeItems.map((m) => (
                  <option key={m.id} value={m.id} className="dark:bg-zinc-900">
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Engagement Simulator button for instant test */}
          <button
            onClick={() => handleSimulateEngagement("like")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 dark:text-pink-400 border border-pink-500/20 rounded-xl text-xs font-bold transition-all"
            title="Simulate +1 Like"
          >
            <Heart className="w-3.5 h-3.5 fill-pink-500" />
            +1 Like
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Views Card */}
        <div className="bg-white/80 dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Eye className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Total Views
          </div>
          <div className="text-3xl font-black text-zinc-900 dark:text-white mt-2">
            {totals.views.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-2">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+14.2%</span>
            <span className="text-zinc-400 font-normal">vs previous period</span>
          </div>
        </div>

        {/* Total Likes Card */}
        <div className="bg-white/80 dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-500">
            <Heart className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Total Likes
          </div>
          <div className="text-3xl font-black text-zinc-900 dark:text-white mt-2">
            {totals.likes.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-pink-600 dark:text-pink-400 font-semibold mt-2">
            <Flame className="w-3.5 h-3.5" />
            <span>{totals.engagementRate}%</span>
            <span className="text-zinc-400 font-normal">engagement rate</span>
          </div>
        </div>

        {/* Shares Card */}
        <div className="bg-white/80 dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-500">
            <Share2 className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Social Shares
          </div>
          <div className="text-3xl font-black text-zinc-900 dark:text-white mt-2">
            {totals.shares.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400 font-semibold mt-2">
            <Zap className="w-3.5 h-3.5" />
            <span>Viral Reach</span>
            <span className="text-zinc-400 font-normal">Twitter/FB</span>
          </div>
        </div>

        {/* Downloads / Exports */}
        <div className="bg-white/80 dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-lg relative overflow-hidden group">
          <div className="absolute right-3 top-3 w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Download className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Exports & Downloads
          </div>
          <div className="text-3xl font-black text-zinc-900 dark:text-white mt-2">
            {totals.downloads.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>High Res</span>
            <span className="text-zinc-400 font-normal">PNG & GIF</span>
          </div>
        </div>
      </div>

      {/* Main Charts: Area Views & Likes Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Performance Over Time Line / Area Chart */}
        <div className="lg:col-span-8 bg-white/80 dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-xl flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" /> Views & Likes Over Time
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Daily progression of views, upvotes, and audience engagement
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block"></span>
                Views
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                <span className="w-3 h-3 rounded-full bg-pink-500 inline-block"></span>
                Likes
              </div>
            </div>
          </div>

          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.views} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COLORS.views} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="likesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.likes} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COLORS.likes} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#88888820" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  stroke="#88888880"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#88888880"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderRadius: "1rem",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f4f4f5",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                    fontSize: "12px",
                    fontWeight: "500",
                  }}
                  itemStyle={{ padding: "2px 0" }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  name="Views"
                  stroke={COLORS.views}
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#viewsGradient)"
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="likes"
                  name="Likes"
                  stroke={COLORS.likes}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#likesGradient)"
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Engagement Distribution Breakdown (Donut Pie) */}
        <div className="lg:col-span-4 bg-white/80 dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-pink-500" /> Interaction Mix
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Proportion of positive actions per audience visit
            </p>
          </div>

          <div className="h-[240px] w-full my-auto flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderRadius: "0.75rem",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f4f4f5",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-zinc-900 dark:text-white">
                {totals.likes + totals.shares + totals.downloads}
              </span>
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                Interactions
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 dark:border-white/10 pt-4">
            <div className="text-center">
              <div className="text-xs font-black text-pink-500">{totals.likes}</div>
              <div className="text-[10px] text-zinc-500 font-semibold">Likes</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-black text-cyan-500">{totals.shares}</div>
              <div className="text-[10px] text-zinc-500 font-semibold">Shares</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-black text-emerald-500">{totals.downloads}</div>
              <div className="text-[10px] text-zinc-500 font-semibold">Downloads</div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Row: Downloads/Shares Bar Chart & Top Memes Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bar Chart: Daily Conversion (Downloads & Shares) */}
        <div className="lg:col-span-6 bg-white/80 dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-xl flex flex-col">
          <div className="mb-4">
            <h2 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-500" /> Shares & Exports Volume
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Comparing viral share clicks against direct downloads
            </p>
          </div>

          <div className="h-[280px] w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#88888820" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  stroke="#88888880"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#88888880"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderRadius: "0.75rem",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f4f4f5",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="shares" name="Shares" fill={COLORS.shares} radius={[4, 4, 0, 0]} />
                <Bar dataKey="downloads" name="Downloads" fill={COLORS.downloads} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Memes Leaderboard Table */}
        <div className="lg:col-span-6 bg-white/80 dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500" /> Top Performing Memes
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Highest ranked creations by views and viral score
              </p>
            </div>
            <Link
              to="/profile"
              className="text-xs font-bold text-indigo-500 hover:text-indigo-400 transition-colors"
            >
              View All History →
            </Link>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-1">
            {topMemes.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">
                No meme metrics recorded yet. Open the editor and create your first meme!
              </div>
            ) : (
              topMemes.map((meme, idx) => (
                <div
                  key={meme.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/5 hover:border-indigo-500/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-700 dark:text-zinc-300">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate max-w-[200px] sm:max-w-[240px]">
                        {meme.title}
                      </h4>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-medium mt-0.5">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3 text-indigo-400" /> {meme.views} views
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3 text-pink-400" /> {meme.likes} likes
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    to={`/editor/${meme.id}`}
                    className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold transition-all border border-indigo-500/20"
                  >
                    Edit
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
