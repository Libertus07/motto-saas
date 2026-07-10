const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

const project = new Project({
    tsConfigFilePath: "tsconfig.json",
});

const sourceFiles = project.getSourceFiles("src/**/*.tsx").concat(project.getSourceFiles("src/**/*.ts"));

let modifiedFilesCount = 0;

sourceFiles.forEach(sourceFile => {
    let modified = false;
    let needsFormatCurrency = false;
    let needsFormatDate = false;

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    // Iterate backwards to avoid invalidating AST nodes!
    for (let i = callExpressions.length - 1; i >= 0; i--) {
        const callExpr = callExpressions[i];
        
        // Ensure node is not already forgotten
        if (callExpr.wasForgotten()) continue;

        const expression = callExpr.getExpression();
        if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
            const propertyAccess = expression;
            const methodName = propertyAccess.getName();
            
            if (methodName === 'toLocaleString') {
                const args = callExpr.getArguments();
                if (args.length > 0 && args[0].getText() === "'tr-TR'") {
                    const baseExpressionText = propertyAccess.getExpression().getText();
                    callExpr.replaceWithText(`formatCurrency(${baseExpressionText})`);
                    needsFormatCurrency = true;
                    modified = true;
                }
            } else if (methodName === 'toLocaleDateString') {
                const args = callExpr.getArguments();
                if (args.length > 0 && args[0].getText() === "'tr-TR'") {
                    const baseExpressionText = propertyAccess.getExpression().getText();
                    callExpr.replaceWithText(`formatDate(${baseExpressionText})`);
                    needsFormatDate = true;
                    modified = true;
                }
            }
        }
    }

    if (modified) {
        // Add imports
        const imports = [];
        if (needsFormatCurrency) imports.push('formatCurrency');
        if (needsFormatDate) imports.push('formatDate');
        
        if (imports.length > 0) {
            const existingImport = sourceFile.getImportDeclaration(dec => dec.getModuleSpecifierValue() === '@/lib/format');
            if (existingImport) {
                imports.forEach(i => {
                    if (!existingImport.getNamedImports().some(ni => ni.getName() === i)) {
                        existingImport.addNamedImport(i);
                    }
                });
            } else {
                sourceFile.addImportDeclaration({
                    namedImports: imports,
                    moduleSpecifier: '@/lib/format'
                });
            }
        }
        sourceFile.saveSync();
        modifiedFilesCount++;
        console.log('Modified:', sourceFile.getFilePath());
    }
});

console.log(`Refactoring completed. ${modifiedFilesCount} files modified.`);
