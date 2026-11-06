import { openDatabase } from '../src/db.js';

const db = openDatabase();
console.log('Database migrations are up to date.');
db.close();
