import type { NextRequest } from "next/server";
import { getAuthenticatedUser, type AuthUser } from "./auth";

export type OperationActor = Pick<AuthUser, "userId" | "displayName" | "email">;

export async function getOperationActor(request: NextRequest): Promise<OperationActor | null> {
  const user = await getAuthenticatedUser({ cookies: request.cookies } as any);
  return user
    ? { userId: user.userId, displayName: user.displayName, email: user.email }
    : null;
}

export function operationFields(actor: OperationActor | null, mode: "create" | "update" | "confirm") {
  if (!actor) return {};
  const fields = {
    ...(mode === "create" ? { createdByUserId: actor.userId, createdByName: actor.displayName } : {}),
    ...(mode !== "confirm" ? { updatedByUserId: actor.userId, updatedByName: actor.displayName } : {}),
    ...(mode === "confirm" ? { confirmedByUserId: actor.userId, confirmedByName: actor.displayName } : {}),
  };
  return fields;
}
