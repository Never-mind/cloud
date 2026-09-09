import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("instance model constraints", () => {
  it("keeps device code as the only unique identifier", () => {
    const schema = readFileSync(resolve(process.cwd(), "schema.sql"), "utf8");
    const instanceModels = schema.match(/CREATE TABLE IF NOT EXISTS `merge_power_instancemodels` \([\s\S]*?ENGINE=InnoDB/)?.[0] ?? "";

    expect(instanceModels).toContain("PRIMARY KEY (`deviceCode`)");
    expect(instanceModels).toContain("`instanceType` VARCHAR(32) NOT NULL DEFAULT 'Equipment'");
    expect(instanceModels).toContain("KEY `idx_InstanceModels_instanceType` (`instanceType`)");
    expect(instanceModels).not.toContain("UNIQUE KEY `uk_InstanceModels_modelCode`");
  });

  it("removes the legacy model code unique index during migration", () => {
    const migration = readFileSync(resolve(process.cwd(), "scripts/migrate.ts"), "utf8");

    expect(migration).toContain('dropIndexIfExists("instancemodels", "uk_InstanceModels_modelCode")');
    expect(migration).toContain('addColumnIfMissing(\n    "instancemodels",\n    "instanceType"');
    expect(migration).toContain("WHEN 'material' THEN 'Material'");
  });
});
