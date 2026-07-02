const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.tsx')) results.push(file);
        }
    });
    return results;
}

const files = walk('w:/Projeler/Motto-saas/motto-saas/src/app/dashboard');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/className="h-full /g, 'className="min-h-full ');
    fs.writeFileSync(file, content, 'utf8');
});

console.log('Done refactoring min-h-full.');
