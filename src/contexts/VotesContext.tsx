import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { db } from "../lib/firebase";
import { collection, doc, onSnapshot, runTransaction } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { handleFirestoreError, OperationType } from "../lib/firebaseErrorHandler";

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

const haveSameVoters = (left: TemplateVotes, right: TemplateVotes) =>
  left.upvoters.length === right.upvoters.length &&
  left.downvoters.length === right.downvoters.length &&
  left.upvoters.every((id, index) => id === right.upvoters[index]) &&
  left.downvoters.every((id, index) => id === right.downvoters[index]);

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
        setVotes((previousVotes) => {
          let changed = snapshot.size !== Object.keys(previousVotes).length;
          const nextVotes: Record<string, TemplateVotes> = {};

          snapshot.docs.forEach((snapshotDoc) => {
            const incoming = snapshotDoc.data() as TemplateVotes;
            const previous = previousVotes[snapshotDoc.id];

            if (previous && haveSameVoters(previous, incoming)) {
              nextVotes[snapshotDoc.id] = previous;
            } else {
              nextVotes[snapshotDoc.id] = incoming;
              changed = true;
            }
          });

          return changed ? nextVotes : previousVotes;
        });
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.GET, "templateVotes");
      }
    );

    return () => unsubscribe();
  }, []);

  const handleVote = useCallback(async (templateId: string, type: 'up' | 'down' | 'clear') => {
    if (!user) {
      toast.error("You must be logged in to vote.");
      return;
    }
    
    if (!db || db.app.options.projectId === "MOCK") return;

    try {
      const voteRef = doc(db, "templateVotes", templateId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(voteRef);
        const current = snapshot.exists()
          ? snapshot.data() as Partial<TemplateVotes>
          : {};
        const upvoters = (current.upvoters ?? []).filter((id) => id !== user.uid);
        const downvoters = (current.downvoters ?? []).filter((id) => id !== user.uid);

        if (type === "up") upvoters.push(user.uid);
        if (type === "down") downvoters.push(user.uid);

        transaction.set(voteRef, { upvoters, downvoters });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `templateVotes/${templateId}`);
    }
  }, [user]);

  const value = useMemo(
    () => ({ votes, handleVote, loading }),
    [votes, handleVote, loading],
  );

  return (
    <VotesContext.Provider value={value}>
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
