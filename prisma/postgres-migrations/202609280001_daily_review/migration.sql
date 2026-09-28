-- The daily question-and-answer sheet: every question, with the answer the
-- bot gave, lands in the same review table as the flagged ones.
ALTER TABLE "unanswered_questions" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'flagged';
ALTER TABLE "unanswered_questions" ADD COLUMN "botAnswer" TEXT;
