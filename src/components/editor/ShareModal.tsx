import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  X,
  Link2,
  Check,
  Copy,
  Image as ImageIcon,
  Code2,
  Share2,
  ExternalLink,
  RefreshCw,
  CloudUpload,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { CanvasObject } from "../../types/canvas";

export interface ShareableMemeState {
  t?: string | null; // templateUrl (non-data URL)
  o?: CanvasObject[]; // canvas objects
  w?: {
    enabled: boolean;
    text: string;
    opacity: number;
    position: string;
  };
}

const MAX_ENCODED_URL_CHARS = 3800;

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64Url: string): string {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeShareState(state: ShareableMemeState): string | null {
  try {
    // Strip large inline base64 images from objects so URLs stay compact
    const compactObjects = (state.o || []).filter(
      (obj) => !(obj.type === "image" && obj.url?.startsWith("data:")),
    );
    const templateUrl =
      state.t && !state.t.startsWith("data:") ? state.t : undefined;

    const payload: ShareableMemeState = {};
    if (templateUrl) payload.t = templateUrl;
    if (compactObjects.length > 0) payload.o = compactObjects;
    if (state.w?.enabled) payload.w = state.w;

    if (!payload.t && (!payload.o || payload.o.length === 0) && !payload.w) {
      return null;
    }

    const encoded = toBase64Url(JSON.stringify(payload));
    if (encoded.length > MAX_ENCODED_URL_CHARS) return null;
    return encoded;
  } catch {
    return null;
  }
}

export function decodeShareState(encoded: string): ShareableMemeState | null {
  try {
    const json = fromBase64Url(encoded);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ShareableMemeState;
  } catch {
    return null;
  }
}

export async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function copyImageBlobToClipboard(
  blob: Blob,
): Promise<{ ok: boolean; error?: string }> {
  if (
    typeof ClipboardItem === "undefined" ||
    !navigator.clipboard ||
    !navigator.clipboard.write
  ) {
    return {
      ok: false,
      error: "Image clipboard is not supported in this browser.",
    };
  }

  try {
    const pngBlob =
      blob.type === "image/png"
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: "image/png" });
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": pngBlob }),
    ]);
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.message ||
        "Clipboard access was blocked. You can copy the image data URL instead.",
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface RenderedMemeSnapshot {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

interface ShareModalProps {
  show: boolean;
  onClose: () => void;
  roomId: string;
  templateName?: string;
  templateUrl?: string | null;
  objects: CanvasObject[];
  watermark: {
    enabled: boolean;
    text: string;
    opacity: number;
    position: string;
  };
  onRenderSnapshot: () => Promise<RenderedMemeSnapshot | null>;
  onPublishCloudLink?: () => Promise<boolean>;
  canPublishToCloud?: boolean;
  onShareRecorded?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  show,
  onClose,
  roomId,
  templateName,
  templateUrl,
  objects,
  watermark,
  onRenderSnapshot,
  onPublishCloudLink,
  canPublishToCloud = false,
  onShareRecorded,
}) => {
  const [snapshot, setSnapshot] = useState<RenderedMemeSnapshot | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [caption, setCaption] = useState(
    templateName
      ? `Check out this "${templateName}" meme I made on MemeForge!`
      : "Check out this meme I made on MemeForge!",
  );
  const [isCloudPublished, setIsCloudPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedDataUrl, setCopiedDataUrl] = useState(false);
  const [clipboardWarning, setClipboardWarning] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setRendering(true);
    setRenderError(null);
    setClipboardWarning(null);
    try {
      const result = await onRenderSnapshot();
      if (result) {
        setSnapshot(result);
      } else {
        setRenderError("Could not capture the current canvas.");
      }
    } catch {
      setRenderError("Could not capture the current canvas.");
    } finally {
      setRendering(false);
    }
  }, [onRenderSnapshot]);

  useEffect(() => {
    if (show) {
      setCopiedLink(false);
      setCopiedImage(false);
      setCopiedDataUrl(false);
      setClipboardWarning(null);
      setCaption(
        templateName
          ? `Check out this "${templateName}" meme I made on MemeForge!`
          : "Check out this meme I made on MemeForge!",
      );
      loadSnapshot();
    }
  }, [show, templateName, loadSnapshot]);

  useEffect(() => {
    if (!show) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, onClose]);

  const { shareUrl, linkMode } = useMemo(() => {
    const baseUrl = `${window.location.origin}/editor/${roomId}`;
    if (isCloudPublished) {
      return { shareUrl: baseUrl, linkMode: "cloud" as const };
    }
    const encoded = encodeShareState({
      t: templateUrl,
      o: objects,
      w: watermark,
    });
    if (encoded) {
      return {
        shareUrl: `${baseUrl}?share=${encoded}`,
        linkMode: "encoded" as const,
      };
    }
    return { shareUrl: baseUrl, linkMode: "room" as const };
  }, [roomId, isCloudPublished, templateUrl, objects, watermark]);

  const handleCopyLink = async () => {
    const ok = await copyTextWithFallback(shareUrl);
    if (ok) {
      setCopiedLink(true);
      toast.success("Shareable link copied to clipboard");
      onShareRecorded?.();
      setTimeout(() => setCopiedLink(false), 2200);
    } else {
      toast.error("Unable to copy link. Please copy it manually.");
    }
  };

  const handleCopyImage = async () => {
    if (!snapshot) return;
    setClipboardWarning(null);
    const res = await copyImageBlobToClipboard(snapshot.blob);
    if (res.ok) {
      setCopiedImage(true);
      toast.success("Meme image copied to clipboard — paste it anywhere!");
      onShareRecorded?.();
      setTimeout(() => setCopiedImage(false), 2400);
    } else {
      setClipboardWarning(
        res.error ||
          "Browser blocked direct image copy. Use Copy Data URL instead.",
      );
      toast.error("Direct image copy blocked by browser permissions.");
    }
  };

  const handleCopyDataUrl = async () => {
    if (!snapshot) return;
    const ok = await copyTextWithFallback(snapshot.dataUrl);
    if (ok) {
      setCopiedDataUrl(true);
      toast.success("Base64 image data copied to clipboard");
      onShareRecorded?.();
      setTimeout(() => setCopiedDataUrl(false), 2200);
    } else {
      toast.error("Unable to copy image data URL.");
    }
  };

  const handlePublishShortLink = async () => {
    if (!onPublishCloudLink || publishing) return;
    setPublishing(true);
    try {
      const ok = await onPublishCloudLink();
      if (ok) {
        setIsCloudPublished(true);
        const shortUrl = `${window.location.origin}/editor/${roomId}`;
        await copyTextWithFallback(shortUrl);
        setCopiedLink(true);
        toast.success("Published to cloud & short link copied!");
        onShareRecorded?.();
        setTimeout(() => setCopiedLink(false), 2200);
      }
    } finally {
      setPublishing(false);
    }
  };

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      if (snapshot) {
        const file = new File([snapshot.blob], `meme-${roomId.slice(0, 8)}.png`, {
          type: "image/png",
        });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: templateName || "MemeForge Meme",
            text: caption,
            files: [file],
          });
          toast.success("Shared successfully!");
          onShareRecorded?.();
          return;
        }
      }
      await navigator.share({
        title: templateName || "MemeForge Meme",
        text: caption,
        url: shareUrl,
      });
      toast.success("Shared successfully!");
      onShareRecorded?.();
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast.error("Unable to open system share sheet.");
      }
    }
  };

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedCaption = encodeURIComponent(caption);
  const encodedCombined = encodeURIComponent(`${caption} ${shareUrl}`);

  const socialPlatforms = [
    {
      name: "X / Twitter",
      href: `https://twitter.com/intent/tweet?text=${encodedCaption}&url=${encodedUrl}`,
      accent: "hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300",
    },
    {
      name: "Reddit",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedCaption}`,
      accent:
        "hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-300",
    },
    {
      name: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedCaption}`,
      accent:
        "hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300",
    },
    {
      name: "WhatsApp",
      href: `https://api.whatsapp.com/send?text=${encodedCombined}`,
      accent:
        "hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300",
    },
    {
      name: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedCaption}`,
      accent:
        "hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300",
    },
    {
      name: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      accent:
        "hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300",
    },
  ];

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2
              id="share-modal-title"
              className="text-lg font-bold text-white tracking-tight"
            >
              Share Meme
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Copy the rendered image to paste anywhere, or generate a shareable
              link.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Preview & Clipboard Image Copy */}
          <div className="md:col-span-5 flex flex-col gap-4">
            <div className="relative aspect-square w-full rounded-xl bg-zinc-950 border border-white/10 overflow-hidden flex items-center justify-center">
              {rendering ? (
                <div className="flex flex-col items-center gap-2 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs font-medium">
                    Rendering preview...
                  </span>
                </div>
              ) : renderError ? (
                <div className="p-4 text-center flex flex-col items-center gap-2">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                  <p className="text-xs text-zinc-400">{renderError}</p>
                  <button
                    type="button"
                    onClick={loadSnapshot}
                    className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                </div>
              ) : snapshot ? (
                <img
                  src={snapshot.dataUrl}
                  alt={templateName ? `Preview of ${templateName}` : "Rendered meme preview"}
                  className="w-full h-full object-contain"
                />
              ) : null}
            </div>

            {snapshot && !rendering && (
              <div className="flex items-center justify-between text-xs text-zinc-400 font-mono tabular-nums px-0.5">
                <span>
                  {snapshot.width} × {snapshot.height} px
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(snapshot.blob.size)}</span>
                <span aria-hidden="true">·</span>
                <span>PNG</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCopyImage}
                disabled={rendering || !snapshot}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {copiedImage ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    Copied Image to Clipboard
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    Copy Image to Clipboard
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyDataUrl}
                disabled={rendering || !snapshot}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-white/10 transition-colors whitespace-nowrap disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {copiedDataUrl ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Copied Image Data URL
                  </>
                ) : (
                  <>
                    <Code2 className="w-4 h-4 text-zinc-400" />
                    Copy Image Data URL
                  </>
                )}
              </button>

              {clipboardWarning && (
                <p className="text-[11px] text-amber-300 leading-relaxed flex items-start gap-1.5 pt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{clipboardWarning}</span>
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Shareable Link, Caption & Social Platforms */}
          <div className="md:col-span-7 flex flex-col gap-5">
            {/* Shareable Link */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="share-link-input"
                  className="text-xs font-semibold text-zinc-300"
                >
                  Shareable Link
                </label>
                <span className="text-[11px] text-zinc-500">
                  {linkMode === "cloud"
                    ? "Saved cloud link"
                    : linkMode === "encoded"
                      ? "Includes template & text"
                      : "Live room link"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Link2 className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="share-link-input"
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 truncate"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-100 hover:bg-white text-zinc-900 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>

              {canPublishToCloud && onPublishCloudLink && !isCloudPublished && (
                <button
                  type="button"
                  onClick={handlePublishShortLink}
                  disabled={publishing}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors pt-0.5 disabled:opacity-50"
                >
                  {publishing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5" />
                  )}
                  {publishing
                    ? "Publishing short link..."
                    : "Save to cloud for a shorter link"}
                </button>
              )}
            </div>

            {/* Share Caption */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <label
                htmlFor="share-caption-input"
                className="text-xs font-semibold text-zinc-300 block"
              >
                Post Caption
              </label>
              <textarea
                id="share-caption-input"
                rows={2}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write a caption for your post..."
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Social Media Platforms */}
            <div className="space-y-2.5 border-t border-white/10 pt-4">
              <span className="text-xs font-semibold text-zinc-300 block">
                Share on Social Media
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {socialPlatforms.map((platform) => (
                  <a
                    key={platform.name}
                    href={platform.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onShareRecorded?.()}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-xs font-semibold text-zinc-200 transition-colors whitespace-nowrap ${platform.accent} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
                  >
                    <span className="truncate">{platform.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  </a>
                ))}
              </div>

              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  disabled={rendering}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 mt-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl text-xs font-semibold border border-white/10 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share via Device Apps
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
