import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const moleculeHistory = sqliteTable(
  "molecule_history",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    name: text("name").notNull(),
    formula: text("formula").notNull(),
    family: text("family").notNull(),
    moleculeJson: text("molecule_json").notNull(),
    viewMode: text("view_mode").notNull().default("condensed"),
    viewModeVersion: integer("view_mode_version").notNull().default(1),
    fingerprint: text("fingerprint").notNull(),
    atomCount: integer("atom_count").notNull().default(0),
    isDraft: integer("is_draft", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("molecule_history_owner_updated_idx").on(
      table.ownerKey,
      table.updatedAt,
    ),
    uniqueIndex("molecule_history_owner_version_idx").on(
      table.ownerKey,
      table.isDraft,
      table.fingerprint,
    ),
  ],
);

export const savedMolecules = sqliteTable(
  "saved_molecules",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    name: text("name").notNull(),
    formula: text("formula").notNull(),
    family: text("family").notNull(),
    moleculeJson: text("molecule_json").notNull(),
    viewMode: text("view_mode").notNull().default("condensed"),
    viewModeVersion: integer("view_mode_version").notNull().default(1),
    fingerprint: text("fingerprint").notNull(),
    atomCount: integer("atom_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("saved_molecules_owner_updated_idx").on(
      table.ownerKey,
      table.updatedAt,
    ),
    uniqueIndex("saved_molecules_owner_fingerprint_idx").on(
      table.ownerKey,
      table.fingerprint,
    ),
  ],
);
