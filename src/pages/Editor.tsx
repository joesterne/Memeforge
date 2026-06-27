import { useEffect, useRef, useState, useCallback, memo } from "react";
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
import { v4 as uuidv4 } from "uuid";
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
  Sparkles,
  X,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  Maximize,
  CloudUpload
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import Draggable from "react-draggable";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import {
  handleFirestoreError,
  OperationType,
} from "../lib/firebaseErrorHandler";
import { toast } from "sonner";
import Konva from "konva";

import type { CanvasObject } from "../types/canvas";
import { CanvasImage, CanvasText, AIPromptInput, AIMemeChatInput } from "../components/editor/CanvasElements";
import { saveRecentCreation } from "../lib/localStorage";

export default function Editor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const template = location.state?.template;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const objectsRef = useRef<CanvasObject[]>([]);
  const [history, setHistory] = useState<CanvasObject[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const historyStepRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [roomId] = useState(() => (id && id !== "new" && !id.startsWith("template_")) ? id : uuidv4());
  const [bgImage] = useImage(template?.url || "", "anonymous");
  const [isRoom, setIsRoom] = useState(!id?.startsWith("template_"));
  const [saving, setSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGridEnabled, setIsGridEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number | "fit">("fit");
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lastDistRef = useRef<number>(0);
  const [isBackgroundAnimatedGif, setIsBackgroundAnimatedGif] = useState(
    template?.is_video || false,
  );
  const [exportFormat, setExportFormat] = useState<
    "image/png" | "image/jpeg" | "image/gif"
  >(template?.is_video ? "image/gif" : "image/png");
  const [exportScale, setExportScale] = useState<number>(1);
  const [exportQuality, setExportQuality] = useState<number>(0.9);
  const [showExportModal, setShowExportModal] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
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

  const pushToHistory = useCallback((newObjects: CanvasObject[]) => {
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyStepRef.current + 1);
      return [...upToCurrent, newObjects];
    });
    setHistoryStep((prev) => {
      const next = prev + 1;
      historyStepRef.current = next;
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
      if (socket) socket.emit("canvas-update", roomId, previousState);
      markDirty();
    }
  }, [history, socket, roomId, markDirty]);

  const handleRedo = useCallback(() => {
    if (historyStepRef.current < history.length - 1) {
      const nextStep = historyStepRef.current + 1;
      const nextState = history[nextStep];
      setObjects(nextState);
      setHistoryStep(nextStep);
      historyStepRef.current = nextStep;
      if (socket) socket.emit("canvas-update", roomId, nextState);
      markDirty();
    }
  }, [history, socket, roomId, markDirty]);

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 600,
  });
  const [logicalSize, setLogicalSize] = useState({ width: 800, height: 800 });
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
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
          }
        })
        .catch((err) => {
          handleFirestoreError(err, OperationType.GET, `memes/${id}`);
        });
    }

    // Replace URL to reflect current room to share
    if (!isRoom || id === "new") {
      window.history.replaceState(null, "", `/editor/${roomId}`);
      setIsRoom(true);
    }
  }, [id, isRoom]);

  useEffect(() => {
    const s = io(window.location.origin);
    setSocket(s);

    if (roomId) {
      s.emit("join-room", roomId, {
        name: user?.displayName || "Anonymous",
        photo: user?.photoURL,
      });
    }

    s.on("room-state", (state: any) => {
      if (state.objects && state.objects.length > 0) {
        setObjects(state.objects);
        setHistory([state.objects]);
        setHistoryStep(0);
        historyStepRef.current = 0;
      }
    });

    s.on("canvas-updated", (newObjects: CanvasObject[]) => {
      setObjects(newObjects);
    });

    s.on("user-joined", (u) => console.log("User joined", u));
    s.on("user-left", (uId) => console.log("User left", uId));

    return () => {
      s.disconnect();
    };
  }, [roomId, user]);

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
    // Only auto-save to cloud if signed in, not mocking, and there are actually unsaved changes
    if (!user || (!db || db.app.options.projectId === "MOCK") || !hasUnsavedChanges) {
      return; 
    }

    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const ref = doc(db, "memes", roomId);
        const snap = await getDoc(ref);
        
        // If it exists and user is not author, don't overwrite
        if (snap.exists() && snap.data().authorId !== user.uid) {
          setSaving(false);
          return;
        }

        await setDoc(
          ref,
          {
            objects,
            templateUrl: template?.url || uploadedImageUrl || null,
            authorId: snap.exists() ? snap.data().authorId : user.uid,
            createdAt: snap.exists()
              ? snap.data().createdAt
              : new Date().toISOString(),
          },
          { merge: true },
        );
        setHasUnsavedChanges(false);
      } catch (err) {
         console.error("Auto-save failed:", err);
      }
      setSaving(false);
    }, 2000); // 2 second delay of inactivity
    
    return () => clearTimeout(timer);
  }, [objects, user, db, roomId, template?.url, uploadedImageUrl, hasUnsavedChanges]);

  const emitUpdate = useCallback(
    (newObjects: CanvasObject[], skipHistory = false, skipSocket = false) => {
      setObjects(newObjects);
      if (!skipHistory) {
        pushToHistory(newObjects);
      }
      markDirty();
      if (socket && !skipSocket) {
        socket.emit("canvas-update", roomId, newObjects);
      }
    },
    [socket, roomId, markDirty, pushToHistory],
  );

  const addText = useCallback(() => {
    const newObj: CanvasObject = {
      id: uuidv4(),
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
          const { default: imageCompression } =
            await import("browser-image-compression");
          const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
            initialQuality: 0.8,
          };
          const compressedFile = await imageCompression(file, options);
          const reader = new FileReader();
          reader.onload = () => {
            const newObj: CanvasObject = {
              id: uuidv4(),
              type: "image",
              url: reader.result as string,
              x: logicalSize.width / 2 - 100,
              y: logicalSize.height / 2 - 100,
              scaleX: 1,
              scaleY: 1,
              draggable: true,
            };
            const newObjs = [...objectsRef.current, newObj];
            emitUpdate(newObjs);
          };
          reader.readAsDataURL(compressedFile);
        } catch (error) {
          console.error("Compression error:", error);
        }
      }
    },
    [logicalSize, emitUpdate],
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
        const { default: imageCompression } =
          await import("browser-image-compression");
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
          initialQuality: 0.8,
        };
        const compressedFile = await imageCompression(file, options);
        const reader = new FileReader();
        reader.onload = () => {
          setUploadedImageUrl(reader.result as string);
        };
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error("Compression error:", error);
      }
    }
  };

  const handleAIGenerateMeme = async (prompt: string) => {
    if (!prompt) return;
    setGeneratingAI(true);
    let newMemeData: any = null;
    let bgUrl: string | null = null;

    try {
      // 1. Get meme layout and background idea via chat-to-meme
      toast.info("Thinking of a meme idea...");
      const chatRes = await fetch("/api/chat-to-meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
      });
      if (!chatRes.ok) {
        const errorData = await chatRes.json().catch(() => null);
        let errMsg = errorData?.error || "Failed to chat-to-meme";
        if (errMsg.includes("dunning decision")) {
          errMsg = "Your Google Cloud billing account is suspended (unpaid balance). Please check your billing settings.";
        }
        throw new Error(errMsg);
      }
      const chatData = await chatRes.json();
      if (!chatData.success || !chatData.memeDraft) {
        let errMsg = chatData.error || "Invalid response from chat-to-meme";
        if (errMsg && typeof errMsg === 'string' && errMsg.includes("dunning decision")) {
          errMsg = "Your Google Cloud billing account is suspended (unpaid balance). Please check your billing settings.";
        }
        throw new Error(errMsg);
      }

      newMemeData = chatData.memeDraft;
      
      // 2. Generate the background image
      toast.info(`Generating image: ${newMemeData.backgroundPrompt}`);
      const bgRes = await fetch("/api/generate-meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newMemeData.backgroundPrompt }),
      });
      if (!bgRes.ok) {
        const errorData = await bgRes.json().catch(() => null);
        let errMsg = errorData?.error || "Failed to generate background";
        if (errMsg.includes("dunning decision")) {
          errMsg = "Your Google Cloud billing account is suspended (unpaid balance). Please check your billing settings.";
        }
        throw new Error(errMsg);
      }
      const bgData = await bgRes.json();
      if (!bgData.success || !bgData.imageUrl) {
        let errMsg = bgData.error || "Failed to generate image";
        if (errMsg && typeof errMsg === 'string' && errMsg.includes("dunning decision")) {
          errMsg = "Your Google Cloud billing account is suspended (unpaid balance). Please check your billing settings.";
        }
        throw new Error(errMsg);
      }

      bgUrl = bgData.imageUrl;
      setUploadedImageUrl(bgUrl);
      
      // Give the image a sec to load to determine logical size, 
      // but we can generate objects array based on 600x600 layout
      const newObjs = newMemeData.texts.map((t: any) => ({
        id: uuidv4(),
        type: "text",
        x: t.x || 50,
        y: t.y || 50,
        text: t.text?.toUpperCase() || "",
        fontSize: 40,
        fontFamily: "Impact, sans-serif",
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 2,
        draggable: true,
      }));

      emitUpdate(newObjs);
      toast.success("Meme generated!");

    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Error generating meme");
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleAIGenerateBackground = async (prompt: string) => {
    if (!prompt) return;
    setGeneratingAI(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("/api/generate-meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error("AI Generator request failed");

      const data = await res.json();
      if (data.success && data.imageUrl) {
        setUploadedImageUrl(data.imageUrl);
      } else {
        toast.error(data.error || "Failed to generate image.");
      }
    } catch (e: any) {
      console.error(e);
      if (e.name === "AbortError") {
        toast.error("AI Generation timed out. Please try again.");
      } else {
        toast.error("Error generating image.");
      }
    } finally {
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

        toast.info(
          "Generating GIF, please wait... (this might take a few seconds)",
        );
        const buffer = await fetch(bgUrl).then((r) => r.arrayBuffer());
        const { decodeFrames, encode } = await import("modern-gif");
        const frames = await decodeFrames(buffer);

        // Hide background image for pure text overlay
        const bgNode = stageRef.current.findOne(".bg-image-node");
        if (bgNode) bgNode.hide();

        const targetWidth = logicalSize.width * exportScale;
        const targetHeight = logicalSize.height * exportScale;

        const overlayDataUrl = stageRef.current.toDataURL({
          pixelRatio: exportScale / renderScale,
        });
        if (bgNode) bgNode.show();

        const overlayImage = await new Promise<HTMLImageElement>(
          (resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = overlayDataUrl;
          },
        );

        const offscreen = document.createElement("canvas");
        offscreen.width = targetWidth;
        offscreen.height = targetHeight;
        const ctx = offscreen.getContext("2d")!;

        const newFrames = [];
        for (const frame of frames) {
          const frameCanvas = document.createElement("canvas");
          frameCanvas.width = frame.width;
          frameCanvas.height = frame.height;
          frameCanvas
            .getContext("2d")!
            .putImageData(
              new ImageData(
                new Uint8ClampedArray(frame.data),
                frame.width,
                frame.height,
              ),
              0,
              0,
            );

          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(frameCanvas, 0, 0, targetWidth, targetHeight);
          ctx.drawImage(overlayImage, 0, 0, targetWidth, targetHeight);

          newFrames.push({
            data: ctx.getImageData(0, 0, targetWidth, targetHeight).data,
            delay: frame.delay,
          });
        }

        const output = await encode({
          width: targetWidth,
          height: targetHeight,
          frames: newFrames,
        });

        const blob = new Blob([output], { type: "image/gif" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `meme-${roomId}.gif`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("GIF exported!");
      } catch (e: any) {
        toast.error("Failed to export GIF: " + e.message);
      } finally {
        setHasUnsavedChanges(false);
        setIsExporting(false);
      }
    } else {
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
      setHasUnsavedChanges(false);
      setIsExporting(false);
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

  const submitMemeToDatabase = async () => {
    if (!user) return toast.error("Must be signed in to submit!");
    if (!db || db.app.options.projectId === "MOCK") return toast.error("Firebase is not configured.");
    
    // clear selection first
    setSelectedId(null);
    setSaving(true);
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 100));

    const finalFormat = exportFormat === "image/gif" ? "image/png" : exportFormat; // fallback since dataurls for GIF are hard

    let uri = "";
    if (exportFormat === "image/gif") {
      uri = stageRef.current.toDataURL({
        pixelRatio: exportScale / renderScale,
        mimeType: "image/png",
      });
    } else {
      uri = stageRef.current.toDataURL({
        pixelRatio: exportScale / renderScale,
        mimeType: finalFormat,
        quality: finalFormat === "image/jpeg" ? exportQuality : undefined,
      });
    }
    
    setIsExporting(false);

    const docId = uuidv4();
    try {
      const ref = doc(db, "submissions", docId);
      await setDoc(ref, {
        userId: user.uid,
        imageUrl: uri,
        createdAt: new Date().toISOString(),
      });
      toast.success("Meme submitted to the database successfully!");
    } catch (e: any) {
      console.error(e);
      handleFirestoreError(e, OperationType.WRITE, `submissions/${docId}`);
    } finally {
      setSaving(false);
    }
  };

  const saveAsTemplateToFirebase = async () => {
    if (!user) return toast.error("Must be signed in to save as template!");
    if (!db || db.app.options.projectId === "MOCK") return toast.error("Firebase is not configured.");
    setSaving(true);
    const newTemplateId = uuidv4();
    try {
      const ref = doc(db, "memes", newTemplateId);
      await setDoc(
        ref,
        {
          objects,
          templateUrl: template?.url || uploadedImageUrl || null,
          authorId: user.uid,
          createdAt: new Date().toISOString(),
          isTemplate: true,
        }
      );
      setHasUnsavedChanges(false);
      toast.success("Saved as new personal template!");
      navigate(`/editor/${newTemplateId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `memes/${newTemplateId}`);
    }
    setSaving(false);
  };

  const saveToFirebase = async () => {
    if (!user) return toast.error("Must be signed in to save!");
    if (!db || db.app.options.projectId === "MOCK") return toast.error("Firebase is not configured.");
    setSaving(true);
    try {
      const ref = doc(db, "memes", roomId!);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().authorId !== user.uid) {
        toast.error("You are not the author of this meme!");
        setSaving(false);
        return;
      }
      await setDoc(
        ref,
        {
          objects,
          templateUrl: template?.url || uploadedImageUrl || null,
          authorId: snap.exists() ? snap.data().authorId : user.uid,
          createdAt: snap.exists()
            ? snap.data().createdAt
            : new Date().toISOString(),
        },
        { merge: true },
      );
      setHasUnsavedChanges(false);
      toast.success("Saved successfully!");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `memes/${roomId}`);
    }
    setSaving(false);
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
      id: uuidv4(),
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

  const exportMemeRef = useRef(exportMeme);
  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);

  useEffect(() => {
    exportMemeRef.current = exportMeme;
    handleUndoRef.current = handleUndo;
    handleRedoRef.current = handleRedo;
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
                      onStop={(e, data) => {
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
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
              Toolbar
            </h3>

            <div className="flex flex-col gap-3">
              <div className="mb-4">
                <AIMemeChatInput
                  onGenerateMeme={handleAIGenerateMeme}
                  generatingAI={generatingAI}
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
                    disabled={historyStepRef.current <= 0}
                    className="flex-1 flex items-center justify-center py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold transition-all border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Undo"
                  >
                    <Undo className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={historyStepRef.current >= history.length - 1 || history.length === 0}
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
              Export & Sync
            </h3>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={saveToFirebase}
                  disabled={saving || !hasUnsavedChanges}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] text-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />{" "}
                  {saving ? "Saving..." : "Save Now"}
                </button>
                <button
                  onClick={saveAsTemplateToFirebase}
                  disabled={saving}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-bold transition-all border border-white/5 text-xs"
                >
                  <ImagePlus className="w-4 h-4" />
                  Template
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => exportMeme("image/png")}
                  disabled={isExporting}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50"
                >
                  {isExporting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isExporting ? "Processing..." : "Download PNG"}
                </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-100 hover:bg-white text-zinc-900 rounded-xl font-bold transition-all shadow-lg"
                >
                  <Download className="w-4 h-4" /> Export Configuration
                </button>
                <button
                  onClick={submitMemeToDatabase}
                  disabled={saving}
                  className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-bold transition-all border border-white/5 disabled:opacity-50"
                >
                  <CloudUpload className="w-4 h-4" /> Submit to Database
                </button>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Collab link copied!");
                }}
                className="flex items-center gap-2 justify-center w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl font-bold transition-all border border-emerald-500/20 mt-2"
              >
                <Users className="w-4 h-4" /> Invite Collaborator
              </button>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => {
                    const url = encodeURIComponent(window.location.href);
                    const text = encodeURIComponent(
                      "Help me make this epic meme on MemeForge!",
                    );
                    window.open(
                      `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
                      "_blank",
                    );
                  }}
                  className="flex items-center justify-center gap-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-xl py-2 text-xs font-bold transition-all border border-sky-500/20"
                >
                  Twitter
                </button>
                <button
                  onClick={() => {
                    const url = encodeURIComponent(window.location.href);
                    window.open(
                      `https://www.facebook.com/sharer/sharer.php?u=${url}`,
                      "_blank",
                    );
                  }}
                  className="flex items-center justify-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-xl py-2 text-xs font-bold transition-all border border-blue-600/20"
                >
                  Facebook
                </button>
              </div>
            </div>

            <div className="mt-auto pt-6 pb-2">
              <p className="text-[10px] text-zinc-600 font-mono text-center uppercase tracking-widest hidden md:block">
                Room: {roomId?.substring(0, 8)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">
              Unsaved Changes
            </h2>
            <p className="text-sm text-zinc-400 mb-6">
              You have unsaved changes. Do you want to save to cloud before leaving?
            </p>

            <div className="flex flex-col gap-3">
              {user && (
                <button
                  onClick={async () => {
                    await saveToFirebase();
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
                onClick={() => setShowCloseModal(false)}
                className="w-full py-2 bg-transparent hover:bg-white/5 text-zinc-400 rounded-xl font-bold transition-all text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
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

              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={async () => {
                    setShowExportModal(false);
                    await exportMeme();
                  }}
                  className="flex font-bold items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                >
                  <Download className="w-4 h-4" /> Download Meme
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="w-full py-3 bg-transparent hover:bg-white/5 text-zinc-400 rounded-xl font-bold transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
