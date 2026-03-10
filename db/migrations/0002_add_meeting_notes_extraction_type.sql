ALTER TYPE "extraction_type" ADD VALUE IF NOT EXISTS 'meeting_notes';

-- Change source_id from uuid to text to support composite keys (cardId:blockId)
ALTER TABLE "ai_extractions" ALTER COLUMN "source_id" TYPE text USING "source_id"::text;
