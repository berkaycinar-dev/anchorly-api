CREATE TABLE "tasks" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"category" text DEFAULT 'Work' NOT NULL,
	"date" date,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" date,
	"description" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" bigint NOT NULL,
	"repeat" text DEFAULT 'none' NOT NULL,
	"repeat_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "tasks_category_check" CHECK ("tasks"."category" in ('Work', 'Personal', 'Self Development', 'Health', 'Other', 'Project')),
	CONSTRAINT "tasks_repeat_check" CHECK ("tasks"."repeat" in ('none', 'daily', 'weekly')),
	CONSTRAINT "tasks_steps_array_check" CHECK (jsonb_typeof("tasks"."steps") = 'array')
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."projects"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_user_repeat_group_idx" ON "tasks" USING btree ("user_id","repeat_group_id");