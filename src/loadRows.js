// Load complete metadata for the pages' client-side search and ownership checks.
// Each callback creates a fresh ordered query; server limits may shorten any batch.
export async function loadRows(makeQuery, key, cancelled) {
  const rows = []
  const seen = new Set()
  let total

  try {
    do {
      if (cancelled()) return { data: null, error: null }
      const { data, error, count } = await makeQuery(total === undefined ? { count: 'exact' } : {})
        .range(rows.length, rows.length + 499)
      if (cancelled()) return { data: null, error: null }
      if (error) return { data: null, error }
      if (total === undefined) {
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Could not verify the result count. Refresh to retry.')
        total = count
      }
      if (!data.length && rows.length < total) throw new Error('Results changed while loading. Refresh to retry.')
      for (const row of data) {
        if (seen.has(row[key])) throw new Error('Results changed while loading. Refresh to retry.')
        seen.add(row[key])
        rows.push(row)
      }
      if (rows.length > total) throw new Error('Results changed while loading. Refresh to retry.')
    } while (rows.length < total)
    return { data: rows, error: null }
  } catch (error) {
    return { data: null, error }
  }
}
