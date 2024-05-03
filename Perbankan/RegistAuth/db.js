const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'Murid',
    password: 'root',
    port: 5432 // Default PostgreSQL port is 5432
});

module.exports = client;