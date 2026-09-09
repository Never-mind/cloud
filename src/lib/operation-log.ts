import { randomUUID } from "node:crypto";
import { execute } from "./db";
import { getOperationActor, type OperationActor } from "./operation-actor";

export type OperationLogAction =
  | "create"
  | "update"
  | "delete"
  | "confirm"
  | "import"
  | "export"
  | "upload"
  | "download"
  | "sync"
  | "login"
  | "logout"
  | "status_change"
  | (string & {});

export type OperationLogInput = {
  actor?: OperationActor | null;
  domainKey?: string | null;
  moduleKey?: string | null;
  action: OperationLogAction;
  entityType?: string | null;
  entityId?: string | null;
  requestId?: string | null;
  detail?: Record<string, unknown> | null;
};

export function getOperationRequestId(request: { headers: { get(name: string): string | null } }) {
  const requestId = request.headers.get("x-request-id")?.trim();
  return requestId && requestId.length <= 128 ? requestId : randomUUID();
}

export async function getOperationActorForLog(request: Parameters<typeof getOperationActor>[0]): Promise<OperationActor | null> {
  try {
    return await getOperationActor(request);
  } catch (error) {
    console.error("[operation-log] failed to resolve operation actor", error);
    return null;
  }
}

export async function recordOperationLog(input: OperationLogInput) {
  try {
    const detailJson = input.detail == null ? null : JSON.stringify(input.detail);
    await execute(
      `INSERT INTO merge_common_operation_logs
        (logId, userId, userName, domainKey, moduleKey, action, entityType, entityId, requestId, detailJson)
       VALUES
        (:logId, :userId, :userName, :domainKey, :moduleKey, :action, :entityType, :entityId, :requestId, :detailJson)`,
      {
        logId: randomUUID(),
        userId: input.actor?.userId ?? null,
        userName: input.actor?.displayName ?? null,
        domainKey: input.domainKey ?? null,
        moduleKey: input.moduleKey ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        requestId: input.requestId ?? randomUUID(),
        detailJson,
      },
    );
  } catch (error) {
    // Auditing must not turn a successful business operation into a failure.
    console.error("[operation-log] failed to persist operation log", error);
  }
}
