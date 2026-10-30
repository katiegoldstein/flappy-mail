-- Finds a sender's earlier letters, so their first letter can be spared the 16% loss.
CREATE INDEX letters_by_sender ON letters (sender_email);
