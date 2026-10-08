CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    bot_token TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    bot_name TEXT,
    logged_in_at TEXT
);

CREATE TABLE IF NOT EXISTS files (
    file_id TEXT PRIMARY KEY,
    message_id INTEGER,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    extension TEXT,
    thumb_file_id TEXT,
    account_id TEXT,
    uploaded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_account ON files(account_id);
CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
