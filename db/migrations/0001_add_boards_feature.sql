-- Add description and updatedAt to boards table, make workspaceId and createdBy optional
ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ALTER COLUMN "board_type" SET DEFAULT 'list';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_boards" (
	"card_id" uuid NOT NULL,
	"board_id" uuid NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "card_boards" ADD CONSTRAINT "card_boards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "card_boards" ADD CONSTRAINT "card_boards_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
