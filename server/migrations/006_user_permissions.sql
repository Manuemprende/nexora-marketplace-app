CREATE TABLE user_permissions (user_id TEXT NOT NULL REFERENCES users(id), section TEXT NOT NULL, PRIMARY KEY(user_id,section));
INSERT INTO user_permissions SELECT id,'scan' FROM users WHERE role='packer';
