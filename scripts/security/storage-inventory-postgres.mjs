const BEGIN_READ_ONLY = 'BEGIN TRANSACTION READ ONLY'
const SET_STATEMENT_TIMEOUT = "SET LOCAL statement_timeout = '30s'"
const SHOW_READ_ONLY = 'SHOW transaction_read_only'

const BUCKETS_QUERY = `
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;
`.trim()

const OBJECTS_QUERY = `
SELECT bucket_id,
       name,
       CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END AS size_bytes,
       updated_at
FROM storage.objects
WHERE ($1::text IS NULL)
   OR bucket_id > $1
   OR (bucket_id = $1 AND name > $2)
ORDER BY bucket_id, name
LIMIT $3;
`.trim()

const REFERENCES_QUERY = `
SELECT source_table, source_id, organization_id, document_url
FROM (
  SELECT 'investments'::text AS source_table, id::text AS source_id, organization_id::text, document_url FROM public.investments WHERE document_url IS NOT NULL
  UNION ALL
  SELECT 'investment_transactions', id::text, organization_id::text, document_url FROM public.investment_transactions WHERE document_url IS NOT NULL
  UNION ALL
  SELECT 'sales', id::text, organization_id::text, document_url FROM public.sales WHERE document_url IS NOT NULL
  UNION ALL
  SELECT 'stock_movements', id::text, organization_id::text, document_url FROM public.stock_movements WHERE document_url IS NOT NULL
) AS document_references
WHERE ($1::text IS NULL)
   OR source_table > $1
   OR (source_table = $1 AND source_id > $2)
ORDER BY source_table, source_id
LIMIT $3;
`.trim()

function validatePageSize(pageSize) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 5000) {
    throw new Error('inventory_page_size_invalid')
  }
}

function normalizeObjectRows(rows) {
  return rows.map((row) => ({
    ...row,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }))
}

async function collectKeysetPages(client, query, pageSize, getCursor, normalizeRows = (rows) => rows) {
  const collected = []
  let cursor = [null, null]

  while (true) {
    const result = await client.query(query, [...cursor, pageSize])
    const rows = normalizeRows(result.rows)
    collected.push(...rows)
    if (rows.length < pageSize) break
    cursor = getCursor(rows.at(-1))
  }

  return collected
}

export async function collectStorageInventoryRows(client, { pageSize }) {
  validatePageSize(pageSize)
  if (!client || typeof client.query !== 'function') throw new Error('inventory_postgres_client_invalid')

  try {
    await client.query(BEGIN_READ_ONLY)
    await client.query(SET_STATEMENT_TIMEOUT)
    const readOnlyResult = await client.query(SHOW_READ_ONLY)
    if (readOnlyResult.rows?.[0]?.transaction_read_only !== 'on') {
      throw new Error('read_only_transaction_required')
    }

    const buckets = (await client.query(BUCKETS_QUERY)).rows
    const objects = await collectKeysetPages(
      client,
      OBJECTS_QUERY,
      pageSize,
      (row) => [row.bucket_id, row.name],
      normalizeObjectRows,
    )
    const references = await collectKeysetPages(client, REFERENCES_QUERY, pageSize, (row) => [
      row.source_table,
      row.source_id,
    ])

    await client.query('COMMIT')
    return { buckets, objects, references }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original failure; rollback errors must not replace its diagnostic code.
    }
    throw error
  }
}
