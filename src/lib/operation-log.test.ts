import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ execute: vi.fn() }));

import { execute } from "./db";
import { getOperationRequestId, recordOperationLog } from "./operation-log";

describe("operation log", () => {
  beforeEach(() => {
    vi.mocked(execute).mockReset();
    vi.mocked(execute).mockResolvedValue({} as never);
  });

  it("preserves a valid request id and generates one when missing or too long", () => {
    expect(getOperationRequestId({ headers: { get: () => " request-123 " } })).toBe("request-123");

    const generated = getOperationRequestId({ headers: { get: () => null } });
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);

    const tooLong = getOperationRequestId({ headers: { get: () => "x".repeat(129) } });
    expect(tooLong).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("writes the actor and compact detail fields", async () => {
    await recordOperationLog({
      actor: { userId: "u1", displayName: "管理员", email: "admin@example.com" },
      domainKey: "power",
      moduleKey: "requests",
      action: "delete",
      entityType: "requests",
      entityId: "REQ-1",
      requestId: "req-1",
      detail: { result: "success", count: 1 },
    });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO merge_common_operation_logs"),
      expect.objectContaining({
        userId: "u1",
        userName: "管理员",
        domainKey: "power",
        moduleKey: "requests",
        action: "delete",
        entityType: "requests",
        entityId: "REQ-1",
        requestId: "req-1",
        detailJson: JSON.stringify({ result: "success", count: 1 }),
      }),
    );
  });

  it("does not propagate database failures into the business request", async () => {
    vi.mocked(execute).mockRejectedValueOnce(new Error("table unavailable"));

    await expect(recordOperationLog({ action: "update" })).resolves.toBeUndefined();
  });
});
