import type { CanvasObject } from "./canvas";

export interface MemeDocument {
  authorId: string;
  createdAt: string;
  objects: CanvasObject[];
  templateUrl?: string;
  templatePath?: string;
}

export interface TemplateDocument {
  userId: string;
  userName: string;
  name: string;
  url: string;
  storagePath?: string;
  width: number;
  height: number;
  box_count: number;
  createdAt: string;
}

export interface SubmissionDocument {
  userId: string;
  userName: string;
  memeUrl: string;
  storagePath: string;
  createdAt: string;
}
