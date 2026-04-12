const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);
  INSERT INTO test (name) VALUES ('Antigravity');
`);

const row = db.prepare('SELECT * FROM test WHERE name = @name').get({ name: 'Antigravity' });
console.log('Result:', row);
