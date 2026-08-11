import type { CanvasObject } from "./canvas";

export interface CollaborationUser {
  id: string;
  name: string;
}

export interface CollaborationRoomState {
  objects: CanvasObject[];
  users: CollaborationUser[];
  revision: number;
}

export interface JoinRoomPayload {
  roomId: string;
  user: { id?: string; name?: string };
}

export interface CanvasUpdatePayload {
  roomId: string;
  objects: CanvasObject[];
  baseRevision: number;
  requestId: string;
}

export interface CanvasUpdateAck {
  accepted: boolean;
  revision: number;
  error?: "invalid-payload" | "revision-conflict" | "room-not-joined";
  state?: CollaborationRoomState;
}
