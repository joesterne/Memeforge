import React from "react";
import { Download, Stamp } from "lucide-react";

interface ExportModalProps {
  show: boolean;
  onClose: () => void;
  exportFormat: string;
  setExportFormat: (format: "image/png" | "image/jpeg" | "image/gif") => void;
  exportScale: number;
  setExportScale: (scale: number) => void;
  exportQuality: number;
  setExportQuality: (quality: number) => void;
  isBackgroundAnimatedGif: boolean;
  exportMeme: () => Promise<void>;
  watermark?: {
    enabled: boolean;
    text: string;
    opacity: number;
    position: string;
  };
  setWatermark?: React.Dispatch<
    React.SetStateAction<{
      enabled: boolean;
      text: string;
      opacity: number;
      position: string;
    }>
  >;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  show,
  onClose,
  exportFormat,
  setExportFormat,
  exportScale,
  setExportScale,
  exportQuality,
  setExportQuality,
  isBackgroundAnimatedGif,
  exportMeme,
  watermark,
  setWatermark,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">
          Export Configuration
        </h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-zinc-400 uppercase font-bold mb-2 block">
              File Format
            </label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-white appearance-none"
            >
              <option value="image/png">PNG (Lossless image)</option>
              <option value="image/jpeg">JPG (Compressed image)</option>
              {isBackgroundAnimatedGif && (
                <option value="image/gif">GIF (Animated image)</option>
              )}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase font-bold mb-2 block">
              Resolution Scale: {exportScale}x
            </label>
            <select
              value={exportScale}
              onChange={(e) => setExportScale(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-white appearance-none"
            >
              <option value={1}>1x (Original Size)</option>
              <option value={2}>2x (High Quality)</option>
              <option value={3}>3x (Ultra HD)</option>
            </select>
          </div>
          {exportFormat === "image/jpeg" && (
            <div>
              <label className="text-xs text-zinc-400 uppercase font-bold flex justify-between mb-2">
                <span>JPEG Quality</span>
                <span>{Math.round(exportQuality * 100)}%</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={exportQuality}
                onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                className="w-full h-2 mt-2 accent-indigo-500 bg-zinc-950 border border-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}

          {/* Watermark Toggle */}
          {watermark && setWatermark && (
            <div className="pt-2 border-t border-white/5">
              <label className="text-xs text-zinc-400 uppercase font-bold mb-2 block">
                Branding
              </label>
              <div className="p-3 bg-zinc-950 border border-white/10 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      watermark.enabled
                        ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                        : "bg-zinc-800 text-zinc-500 border border-white/5"
                    }`}
                  >
                    <Stamp className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      'MemeForge' Watermark
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      {watermark.enabled
                        ? "Watermark stamped on export"
                        : "Clean meme without watermark"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={watermark.enabled}
                  onClick={() =>
                    setWatermark((p) => ({
                      ...p,
                      enabled: !p.enabled,
                      text: p.text || "MemeForge",
                    }))
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    watermark.enabled ? "bg-indigo-600" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      watermark.enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={async () => {
                onClose();
                await exportMeme();
              }}
              className="flex font-bold items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]"
            >
              <Download className="w-4 h-4" /> Download Meme
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 bg-transparent hover:bg-white/5 text-zinc-400 rounded-xl font-bold transition-all text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
