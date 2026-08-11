import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { FieldValue } from "firebase-admin/firestore";
import { createClient } from "redis";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type {
  CanvasUpdateAck,
  CanvasUpdatePayload,
  CollaborationRoomState,
  CollaborationUser,
  JoinRoomPayload,
} from "../src/types/collaboration";
import type { CanvasObject } from "../src/types/canvas";
import { getAdminServices } from "./firebaseAdmin";
import { isSafeId } from "./http";
import { isAllowedOrigin } from "./origins";
import { logEvent } from "./telemetry";

const MAX_ROOMS = Math.max(1, Number(process.env.MAX_COLLABORATION_ROOMS || 500));
const MAX_USERS_PER_ROOM = Math.max(2, Number(process.env.MAX_COLLABORATORS_PER_ROOM || 25));
const MAX_OBJECTS = Math.max(1, Number(process.env.MAX_CANVAS_OBJECTS || 250));
const MAX_PAYLOAD_BYTES = Math.max(16_384, Number(process.env.MAX_CANVAS_PAYLOAD_BYTES || 262_144));
const PRESENCE_TTL_SECONDS = 60;
const PRESENCE_REFRESH_MS = 20_000;
const REDIS_CHANNEL = "memeforge:collaboration:events";

interface CanvasState {
  objects: CanvasObject[];
  revision: number;
}

interface StateStore {
  get(roomId: string): Promise<CanvasState>;
  update(roomId: string, baseRevision: number, objects: CanvasObject[]): Promise<{ accepted: boolean; state: CanvasState }>;
  release(roomId: string): Promise<void>;
  close(): Promise<void>;
}

interface CollaborationSocket extends WebSocket {
  connectionId: string;
  roomId?: string;
  user?: CollaborationUser;
  messageCount: number;
  messageWindowStartedAt: number;
}

interface ClientMessage {
  type?: unknown;
  payload?: unknown;
}

interface DistributedEvent {
  instanceId: string;
  roomId: string;
  type: "canvas-updated" | "presence-updated";
  payload: unknown;
}

class LocalStateStore implements StateStore {
  private readonly rooms = new Map<string, CanvasState>();

  async get(roomId: string): Promise<CanvasState> {
    const current = this.rooms.get(roomId);
    if (current) return current;
    if (this.rooms.size >= MAX_ROOMS) throw new Error("room-capacity");
    const restored = await restoreSnapshot(roomId);
    this.rooms.set(roomId, restored);
    return restored;
  }

  async update(roomId: string, baseRevision: number, objects: CanvasObject[]) {
    const current = await this.get(roomId);
    if (current.revision !== baseRevision) return { accepted: false, state: current };
    const state = { objects, revision: current.revision + 1 };
    this.rooms.set(roomId, state);
    return { accepted: true, state };
  }

  async release(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  async close(): Promise<void> {
    this.rooms.clear();
  }
}

class RedisStateStore implements StateStore {
  constructor(private readonly client: ReturnType<typeof createClient>) {}

  private key(roomId: string): string {
    return `memeforge:room:${roomId}`;
  }

  async get(roomId: string): Promise<CanvasState> {
    const raw = await this.client.get(this.key(roomId));
    if (raw) return JSON.parse(String(raw)) as CanvasState;
    const restored = await restoreSnapshot(roomId);
    await this.client.set(this.key(roomId), JSON.stringify(restored), { EX: 86_400, NX: true });
    const current = await this.client.get(this.key(roomId));
    return current ? JSON.parse(String(current)) as CanvasState : restored;
  }

  async update(roomId: string, baseRevision: number, objects: CanvasObject[]) {
    const script = `
      local raw = redis.call('GET', KEYS[1])
      local current = { revision = 0, objects = {} }
      if raw then current = cjson.decode(raw) end
      if current.revision ~= tonumber(ARGV[1]) then
        return cjson.encode({ accepted = false, state = current })
      end
      local nextState = { revision = current.revision + 1, objects = cjson.decode(ARGV[2]) }
      redis.call('SET', KEYS[1], cjson.encode(nextState), 'EX', 86400)
      return cjson.encode({ accepted = true, state = nextState })
    `;
    const result = await this.client.eval(script, {
      keys: [this.key(roomId)],
      arguments: [String(baseRevision), JSON.stringify(objects)],
    });
    return JSON.parse(String(result)) as { accepted: boolean; state: CanvasState };
  }

  async release(_roomId: string): Promise<void> {
    // Redis state expires after 24 hours so reconnects and other instances can recover it.
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

async function restoreSnapshot(roomId: string): Promise<CanvasState> {
  try {
    const snapshot = await getAdminServices().db.doc(`collaborationRooms/${roomId}`).get();
    const data = snapshot.data();
    return {
      objects: Array.isArray(data?.objects) ? data.objects.slice(0, MAX_OBJECTS) as CanvasObject[] : [],
      revision: Number.isSafeInteger(data?.revision) ? Number(data?.revision) : 0,
    };
  } catch (error) {
    logEvent("warn", "collaboration_restore_failed", { roomId, error: error instanceof Error ? error.message : String(error) });
    return { objects: [], revision: 0 };
  }
}

function safeUser(socket: CollaborationSocket, input: JoinRoomPayload["user"]): CollaborationUser {
  return {
    id: typeof input?.id === "string" ? input.id.slice(0, 80) : socket.connectionId,
    name: typeof input?.name === "string" && input.name.trim() ? input.name.trim().slice(0, 80) : "Guest",
  };
}

function send(socket: WebSocket, type: string, payload: unknown, requestId?: string): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_PAYLOAD_BYTES * 2) {
    socket.terminate();
    return;
  }
  socket.send(JSON.stringify({ type, payload, ...(requestId ? { requestId } : {}) }));
}

function parseMessage(data: RawData): ClientMessage | null {
  try {
    const parsed = JSON.parse(data.toString()) as ClientMessage;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function validateCanvasUpdate(payload: CanvasUpdatePayload): boolean {
  if (!payload || !isSafeId(payload.roomId, 64) || !isSafeId(payload.requestId, 80)) return false;
  if (!Number.isSafeInteger(payload.baseRevision) || payload.baseRevision < 0) return false;
  if (!Array.isArray(payload.objects) || payload.objects.length > MAX_OBJECTS) return false;
  if (!payload.objects.every((object) => {
    if (!object || typeof object !== "object" || !isSafeId(object.id, 100)) return false;
    if (object.type === "text") return typeof object.text === "string" && object.text.length <= 2_000;
    if (object.type === "image") {
      return typeof object.url === "string" && object.url.length <= 2_000 && /^https:\/\//.test(object.url);
    }
    return false;
  })) return false;
  return Buffer.byteLength(JSON.stringify(payload.objects), "utf8") <= MAX_PAYLOAD_BYTES;
}

export async function registerCollaboration(httpServer: HttpServer, origins: Set<string>): Promise<() => Promise<void>> {
  const mode = process.env.COLLABORATION_MODE || "single";
  const instanceId = randomUUID();
  const rooms = new Map<string, Set<CollaborationSocket>>();
  let store: StateStore;
  let redisClient: ReturnType<typeof createClient> | undefined;
  let pubClient: ReturnType<typeof createClient> | undefined;
  let subClient: ReturnType<typeof createClient> | undefined;

  if (mode === "redis") {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error("REDIS_URL is required when COLLABORATION_MODE=redis");
    redisClient = createClient({ url: redisUrl });
    pubClient = redisClient.duplicate();
    subClient = redisClient.duplicate();
    await Promise.all([redisClient.connect(), pubClient.connect(), subClient.connect()]);
    store = new RedisStateStore(redisClient);
  } else if (mode === "single") {
    if (process.env.NODE_ENV === "production" && Number(process.env.INSTANCE_COUNT || 1) > 1) {
      throw new Error("COLLABORATION_MODE=single requires INSTANCE_COUNT=1");
    }
    store = new LocalStateStore();
  } else {
    throw new Error("COLLABORATION_MODE must be 'single' or 'redis'");
  }

  const localRoomUsers = (roomId: string): CollaborationUser[] =>
    [...(rooms.get(roomId) || [])].flatMap((socket) => socket.user ? [socket.user] : []);

  const presenceKey = (roomId: string) => `memeforge:presence:${roomId}`;
  const presenceDetailKey = (connectionId: string) => `memeforge:presence-user:${connectionId}`;

  const refreshPresence = async (socket: CollaborationSocket): Promise<void> => {
    if (!redisClient || !socket.roomId || !socket.user) return;
    const expiresAt = Date.now() + PRESENCE_TTL_SECONDS * 1_000;
    await Promise.all([
      redisClient.zAdd(presenceKey(socket.roomId), { score: expiresAt, value: socket.connectionId }),
      redisClient.set(presenceDetailKey(socket.connectionId), JSON.stringify(socket.user), { EX: PRESENCE_TTL_SECONDS }),
      redisClient.expire(presenceKey(socket.roomId), 86_400),
    ]);
  };

  const roomUsers = async (roomId: string): Promise<CollaborationUser[]> => {
    if (!redisClient) return localRoomUsers(roomId);
    const key = presenceKey(roomId);
    await redisClient.zRemRangeByScore(key, 0, Date.now());
    const ids = await redisClient.zRange(key, 0, -1);
    if (ids.length === 0) return [];
    const rawUsers = await redisClient.mGet(ids.map(presenceDetailKey));
    return rawUsers.flatMap((raw) => {
      if (!raw) return [];
      try {
        return [JSON.parse(String(raw)) as CollaborationUser];
      } catch {
        return [];
      }
    });
  };

  const broadcastLocal = (roomId: string, type: string, payload: unknown, except?: CollaborationSocket) => {
    for (const client of rooms.get(roomId) || []) {
      if (client !== except) send(client, type, payload);
    }
  };

  const broadcast = async (roomId: string, type: DistributedEvent["type"], payload: unknown, except?: CollaborationSocket) => {
    broadcastLocal(roomId, type, payload, except);
    if (pubClient) {
      await pubClient.publish(REDIS_CHANNEL, JSON.stringify({ instanceId, roomId, type, payload } satisfies DistributedEvent));
    }
  };

  if (subClient) {
    await subClient.subscribe(REDIS_CHANNEL, (raw) => {
      try {
        const event = JSON.parse(String(raw)) as DistributedEvent;
        if (event.instanceId !== instanceId && isSafeId(event.roomId, 64)) {
          broadcastLocal(event.roomId, event.type, event.payload);
        }
      } catch (error) {
        logEvent("warn", "collaboration_event_rejected", { error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  const persistenceTimers = new Map<string, NodeJS.Timeout>();
  const schedulePersistence = (roomId: string, state: CanvasState) => {
    const existing = persistenceTimers.get(roomId);
    if (existing) clearTimeout(existing);
    persistenceTimers.set(roomId, setTimeout(() => {
      persistenceTimers.delete(roomId);
      void getAdminServices().db.doc(`collaborationRooms/${roomId}`).set({
        objects: state.objects,
        revision: state.revision,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch((error) => {
        logEvent("error", "collaboration_persist_failed", { roomId, error: error instanceof Error ? error.message : String(error) });
      });
    }, 1_000));
  };

  const leaveRoom = async (socket: CollaborationSocket): Promise<void> => {
    const roomId = socket.roomId;
    if (!roomId) return;
    socket.roomId = undefined;
    socket.user = undefined;
    const local = rooms.get(roomId);
    local?.delete(socket);
    if (local?.size === 0) rooms.delete(roomId);
    if (redisClient) {
      await Promise.all([
        redisClient.zRem(presenceKey(roomId), socket.connectionId),
        redisClient.del(presenceDetailKey(socket.connectionId)),
      ]);
    }
    const users = await roomUsers(roomId);
    await broadcast(roomId, "presence-updated", users);
    if (users.length === 0) await store.release(roomId);
    logEvent("info", "collaboration_leave", { roomId, participants: users.length, released: users.length === 0 });
  };

  const joinRoom = async (socket: CollaborationSocket, payload: JoinRoomPayload): Promise<void> => {
    if (!payload || !isSafeId(payload.roomId, 64)) {
      send(socket, "collaboration-error", { code: "invalid-room", message: "That collaboration link is invalid." });
      return;
    }
    const existingUsers = await roomUsers(payload.roomId);
    if (existingUsers.length >= MAX_USERS_PER_ROOM && socket.roomId !== payload.roomId) {
      send(socket, "collaboration-error", { code: "room-full", message: "This collaboration room is full." });
      return;
    }
    if (socket.roomId && socket.roomId !== payload.roomId) await leaveRoom(socket);
    socket.user = safeUser(socket, payload.user);
    socket.roomId = payload.roomId;
    let room = rooms.get(payload.roomId);
    if (!room) {
      room = new Set();
      rooms.set(payload.roomId, room);
    }
    room.add(socket);
    await refreshPresence(socket);
    const state = await store.get(payload.roomId);
    const users = await roomUsers(payload.roomId);
    const roomState: CollaborationRoomState = { ...state, users };
    send(socket, "room-state", roomState);
    await broadcast(payload.roomId, "presence-updated", users);
    logEvent("info", "collaboration_join", { roomId: payload.roomId, participants: users.length });
  };

  const handleCanvasUpdate = async (socket: CollaborationSocket, payload: CanvasUpdatePayload): Promise<void> => {
    const reject = (ack: CanvasUpdateAck) => send(socket, "canvas-ack", ack, payload?.requestId);
    if (!validateCanvasUpdate(payload)) {
      logEvent("warn", "collaboration_rejected", { reason: "invalid-payload" });
      reject({ accepted: false, revision: 0, error: "invalid-payload" });
      return;
    }
    if (socket.roomId !== payload.roomId) {
      reject({ accepted: false, revision: 0, error: "room-not-joined" });
      return;
    }
    try {
      const result = await store.update(payload.roomId, payload.baseRevision, payload.objects);
      const users = await roomUsers(payload.roomId);
      if (!result.accepted) {
        reject({
          accepted: false,
          revision: result.state.revision,
          error: "revision-conflict",
          state: { ...result.state, users },
        });
        return;
      }
      schedulePersistence(payload.roomId, result.state);
      await broadcast(payload.roomId, "canvas-updated", {
        objects: result.state.objects,
        revision: result.state.revision,
        requestId: payload.requestId,
      }, socket);
      send(socket, "canvas-ack", { accepted: true, revision: result.state.revision } satisfies CanvasUpdateAck, payload.requestId);
    } catch (error) {
      logEvent("error", "collaboration_update_failed", { roomId: payload.roomId, error: error instanceof Error ? error.message : String(error) });
      reject({ accepted: false, revision: payload.baseRevision, error: "revision-conflict" });
    }
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  wss.on("connection", (rawSocket) => {
    const socket = rawSocket as CollaborationSocket;
    socket.connectionId = randomUUID();
    socket.messageCount = 0;
    socket.messageWindowStartedAt = Date.now();
    socket.on("message", (data) => {
      const now = Date.now();
      if (now - socket.messageWindowStartedAt >= 60_000) {
        socket.messageWindowStartedAt = now;
        socket.messageCount = 0;
      }
      socket.messageCount += 1;
      if (socket.messageCount > 240) {
        send(socket, "collaboration-error", { code: "rate-limited", message: "Too many collaboration updates. Please reconnect." });
        socket.close(1008, "rate-limited");
        return;
      }
      const message = parseMessage(data);
      if (!message || typeof message.type !== "string") {
        send(socket, "collaboration-error", { code: "invalid-message", message: "The collaboration message was invalid." });
        return;
      }
      if (message.type === "join-room") {
        void joinRoom(socket, message.payload as JoinRoomPayload).catch((error) => {
          logEvent("error", "collaboration_join_failed", { error: error instanceof Error ? error.message : String(error) });
          send(socket, "collaboration-error", { code: "join-failed", message: "Could not join the collaboration room." });
        });
      } else if (message.type === "canvas-update") {
        void handleCanvasUpdate(socket, message.payload as CanvasUpdatePayload);
      } else {
        send(socket, "collaboration-error", { code: "unsupported-message", message: "The collaboration message type is unsupported." });
      }
    });
    socket.on("close", () => void leaveRoom(socket).catch((error) => {
      logEvent("error", "collaboration_leave_failed", { error: error instanceof Error ? error.message : String(error) });
    }));
    socket.on("error", (error) => logEvent("warn", "collaboration_socket_error", { error: error.message }));
  });

  const upgradeHandler = (request: IncomingMessage, networkSocket: Duplex, head: Buffer) => {
    const origin = request.headers.origin?.replace(/\/$/, "");
    let pathname = "";
    try {
      pathname = new URL(request.url || "", `http://${request.headers.host || "localhost"}`).pathname;
    } catch {
      networkSocket.destroy();
      return;
    }
    if (pathname !== "/api/collaboration") {
      networkSocket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      networkSocket.destroy();
      return;
    }
    if (!isAllowedOrigin(origin, origins)) {
      networkSocket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      networkSocket.destroy();
      return;
    }
    wss.handleUpgrade(request, networkSocket, head, (socket) => wss.emit("connection", socket, request));
  };
  httpServer.on("upgrade", upgradeHandler);

  const presenceTimer = setInterval(() => {
    if (!redisClient) return;
    for (const socket of wss.clients) void refreshPresence(socket as CollaborationSocket);
  }, PRESENCE_REFRESH_MS);
  presenceTimer.unref();

  logEvent("info", "collaboration_ready", { mode, transport: "websocket" });
  return async () => {
    httpServer.off("upgrade", upgradeHandler);
    clearInterval(presenceTimer);
    for (const timer of persistenceTimers.values()) clearTimeout(timer);
    for (const socket of wss.clients) socket.close(1001, "server-shutdown");
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await store.close();
    await Promise.allSettled([pubClient?.quit(), subClient?.quit()]);
  };
}
