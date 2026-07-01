import React, { createContext, useContext, useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

interface TemplateVotes {
  upvoters: string[];
  downvoters: string[];
}

interface VotesContextType {
  votes: Record<string, TemplateVotes>;
  handleVote: (templateId: string, type: 'up' | 'down' | 'clear') => Promise<void>;
  loading: boolean;
}

const VotesContext = createContext<VotesContextType | null>(null);

export const VotesProvider = ({ children }: { children: React.ReactNode }) => {
  const [votes, setVotes] = useState<Record<string, TemplateVotes>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!db || db.app.options.projectId === "MOCK") {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "templateVotes"),
      (snapshot) => {
        const newVotes: Record<string, TemplateVotes> = {};
        snapshot.docs.forEach((doc) => {
          newVotes[doc.id] = doc.data() as TemplateVotes;
        });
        setVotes(newVotes);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching votes:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleVote = async (templateId: string, type: 'up' | 'down' | 'clear') => {
    if (!user) {
      toast.error("You must be logged in to vote.");
      return;
    }
    
    if (!db || db.app.options.projectId === "MOCK") return;

    try {
      const voteRef = doc(db, "templateVotes", templateId);
      const voteDoc = await getDoc(voteRef);

      const isUpvoting = type === 'up';
      const isDownvoting = type === 'down';

      if (!voteDoc.exists()) {
        // Create document if it doesn't exist
        await setDoc(voteRef, {
          upvoters: isUpvoting ? [user.uid] : [],
          downvoters: isDownvoting ? [user.uid] : []
        });
      } else {
        const updates: any = {};
        
        // Remove from both lists first to ensure clean state
        updates.upvoters = arrayRemove(user.uid);
        updates.downvoters = arrayRemove(user.uid);

        await updateDoc(voteRef, updates);

        // Then add to the target list if we aren't just clearing
        if (type !== 'clear') {
           const reUpdate: any = {};
           if (isUpvoting) {
             reUpdate.upvoters = arrayUnion(user.uid);
           } else if (isDownvoting) {
             reUpdate.downvoters = arrayUnion(user.uid);
           }
           await updateDoc(voteRef, reUpdate);
        }
      }
    } catch (err) {
      console.error("Error voting:", err);
      toast.error("Failed to record vote");
    }
  };

  return (
    <VotesContext.Provider value={{ votes, handleVote, loading }}>
      {children}
    </VotesContext.Provider>
  );
};

export const useVotes = () => {
  const context = useContext(VotesContext);
  if (!context) {
    throw new Error("useVotes must be used within a VotesProvider");
  }
  return context;
};
