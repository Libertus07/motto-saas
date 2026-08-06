import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Node, Project, SyntaxKind } from 'ts-morph'

function collectFiles(directory: string, extensions: ReadonlySet<string>): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(fullPath, extensions)
    return extensions.has(path.extname(entry.name)) ? [fullPath] : []
  })
}

type SqlFunctionDefinition = {
  parameterNames: Set<string>
  parameterCount: number
}

function parseSqlParameterNames(parameters: string) {
  if (!parameters.trim()) return []
  return parameters.split(',').flatMap((parameter) => {
    const match = parameter.trim().match(/^"?([a-z_][a-z0-9_]*)"?\s+/i)
    return match ? [match[1].toLowerCase()] : []
  })
}

function collectFinalSqlFunctionDefinitions(migrationFiles: string[]) {
  const definitions = new Map<string, SqlFunctionDefinition[]>()

  for (const migrationFile of migrationFiles.sort()) {
    const sql = fs.readFileSync(migrationFile, 'utf8')
    const events: Array<
      | { index: number; type: 'drop'; name: string; parameterCount: number }
      | { index: number; type: 'create'; name: string; parameterNames: string[] }
      | { index: number; type: 'rename'; fromName: string; toName: string; parameterCount: number }
    > = []

    for (const match of sql.matchAll(
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+(?:"public"\.|public\.)"?([a-zA-Z0-9_]+)"?\s*\(([^;]*)\)/gi,
    )) {
      const parameterCount = match[2].trim() ? match[2].split(',').length : 0
      events.push({ index: match.index, type: 'drop', name: match[1].toLowerCase(), parameterCount })
    }

    for (const match of sql.matchAll(
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(?:"public"\.|public\.)"?([a-zA-Z0-9_]+)"?\s*\(([\s\S]*?)\)\s*RETURNS/gi,
    )) {
      events.push({
        index: match.index,
        type: 'create',
        name: match[2].toLowerCase(),
        parameterNames: parseSqlParameterNames(match[3]),
      })
    }

    for (const match of sql.matchAll(
      /ALTER\s+FUNCTION\s+(?:"public"\.|public\.)"?([a-zA-Z0-9_]+)"?\s*\(([^;]*)\)\s+RENAME\s+TO\s+"?([a-zA-Z0-9_]+)"?/gi,
    )) {
      const parameterCount = match[2].trim() ? match[2].split(',').length : 0
      events.push({
        index: match.index,
        type: 'rename',
        fromName: match[1].toLowerCase(),
        toName: match[3].toLowerCase(),
        parameterCount,
      })
    }

    for (const event of events.sort((left, right) => left.index - right.index)) {
      if (event.type === 'rename') {
        const sourceDefinitions = definitions.get(event.fromName) ?? []
        const renamedDefinitions = sourceDefinitions.filter(
          (definition) => definition.parameterCount === event.parameterCount,
        )
        definitions.set(
          event.fromName,
          sourceDefinitions.filter((definition) => definition.parameterCount !== event.parameterCount),
        )
        if (renamedDefinitions.length > 0) {
          const targetDefinitions = definitions.get(event.toName) ?? []
          definitions.set(event.toName, [
            ...targetDefinitions.filter((definition) => definition.parameterCount !== event.parameterCount),
            ...renamedDefinitions,
          ])
        }
        continue
      }

      const current = definitions.get(event.name) ?? []
      const parameterCount = event.type === 'drop' ? event.parameterCount : event.parameterNames.length
      const withoutSameArity = current.filter((definition) => definition.parameterCount !== parameterCount)

      if (event.type === 'drop') {
        definitions.set(event.name, withoutSameArity)
      } else {
        definitions.set(event.name, [
          ...withoutSameArity,
          { parameterNames: new Set(event.parameterNames), parameterCount },
        ])
      }
    }
  }

  return definitions
}

function collectLiteralRpcCalls(sourceFiles: string[]) {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true })
  const calls: Array<{ name: string; parameterNames: string[]; source: string }> = []

  for (const sourceFilePath of sourceFiles) {
    const sourceFile = project.createSourceFile(
      sourceFilePath.replaceAll('\\', '/'),
      fs.readFileSync(sourceFilePath, 'utf8'),
      { overwrite: true },
    )

    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression()
      if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== 'rpc') continue

      const [nameArgument, parametersArgument] = call.getArguments()
      if (!nameArgument || !Node.isStringLiteral(nameArgument)) continue

      const parameterNames: string[] = []
      if (parametersArgument && Node.isObjectLiteralExpression(parametersArgument)) {
        for (const property of parametersArgument.getProperties()) {
          if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) {
            parameterNames.push(
              property
                .getName()
                .replace(/^['"]|['"]$/g, '')
                .toLowerCase(),
            )
          }
        }
      }

      calls.push({
        name: nameArgument.getLiteralValue().toLowerCase(),
        parameterNames,
        source: `${path.relative(process.cwd(), sourceFilePath)}:${call.getStartLineNumber()}`,
      })
    }
  }

  return calls
}

describe('RPC Fonksiyon İletişim ve İmza Doğrulama Testleri', () => {
  it('20260728000004_tenant_rpc_functions_sec102.sql içerisinde eski overload DROP komutları bulunmalıdır', () => {
    const migrationFilePath = path.join(
      process.cwd(),
      'supabase/migrations/20260728000004_tenant_rpc_functions_sec102.sql',
    )
    expect(fs.existsSync(migrationFilePath)).toBe(true)

    const sqlContent = fs.readFileSync(migrationFilePath, 'utf8')
    expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.delete_receipt_transaction(uuid);')
    expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.delete_z_report_transaction(uuid);')
    expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.delete_supplier_transaction(uuid);')
  })

  it('RPC parametre isimleri frontend API rotaları ile uyumlu olmalıdır', () => {
    const deleteReceiptRoute = path.join(process.cwd(), 'src/app/api/delete-receipt/route.ts')
    const deleteZReportRoute = path.join(process.cwd(), 'src/app/api/delete-z-report/route.ts')
    const tedarikcilerPage = path.join(process.cwd(), 'src/app/dashboard/tedarikciler/page.tsx')

    const receiptContent = fs.readFileSync(deleteReceiptRoute, 'utf8')
    expect(receiptContent).toContain('p_batch_id: batch_id')

    const zReportContent = fs.readFileSync(deleteZReportRoute, 'utf8')
    expect(zReportContent).toContain('p_batch_id: batch_id')

    const tedarikcilerContent = fs.readFileSync(tedarikcilerPage, 'utf8')
    expect(tedarikcilerContent).toContain('p_transaction_id: trx.id')
  })

  it('kira tahsilatı tenant-scoped RPC imzasını kullanmalıdır', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20260801211530_fix_rpc_lint_and_rent_signature.sql',
    )
    const investmentHookPath = path.join(process.cwd(), 'src/features/investments/hooks/useInvestmentsData.ts')
    const migration = fs.readFileSync(migrationPath, 'utf8')
    const investmentHook = fs.readFileSync(investmentHookPath, 'utf8')

    expect(migration).toContain('p_organization_id uuid')
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.process_investment_rent(uuid, uuid, numeric);')
    expect(investmentHook).toContain('p_organization_id: activeOrg?.id')
  })

  it('kaynak kodda çağrılan her RPC adı ve parametreleri son göç imzalarıyla uyumlu olmalıdır', () => {
    const sourceFiles = collectFiles(path.join(process.cwd(), 'src'), new Set(['.ts', '.tsx']))
    const migrationFiles = collectFiles(path.join(process.cwd(), 'supabase/migrations'), new Set(['.sql']))
    const definitions = collectFinalSqlFunctionDefinitions(migrationFiles)
    const calls = collectLiteralRpcCalls(sourceFiles)

    const mismatches = calls.flatMap((call) => {
      const matchingDefinition = definitions
        .get(call.name)
        ?.some((definition) =>
          call.parameterNames.every((parameterName) => definition.parameterNames.has(parameterName)),
        )
      return matchingDefinition ? [] : [`${call.source} ${call.name}(${call.parameterNames.join(', ')})`]
    })

    expect(mismatches).toEqual([])
  })
})
