-- A 6-digit code is not globally unique: two users can hold the same code at the same time, which made
-- creating the second token fail. Uniqueness is per (identifier, token), which already exists.
DROP INDEX "TwoFactorToken_token_key";
