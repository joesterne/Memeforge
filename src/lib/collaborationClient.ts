import type { CanvasUpdateAck, CanvasUpdatePayload } from "../types/collaboration";

export type CollaborationStatus = "connecting" | "connected" | "reconnecting" | "failed";

interface Envelope {
  type?: unknown;
  payload?: unknown;
  requestId?: unknown;
}

type EventHandler = (payload: unknown) => void;

interface PendingAcknowledgement {
  resolve: (acknowledgement: CanvasUpdateAck) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class CollaborationClient {
  private webSocket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closed = false;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly pending = new Map<string, PendingAcknowledgement>();

  constructor(private readonly url: string, private readonly maxReconnectAttempts = 8) {}

  get connected(): boolean {
    return this.webSocket?.readyState === WebSocket.OPEN;
  }

  on<T>(type: string, handler: (payload: T) => void): () => void {
    let handlers = this.handlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(type, handlers);
    }
    handlers.add(handler as EventHandler);
    return () => handlers?.delete(handler as EventHandler);
  }

  private dispatch(type: string, payload: unknown): void {
    for (const handler of this.handlers.get(type) || []) handler(payload);
  }

  connect(): void {
    this.closed = false;
    this.open(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
  }

  private open(status: CollaborationStatus): void {
    if (this.closed) return;
    this.dispatch("status", status);
    const socket = new WebSocket(this.url);
    this.webSocket = socket;
    socket.addEventListener("open", () => {
      this.dispatch("status", "connected" satisfies CollaborationStatus);
      this.stableConnectionTimer = setTimeout(() => {
        this.reconnectAttempt = 0;
      }, 30_000);
    });
    socket.addEventListener("message", (event) => {
      let envelope: Envelope;
      try {
        envelope = JSON.parse(String(event.data)) as Envelope;
      } catch {
        return;
      }
      if (typeof envelope.type !== "string") return;
      if (envelope.type === "canvas-ack" && typeof envelope.requestId === "string") {
        const pending = this.pending.get(envelope.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(envelope.requestId);
          pending.resolve(envelope.payload as CanvasUpdateAck);
        }
        return;
      }
      this.dispatch(envelope.type, envelope.payload);
    });
    socket.addEventListener("close", () => {
      if (this.stableConnectionTimer) clearTimeout(this.stableConnectionTimer);
      if (this.webSocket === socket) this.webSocket = null;
      this.rejectPending(new Error("Collaboration connection closed."));
      if (this.closed) return;
      this.reconnectAttempt += 1;
      if (this.reconnectAttempt > this.maxReconnectAttempts) {
        this.dispatch("status", "failed" satisfies CollaborationStatus);
        return;
      }
      this.dispatch("status", "reconnecting" satisfies CollaborationStatus);
      const delay = Math.min(500 * 2 ** (this.reconnectAttempt - 1), 5_000);
      this.reconnectTimer = setTimeout(() => this.open("reconnecting"), delay);
    });
    socket.addEventListener("error", () => socket.close());
  }

  send(type: string, payload: unknown): boolean {
    if (!this.connected || !this.webSocket) return false;
    this.webSocket.send(JSON.stringify({ type, payload }));
    return true;
  }

  sendCanvasUpdate(payload: CanvasUpdatePayload, timeoutMs = 5_000): Promise<CanvasUpdateAck> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(payload.requestId);
        reject(new Error("Collaboration acknowledgement timed out."));
      }, timeoutMs);
      this.pending.set(payload.requestId, { resolve, reject, timeout });
      if (!this.send("canvas-update", payload)) {
        clearTimeout(timeout);
        this.pending.delete(payload.requestId);
        reject(new Error("Collaboration is disconnected."));
      }
    });
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.stableConnectionTimer) clearTimeout(this.stableConnectionTimer);
    this.rejectPending(new Error("Collaboration client closed."));
    this.webSocket?.close(1000, "client-close");
    this.webSocket = null;
    this.handlers.clear();
  }
}
