import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ORGANIZATION_PAGES = [
  'src/app/dashboard/tedarikciler/page.tsx',
  'src/app/dashboard/raporlar/tedarikci-gecmisi/page.tsx',
  'src/app/dashboard/raporlar/gecmis/page.tsx',
  'src/app/dashboard/raporlar/yatirim-gecmisi/page.tsx',
]

const SUPPLIER_PAGES = ORGANIZATION_PAGES.slice(0, 2)

function parse(filePath: string) {
  const absolutePath = resolve(process.cwd(), filePath)
  return ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
}

function findCalls(sourceFile: ts.SourceFile, functionName: string): ts.CallExpression[] {
  const calls: ts.CallExpression[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === functionName) {
      calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return calls
}

describe('financial document preview production boundaries', () => {
  it.each(ORGANIZATION_PAGES)('%s binds authorization to the active organization scope', (filePath) => {
    const sourceFile = parse(filePath)
    const calls = findCalls(sourceFile, 'useDocumentPreview')

    expect(calls).toHaveLength(1)
    expect(calls[0].arguments).toHaveLength(1)
    expect(calls[0].arguments[0].getText(sourceFile).replaceAll(' ', '')).toBe('activeOrg?.id??null')
  })

  it.each(SUPPLIER_PAGES)('%s supplies a current-request guard to the tenant row lookup', (filePath) => {
    const sourceFile = parse(filePath)
    const calls = findCalls(sourceFile, 'openSupplierDocument')

    expect(calls).toHaveLength(1)
    const input = calls[0].arguments[0]
    expect(ts.isObjectLiteralExpression(input)).toBe(true)
    if (!ts.isObjectLiteralExpression(input)) return
    expect(
      input.properties.some(
        (property) =>
          (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
          property.name.getText(sourceFile) === 'isRequestCurrent',
      ),
    ).toBe(true)
  })
})
