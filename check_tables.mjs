import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!dbUrl) {
    console.error("No database URL found in .env.local");
    process.exit(1);
}

const client = new Client({ connectionString: dbUrl });

async function listTables() {
    try {
        await client.connect();
        const res = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log("Existing Tables:");
        res.rows.forEach(row => console.log("- " + row.table_name));
    } catch (err) {
        console.error('Error fetching tables:', err);
    } finally {
        await client.end();
    }
}

listTables();
