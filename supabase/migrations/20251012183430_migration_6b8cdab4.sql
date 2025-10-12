-- Drop the old trigger if it exists
DROP TRIGGER IF EXISTS support_tickets_ticket_number_trigger ON public.support_tickets;

-- Alter the table to use the function as a default value for the ticket_number column
-- This makes it so we don't have to provide it on insert, and the database handles it automatically.
ALTER TABLE public.support_tickets 
ALTER COLUMN ticket_number SET DEFAULT generate_ticket_number();