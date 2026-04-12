const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('test', 10);
console.log('Bcrypt works:', hash);
