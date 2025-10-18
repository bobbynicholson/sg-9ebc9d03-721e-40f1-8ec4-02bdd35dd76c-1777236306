-- Create staff_invitations table for managing staff invitations
CREATE TABLE IF NOT EXISTS staff_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('kitchen', 'driver', 'cleaning', 'shopping', 'admin')),
  invitation_token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(company_id, email)
);

-- Enable RLS
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Company admins can manage their own invitations
CREATE POLICY "Company admins can view their invitations" 
ON staff_invitations FOR SELECT 
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Company admins can create invitations" 
ON staff_invitations FOR INSERT 
WITH CHECK (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Company admins can update their invitations" 
ON staff_invitations FOR UPDATE 
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Anyone can accept invitations with valid token" 
ON staff_invitations FOR UPDATE 
USING (status = 'pending' AND expires_at > NOW());

CREATE POLICY "Company admins can delete their invitations" 
ON staff_invitations FOR DELETE 
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Create index for faster lookups
CREATE INDEX idx_staff_invitations_token ON staff_invitations(invitation_token);
CREATE INDEX idx_staff_invitations_company_email ON staff_invitations(company_id, email);
CREATE INDEX idx_staff_invitations_status ON staff_invitations(status);

-- Add comment
COMMENT ON TABLE staff_invitations IS 'Tracks staff member invitations sent by company admins';