CREATE TABLE jumpseller_prepared_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER CHECK(enabled IN (0,1)),since TEXT);
INSERT INTO jumpseller_prepared_settings(id) VALUES(1);
