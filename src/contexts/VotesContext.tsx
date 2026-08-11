import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface TemplateVotes {
  upvotes: number;
  downvotes: number;
  userVote: "up" | "down" | null;
}

interface VotesContextType {
  votes: Record<string, TemplateVotes>;
  loadVotes: (templateIds: string[]) => void;
  handleVote: (templateId: string, type: "up" | "down" | "clear") => Promise<void>;
  loading: boolean;
}

const VotesContext = createContext<VotesContextType | null>(null);

export const VotesProvider = ({ children }: { children: React.ReactNode }) => {
  const [votes, setVotes] = useState<Record<string, TemplateVotes>>({});
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const pending = useRef(new Set<string>());
  const loaded = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loaded.current.clear();
    pending.current.clear();
    setVotes({});
  }, [user?.uid]);

  const flush = useCallback(async () => {
    const ids = [...pending.current].slice(0, 50);
    ids.forEach((id) => pending.current.delete(id));
    if (!ids.length) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ votes: Record<string, TemplateVotes> }>(
        `/api/template-votes?ids=${encodeURIComponent(ids.join(","))}`,
        {},
        { user },
      );
      ids.forEach((id) => loaded.current.add(id));
      setVotes((previous) => ({ ...previous, ...data.votes }));
    } catch (error) {
      console.error("Vote totals could not be loaded", error);
    } finally {
      setLoading(false);
      if (pending.current.size) {
        timer.current = setTimeout(() => {
          timer.current = null;
          void flush();
        }, 50);
      }
    }
  }, [user]);

  const loadVotes = useCallback((templateIds: string[]) => {
    templateIds.forEach((id) => {
      if (id && !loaded.current.has(id)) pending.current.add(id);
    });
    if (pending.current.size && !timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, 50);
    }
  }, [flush]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleVote = useCallback(async (templateId: string, type: "up" | "down" | "clear") => {
    if (!user) {
      toast.error("Sign in to vote.");
      return;
    }
    const previous = votes[templateId] || { upvotes: 0, downvotes: 0, userVote: null };
    let upvotes = previous.upvotes;
    let downvotes = previous.downvotes;
    if (previous.userVote === "up") upvotes = Math.max(0, upvotes - 1);
    if (previous.userVote === "down") downvotes = Math.max(0, downvotes - 1);
    if (type === "up") upvotes += 1;
    if (type === "down") downvotes += 1;
    setVotes((current) => ({
      ...current,
      [templateId]: { upvotes, downvotes, userVote: type === "clear" ? null : type },
    }));
    try {
      const data = await apiFetch<{ vote: TemplateVotes }>(
        `/api/template-votes/${encodeURIComponent(templateId)}`,
        { method: "POST", body: JSON.stringify({ type }) },
        { user },
      );
      setVotes((previous) => ({ ...previous, [templateId]: data.vote }));
    } catch (error) {
      setVotes((current) => ({ ...current, [templateId]: previous }));
      toast.error(error instanceof Error ? error.message : "Could not save your vote.");
    }
  }, [user, votes]);

  return (
    <VotesContext.Provider value={{ votes, loadVotes, handleVote, loading }}>
      {children}
    </VotesContext.Provider>
  );
};

export const useVotes = () => {
  const context = useContext(VotesContext);
  if (!context) throw new Error("useVotes must be used within a VotesProvider");
  return context;
};
