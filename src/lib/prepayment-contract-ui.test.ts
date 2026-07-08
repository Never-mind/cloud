import { describe, expect, it } from "vitest";
import { getPrepaymentContractEditState } from "./prepayment-contract-ui";

describe("prepayment contract edit state", () => {
  it("keeps draft contracts read-only until the user clicks edit", () => {
    expect(
      getPrepaymentContractEditState({
        isEditing: false,
        isSaving: false,
        isConfirming: false,
        status: "草稿",
      }),
    ).toMatchObject({
      canEdit: false,
      editButtonLabel: "修改",
      confirmButtonLabel: "确认合同",
      confirmDisabled: false,
    });
  });

  it("shows save draft while editing a draft contract", () => {
    expect(
      getPrepaymentContractEditState({
        isEditing: true,
        isSaving: false,
        isConfirming: false,
        status: "草稿",
      }),
    ).toMatchObject({
      canEdit: true,
      editButtonLabel: "保存草稿",
    });
  });

  it("shows confirmed state immediately while confirming", () => {
    expect(
      getPrepaymentContractEditState({
        isEditing: false,
        isSaving: false,
        isConfirming: true,
        status: "草稿",
      }).confirmButtonLabel,
    ).toBe("已确认");
  });

  it("keeps confirmed contracts read-only", () => {
    expect(
      getPrepaymentContractEditState({
        isEditing: true,
        isSaving: false,
        isConfirming: false,
        status: "已确认",
      }),
    ).toMatchObject({
      canEdit: false,
      editButtonLabel: "修改",
      confirmButtonLabel: "已确认",
      confirmDisabled: true,
    });
  });
});
