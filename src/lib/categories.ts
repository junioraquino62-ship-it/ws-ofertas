const categoryStorageKey = 'ws-ofertas-categories'

const defaultCategories = ['Eletronicos', 'Casa', 'Moda', 'Cosmeticos']

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

function uniqueCategories(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

export function listCategories(): string[] {
  const raw = localStorage.getItem(categoryStorageKey)
  if (!raw) {
    const initial = uniqueCategories(defaultCategories).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
    localStorage.setItem(categoryStorageKey, JSON.stringify(initial))
    return initial
  }

  try {
    const parsed = JSON.parse(raw) as string[]
    const normalized = uniqueCategories(parsed.map((item) => normalizeCategoryName(item)))
      .filter((item) => item.length > 0)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    localStorage.setItem(categoryStorageKey, JSON.stringify(normalized))
    return normalized
  } catch {
    const fallback = uniqueCategories(defaultCategories).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
    localStorage.setItem(categoryStorageKey, JSON.stringify(fallback))
    return fallback
  }
}

export function createCategory(name: string): string {
  const nextName = normalizeCategoryName(name)
  if (!nextName) {
    throw new Error('Nome de categoria invalido.')
  }

  const current = listCategories()
  const exists = current.some(
    (item) => item.toLocaleLowerCase('pt-BR') === nextName.toLocaleLowerCase('pt-BR'),
  )

  if (exists) {
    throw new Error('Categoria ja cadastrada.')
  }

  const updated = [...current, nextName].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  localStorage.setItem(categoryStorageKey, JSON.stringify(updated))
  return nextName
}

export function deleteCategory(name: string): void {
  const current = listCategories()
  const updated = current.filter(
    (item) => item.toLocaleLowerCase('pt-BR') !== name.toLocaleLowerCase('pt-BR'),
  )
  localStorage.setItem(categoryStorageKey, JSON.stringify(updated))
}
