import { auth } from "./firebase";
import { toast } from "sonner";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.replace(/^firestore\//, "").slice(0, 80);
  }
  return "unknown";
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const code = errorCode(error);
  console.error(JSON.stringify({
    event: "firestore_client_error",
    code,
    operation: operationType,
    collection: path?.split("/")[0]?.slice(0, 80) || null,
    actor: auth?.currentUser ? "authenticated" : "anonymous",
  }));

  if (code.includes("permission-denied")) {
    toast.error("You do not have access to that item.");
  } else if (code.includes("unauthenticated")) {
    toast.error("Sign in again to continue.");
  } else if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    toast.error("The database is temporarily unavailable. Please retry.");
  } else if (code.includes("resource-exhausted")) {
    toast.error("That request is too large. Reduce the meme size and retry.");
  } else {
    toast.error(`Could not ${operationType} the requested data.`);
  }
}
