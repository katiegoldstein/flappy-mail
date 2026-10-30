-- Letters. A letter's whole trip is planned at send time and stored here.
CREATE TABLE letters (
  id TEXT PRIMARY KEY,                -- opaque public id (shown on the map)
  tracking_token TEXT NOT NULL UNIQUE,
  letter_token TEXT NOT NULL UNIQUE,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  body TEXT NOT NULL,
  carrier TEXT NOT NULL CHECK (carrier IN ('pigeon', 'bottle')),
  carrier_name TEXT NOT NULL,
  origin_city_id INTEGER NOT NULL,
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  dest_city_id INTEGER NOT NULL,
  dest_lat REAL NOT NULL,
  dest_lng REAL NOT NULL,
  route TEXT NOT NULL,                -- JSON [[lon,lat],...], great-circle legs
  distance_miles REAL NOT NULL,
  plan TEXT NOT NULL,                 -- JSON segments
  departed_at INTEGER NOT NULL,       -- epoch ms
  arrives_at INTEGER NOT NULL,
  lost INTEGER NOT NULL DEFAULT 0,
  lost_at INTEGER,
  lost_reason TEXT,
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit', 'delivered', 'lost')),
  departure_email_sent_at INTEGER,
  arrival_email_sent_at INTEGER,
  delivered_email_sent_at INTEGER,
  lost_email_sent_at INTEGER,
  reply_to_letter_id TEXT,
  resend_of_letter_id TEXT,
  sender_ip_hash TEXT,
  created_at INTEGER NOT NULL
);
-- "Gone" is when a carrier leaves the sky: arrival, or the loss moment for doomed letters.
CREATE INDEX letters_in_air ON letters (arrives_at, lost_at);
CREATE INDEX letters_name ON letters (carrier_name);

CREATE TABLE blocked_recipients (
  email_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Bottle sea routes are slow to compute, so each city pair is worked out once.
CREATE TABLE sea_routes (
  pair TEXT PRIMARY KEY,              -- "<from city id>-<to city id>"
  route TEXT,                         -- JSON, or NULL when there is no sea route
  miles REAL
);

-- Local development only: emails land here instead of being sent (see /dev/outbox).
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
