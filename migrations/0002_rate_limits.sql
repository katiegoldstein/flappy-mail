-- Rate limits look back 24 hours by sender IP (hashed) and by recipient address.
CREATE INDEX letters_by_ip ON letters (sender_ip_hash, created_at);
CREATE INDEX letters_by_recipient ON letters (recipient_email, created_at);
-- The scheduler finds departure emails that still need sending.
CREATE INDEX letters_departure_email ON letters (departure_email_sent_at, created_at);
