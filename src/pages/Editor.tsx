import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text as KonvaText,
  Transformer,
  Rect,
  Line,
} from "react-konva";
import useImage from "use-image";
import {
  Type,
  Download,
  Share2,
  Users,
  Save,
  ImagePlus,
  Undo,
  Redo,
  Copy,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  ImageIcon,
  Camera,
  X,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  CloudUpload
} from "lucide-react";
import Draggable from "react-draggable";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import {
  handleFirestoreError,
  OperationType,
} from "../lib/firebaseErrorHandler";
import { toast } from "sonner";
import type { CanvasObject } from "../types/canvas";
import { CanvasImage, CanvasText, AIPromptInput, AIMemeChatInput } from "../components/editor/CanvasElements";
import { ExportModal } from "../components/editor/ExportModal";
import { CloseModal } from "../components/editor/CloseModal";
import { saveRecentCreation } from "../lib/localStorage";
import { useVotes } from "../contexts/VotesContext";
import { apiFetch, collaborationUrl } from "../lib/api";
import { CollaborationClient, type CollaborationStatus } from "../lib/collaborationClient";
import { dataUrlToBlob, storeUserMedia, validateImageFile } from "../lib/mediaStorage";
import { encodeGifInWorker } from "../lib/gifExport";
import { buildMemeDocument, resolveBackground } from "../lib/memeDocuments";
import type { SubmissionDocument, TemplateDocument } from "../types/documents";
import type {
  CanvasUpdateAck,
  CanvasUpdatePayload,
  CollaborationRoomState,
  CollaborationUser,
} from "../types/collaboration";

const MAX_HISTORY_STEPS = 30;

export default function Editor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const template = location.state?.template;
  
  const { votes, loadVotes, handleVote } = useVotes();
  const templateId = template?.id || id?.replace("template_", "");
  const templateVotes = templateId ? votes[templateId] : undefined;
  const upvotes = templateVotes?.upvotes || 0;
  const downvotes = templateVotes?.downvotes || 0;
  const score = upvotes - downvotes;
  const hasUpvoted = user && templateVotes?.userVote === "up";
  const hasDownvoted = user && templateVotes?.userVote === "down";

  useEffect(() => {
    if (templateId) loadVotes([templateId]);
  }, [loadVotes, templateId]);

  const [socket, setSocket] = useState<CollaborationClient | null>(null);
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const objectsRef = useRef<CanvasObject[]>([]);
  const [history, setHistory] = useState<CanvasObject[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const historyStepRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  const [activeUsers, setActiveUsers] = useState<CollaborationUser[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting" | "failed">("connecting");
  const revisionRef = useRef(0);
  const socketUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSocketObjectsRef = useRef<CanvasObject[] | null>(null);
  const socketUpdateInFlightRef = useRef(false);
  const [roomId] = useState(() => (id && id !== "new" && !id.startsWith("template_")) ? id : crypto.randomUUID());
  const [bgImage] = useImage(template?.url || "", "anonymous");
  const [isRoom, setIsRoom] = useState(!id?.startsWith("template_"));
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed" | "offline">("idle");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportAbortRef = useRef<AbortController | null>(null);

  const [isGridEnabled, setIsGridEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number | "fit">("fit");
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const lastDistRef = useRef<number>(0);
  const [isBackgroundAnimatedGif, setIsBackgroundAnimatedGif] = useState(
    template?.is_video || false,
  );
  const [exportFormat, setExportFormat] = useState<
    "image/png" | "image/jpeg" | "image/gif"
  >(() => {
    if (template?.is_video) return "image/gif";
    const saved = localStorage.getItem("memeforge_export_format");
    return saved === "image/jpeg" || saved === "image/gif" ? saved : "image/png";
  });
  const [exportScale, setExportScale] = useState<number>(() => Number(localStorage.getItem("memeforge_export_scale")) || 1);
  const [exportQuality, setExportQuality] = useState<number>(() => Number(localStorage.getItem("memeforge_export_quality")) || 0.9);
  const [showExportModal, setShowExportModal] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const [watermark, setWatermark] = useState({
    enabled: false,
    text: "Watermark",
    opacity: 0.5,
    position: "bottom-right",
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const markDirty = useCallback(() => setHasUnsavedChanges(true), []);

  useEffect(() => () => {
    exportAbortRef.current?.abort();
    aiAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    localStorage.setItem("memeforge_export_format", exportFormat);
    localStorage.setItem("memeforge_export_scale", String(exportScale));
    localStorage.setItem("memeforge_export_quality", String(exportQuality));
  }, [exportFormat, exportQuality, exportScale]);

  const sendSocketUpdate = useCallback((nextObjects: CanvasObject[], immediate = false) => {
    pendingSocketObjectsRef.current = nextObjects;
    if (!socket?.connected) {
      setConnectionStatus(socket ? "reconnecting" : "failed");
      return;
    }

    const flush = () => {
      if (socketUpdateInFlightRef.current || !pendingSocketObjectsRef.current || !socket.connected) return;
      const queuedObjects = pendingSocketObjectsRef.current;
      pendingSocketObjectsRef.current = null;
      socketUpdateInFlightRef.current = true;
      const payload: CanvasUpdatePayload = {
        roomId,
        objects: queuedObjects,
        baseRevision: revisionRef.current,
        requestId: crypto.randomUUID(),
      };
      socket.sendCanvasUpdate(payload, 5_000).then((acknowledgement: CanvasUpdateAck) => {
        socketUpdateInFlightRef.current = false;
        if (acknowledgement.accepted) {
          revisionRef.current = acknowledgement.revision;
          setConnectionStatus("connected");
        } else if (acknowledgement.state) {
          revisionRef.current = acknowledgement.state.revision;
          setObjects(acknowledgement.state.objects);
          setActiveUsers(acknowledgement.state.users);
          setHistory([structuredClone(acknowledgement.state.objects)]);
          setHistoryStep(0);
          historyStepRef.current = 0;
          toast.info("A collaborator changed the canvas first. The latest room version was restored.");
        }
        if (pendingSocketObjectsRef.current) queueMicrotask(flush);
      }).catch(() => {
        socketUpdateInFlightRef.current = false;
        setConnectionStatus("reconnecting");
      });
    };

    if (socketUpdateTimerRef.current) clearTimeout(socketUpdateTimerRef.current);
    if (immediate) flush();
    else socketUpdateTimerRef.current = setTimeout(flush, 150);
  }, [roomId, socket]);

  useEffect(() => () => {
    if (socketUpdateTimerRef.current) clearTimeout(socketUpdateTimerRef.current);
  }, []);

  const pushToHistory = useCallback((newObjects: CanvasObject[]) => {
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyStepRef.current + 1);
      const next = [...upToCurrent, structuredClone(newObjects)].slice(-MAX_HISTORY_STEPS);
      const nextStep = next.length - 1;
      historyStepRef.current = nextStep;
      setHistoryStep(nextStep);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (historyStepRef.current > 0) {
      const prevStep = historyStepRef.current - 1;
      const previousState = history[prevStep];
      setObjects(previousState);
      setHistoryStep(prevStep);
      historyStepRef.current = prevStep;
      sendSocketUpdate(previousState, true);
      markDirty();
    }
  }, [history, markDirty, sendSocketUpdate]);

  const handleRedo = useCallback(() => {
    if (historyStepRef.current < history.length - 1) {
      const nextStep = historyStepRef.current + 1;
      const nextState = history[nextStep];
      setObjects(nextState);
      setHistoryStep(nextStep);
      historyStepRef.current = nextStep;
      sendSocketUpdate(nextState, true);
      markDirty();
    }
  }, [history, markDirty, sendSocketUpdate]);

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 600,
  });
  const [logicalSize, setLogicalSize] = useState({ width: 800, height: 800 });
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [upImage] = useImage(uploadedImageUrl || "", "anonymous");

  useEffect(() => {
    if (bgImage) {
      setLogicalSize({ width: bgImage.width || 800, height: bgImage.height || 800 });
    } else if (upImage) {
      setLogicalSize({ width: upImage.width || 800, height: upImage.height || 800 });
    }
    const currentUrl = uploadedImageUrl || template?.url;
    setIsBackgroundAnimatedGif(
      template?.is_video || currentUrl?.toLowerCase()?.includes(".gif"),
    );
  }, [bgImage, upImage, uploadedImageUrl, template]);

  useEffect(() => {
    // If it's an existing room (not template_), fetch from Firestore
    if (!db || db.app.options.projectId === "MOCK") return;
    if (isRoom && id && id !== "new") {
      getDoc(doc(db, "memes", id))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.objects) {
              setObjects(data.objects);
              setHistory([data.objects]);
              setHistoryStep(0);
              historyStepRef.current = 0;
            }
            if (data.templateUrl) setUploadedImageUrl(data.templateUrl);
            if (data.templatePath) setUploadedImagePath(data.templatePath);
          }
        })
        .catch((err) => {
          handleFirestoreError(err, OperationType.GET, `memes/${id}`);
        });
    }

    // Replace URL to reflect current room to share. Use React Router so
    // Capacitor/iOS builds update the HashRouter URL instead of the path.
    if (!isRoom || id === "new") {
      navigate(`/editor/${roomId}`, { replace: true });
      setIsRoom(true);
    }
  }, [id, isRoom, navigate, roomId]);

  useEffect(() => {
    const s = new CollaborationClient(collaborationUrl(), 8);
    setSocket(s);
    setConnectionStatus("connecting");

    const join = () => s.send("join-room", {
      roomId,
      user: { id: user?.uid, name: user?.displayName || "Anonymous" },
    });
    s.on<CollaborationStatus>("status", (status) => {
      setConnectionStatus(status);
      if (status === "connected") join();
    });

    s.on<CollaborationRoomState>("room-state", (state) => {
      revisionRef.current = state.revision;
      setActiveUsers(state.users || []);
      if (state.objects && state.objects.length > 0) {
        setObjects(state.objects);
        setHistory([structuredClone(state.objects)]);
        setHistoryStep(0);
        historyStepRef.current = 0;
      }
    });

    s.on<{ objects: CanvasObject[]; revision: number }>("canvas-updated", (event) => {
      revisionRef.current = event.revision;
      setObjects(event.objects);
    });
    s.on<CollaborationUser[]>("presence-updated", (users) => setActiveUsers(users));
    s.on<{ message?: string }>("collaboration-error", (error) => {
      setConnectionStatus("failed");
      toast.error(error.message || "Realtime collaboration is unavailable.");
    });

    s.connect();
    return () => s.close();
  }, [roomId, user?.displayName, user?.uid]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let windowTimeoutId: NodeJS.Timeout;
    
    const updateSize = (rectWidth?: number, rectHeight?: number) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (rectWidth !== undefined && rectHeight !== undefined) {
          setContainerSize({ width: rectWidth, height: rectHeight });
        } else if (containerRef.current) {
          setContainerSize({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      }, 100);
    }
    
    const observer = new ResizeObserver((entries) => {
      if (entries[0] && entries[0].contentRect) {
        updateSize(entries[0].contentRect.width, entries[0].contentRect.height);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    const handleWindowResize = () => {
      clearTimeout(windowTimeoutId);
      windowTimeoutId = setTimeout(() => {
        updateSize();
      }, 100);
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(windowTimeoutId);
      window.removeEventListener("resize", handleWindowResize);
      observer.disconnect();
    };
  }, []);

  const persistMeme = useCallback(async (announce = false) => {
    if (!user) {
      setSaveStatus("offline");
      if (announce) toast.info("Sign in to save this meme to the cloud.");
      return false;
    }
    if (!db || db.app.options.projectId === "MOCK") {
      setSaveStatus("offline");
      if (announce) toast.error("Firebase is not configured.");
      return false;
    }
    const background = resolveBackground(
      uploadedImageUrl,
      uploadedImagePath,
      template?.url,
      template?.storagePath,
    );
    const containsTemporaryMedia = [
      background.url,
      ...objectsRef.current.map((object) => object.url),
    ].some((url) => typeof url === "string" && (url.startsWith("data:") || url.startsWith("blob:")));
    if (containsTemporaryMedia) {
      setSaveStatus("failed");
      if (announce) toast.error("Sign in before adding media so it can be stored safely, then add the image again.");
      return false;
    }

    setSaving(true);
    setSaveStatus("saving");
    try {
      const reference = doc(db, "memes", roomId);
      const snapshot = await getDoc(reference);
      if (snapshot.exists() && snapshot.data().authorId !== user.uid) {
        throw new Error("You are not the author of this meme.");
      }
      const payload = buildMemeDocument({
        objects: objectsRef.current,
        authorId: snapshot.exists() ? snapshot.data().authorId : user.uid,
        createdAt: snapshot.exists() ? snapshot.data().createdAt : new Date().toISOString(),
        uploadedUrl: uploadedImageUrl,
        uploadedPath: uploadedImagePath,
        templateUrl: template?.url,
        templatePath: template?.storagePath,
      });
      await setDoc(reference, payload);
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
      if (announce) toast.success("Saved to the cloud.");
      return true;
    } catch (error) {
      setSaveStatus("failed");
      if (announce) toast.error(error instanceof Error ? error.message : "Could not save this meme.");
      handleFirestoreError(error, OperationType.WRITE, `memes/${roomId}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [roomId, template?.storagePath, template?.url, uploadedImagePath, uploadedImageUrl, user]);

  // Auto-save logic
  useEffect(() => {
    if (!hasUnsavedChanges || !stageRef.current) return;
    
    // Auto-save to local history
    const localTimer = setTimeout(() => {
      try {
        const title = template?.name || "Custom Meme";
        let thumbUrl = uploadedImageUrl || template?.url || "";
        
        if (stageRef.current) {
          try {
            thumbUrl = stageRef.current.toDataURL({
              pixelRatio: 150 / Math.max(stageRef.current.width() || 1, stageRef.current.height() || 1),
              mimeType: "image/jpeg",
              quality: 0.5
            });
          } catch(e) { } // Ignore CORS taint errors
        }

        saveRecentCreation({
          id: roomId,
          title,
          thumbnailUrl: thumbUrl,
          createdAt: new Date().toISOString()
        });
      } catch(e) {}
    }, 3000);

    return () => clearTimeout(localTimer);
  }, [objects, hasUnsavedChanges, roomId, template?.name, template?.url, uploadedImageUrl]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    if (!user || !db || db.app.options.projectId === "MOCK") {
      setSaveStatus("offline");
      return;
    }

    const timer = setTimeout(() => void persistMeme(false), 2000);
    
    return () => clearTimeout(timer);
  }, [objects, user, hasUnsavedChanges, persistMeme]);

  const emitUpdate = useCallback(
    (newObjects: CanvasObject[], skipHistory = false, skipSocket = false) => {
      setObjects(newObjects);
      if (!skipHistory) {
        pushToHistory(newObjects);
      }
      markDirty();
      if (!skipSocket) sendSocketUpdate(newObjects);
    },
    [markDirty, pushToHistory, sendSocketUpdate],
  );

  const addText = useCallback(() => {
    const newObj: CanvasObject = {
      id: crypto.randomUUID(),
      type: "text",
      x: logicalSize.width / 2 - 50,
      y: logicalSize.height / 2 - 20,
      text: "Double click to edit",
      fontSize: 40,
      fontFamily: "Impact, sans-serif",
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 2,
      draggable: true,
    };
    const newObjs = [...objectsRef.current, newObj];
    emitUpdate(newObjs);
  }, [logicalSize, emitUpdate]);

  const addImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          validateImageFile(file);
          const { default: imageCompression } =
            await import("browser-image-compression");
          const options = {
            maxSizeMB: 0.08,
            maxWidthOrHeight: 900,
            useWebWorker: true,
            initialQuality: 0.72,
          };
          const compressedFile = file.type === "image/gif" ? file : await imageCompression(file, options);
          const mediaId = crypto.randomUUID();
          const stored = user
            ? await storeUserMedia(user.uid, "elements", mediaId, compressedFile)
            : { url: URL.createObjectURL(compressedFile), storagePath: undefined };
          if (!user) toast.info("This image is stored only on this device until you sign in and add it again.");
          const newObj: CanvasObject = {
            id: mediaId,
            type: "image",
            url: stored.url,
            storagePath: stored.storagePath,
            x: logicalSize.width / 2 - 100,
            y: logicalSize.height / 2 - 100,
            scaleX: 1,
            scaleY: 1,
            draggable: true,
          };
          emitUpdate([...objectsRef.current, newObj]);
        } catch (error) {
          console.error("Compression error:", error);
          toast.error("Could not add that image.");
        } finally {
          e.target.value = "";
        }
      }
    },
    [logicalSize, emitUpdate, user],
  );

  const handleDragEnd = useCallback(
    (e: any) => {
      const id = e.target.id();
      const newObjs = objectsRef.current.map((o) => {
        if (o.id === id) {
          return { ...o, x: e.target.x(), y: e.target.y() };
        }
        return o;
      });
      emitUpdate(newObjs);
    },
    [emitUpdate],
  );

  const handleTransformEnd = useCallback(() => {
    const node = stageRef.current.findOne(`#${selectedId}`);
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const newObjs = objectsRef.current.map((o) => {
      if (o.id === selectedId) {
        if (o.type === "text") {
          node.scaleX(1);
          node.scaleY(1);
        }
        return {
          ...o,
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: o.type === "text" ? 1 : scaleX,
          scaleY: o.type === "text" ? 1 : scaleY,
          fontSize:
            o.type === "text" && o.fontSize
              ? o.fontSize * Math.max(scaleX, scaleY)
              : undefined,
        };
      }
      return o;
    });
    emitUpdate(newObjs);
  }, [selectedId, emitUpdate]);

  const deselect = (e: any) => {
    const clickedOnEmpty =
      e.target === e.target.getStage() || e.target.hasName("bg");
    if (clickedOnEmpty) {
      setSelectedId(null);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        validateImageFile(file);
        const { default: imageCompression } =
          await import("browser-image-compression");
        const options = {
          maxSizeMB: 0.08,
          maxWidthOrHeight: 900,
          useWebWorker: true,
          initialQuality: 0.72,
        };
        const compressedFile = file.type === "image/gif" ? file : await imageCompression(file, options);
        const stored = user
          ? await storeUserMedia(user.uid, "backgrounds", roomId, compressedFile)
          : { url: URL.createObjectURL(compressedFile), storagePath: undefined };
        setUploadedImageUrl(stored.url);
        setUploadedImagePath(stored.storagePath || null);
        markDirty();
        toast.success(user ? "Background uploaded and queued for autosave." : "Background added locally. Sign in before adding it to save it in the cloud.");
      } catch (error) {
        console.error("Compression error:", error);
        toast.error("Could not upload that background image.");
      } finally {
        e.target.value = "";
      }
    }
  };

  const handleAIGenerateMeme = async (prompt: string) => {
    if (!prompt) return;
    if (!user) {
      toast.error("Sign in with an active Pro plan to use AI generation.");
      return;
    }
    setGeneratingAI(true);
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      toast.info("Thinking of a meme idea...");
      const chatData = await apiFetch<{
        memeDraft: { backgroundPrompt: string; texts: Array<{ text?: string; x?: number; y?: number }> };
      }>("/api/chat-to-meme", { method: "POST", body: JSON.stringify({ text: prompt }), signal: controller.signal }, { user, timeoutMs: 35_000 });

      toast.info("Generating the background...");
      const background = await apiFetch<{ imageUrl: string; storagePath: string }>(
        "/api/generate-meme",
        { method: "POST", body: JSON.stringify({ text: chatData.memeDraft.backgroundPrompt }), signal: controller.signal },
        { user, timeoutMs: 50_000 },
      );
      setUploadedImageUrl(background.imageUrl);
      setUploadedImagePath(background.storagePath);

      const newObjs: CanvasObject[] = chatData.memeDraft.texts.map((text) => ({
        id: crypto.randomUUID(),
        type: "text" as const,
        x: text.x || 50,
        y: text.y || 50,
        text: text.text?.toUpperCase() || "",
        fontSize: 40,
        fontFamily: "Impact, sans-serif",
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 2,
        draggable: true,
      }));

      emitUpdate(newObjs);
      toast.success("Meme generated!");
    } catch (error) {
      if (controller.signal.aborted) toast.info("AI generation cancelled.");
      else toast.error(error instanceof Error ? error.message : "Could not generate the meme.");
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      setGeneratingAI(false);
    }
  };

  const handleAIGenerateBackground = async (prompt: string) => {
    if (!prompt) return;
    if (!user) {
      toast.error("Sign in with an active Pro plan to use AI generation.");
      return;
    }
    setGeneratingAI(true);
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      const data = await apiFetch<{ imageUrl: string; storagePath: string }>(
        "/api/generate-meme",
        { method: "POST", body: JSON.stringify({ text: prompt }), signal: controller.signal },
        { user, timeoutMs: 50_000 },
      );
      setUploadedImageUrl(data.imageUrl);
      setUploadedImagePath(data.storagePath);
      markDirty();
      toast.success("Background generated and queued for autosave.");
    } catch (error) {
      if (controller.signal.aborted) toast.info("AI generation cancelled.");
      else toast.error(error instanceof Error ? error.message : "Could not generate the image.");
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      setGeneratingAI(false);
    }
  };

  const exportMeme = async (overrideFormat?: string) => {
    // clear selection first
    setSelectedId(null);
    setIsExporting(true);

    // Give react complete cycle to remove selection
    await new Promise((r) => setTimeout(r, 100));

    const finalFormat = overrideFormat || exportFormat;

    if (finalFormat === "image/gif") {
      try {
        const bgUrl = uploadedImageUrl || template?.url;
        if (!bgUrl) throw new Error("No background GIF to export");

        toast.info("Encoding the GIF in the background. You can cancel at any time.");
        const controller = new AbortController();
        exportAbortRef.current = controller;
        setExportProgress(0);

        const bgNode = stageRef.current.findOne(".bg-image-node");
        if (bgNode) bgNode.hide();
        const safeScale = Math.min(exportScale, 2, 1_000 / Math.max(logicalSize.width, logicalSize.height));
        const targetWidth = Math.max(1, Math.round(logicalSize.width * safeScale));
        const targetHeight = Math.max(1, Math.round(logicalSize.height * safeScale));
        const overlayDataUrl = stageRef.current.toDataURL({
          pixelRatio: safeScale / renderScale,
        });
        if (bgNode) bgNode.show();
        const blob = await encodeGifInWorker({
          sourceUrl: bgUrl,
          overlayDataUrl,
          width: targetWidth,
          height: targetHeight,
          signal: controller.signal,
          onProgress: setExportProgress,
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `meme-${roomId}.gif`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("GIF exported!");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") toast.info("GIF export cancelled.");
        else toast.error(`Failed to export GIF: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        exportAbortRef.current = null;
        setExportProgress(0);
        setIsExporting(false);
      }
    } else {
      try {
        const uri = stageRef.current.toDataURL({
          pixelRatio: exportScale / renderScale,
          mimeType: finalFormat,
          quality: finalFormat === "image/jpeg" ? exportQuality : undefined,
        });
        const link = document.createElement("a");
        link.download = `meme-${roomId}.${finalFormat === "image/png" ? "png" : "jpg"}`;
        link.href = uri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not export this meme.");
      } finally {
        setIsExporting(false);
      }
    }
  };

  const exportSelectedImage = () => {
    if (!selectedId) return;
    const node = stageRef.current.findOne(`#${selectedId}`);
    if (!node) return;

    const uri = node.toDataURL({
      mimeType: exportFormat,
      pixelRatio: exportScale,
      quality: exportFormat === "image/jpeg" ? exportQuality : undefined,
    });
    const link = document.createElement("a");
    link.download = `exported-image-${selectedId}.${exportFormat === "image/png" ? "png" : "jpg"}`;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderMemeBlob = async (mimeType: "image/png" | "image/jpeg" = "image/png") => {
    if (!stageRef.current) throw new Error("Canvas is not ready");
    setSelectedId(null);
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 100));

    const maxDimension = Math.max(logicalSize.width, logicalSize.height, 1);
    const pixelRatio = Math.min(1, 900 / maxDimension);
    const uri = stageRef.current.toDataURL({
      pixelRatio: pixelRatio / renderScale,
      mimeType,
      quality: mimeType === "image/jpeg" ? 0.82 : undefined,
    });
    return dataUrlToBlob(uri);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const finishMeme = async () => {
    try {
      const blob = await renderMemeBlob("image/png");
      const file = new File([blob], `meme-${roomId}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "My Memeforge creation", files: [file] });
      } else {
        downloadBlob(blob, file.name);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "Could not finish the meme.");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const submitMemeToDatabase = async () => {
    if (!user) return toast.error("Sign in to publish this meme.");
    if (!db || db.app.options.projectId === "MOCK") return toast.error("Firebase is not configured.");
    setSaving(true);

    const docId = crypto.randomUUID();
    try {
      const blob = await renderMemeBlob("image/jpeg");
      const stored = await storeUserMedia(user.uid, "submissions", docId, blob);
      const ref = doc(db, "submissions", docId);
      const submission: SubmissionDocument = {
        userId: user.uid,
        userName: user.displayName || "Anonymous",
        memeUrl: stored.url,
        storagePath: stored.storagePath,
        createdAt: new Date().toISOString(),
      };
      await setDoc(ref, submission);
      toast.success("Published to the gallery.");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `submissions/${docId}`);
    } finally {
      setSaving(false);
      setIsExporting(false);
    }
  };

  const saveAsTemplateToFirebase = async () => {
    if (!user) return toast.error("Must be signed in to save as template!");
    if (!db || db.app.options.projectId === "MOCK") return toast.error("Firebase is not configured.");
    setSaving(true);
    const newTemplateId = crypto.randomUUID();
    try {
      const blob = await renderMemeBlob("image/jpeg");
      const stored = await storeUserMedia(user.uid, "templates", newTemplateId, blob);
      const ref = doc(db, "templates", newTemplateId);
      const savedTemplate: TemplateDocument = {
        userId: user.uid,
        userName: user.displayName || "Anonymous",
        name: template?.name ? `${template.name} remix` : "Saved meme template",
        url: stored.url,
        storagePath: stored.storagePath,
        width: logicalSize.width,
        height: logicalSize.height,
        box_count: 2,
        createdAt: new Date().toISOString(),
      };
      await setDoc(ref, savedTemplate);
      setHasUnsavedChanges(false);
      toast.success("Saved meme as a reusable template!");
      navigate(`/editor/template_${newTemplateId}`, {
        state: {
          template: {
            id: newTemplateId,
            name: template?.name ? `${template.name} remix` : "Saved meme template",
            url: stored.url,
            storagePath: stored.storagePath,
            width: logicalSize.width,
            height: logicalSize.height,
            box_count: 2,
          },
        },
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `templates/${newTemplateId}`);
    } finally {
      setSaving(false);
      setIsExporting(false);
    }
  };

  const saveToFirebase = async () => {
    await persistMeme(true);
  };

  const deleteSelected = () => {
    if (selectedId) {
      emitUpdate(objects.filter((o) => o.id !== selectedId));
      setSelectedId(null);
    }
  };

  const duplicateSelected = () => {
    if (!selectedId) return;
    const objToCopy = objects.find((o) => o.id === selectedId);
    if (!objToCopy) return;

    const newObj = {
      ...objToCopy,
      id: crypto.randomUUID(),
      x: objToCopy.x + 20,
      y: objToCopy.y + 20,
    };
    
    const newObjs = [...objects, newObj];
    emitUpdate(newObjs);
    setSelectedId(newObj.id);
  };

  const bringToFront = () => {
    if (!selectedId) return;
    const objIndex = objects.findIndex((o) => o.id === selectedId);
    if (objIndex < 0 || objIndex === objects.length - 1) return;
    const newObjs = [...objects];
    const [obj] = newObjs.splice(objIndex, 1);
    newObjs.push(obj);
    emitUpdate(newObjs);
  };

  const sendToBack = () => {
    if (!selectedId) return;
    const objIndex = objects.findIndex((o) => o.id === selectedId);
    if (objIndex <= 0) return;
    const newObjs = [...objects];
    const [obj] = newObjs.splice(objIndex, 1);
    newObjs.unshift(obj);
    emitUpdate(newObjs);
  };

  const bringForward = () => {
    if (!selectedId) return;
    const objIndex = objects.findIndex((o) => o.id === selectedId);
    if (objIndex < 0 || objIndex === objects.length - 1) return;
    const newObjs = [...objects];
    const temp = newObjs[objIndex];
    newObjs[objIndex] = newObjs[objIndex + 1];
    newObjs[objIndex + 1] = temp;
    emitUpdate(newObjs);
  };

  const sendBackward = () => {
    if (!selectedId) return;
    const objIndex = objects.findIndex((o) => o.id === selectedId);
    if (objIndex <= 0) return;
    const newObjs = [...objects];
    const temp = newObjs[objIndex];
    newObjs[objIndex] = newObjs[objIndex - 1];
    newObjs[objIndex - 1] = temp;
    emitUpdate(newObjs);
  };

  // Effect to attach transformer
  useEffect(() => {
    if (selectedId && trRef.current) {
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (node) {
        trRef.current.nodes([node]);
        trRef.current.getLayer().batchDraw();
      }
    }
  }, [selectedId, objects]);

  const onTextDblClick = (e: any) => {
    const textNode = e.target;
    textNode.hide();
    trRef.current.hide();

    const textPosition = textNode.absolutePosition();
    const stageBox = stageRef.current.container().getBoundingClientRect();
    const areaPosition = {
      x: stageBox.left + textPosition.x,
      y: stageBox.top + textPosition.y,
    };

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    textarea.value = textNode.text();
    textarea.style.position = "absolute";
    textarea.style.top = areaPosition.y + "px";
    textarea.style.left = areaPosition.x + "px";
    textarea.style.width = textNode.width() - textNode.padding() * 2 + "px";
    textarea.style.height =
      textNode.height() - textNode.padding() * 2 + 5 + "px";
    textarea.style.fontSize = textNode.fontSize() + "px";
    textarea.style.border = "none";
    textarea.style.padding = "0px";
    textarea.style.margin = "0px";
    textarea.style.overflow = "hidden";
    textarea.style.background = "none";
    textarea.style.outline = "none";
    textarea.style.resize = "none";
    textarea.style.lineHeight = textNode.lineHeight();
    textarea.style.fontFamily = textNode.fontFamily();
    textarea.style.transformOrigin = "left top";
    textarea.style.textAlign = textNode.align();
    textarea.style.color = textNode.fill();
    const rotation = textNode.rotation();
    let transform = "";
    if (rotation) {
      transform += `rotateZ(${rotation}deg)`;
    }
    textarea.style.transform = transform;

    textarea.focus();

    textarea.addEventListener("keydown", function (e) {
      if (e.keyCode === 13 && !e.shiftKey) {
        textNode.text(textarea.value);
        removeTextarea();
      }
      if (e.keyCode === 27) {
        removeTextarea();
      }
    });

    textarea.addEventListener("blur", function () {
      textNode.text(textarea.value);
      removeTextarea();
    });

    const removeTextarea = () => {
      textarea.parentNode?.removeChild(textarea);
      window.removeEventListener("click", handleOutsideClick);
      textNode.show();
      trRef.current.show();
      trRef.current.forceUpdate();

      emitUpdate(
        objects.map((o) =>
          o.id === textNode.id() ? { ...o, text: textNode.text() } : o,
        ),
      );
    };

    const handleOutsideClick = (e: any) => {
      if (e.target !== textarea) {
        textNode.text(textarea.value);
        removeTextarea();
      }
    };

    setTimeout(() => {
      window.addEventListener("click", handleOutsideClick);
    }, 0);
  };

  const fitScale = Math.max(
    0.1,
    Math.min(
      Math.max(10, containerSize.width - 40) / logicalSize.width,
      Math.max(10, containerSize.height - 40) / logicalSize.height,
    ),
  );

  const renderScale = zoomLevel === "fit" ? fitScale : zoomLevel;

  const currentStagePos =
    zoomLevel === "fit"
      ? {
          x: (containerSize.width - logicalSize.width * fitScale) / 2,
          y: (containerSize.height - logicalSize.height * fitScale) / 2,
        }
      : stagePos;

  const handleZoom = useCallback(
    (newZoom: number | "fit", center?: { x: number; y: number }) => {
      if (newZoom === "fit") {
        setZoomLevel("fit");
        return;
      }
      const oldScale = zoomLevel === "fit" ? fitScale : zoomLevel;
      const oldPos =
        zoomLevel === "fit"
          ? {
              x: (containerSize.width - logicalSize.width * fitScale) / 2,
              y: (containerSize.height - logicalSize.height * fitScale) / 2,
            }
          : stagePos;

      const zoomCenter = center || {
        x: containerSize.width / 2,
        y: containerSize.height / 2,
      };

      const pointTo = {
        x: (zoomCenter.x - oldPos.x) / oldScale,
        y: (zoomCenter.y - oldPos.y) / oldScale,
      };

      const newPos = {
        x: zoomCenter.x - pointTo.x * newZoom,
        y: zoomCenter.y - pointTo.y * newZoom,
      };

      setStagePos(newPos);
      setZoomLevel(newZoom);
    },
    [zoomLevel, fitScale, containerSize, logicalSize, stagePos],
  );

  const dragBoundFunc = useCallback(
    (pos: any) => {
      if (!isGridEnabled) return pos;
      const SNAP_SIZE = 20;
      return {
        x: Math.round(pos.x / renderScale / SNAP_SIZE) * SNAP_SIZE * renderScale,
        y: Math.round(pos.y / renderScale / SNAP_SIZE) * SNAP_SIZE * renderScale,
      };
    },
    [isGridEnabled, renderScale]
  );

  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const saveToFirebaseRef = useRef(saveToFirebase);

  useEffect(() => {
    handleUndoRef.current = handleUndo;
    handleRedoRef.current = handleRedo;
    saveToFirebaseRef.current = saveToFirebase;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveToFirebaseRef.current();
      } else if (cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setShowExportModal(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <div className="flex flex-col md:flex-row gap-6 md:h-[calc(100vh-120px)] w-full pb-6">
        {/* Editor Main Canvas */}
        <div
          className="w-full aspect-square md:aspect-auto md:h-full md:flex-[2] bg-zinc-900 border border-white/10 rounded-3xl relative overflow-hidden"
          ref={containerRef}
        >
          {/* Zoom Controls */}
          <div className="absolute top-4 right-4 z-20 flex bg-black/60 rounded-xl backdrop-blur-md overflow-hidden border border-white/10">
            <button
              onClick={() => handleZoom(Math.max(0.1, renderScale - 0.1))}
              className="p-2 text-white hover:bg-white/20 transition-all"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleZoom("fit")}
              className={`px-3 text-xs font-bold transition-all border-l border-r border-white/10 ${
                zoomLevel === "fit" ? "text-indigo-400 bg-white/10" : "text-white hover:bg-white/20"
              }`}
              title="Zoom to Fit"
            >
              {zoomLevel === "fit" ? "FIT" : `${Math.round(renderScale * 100)}%`}
            </button>
            <button
              onClick={() => handleZoom(Math.min(5, renderScale + 0.1))}
              className="p-2 text-white hover:bg-white/20 transition-all"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() =>
              hasUnsavedChanges ? setShowCloseModal(true) : navigate("/")
            }
            className="absolute top-4 left-4 z-20 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-full h-full relative" style={{ touchAction: "none" }}>
            {isBackgroundAnimatedGif && (uploadedImageUrl || template?.url) && (
              <img
                src={uploadedImageUrl || template?.url}
                alt="Background GIF"
                className="absolute pointer-events-none"
                style={{
                  width: logicalSize.width * renderScale,
                  height: logicalSize.height * renderScale,
                  left: currentStagePos.x,
                  top: currentStagePos.y,
                }}
              />
            )}

            <Stage
              width={containerSize.width}
              height={containerSize.height}
              scale={{ x: renderScale, y: renderScale }}
              x={currentStagePos.x}
              y={currentStagePos.y}
              draggable={zoomLevel !== "fit"}
              onDragStart={(e) => {
                if (e.target === e.target.getStage()) {
                  // Stage drag
                }
              }}
              onDragEnd={(e) => {
                if (e.target === e.target.getStage()) {
                  setStagePos({ x: e.target.x(), y: e.target.y() });
                }
              }}
              onWheel={(e) => {
                e.evt.preventDefault();
                const direction = e.evt.deltaY > 0 ? -1 : 1;
                const scaleBy = 1.1;
                let newScale = direction > 0 ? renderScale * scaleBy : renderScale / scaleBy;
                newScale = Math.max(0.1, Math.min(newScale, 5));
                handleZoom(newScale, e.target.getStage()?.getPointerPosition() || undefined);
              }}
              onTouchMove={(e) => {
                const touch1 = e.evt.touches?.[0];
                const touch2 = e.evt.touches?.[1];

                if (touch1 && touch2) {
                  e.evt.preventDefault();
                  const stage = e.target.getStage();
                  if (!stage) return;

                  if (stage.isDragging()) {
                    stage.stopDrag();
                  }

                  const p1 = { x: touch1.clientX, y: touch1.clientY };
                  const p2 = { x: touch2.clientX, y: touch2.clientY };

                  const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

                  if (!lastDistRef.current) {
                    lastDistRef.current = dist;
                  }

                  const scale = renderScale * (dist / lastDistRef.current);
                  const newScale = Math.max(0.1, Math.min(scale, 5));

                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;

                  const center = {
                    x: (p1.x + p2.x) / 2 - rect.left,
                    y: (p1.y + p2.y) / 2 - rect.top,
                  };

                  handleZoom(newScale, center);
                  lastDistRef.current = dist;
                }
              }}
              onTouchEnd={() => {
                lastDistRef.current = 0;
              }}
              onMouseDown={deselect}
              onTouchStart={deselect}
              ref={stageRef}
            >
            <Layer>
              {/* Background */}
              {bgImage || upImage ? (
                <KonvaImage
                  image={bgImage || upImage}
                  name="bg bg-image-node"
                  width={logicalSize.width}
                  height={logicalSize.height}
                  opacity={isBackgroundAnimatedGif ? 0 : 1}
                />
              ) : (
                <Rect
                  width={logicalSize.width}
                  height={logicalSize.height}
                  fill="#ffffff"
                  name="bg bg-image-node"
                  opacity={isBackgroundAnimatedGif ? 0 : 1}
                />
              )}

              {/* Grid Layout (if enabled) */}
              {isGridEnabled && (
                  (() => {
                    const lines = [];
                    const SNAP_SIZE = 20;
                    const strokeColor = isBackgroundAnimatedGif ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.2)";
                    for (let i = 1; i < logicalSize.width / SNAP_SIZE; i++) {
                      lines.push(
                        <Line
                          key={`v-${i}`}
                          points={[
                            Math.round(i * SNAP_SIZE),
                            0,
                            Math.round(i * SNAP_SIZE),
                            logicalSize.height,
                          ]}
                          stroke={strokeColor}
                          strokeWidth={1 / renderScale}
                          dash={[5, 5]}
                          listening={false}
                        />
                      );
                    }
                    for (let j = 1; j < logicalSize.height / SNAP_SIZE; j++) {
                      lines.push(
                        <Line
                          key={`h-${j}`}
                          points={[
                            0,
                            Math.round(j * SNAP_SIZE),
                            logicalSize.width,
                            Math.round(j * SNAP_SIZE),
                          ]}
                          stroke={strokeColor}
                          strokeWidth={1 / renderScale}
                          dash={[5, 5]}
                          listening={false}
                        />
                      );
                    }
                    return lines;
                  })()
              )}

              {/* Draggable Objects */}
              {objects.map((obj) => {
                if (obj.type === "text") {
                  return (
                    <CanvasText
                      key={obj.id}
                      obj={obj}
                      setSelectedId={setSelectedId}
                      handleDragEnd={handleDragEnd}
                      handleTransformEnd={handleTransformEnd}
                      onDblClick={onTextDblClick}
                      dragBoundFunc={dragBoundFunc}
                      isExporting={isExporting}
                    />
                  );
                } else if (obj.type === "image") {
                  return (
                    <CanvasImage
                      key={obj.id}
                      obj={obj}
                      setSelectedId={setSelectedId}
                      handleDragEnd={handleDragEnd}
                      handleTransformEnd={handleTransformEnd}
                      dragBoundFunc={dragBoundFunc}
                    />
                  );
                }
                return null;
              })}

              {/* Transformer Selection */}
              {selectedId && objects.find(o => o.id === selectedId)?.type === "image" && (
                <Transformer
                  ref={trRef}
                  keepRatio={true}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (
                      Math.abs(newBox.width) < 10 ||
                      Math.abs(newBox.height) < 10
                    )
                      return oldBox;
                    return newBox;
                  }}
                  enabledAnchors={[
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                  ]}
                />
              )}

              {/* Watermark */}
              {watermark.enabled && watermark.text && (
                <KonvaText
                  text={watermark.text}
                  x={20}
                  y={
                    watermark.position.includes("bottom")
                      ? logicalSize.height - 40
                      : 20
                  }
                  width={logicalSize.width - 40}
                  align={
                    watermark.position.includes("right") ? "right" : "left"
                  }
                  fontSize={24}
                  fontFamily="Impact, sans-serif"
                  fill="white"
                  stroke="black"
                  strokeWidth={1}
                  opacity={watermark.opacity}
                  listening={false}
                />
              )}
            </Layer>
          </Stage>

          {/* HTML Text Overlay using react-draggable */}
          {!isExporting && (
            <div
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                transform: `translate(${currentStagePos.x}px, ${currentStagePos.y}px) scale(${renderScale})`,
                transformOrigin: "0 0",
              }}
            >
              {objects.map((obj) => {
                if (obj.type === "text") {
                  return (
                    <Draggable
                      key={obj.id}
                      position={{ x: obj.x, y: obj.y }}
                      scale={renderScale}
                      onStart={() => setSelectedId(obj.id)}
                      onStop={(_event, data) => {
                        const newObjs = objectsRef.current.map((o) =>
                          o.id === obj.id ? { ...o, x: data.x, y: data.y } : o
                        );
                        emitUpdate(newObjs);
                      }}
                    >
                      <div
                        className={`absolute pointer-events-auto cursor-move ${
                          selectedId === obj.id ? "ring-2 ring-indigo-500 rounded" : ""
                        }`}
                        style={{
                          fontFamily: obj.fontFamily,
                          fontSize: `${obj.fontSize}px`,
                          color: obj.fill,
                          WebkitTextStroke: obj.stroke
                            ? `${obj.strokeWidth}px ${obj.stroke}`
                            : undefined,
                          lineHeight: 1,
                          whiteSpace: "pre-wrap",
                          transform: `rotate(${obj.rotation || 0}deg)`,
                        }}
                        onDoubleClick={() => setEditingTextId(obj.id)}
                      >
                        {editingTextId === obj.id ? (
                          <textarea
                            autoFocus
                            defaultValue={obj.text}
                            onBlur={(e) => {
                              setEditingTextId(null);
                              const newObjs = objectsRef.current.map((o) =>
                                o.id === obj.id
                                  ? { ...o, text: e.target.value }
                                  : o
                              );
                              emitUpdate(newObjs);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.currentTarget.blur();
                              }
                            }}
                            className="bg-transparent border-none outline-none resize-none overflow-hidden m-0 p-0"
                            style={{
                              fontFamily: "inherit",
                              fontSize: "inherit",
                              color: "inherit",
                              lineHeight: "inherit",
                              width: obj.text ? (obj.text.length * obj.fontSize * 0.6) + 'px' : '200px',
                            }}
                            onInput={(e) => {
                              e.currentTarget.style.width = '0px';
                              e.currentTarget.style.width = (e.currentTarget.scrollWidth + 20) + 'px';
                              e.currentTarget.style.height = '0px';
                              e.currentTarget.style.height = (e.currentTarget.scrollHeight + 10) + 'px';
                            }}
                          />
                        ) : (
                          obj.text
                        )}
                      </div>
                    </Draggable>
                  );
                }
                return null;
              })}
            </div>
          )}
          </div>
        </div>

        {/* Sidebar Tooling */}
        <div className="w-full md:w-80 bg-zinc-900 shadow-2xl border border-white/10 rounded-3xl p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                Toolbar
              </h3>
              {templateId && (
                <div className="flex items-center gap-1.5 bg-zinc-950/50 rounded-full px-2 py-1 border border-white/5">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleVote(templateId, hasUpvoted ? 'clear' : 'up');
                    }}
                    className={`hover:text-indigo-400 transition-colors ${hasUpvoted ? 'text-indigo-500' : 'text-zinc-500'}`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" strokeWidth={hasUpvoted ? 3 : 2} />
                  </button>
                  <span className={`text-[10px] font-bold min-w-[1ch] text-center ${score > 0 ? 'text-indigo-400' : score < 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
                    {score}
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleVote(templateId, hasDownvoted ? 'clear' : 'down');
                    }}
                    className={`hover:text-rose-400 transition-colors ${hasDownvoted ? 'text-rose-500' : 'text-zinc-500'}`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" strokeWidth={hasDownvoted ? 3 : 2} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="mb-4">
                <AIMemeChatInput
                  onGenerateMeme={handleAIGenerateMeme}
                  generatingAI={generatingAI}
                  onCancel={() => aiAbortRef.current?.abort()}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2 bg-zinc-800/50 p-2 rounded-xl border border-white/5">
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase mb-1 pl-1 block">
                    Size W
                  </label>
                  <input
                    type="number"
                    value={logicalSize.width}
                    onChange={(e) => {
                      setLogicalSize((prev) => ({
                        ...prev,
                        width: Number(e.target.value) || 100,
                      }));
                      markDirty();
                    }}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white appearance-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase mb-1 pl-1 block">
                    Size H
                  </label>
                  <input
                    type="number"
                    value={logicalSize.height}
                    onChange={(e) => {
                      setLogicalSize((prev) => ({
                        ...prev,
                        height: Number(e.target.value) || 100,
                      }));
                      markDirty();
                    }}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white appearance-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex gap-2 w-full col-span-2">
                  <button
                    onClick={handleUndo}
                    disabled={historyStep <= 0}
                    className="flex-1 flex items-center justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold transition-all border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Undo"
                  >
                    <Undo className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={historyStep >= history.length - 1 || history.length === 0}
                    className="flex-1 flex items-center justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold transition-all border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Redo"
                  >
                    <Redo className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={addText}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold transition-all border border-white/5"
                >
                  <Type className="w-4 h-4" /> Text
                </button>
                <button
                  onClick={() => setIsGridEnabled(!isGridEnabled)}
                  className={`flex items-center gap-2 justify-center w-full py-3 rounded-xl font-bold transition-all border border-white/5 ${
                    isGridEnabled ? "bg-indigo-600/30 text-indigo-400" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" /> Grid
                </button>
              </div>

              <label className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold cursor-pointer transition-all border border-white/5">
                <ImageIcon className="w-4 h-4" /> Add Image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={addImage}
                />
              </label>

              <label className="flex sm:hidden items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold cursor-pointer transition-all border border-white/5">
                <Camera className="w-4 h-4" /> Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={addImage}
                />
              </label>

              <label className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold cursor-pointer transition-all border border-white/5">
                <ImagePlus className="w-4 h-4" /> Change Background
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>

              <div className="flex flex-col gap-4 pt-2 pb-2">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1 block mb-2">
                    AI Background
                  </label>
                  <AIPromptInput
                    onGenerate={handleAIGenerateBackground}
                    generatingAI={generatingAI}
                    onCancel={() => aiAbortRef.current?.abort()}
                  />
                </div>
              </div>

              <button
                onClick={deleteSelected}
                disabled={!selectedId}
                className="flex items-center gap-2 justify-center w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" /> Delete Selected
              </button>
            </div>
          </div>

          {selectedId && (
            <div className="border-t border-white/5 pt-6">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
                Object Layering
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={bringToFront}
                  className="flex items-center gap-2 justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all border border-white/5"
                >
                  <ArrowUpToLine className="w-3 h-3" /> Front
                </button>
                <button
                  onClick={bringForward}
                  className="flex items-center gap-2 justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all border border-white/5"
                >
                  <ArrowUp className="w-3 h-3" /> Forward
                </button>
                <button
                  onClick={sendBackward}
                  className="flex items-center gap-2 justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all border border-white/5"
                >
                  <ArrowDown className="w-3 h-3" /> Backward
                </button>
                <button
                  onClick={sendToBack}
                  className="flex items-center gap-2 justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all border border-white/5"
                >
                  <ArrowDownToLine className="w-3 h-3" /> Back
                </button>
                <button
                  onClick={duplicateSelected}
                  className="flex items-center gap-2 justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all border border-white/5 col-span-2"
                >
                  <Copy className="w-3 h-3" /> Duplicate
                </button>
              </div>
            </div>
          )}

          {selectedId &&
            objects.find((o) => o.id === selectedId)?.type === "text" && (
              <div className="border-t border-white/5 pt-6">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
                  Text Customization
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                      Font Family
                    </label>
                    <select
                      value={
                        objects.find((o) => o.id === selectedId)?.fontFamily ||
                        "Impact, sans-serif"
                      }
                      onChange={(e) => {
                        const newObjs = objects.map((o) =>
                          o.id === selectedId
                            ? { ...o, fontFamily: e.target.value }
                            : o,
                        );
                        emitUpdate(newObjs);
                      }}
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white appearance-none"
                    >
                      <option value="Impact, sans-serif">Impact</option>
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="'Comic Sans MS', cursive, sans-serif">
                        Comic Sans
                      </option>
                      <option value="'Times New Roman', Times, serif">
                        Times New Roman
                      </option>
                      <option value="'Courier New', Courier, monospace">
                        Courier New
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase flex justify-between mb-2">
                      <span>Font Size</span>
                      <span>
                        {Math.round(
                          objects.find((o) => o.id === selectedId)?.fontSize ||
                            40,
                        )}
                        px
                      </span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="300"
                      value={Math.round(
                        objects.find((o) => o.id === selectedId)?.fontSize ||
                          40,
                      )}
                      onChange={(e) => {
                        const newObjs = objects.map((o) =>
                          o.id === selectedId
                            ? { ...o, fontSize: Number(e.target.value) }
                            : o,
                        );
                        emitUpdate(newObjs, true, true);
                      }}
                      onPointerUp={() => emitUpdate(objects)}
                      className="w-full accent-indigo-500 bg-zinc-950 border border-white/10 rounded-lg appearance-none h-2 cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const presets = ["#ffffff", "#000000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#94a3b8"];
                      return (
                        <>
                          <div>
                            <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                              Fill
                            </label>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 bg-zinc-950 border border-white/10 rounded-lg p-1">
                                <input
                                  type="color"
                                  value={
                                    objects.find((o) => o.id === selectedId)?.fill ||
                                    "#ffffff"
                                  }
                                  onChange={(e) => {
                                    const newObjs = objects.map((o) =>
                                      o.id === selectedId
                                        ? { ...o, fill: e.target.value }
                                        : o,
                                    );
                                    emitUpdate(newObjs, true, true);
                                  }}
                                  onBlur={() => emitUpdate(objects)}
                                  className="w-6 h-6 rounded shrink-0 cursor-pointer p-0 border-0 bg-transparent"
                                />
                                <span className="text-xs text-zinc-400 font-mono uppercase truncate">
                                  {objects.find((o) => o.id === selectedId)?.fill || "#ffffff"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {presets.map((c) => (
                                  <button
                                    key={c}
                                    onClick={() => {
                                      const newObjs = objects.map((o) =>
                                        o.id === selectedId ? { ...o, fill: c } : o
                                      );
                                      emitUpdate(newObjs);
                                    }}
                                    className="w-4 h-4 rounded-full border border-white/20 shadow-sm cursor-pointer hover:scale-125 transition-transform"
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                              Stroke
                            </label>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 bg-zinc-950 border border-white/10 rounded-lg p-1">
                                <input
                                  type="color"
                                  value={
                                    objects.find((o) => o.id === selectedId)?.stroke ||
                                    "#000000"
                                  }
                                  onChange={(e) => {
                                    const newObjs = objects.map((o) =>
                                      o.id === selectedId
                                        ? { ...o, stroke: e.target.value }
                                        : o,
                                    );
                                    emitUpdate(newObjs, true, true);
                                  }}
                                  onBlur={() => emitUpdate(objects)}
                                  className="w-6 h-6 rounded shrink-0 cursor-pointer p-0 border-0 bg-transparent"
                                />
                                <span className="text-xs text-zinc-400 font-mono uppercase truncate">
                                  {objects.find((o) => o.id === selectedId)?.stroke || "#000000"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {presets.map((c) => (
                                  <button
                                    key={c}
                                    onClick={() => {
                                      const newObjs = objects.map((o) =>
                                        o.id === selectedId ? { ...o, stroke: c } : o
                                      );
                                      emitUpdate(newObjs);
                                    }}
                                    className="w-4 h-4 rounded-full border border-white/20 shadow-sm cursor-pointer hover:scale-125 transition-transform"
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                      Stroke Width:{" "}
                      {objects.find((o) => o.id === selectedId)?.strokeWidth ??
                        2}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={
                        objects.find((o) => o.id === selectedId)?.strokeWidth ??
                        2
                      }
                      onChange={(e) => {
                        const newObjs = objects.map((o) =>
                          o.id === selectedId
                            ? { ...o, strokeWidth: parseInt(e.target.value) }
                            : o,
                        );
                        emitUpdate(newObjs, true, true);
                      }}
                      onPointerUp={() => emitUpdate(objects)}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                      Stroke Dash:{" "}
                      {objects.find((o) => o.id === selectedId)?.dash?.[0] ?? 0}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={
                        objects.find((o) => o.id === selectedId)?.dash?.[0] ?? 0
                      }
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        const dash = val === 0 ? undefined : [val, val];
                        const newObjs = objects.map((o) =>
                          o.id === selectedId ? { ...o, dash } : o,
                        );
                        emitUpdate(newObjs, true, true);
                      }}
                      onPointerUp={() => emitUpdate(objects)}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

          {selectedId &&
            objects.find((o) => o.id === selectedId)?.type === "image" && (
              <div className="border-t border-white/5 pt-6">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
                  Image Customization
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                      Filter Effect
                    </label>
                    <select
                      value={
                        objects.find((o) => o.id === selectedId)?.filter ||
                        "none"
                      }
                      onChange={(e) => {
                        const val = e.target.value as any;
                        const newObjs = objects.map((o) =>
                          o.id === selectedId ? { ...o, filter: val } : o,
                        );
                        emitUpdate(newObjs);
                      }}
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white appearance-none"
                    >
                      <option value="none">None</option>
                      <option value="grayscale">Grayscale</option>
                      <option value="sepia">Sepia</option>
                      <option value="invert">Invert</option>
                    </select>
                  </div>
                </div>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-6 mb-4">
                  Image Export Options
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                        Format
                      </label>
                      <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value as any)}
                        className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white appearance-none"
                      >
                        <option value="image/png">PNG</option>
                        <option value="image/jpeg">JPG</option>
                        {isBackgroundAnimatedGif && (
                          <option value="image/gif">GIF (Animated)</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                        Scale
                      </label>
                      <select
                        value={exportScale}
                        onChange={(e) => setExportScale(Number(e.target.value))}
                        className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white appearance-none"
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={exportSelectedImage}
                    className="flex items-center gap-2 justify-center w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg text-xs font-bold transition-all border border-indigo-500/20"
                  >
                    <Download className="w-3 h-3" /> Export Selected Image
                  </button>
                </div>
              </div>
            )}

          <div className="border-t border-white/5 pt-6">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
              Watermark
            </h3>
            <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm font-bold text-white">
              <input
                type="checkbox"
                checked={watermark.enabled}
                onChange={(e) => {
                  setWatermark((p) => ({ ...p, enabled: e.target.checked }));
                  markDirty();
                }}
                className="w-4 h-4 rounded border border-white/20 bg-zinc-950 accent-indigo-500"
              />
              Enable Watermark
            </label>
            {watermark.enabled && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-400 flex justify-between mb-1 pl-1">
                    <span>Watermark Text</span>
                  </label>
                  <input
                    type="text"
                    value={watermark.text}
                    onChange={(e) => {
                      setWatermark((p) => ({ ...p, text: e.target.value }));
                      markDirty();
                    }}
                    className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-400 mb-1 pl-1 block">
                      Position
                    </label>
                    <select
                      value={watermark.position}
                      onChange={(e) => {
                        setWatermark((p) => ({
                          ...p,
                          position: e.target.value as any,
                        }));
                        markDirty();
                      }}
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2 text-sm text-white appearance-none"
                    >
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="top-left">Top Left</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 flex justify-between mb-1 pl-1">
                      <span>Opacity</span>
                      <span>{Math.round(watermark.opacity * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={watermark.opacity}
                      onChange={(e) => {
                        setWatermark((p) => ({
                          ...p,
                          opacity: parseFloat(e.target.value),
                        }));
                        markDirty();
                      }}
                      className="w-full h-2 mt-2 accent-indigo-500 bg-zinc-950 border border-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 border-t border-white/5 pt-6 flex flex-col">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
              Finish & collaborate
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-950 border border-white/5 text-xs">
                <span className="text-zinc-500">Cloud save</span>
                <span className={saveStatus === "failed" ? "text-rose-400" : saveStatus === "saved" ? "text-emerald-400" : "text-zinc-300"}>
                  {saveStatus === "saving" || saving
                    ? "Saving…"
                    : saveStatus === "saved"
                      ? "Saved"
                      : saveStatus === "failed"
                        ? "Save failed"
                        : saveStatus === "offline"
                          ? "Local only"
                          : hasUnsavedChanges
                            ? "Autosave pending"
                            : "Up to date"}
                </span>
              </div>
              {saveStatus === "failed" && (
                <button
                  onClick={() => void saveToFirebase()}
                  disabled={saving}
                  className="flex items-center gap-2 justify-center w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl font-bold border border-rose-500/20"
                >
                  <Save className="w-4 h-4" /> Retry save
                </button>
              )}

              <button
                onClick={() => void finishMeme()}
                disabled={isExporting}
                className="flex items-center gap-2 justify-center w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50"
              >
                {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Share2 className="w-4 h-4" />}
                {isExporting && exportProgress ? `Encoding ${exportProgress}%` : isExporting ? "Preparing…" : "Share or download"}
              </button>
              {isExporting && exportAbortRef.current && (
                <button onClick={() => exportAbortRef.current?.abort()} className="text-xs text-rose-400 hover:text-rose-300 font-bold">
                  Cancel export
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={saveAsTemplateToFirebase}
                  disabled={saving}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-bold transition-all border border-white/5 text-xs"
                >
                  <ImagePlus className="w-4 h-4" />
                  Save template
                </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-bold transition-all border border-white/5 text-xs"
                >
                  <Download className="w-4 h-4" /> Advanced export
                </button>
              </div>

              <button
                onClick={submitMemeToDatabase}
                disabled={saving}
                className="flex items-center gap-2 justify-center w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-xl font-bold border border-white/5 disabled:opacity-50 text-xs"
              >
                <CloudUpload className="w-4 h-4" /> Publish to gallery
              </button>

              <div className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Realtime room</span>
                  <span className={connectionStatus === "connected" ? "text-emerald-400" : connectionStatus === "failed" ? "text-rose-400" : "text-amber-400"}>
                    {connectionStatus} · {activeUsers.length} here
                  </span>
                </div>
                {activeUsers.length > 0 && (
                  <p className="mt-1 text-[10px] text-zinc-600 truncate" title={activeUsers.map((participant) => participant.name).join(", ")}>
                    {activeUsers.map((participant) => participant.name).join(", ")}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Collab link copied!");
                }}
                className="flex items-center gap-2 justify-center w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl font-bold transition-all border border-emerald-500/20 mt-2"
              >
                <Users className="w-4 h-4" /> Copy collaborator link
              </button>
            </div>

            <div className="mt-auto pt-6 pb-2">
              <p className="text-[10px] text-zinc-600 font-mono text-center uppercase tracking-widest hidden md:block">
                Room: {roomId?.substring(0, 8)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <CloseModal
        show={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        onSaveToCloud={saveToFirebase}
        user={user}
      />

      <ExportModal
        show={showExportModal}
        onClose={() => setShowExportModal(false)}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        exportScale={exportScale}
        setExportScale={setExportScale}
        exportQuality={exportQuality}
        setExportQuality={setExportQuality}
        isBackgroundAnimatedGif={isBackgroundAnimatedGif}
        exportMeme={exportMeme}
      />
    </>
  );
}
