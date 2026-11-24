import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, Search, Type } from "lucide-react";

export interface MemeFontOption {
  label: string;
  family: string;
  googleName?: string;
  category: "Meme Display" | "Modern Sans" | "Comic & Fun" | "Serif & Fancy" | "Retro & Mono" | "System";
}

export const MEME_FONTS: MemeFontOption[] = [
  // Meme Display (Google Fonts)
  { label: "Anton", family: "'Anton', Impact, sans-serif", googleName: "Anton", category: "Meme Display" },
  { label: "Bangers", family: "'Bangers', cursive, sans-serif", googleName: "Bangers", category: "Meme Display" },
  { label: "Bebas Neue", family: "'Bebas Neue', sans-serif", googleName: "Bebas Neue", category: "Meme Display" },
  { label: "Oswald", family: "'Oswald', sans-serif", googleName: "Oswald", category: "Meme Display" },
  { label: "Black Ops One", family: "'Black Ops One', system-ui, sans-serif", googleName: "Black Ops One", category: "Meme Display" },
  { label: "Bungee", family: "'Bungee', sans-serif", googleName: "Bungee", category: "Meme Display" },
  { label: "Rubik Mono One", family: "'Rubik Mono One', monospace", googleName: "Rubik Mono One", category: "Meme Display" },

  // Modern Sans (Google Fonts)
  { label: "Montserrat", family: "'Montserrat', sans-serif", googleName: "Montserrat", category: "Modern Sans" },
  { label: "Poppins", family: "'Poppins', sans-serif", googleName: "Poppins", category: "Modern Sans" },
  { label: "Fredoka", family: "'Fredoka', sans-serif", googleName: "Fredoka", category: "Modern Sans" },
  { label: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', sans-serif", googleName: "Plus Jakarta Sans", category: "Modern Sans" },
  { label: "Barlow Condensed", family: "'Barlow Condensed', sans-serif", googleName: "Barlow Condensed", category: "Modern Sans" },

  // Comic & Fun (Google Fonts)
  { label: "Comic Neue", family: "'Comic Neue', cursive, sans-serif", googleName: "Comic Neue", category: "Comic & Fun" },
  { label: "Permanent Marker", family: "'Permanent Marker', cursive", googleName: "Permanent Marker", category: "Comic & Fun" },
  { label: "Luckiest Guy", family: "'Luckiest Guy', cursive", googleName: "Luckiest Guy", category: "Comic & Fun" },
  { label: "Pacifico", family: "'Pacifico', cursive", googleName: "Pacifico", category: "Comic & Fun" },
  { label: "Creepster", family: "'Creepster', cursive", googleName: "Creepster", category: "Comic & Fun" },

  // Serif & Fancy (Google Fonts)
  { label: "Playfair Display", family: "'Playfair Display', Georgia, serif", googleName: "Playfair Display", category: "Serif & Fancy" },
  { label: "Cinzel", family: "'Cinzel', Georgia, serif", googleName: "Cinzel", category: "Serif & Fancy" },

  // Retro & Mono (Google Fonts)
  { label: "Press Start 2P", family: "'Press Start 2P', monospace", googleName: "Press Start 2P", category: "Retro & Mono" },
  { label: "JetBrains Mono", family: "'JetBrains Mono', monospace", googleName: "JetBrains Mono", category: "Retro & Mono" },

  // Classic System Fallbacks
  { label: "Impact", family: "Impact, sans-serif", category: "System" },
  { label: "Arial", family: "Arial, sans-serif", category: "System" },
  { label: "Comic Sans MS", family: "'Comic Sans MS', cursive, sans-serif", category: "System" },
  { label: "Times New Roman", family: "'Times New Roman', Times, serif", category: "System" },
  { label: "Courier New", family: "'Courier New', Courier, monospace", category: "System" },
];

const loadedGoogleFonts = new Set<string>();

/**
 * Ensures a Google Font face is fetched and ready in document.fonts
 * so Konva's HTML5 canvas redraws text accurately with the chosen typeface.
 */
export async function ensureFontLoaded(fontFamily: string): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;

  const matched = MEME_FONTS.find(
    (f) =>
      f.family === fontFamily ||
      (f.googleName &&
        fontFamily.toLowerCase().includes(f.googleName.toLowerCase())),
  );

  const primaryName = matched?.googleName || fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  if (!primaryName) return;

  // Ensure stylesheet link exists if dynamically referenced
  if (matched?.googleName && !loadedGoogleFonts.has(matched.googleName)) {
    loadedGoogleFonts.add(matched.googleName);
  }

  try {
    await Promise.all([
      document.fonts.load(`400 32px "${primaryName}"`),
      document.fonts.load(`700 32px "${primaryName}"`),
    ]);
  } catch {
    // Gracefully ignore font loading errors (e.g., offline)
  }
}

interface FontPickerDropdownProps {
  value: string;
  onChange: (fontFamily: string) => void;
  label?: string;
  helperText?: string;
  id?: string;
}

export const FontPickerDropdown: React.FC<FontPickerDropdownProps> = ({
  value,
  onChange,
  label = "Font Family",
  helperText,
  id = "meme-font-picker",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(() => {
    return (
      MEME_FONTS.find((f) => f.family === value) ||
      MEME_FONTS.find((f) =>
        value?.toLowerCase().includes(f.label.toLowerCase()),
      ) || {
        label: value?.split(",")[0]?.replace(/['"]/g, "") || "Impact",
        family: value || "Impact, sans-serif",
        category: "System" as const,
      }
    );
  }, [value]);

  const filteredFonts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MEME_FONTS;
    return MEME_FONTS.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
    );
  }, [query]);

  const groupedFonts = useMemo(() => {
    const groups: Record<string, MemeFontOption[]> = {};
    for (const font of filteredFonts) {
      if (!groups[font.category]) groups[font.category] = [];
      groups[font.category].push(font);
    }
    return Object.entries(groups);
  }, [filteredFonts]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery("");
    }
  }, [open]);

  const handleSelect = (font: MemeFontOption) => {
    onChange(font.family);
    ensureFontLoaded(font.family);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label
            htmlFor={id}
            className="text-[11px] font-semibold text-zinc-400 block"
          >
            {label}
          </label>
          {helperText && (
            <span className="text-[10px] text-zinc-500 truncate">
              {helperText}
            </span>
          )}
        </div>
      )}

      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 bg-zinc-950 hover:bg-zinc-900 border border-white/10 hover:border-white/20 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Type className="w-4 h-4 text-indigo-400 shrink-0" />
          <span
            className="text-sm text-white truncate"
            style={{ fontFamily: selectedOption.family }}
          >
            {selectedOption.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-zinc-500 whitespace-nowrap">
            {selectedOption.googleName ? "Google Font" : "System"}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-400 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Google Fonts list"
          className="absolute left-0 right-0 mt-1.5 z-40 bg-zinc-950 border border-white/15 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-72"
        >
          {/* Search input */}
          <div className="p-2 border-b border-white/10 bg-zinc-900/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Google Fonts..."
                className="w-full bg-zinc-950 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Font List */}
          <div className="overflow-y-auto py-1">
            {groupedFonts.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                No fonts match "{query}"
              </div>
            ) : (
              groupedFonts.map(([category, fonts]) => (
                <div key={category} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-zinc-500 tracking-wide">
                    {category}
                  </div>
                  {fonts.map((font) => {
                    const isSelected = font.family === selectedOption.family;
                    return (
                      <button
                        key={font.family}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(font)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "bg-indigo-600/20 text-white"
                            : "text-zinc-200 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span
                          className="text-sm leading-snug truncate"
                          style={{ fontFamily: font.family }}
                        >
                          {font.label}
                        </span>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] text-zinc-500 whitespace-nowrap shrink-0">
                            {font.googleName ? "Google" : "Classic"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
