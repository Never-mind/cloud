import { describe, expect, it } from "vitest";
import { groupDetailsByMaster, summarizeQuantity } from "./master-detail";

describe("master detail helpers", () => {
  it("groups detail rows by their master key", () => {
    const grouped = groupDetailsByMaster(
      [
        { id: "ri-1", requestNo: "REQ-1" },
        { id: "ri-2", requestNo: "REQ-1" },
        { id: "ri-3", requestNo: "REQ-2" },
      ],
      "requestNo",
    );

    expect(grouped.get("REQ-1")?.map((item) => item.id)).toEqual(["ri-1", "ri-2"]);
    expect(grouped.get("REQ-2")?.map((item) => item.id)).toEqual(["ri-3"]);
  });

  it("summarizes numeric quantities across details", () => {
    expect(
      summarizeQuantity([
        { quantity: 2 },
        { quantity: 8 },
        { quantity: null },
      ]),
    ).toBe(10);
  });
});
