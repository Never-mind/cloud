import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/settlement-project-detail-workspace.tsx"),
  "utf8",
);

describe("settlement project read-only state", () => {
  it("disables the expense and sales entry form when the project is closed", () => {
    expect(source).toContain('<fieldset className="min-w-0" disabled={locked}><div className={formGrid}>');
    expect(source).toContain("</Field></div></fieldset><TableScroll");
  });

  it("disables the expense and sales row actions when the project is closed", () => {
    const guarded = source.split("disabled={locked || busy}").length - 1;
    expect(guarded).toBeGreaterThanOrEqual(3);
  });

  it("tells the user why the section is not editable", () => {
    expect(source).toContain("项目已完结，数据只读");
  });
});
