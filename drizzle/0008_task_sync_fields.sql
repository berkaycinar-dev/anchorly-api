ALTER TABLE "tasks" ADD COLUMN "board_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "important" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_time" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_status_check" CHECK ("tasks"."board_status" in ('todo', 'doing'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_due_time_check" CHECK ("tasks"."due_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');