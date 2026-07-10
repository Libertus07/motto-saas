const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                results.push(file);
            }
        }
    });
    return results;
}

const srcDir = path.join(__dirname, '..', '..', 'src');
const files = walk(srcDir);

files.forEach(file => {
    // Skip debug.ts itself
    if (file.includes('debug.ts')) return;

    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    if (content.includes('console.error')) {
        content = content.replace(/console\.error/g, 'devError');
        modified = true;
    }

    if (content.includes('console.log')) {
        content = content.replace(/console\.log/g, 'devLog');
        modified = true;
    }

    if (modified) {
        // Add import at the top if not exists
        if (!content.includes("from '@/lib/debug'")) {
            // Find the last import statement
            const lines = content.split('\n');
            let lastImportIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('import ')) {
                    lastImportIdx = i;
                }
            }

            const importStr = "import { devLog, devError } from '@/lib/debug';";
            if (lastImportIdx === -1) {
                // If there are no imports, add it after 'use client' if it exists, else top
                if (lines[0].includes('use client')) {
                    lines.splice(1, 0, importStr);
                } else {
                    lines.unshift(importStr);
                }
            } else {
                lines.splice(lastImportIdx + 1, 0, importStr);
            }
            content = lines.join('\n');
        }
        fs.writeFileSync(file, content, 'utf8');
        console.log('Modified:', file);
    }
});
