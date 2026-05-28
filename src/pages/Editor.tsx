import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useParams, useLocation, useNavigate } from "react-router";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text as KonvaText,
  Transformer,
  Rect,
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
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  ImageIcon,
  Camera,
  Sparkles,
  X,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import {
  handleFirestoreError,
  OperationType,
} from "../lib/firebaseErrorHandler";
import { toast } from "sonner";
import Konva from "konva";

interface CanvasObject {
  id: string;
  type: "text" | "image";
  x: number;
  y: number;
  text?: string;
  url?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  draggable: boolean;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  dash?: number[];
  filter?: "none" | "grayscale" | "sepia" | "invert";
}

const CanvasImage = memo(
  ({ obj, setSelectedId, handleDragEnd, handleTransformEnd }: any) => {
    const [img] = useImage(obj.url);
    const imageRef = useRef<any>(null);
    const handleSelect = useCallback(
      () => setSelectedId(obj.id),
      [setSelectedId, obj.id],
    );

    useEffect(() => {
      if (img && imageRef.current) {
        imageRef.current.cache();
      }
    }, [img, obj.filter, obj.scaleX, obj.scaleY, obj.rotation]);

    let filters = [];
    if (obj.filter === "grayscale") filters.push(Konva.Filters.Grayscale);
    if (obj.filter === "sepia") filters.push(Konva.Filters.Sepia);
    if (obj.filter === "invert") filters.push(Konva.Filters.Invert);

    return (
      <KonvaImage
        ref={imageRef}
        id={obj.id}
        image={img}
        x={obj.x}
        y={obj.y}
        scaleX={obj.scaleX || 1}
        scaleY={obj.scaleY || 1}
        rotation={obj.rotation || 0}
        draggable={obj.draggable}
        filters={filters}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
    );
  },
);
CanvasImage.displayName = "CanvasImage";

const CanvasText = memo(
  ({
    obj,
    setSelectedId,
    handleDragEnd,
    handleTransformEnd,
    onDblClick,
  }: any) => {
    const handleSelect = useCallback(
      () => setSelectedId(obj.id),
      [setSelectedId, obj.id],
    );

    return (
      <KonvaText
        id={obj.id}
        text={obj.text}
        x={obj.x}
        y={obj.y}
        fontSize={obj.fontSize}
        fontFamily={obj.fontFamily}
        fill={obj.fill}
        stroke={obj.stroke || "black"}
        strokeWidth={obj.strokeWidth ?? 2}
        dash={obj.dash}
        draggable={obj.draggable}
        rotation={obj.rotation || 0}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
      />
    );
  },
);
CanvasText.displayName = "CanvasText";

const AIPromptInput = memo(
  ({
    onGenerate,
    generatingAI,
  }: {
    onGenerate: (prompt: string) => void;
    generatingAI: boolean;
  }) => {
    const [aiPrompt, setAiPrompt] = useState("");
    return (
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Generate AI relative to..."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onGenerate(aiPrompt)}
          className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-white appearance-none"
        />
        <button
          onClick={() => onGenerate(aiPrompt)}
          disabled={generatingAI || !aiPrompt}
          className="flex items-center justify-center px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all disabled:opacity-50"
        >
          {generatingAI ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
        </button>
      </div>
    );
  },
);
AIPromptInput.displayName = "AIPromptInput";

export default function Editor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const template = location.state?.template;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [bgImage] = useImage(template?.url || "");
  const [isRoom, setIsRoom] = useState(!id?.startsWith("template_"));
  const [saving, setSaving] = useState(false);
  const [isBackgroundAnimatedGif, setIsBackgroundAnimatedGif] = useState(
    template?.is_video || false,
  );
  const [exportFormat, setExportFormat] = useState<
    "image/png" | "image/jpeg" | "image/gif"
  >(template?.is_video ? "image/gif" : "image/png");
  const [exportScale, setExportScale] = useState<number>(1);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [watermark, setWatermark] = useState({
    enabled: false,
    text: "Watermark",
    opacity: 0.5,
    position: "bottom-right",
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const markDirty = useCallback(() => setHasUnsavedChanges(true), []);

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 600,
  });
  const [logicalSize, setLogicalSize] = useState({ width: 800, height: 800 });
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [upImage] = useImage(uploadedImageUrl || "");

  useEffect(() => {
    if (bgImage) {
      setLogicalSize({ width: bgImage.width, height: bgImage.height });
    } else if (upImage) {
      setLogicalSize({ width: upImage.width, height: upImage.height });
    }
    const currentUrl = uploadedImageUrl || template?.url;
    setIsBackgroundAnimatedGif(
      template?.is_video || currentUrl?.toLowerCase()?.includes(".gif"),
    );
  }, [bgImage, upImage, uploadedImageUrl, template]);

  // Derive initial ID or Room ID
  const roomId = isRoom ? id : uuidv4();

  useEffect(() => {
    // If it's an existing room (not template_), fetch from Firestore
    if (!db || db.app.options.projectId === "MOCK") return;
    if (isRoom && id && id !== "new") {
      getDoc(doc(db, "memes", id))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.objects) setObjects(data.objects);
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
    const observer = new ResizeObserver((entries) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (entries[0] && entries[0].contentRect) {
          setContainerSize({
            width: entries[0].contentRect.width,
            height: entries[0].contentRect.height,
          });
        }
      }, 100);
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, []);

  const emitUpdate = useCallback(
    (newObjects: CanvasObject[]) => {
      setObjects(newObjects);
      markDirty();
      if (socket) {
        socket.emit("canvas-update", roomId, newObjects);
      }
    },
    [socket, roomId, markDirty],
  );

  const addText = useCallback(() => {
    setObjects((prev) => {
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
      const newObjs = [...prev, newObj];
      if (socket) socket.emit("canvas-update", roomId, newObjs);
      markDirty();
      return newObjs;
    });
  }, [logicalSize, socket, roomId, markDirty]);

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
            setObjects((prev) => {
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
              const newObjs = [...prev, newObj];
              if (socket) socket.emit("canvas-update", roomId, newObjs);
              markDirty();
              return newObjs;
            });
          };
          reader.readAsDataURL(compressedFile);
        } catch (error) {
          console.error("Compression error:", error);
        }
      }
    },
    [logicalSize, socket, roomId, markDirty],
  );

  const handleDragEnd = useCallback(
    (e: any) => {
      const id = e.target.id();
      setObjects((prev) => {
        const newObjs = prev.map((o) => {
          if (o.id === id) {
            return { ...o, x: e.target.x(), y: e.target.y() };
          }
          return o;
        });
        if (socket) socket.emit("canvas-update", roomId, newObjs);
        markDirty();
        return newObjs;
      });
    },
    [socket, roomId, markDirty],
  );

  const handleTransformEnd = useCallback(() => {
    const node = stageRef.current.findOne(`#${selectedId}`);
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    setObjects((prev) => {
      const newObjs = prev.map((o) => {
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
      if (socket) socket.emit("canvas-update", roomId, newObjs);
      markDirty();
      return newObjs;
    });
  }, [selectedId, socket, roomId, markDirty]);

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

  const exportMeme = async () => {
    // clear selection first
    setSelectedId(null);
    setSaving(true);

    // Give react complete cycle to remove selection
    await new Promise((r) => setTimeout(r, 100));

    if (exportFormat === "image/gif") {
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
        setSaving(false);
      }
    } else {
      const uri = stageRef.current.toDataURL({
        pixelRatio: exportScale / renderScale,
        mimeType: exportFormat,
        quality: exportFormat === "image/jpeg" ? 0.9 : undefined,
      });
      const link = document.createElement("a");
      link.download = `meme-${roomId}.${exportFormat === "image/png" ? "png" : "jpg"}`;
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setHasUnsavedChanges(false);
      setSaving(false);
    }
  };

  const exportSelectedImage = () => {
    if (!selectedId) return;
    const node = stageRef.current.findOne(`#${selectedId}`);
    if (!node) return;

    const uri = node.toDataURL({
      mimeType: exportFormat,
      pixelRatio: exportScale,
      quality: exportFormat === "image/jpeg" ? 0.9 : undefined,
    });
    const link = document.createElement("a");
    link.download = `exported-image-${selectedId}.${exportFormat === "image/png" ? "png" : "jpg"}`;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const renderScale =
    Math.max(
      0.1,
      Math.min(
        Math.max(10, containerSize.width - 40) / logicalSize.width,
        Math.max(10, containerSize.height - 40) / logicalSize.height,
      )
    );

  return (
    <>
      <div className="flex flex-col md:flex-row gap-6 md:h-[calc(100vh-120px)] w-full pb-6">
        {/* Editor Main Canvas */}
        <div
          className="w-full h-[50vh] md:flex-1 md:h-auto md:min-h-0 bg-zinc-900 border border-white/10 rounded-3xl relative overflow-hidden shadow-2xl flex flex-col justify-center items-center"
          ref={containerRef}
        >
          {isBackgroundAnimatedGif && (uploadedImageUrl || template?.url) && (
            <img
              src={uploadedImageUrl || template?.url}
              alt="Background GIF"
              className="absolute object-contain pointer-events-none"
              style={{
                width: logicalSize.width * renderScale,
                height: logicalSize.height * renderScale,
              }}
            />
          )}
          <button
            onClick={() =>
              hasUnsavedChanges ? setShowCloseModal(true) : navigate("/")
            }
            className="absolute top-4 left-4 z-10 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <Stage
            width={logicalSize.width * renderScale}
            height={logicalSize.height * renderScale}
            scale={{ x: renderScale, y: renderScale }}
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
                    />
                  );
                }
                return null;
              })}

              {/* Transformer Selection */}
              {selectedId && (
                <Transformer
                  ref={trRef}
                  keepRatio={
                    objects.find((o) => o.id === selectedId)?.type === "image"
                  }
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
        </div>

        {/* Sidebar Tooling */}
        <div className="w-full md:w-80 bg-zinc-900 shadow-2xl border border-white/10 rounded-3xl p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
              Toolbar
            </h3>

            <div className="flex flex-col gap-3">
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

              <button
                onClick={addText}
                className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold transition-all border border-white/5"
              >
                <Type className="w-4 h-4" /> Add Text
              </button>

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

              <div className="flex flex-col gap-2 pt-2 pb-2">
                <AIPromptInput
                  onGenerate={handleAIGenerateBackground}
                  generatingAI={generatingAI}
                />
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
                        emitUpdate(newObjs);
                      }}
                      className="w-full accent-indigo-500 bg-zinc-950 border border-white/10 rounded-lg appearance-none h-2 cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                        Fill
                      </label>
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
                          emitUpdate(newObjs);
                        }}
                        className="w-full h-8 bg-zinc-950 border border-white/10 rounded-lg cursor-pointer p-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase mb-2 block">
                        Stroke
                      </label>
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
                          emitUpdate(newObjs);
                        }}
                        className="w-full h-8 bg-zinc-950 border border-white/10 rounded-lg cursor-pointer p-0.5"
                      />
                    </div>
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
                        emitUpdate(newObjs);
                      }}
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
                        emitUpdate(newObjs);
                      }}
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
              <button
                onClick={saveToFirebase}
                disabled={saving}
                className="flex items-center gap-2 justify-center w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]"
              >
                <Save className="w-4 h-4" />{" "}
                {saving ? "Saving..." : "Save to History"}
              </button>

              <button
                onClick={exportMeme}
                className="flex items-center gap-2 justify-center w-full py-3 bg-zinc-100 hover:bg-white text-zinc-900 rounded-xl font-bold transition-all shadow-lg"
              >
                <Download className="w-4 h-4" /> Export Image
              </button>

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
              You have unsaved changes. Do you want to export or save to cloud
              before leaving?
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as any)}
                  className="flex-1 bg-zinc-950 border border-white/10 rounded-xl p-2 text-sm text-white appearance-none"
                >
                  <option value="image/png">PNG</option>
                  <option value="image/jpeg">JPEG</option>
                  {isBackgroundAnimatedGif && (
                    <option value="image/gif">GIF (Animated)</option>
                  )}
                </select>
                <button
                  onClick={async () => {
                    await exportMeme();
                    navigate("/");
                  }}
                  className="flex-[2] py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all text-sm"
                >
                  Export
                </button>
              </div>

              {user && (
                <button
                  onClick={async () => {
                    await saveToFirebase();
                    navigate("/");
                  }}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all text-sm border border-white/5"
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
    </>
  );
}
