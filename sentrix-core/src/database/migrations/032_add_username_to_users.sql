ALTER TABLE users ADD COLUMN username VARCHAR(255) NULL;
UPDATE users SET username = SUBSTRING_INDEX(email, '@', 1) WHERE username IS NULL OR username = '';
