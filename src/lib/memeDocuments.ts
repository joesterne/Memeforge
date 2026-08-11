import type { CanvasObject } from "../types/canvas";
import type { MemeDocument } from "../types/documents";

export function resolveBackground(
  uploadedUrl: string | null | undefined,
  uploadedPath: string | null | undefined,
  templateUrl: string | null | undefined,
  templatePath: string | null | undefined,
): { url?: string; path?: string } {
  if (uploadedUrl) return { url: uploadedUrl, ...(uploadedPath ? { path: uploadedPath } : {}) };
  if (templateUrl) return { url: templateUrl, ...(templatePath ? { path: templatePath } : {}) };
  return {};
}

export function buildMemeDocument(input: {
  authorId: string;
  createdAt: string;
  objects: CanvasObject[];
  uploadedUrl?: string | null;
  uploadedPath?: string | null;
  templateUrl?: string | null;
  templatePath?: string | null;
}): MemeDocument {
  const background = resolveBackground(
    input.uploadedUrl,
    input.uploadedPath,
    input.templateUrl,
    input.templatePath,
  );
  return {
    authorId: input.authorId,
    createdAt: input.createdAt,
    objects: input.objects,
    ...(background.url ? { templateUrl: background.url } : {}),
    ...(background.path ? { templatePath: background.path } : {}),
  };
}
