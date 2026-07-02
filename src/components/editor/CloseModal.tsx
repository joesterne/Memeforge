import React from "react";
import { useNavigate } from "react-router";

interface CloseModalProps {
  show: boolean;
  onClose: () => void;
  onSaveToCloud: () => Promise<any>;
  user: any;
}

export const CloseModal: React.FC<CloseModalProps> = ({
  show,
  onClose,
  onSaveToCloud,
  user,
}) => {
  const navigate = useNavigate();

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2">Unsaved Changes</h2>
        <p className="text-sm text-zinc-400 mb-6">
          You have unsaved changes. Do you want to save to cloud before leaving?
        </p>
        <div className="flex flex-col gap-3">
          {user && (
            <button
              onClick={async () => {
                await onSaveToCloud();
                navigate("/");
              }}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all text-sm"
            >
              Save to Cloud
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            className="w-full py-2 bg-rose-500/20 hover:bg-rose-500/40 text-rose-500 rounded-xl font-bold transition-all text-sm border border-rose-500/20"
          >
            Leave Without Saving
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 bg-transparent hover:bg-white/5 text-zinc-400 rounded-xl font-bold transition-all text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
