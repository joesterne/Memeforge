import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchBar({ value, onChange, placeholder = "Search...", className = "max-w-lg mx-auto mt-6" }: SearchBarProps) {
  return (
    <div className={`relative group ${className}`}>
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 w-5 h-5 transition-colors group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400" />
      <input 
        type="text" 
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-full pl-12 pr-10 py-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 dark:focus:ring-indigo-500/20 transition-all text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 shadow-sm"
      />
      {value && (
        <button 
          onClick={() => onChange("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
