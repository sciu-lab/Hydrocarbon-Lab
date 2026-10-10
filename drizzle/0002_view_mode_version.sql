ALTER TABLE `molecule_history` ADD `view_mode_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_molecules` ADD `view_mode_version` integer DEFAULT 1 NOT NULL;