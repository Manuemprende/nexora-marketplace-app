ALTER TABLE users ADD COLUMN operational_profile TEXT NOT NULL DEFAULT 'operator' CHECK(operational_profile IN ('operator','packer','collector'));
