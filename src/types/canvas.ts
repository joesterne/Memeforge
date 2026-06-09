export interface CanvasObject {
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
  scaleX?: number;
  scaleY?: number;
  draggable?: boolean;
  rotation?: number;
  dash?: number[];
  filter?: "none" | "grayscale" | "sepia" | "invert";
}
