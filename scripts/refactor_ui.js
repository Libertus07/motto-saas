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
    
    // Remove "min-h-screen" to prevent double scrollbars
    content = content.replace(/className="min-h-screen /g, 'className="h-full ');
    
    // Remove specific Geri buttons that point to /dashboard exactly
    content = content.replace(/<button onClick=\{\(\) => router\.push\('\/dashboard'\)\} className="text-stone-400 hover:text-white">← Geri<\/button>\s*<span className="text-stone-600">\|<\/span>\s*/g, '');

    fs.writeFileSync(file, content, 'utf8');
});

console.log('Done refactoring UI.');
