import { memo, useRef, useCallback, useEffect, useState } from "react";
import { Image as KonvaImage, Text as KonvaText } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import { Sparkles } from "lucide-react";
import type { CanvasObject } from "../../types/canvas";

export const CanvasImage = memo(
  ({ obj, setSelectedId, handleDragEnd, handleTransformEnd, dragBoundFunc }: any) => {
    const [img] = useImage(obj.url, "anonymous");
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
        dragBoundFunc={dragBoundFunc}
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

export const CanvasText = memo(
  ({
    obj,
    setSelectedId,
    handleDragEnd,
    handleTransformEnd,
    onDblClick,
    dragBoundFunc,
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
        dragBoundFunc={dragBoundFunc}
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

export const AIPromptInput = memo(
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
