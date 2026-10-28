CREATE TABLE "projects" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "routine_checks" (
	"user_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"date" date NOT NULL,
	"checked" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_checks_user_id_routine_id_date_pk" PRIMARY KEY("user_id","routine_id","date")
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "routines_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'gray' NOT NULL,
	"language" text DEFAULT 'tr' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"week_start_day" text DEFAULT 'monday' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_theme_check" CHECK ("user_settings"."theme" in ('gray', 'purple', 'blue', 'red', 'green', 'pink', 'black')),
	CONSTRAINT "user_settings_language_check" CHECK ("user_settings"."language" in ('tr', 'en')),
	CONSTRAINT "user_settings_font_family_check" CHECK ("user_settings"."font_family" in ('Inter', 'Poppins', 'Manrope')),
	CONSTRAINT "user_settings_week_start_day_check" CHECK ("user_settings"."week_start_day" in ('monday', 'sunday'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_checks" ADD CONSTRAINT "routine_checks_routine_fk" FOREIGN KEY ("user_id","routine_id") REFERENCES "public"."routines"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;