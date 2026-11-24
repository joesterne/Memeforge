import React, { useRef, useState, useEffect } from "react";
import {
  Flame,
  TrendingUp,
  Smile,
  Cat,
  Gamepad2,
  Briefcase,
  Brain,
  Film,
  Sparkles,
  Crown,
  DollarSign,
  Coffee,
  X,
  ChevronLeft,
  ChevronRight,
  LucideIcon,
} from "lucide-react";

export interface TrendingTag {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: "HOT" | "NEW" | "TOP" | "LEGEND";
  keywords: string[];
  gifQuery: string;
}

export const TRENDING_TAGS: TrendingTag[] = [
  {
    id: "all",
    label: "All Templates",
    icon: Flame,
    keywords: [],
    gifQuery: "trending meme",
  },
  {
    id: "viral",
    label: "Viral Now",
    icon: TrendingUp,
    badge: "HOT",
    keywords: [
      "drake",
      "distracted boyfriend",
      "two buttons",
      "buff doge",
      "bernie",
      "batman slapping",
      "uno",
      "change my mind",
      "always has been",
      "disaster girl",
      "trade offer",
      "woman yelling",
      "roll safe",
      "left exit",
      "expanding brain",
      "gru",
    ],
    gifQuery: "viral meme",
  },
  {
    id: "reactions",
    label: "Reactions",
    icon: Smile,
    badge: "TOP",
    keywords: [
      "reaction",
      "face",
      "shocked",
      "crying",
      "laughing",
      "surprised",
      "facepalm",
      "think",
      "roll safe",
      "pikachu",
      "harvey",
      "stare",
      "blink",
      "disaster girl",
      "kermit",
      "screaming",
      "smile",
      "wink",
      "sweating",
    ],
    gifQuery: "reaction meme",
  },
  {
    id: "animals",
    label: "Cats & Animals",
    icon: Cat,
    keywords: [
      "cat",
      "dog",
      "doge",
      "cheems",
      "monkey",
      "chimp",
      "kitten",
      "puppy",
      "bird",
      "frog",
      "pepe",
      "shiba",
      "seal",
      "bear",
      "gorilla",
      "harambe",
      "pigeon",
    ],
    gifQuery: "funny cat dog animals meme",
  },
  {
    id: "gaming",
    label: "Gaming",
    icon: Gamepad2,
    badge: "NEW",
    keywords: [
      "gaming",
      "game",
      "gta",
      "minecraft",
      "pokemon",
      "among us",
      "skyrim",
      "zelda",
      "mario",
      "elden ring",
      "roblox",
      "fortnite",
      "pc master",
      "press f",
      "npc",
      "gamer",
      "quest",
      "boss",
    ],
    gifQuery: "gaming funny meme",
  },
  {
    id: "work",
    label: "Work & Hustle",
    icon: Briefcase,
    keywords: [
      "work",
      "job",
      "office",
      "boss",
      "monday",
      "corporate",
      "meeting",
      "zoom",
      "coffee",
      "worker",
      "burnout",
      "shift",
      "overtime",
      "interview",
      "manager",
      "email",
      "paycheck",
    ],
    gifQuery: "work office corporate meme",
  },
  {
    id: "relatable",
    label: "Relatable Life",
    icon: Brain,
    keywords: [
      "two buttons",
      "trade offer",
      "left exit 12",
      "change my mind",
      "expectation vs reality",
      "expanding brain",
      "sleep",
      "me trying",
      "struggle",
      "adulting",
      "life",
      "choices",
      "brain",
      "clown",
      "wake up",
    ],
    gifQuery: "relatable funny life meme",
  },
  {
    id: "movies",
    label: "Movies & TV",
    icon: Film,
    keywords: [
      "marvel",
      "avengers",
      "star wars",
      "spiderman",
      "batman",
      "spongebob",
      "squidward",
      "shrek",
      "lotr",
      "office",
      "dicaprio",
      "thanos",
      "walter white",
      "breaking bad",
      "simpsons",
      "batman slapping",
      "matrix",
      "cinema",
    ],
    gifQuery: "movie tv show meme",
  },
  {
    id: "anime",
    label: "Anime & Manga",
    icon: Sparkles,
    keywords: [
      "anime",
      "pigeon",
      "manga",
      "goku",
      "dragon ball",
      "naruto",
      "jojo",
      "sailor moon",
      "death note",
      "evangelion",
      "pokemon",
      "is this a pigeon",
      "otaku",
    ],
    gifQuery: "anime funny meme",
  },
  {
    id: "classics",
    label: "Vintage Classics",
    icon: Crown,
    badge: "LEGEND",
    keywords: [
      "success kid",
      "bad luck brian",
      "philosoraptor",
      "one does not simply",
      "scumbag steve",
      "overly attached",
      "grumpy cat",
      "doge",
      "wonka",
      "first world",
      "conspiracy keanu",
      "y u no",
      "futurama fry",
      "brace yourselves",
    ],
    gifQuery: "classic early 2010s meme",
  },
  {
    id: "crypto",
    label: "Crypto & Stonks",
    icon: DollarSign,
    keywords: [
      "stonks",
      "crypto",
      "bitcoin",
      "money",
      "invest",
      "stock",
      "to the moon",
      "diamond hands",
      "hodl",
      "broke",
      "rich",
      "trade",
    ],
    gifQuery: "stonks crypto trading meme",
  },
  {
    id: "chill",
    label: "Coffee & Chill",
    icon: Coffee,
    keywords: [
      "coffee",
      "tea",
      "chill",
      "kermit",
      "morning",
      "relax",
      "weekend",
      "sleep",
      "peace",
      "calm",
      "mood",
    ],
    gifQuery: "coffee relax mood meme",
  },
];

export function matchesTrendingTag(
  templateName: string,
  tagId: string
): boolean {
  if (tagId === "all") return true;
  const tag = TRENDING_TAGS.find((t) => t.id === tagId);
  if (!tag || tag.keywords.length === 0) return true;

  const lowerName = templateName.toLowerCase();
  return tag.keywords.some((kw) => lowerName.includes(kw.toLowerCase()));
}

interface TrendingTagsBarProps {
  selectedTag: string;
  onSelectTag: (tagId: string) => void;
  tagCounts?: Record<string, number>;
  activeTab: "still" | "gif" | "library";
  totalMatchingTemplates?: number;
  onClearFilters?: () => void;
  searchQuery?: string;
}

export default function TrendingTagsBar({
  selectedTag,
  onSelectTag,
  tagCounts = {},
  activeTab,
  totalMatchingTemplates,
  onClearFilters,
  searchQuery = "",
}: TrendingTagsBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, []);

  const handleScroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = direction === "left" ? -280 : 280;
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  const currentTagObj = TRENDING_TAGS.find((t) => t.id === selectedTag);
  const isTagFiltered = selectedTag !== "all";
  const hasActiveFilters = isTagFiltered || searchQuery.trim().length > 0;

  return (
    <div className="w-full space-y-3 py-2">
      {/* Header bar with title & scroll triggers */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Flame className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className="text-xs font-black tracking-wider uppercase text-zinc-300">
              Trending Tags & Categories
            </span>
            <span className="hidden sm:inline-block ml-2 text-[11px] text-zinc-500 font-medium">
              Filter popular templates by internet trend
            </span>
          </div>
        </div>

        {/* Scroll Arrows */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleScroll("left")}
            disabled={!canScrollLeft}
            aria-label="Scroll tags left"
            className={`p-1.5 rounded-lg border transition-all ${
              canScrollLeft
                ? "bg-zinc-800 border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                : "bg-zinc-900/50 border-white/5 text-zinc-600 cursor-not-allowed opacity-50"
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleScroll("right")}
            disabled={!canScrollRight}
            aria-label="Scroll tags right"
            className={`p-1.5 rounded-lg border transition-all ${
              canScrollRight
                ? "bg-zinc-800 border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                : "bg-zinc-900/50 border-white/5 text-zinc-600 cursor-not-allowed opacity-50"
            }`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Tags Track */}
      <div className="relative group">
        {/* Left Gradient Mask */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-zinc-950 to-transparent z-10 pointer-events-none" />
        )}
        {/* Right Gradient Mask */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-950 to-transparent z-10 pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {TRENDING_TAGS.map((tag) => {
            const Icon = tag.icon;
            const isSelected = selectedTag === tag.id;
            const count = tagCounts[tag.id];

            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  // Toggle: if already selected, reset to all (unless clicking all)
                  if (isSelected && tag.id !== "all") {
                    onSelectTag("all");
                  } else {
                    onSelectTag(tag.id);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border select-none shrink-0 ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/40 translate-y-[-1px]"
                    : "bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border-white/10 hover:border-white/20 hover:translate-y-[-1px]"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSelected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                  }`}
                />
                <span>{tag.label}</span>

                {/* Badge if present (HOT, TOP, etc.) */}
                {tag.badge && (
                  <span
                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase leading-none ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : tag.badge === "HOT"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : tag.badge === "NEW"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : tag.badge === "LEGEND"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    }`}
                  >
                    {tag.badge}
                  </span>
                )}

                {/* Template count for Still tab */}
                {activeTab === "still" && count !== undefined && count > 0 && tag.id !== "all" && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                      isSelected
                        ? "bg-indigo-700/80 text-indigo-100"
                        : "bg-zinc-800 text-zinc-400 border border-white/5"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Status & Active Tag Feedback Bar */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900/80 border border-white/10 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-zinc-300 flex-wrap">
            <span className="text-zinc-500 font-medium">Active filter:</span>
            {isTagFiltered && currentTagObj && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-semibold">
                <currentTagObj.icon className="w-3.5 h-3.5" />
                {currentTagObj.label}
                <button
                  type="button"
                  onClick={() => onSelectTag("all")}
                  aria-label="Remove tag filter"
                  className="hover:text-white ml-0.5 p-0.5 rounded hover:bg-indigo-500/30 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {searchQuery.trim().length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 border border-white/10 text-zinc-300 font-medium">
                Keyword: <span className="font-bold text-white">"{searchQuery.trim()}"</span>
              </span>
            )}
            {totalMatchingTemplates !== undefined && (
              <span className="text-zinc-400 font-medium">
                • {totalMatchingTemplates} {totalMatchingTemplates === 1 ? "template" : "templates"} found
              </span>
            )}
          </div>

          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 hover:underline ml-auto"
            >
              <X className="w-3.5 h-3.5" /> Reset filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
