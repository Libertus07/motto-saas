import { Client } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!dbUrl) {
    console.error("No database URL found in .env.local");
    process.exit(1);
}

const client = new Client({
    connectionString: dbUrl,
});

async function runMigrations() {
    try {
        await client.connect();
        console.log('Connected to database');

        const migrationsDir = './migrations';
        if (!fs.existsSync(migrationsDir)) {
            console.log('No migrations directory found');
            await client.end();
            return;
        }

        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const filePath = `${migrationsDir}/${file}`;
            const sql = fs.readFileSync(filePath, 'utf8');
            console.log(`Running migration: ${file}`);
            
            try {
                await client.query(sql);
                console.log(`✓ Completed: ${file}`);
            } catch (err) {
                console.error(`✗ Failed: ${file}`);
                console.error(err);
            }
        }
    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await client.end();
    }
}

runMigrations();
