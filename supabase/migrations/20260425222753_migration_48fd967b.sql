-- Add status column to email_automation_log if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_automation_log' AND column_name = 'status'
  ) THEN
    ALTER TABLE email_automation_log ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- Add updated_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_automation_log' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE email_automation_log ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create index for efficient pending email queries
CREATE INDEX IF NOT EXISTS idx_email_log_pending 
  ON email_automation_log(user_id, status, created_at) 
  WHERE status = 'pending';