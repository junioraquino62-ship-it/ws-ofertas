export const categoryHierarchy: Record<string, string[]> = {
  Eletrodomesticos: ['Ventilacao', 'Cozinha', 'Limpeza'],
  Eletronicos: ['Caixas de Som', 'TV e Video', 'Acessorios'],
  Cosmeticos: ['Perfumes', 'Maquiagem', 'Cuidados com a Pele'],
}

export const defaultBrands = [
  'Natura',
  'Avon',
  'Arno',
  'JBL',
  'Samsung',
  'Philips',
  'Outras',
]

export function getSubcategories(parentCategory: string): string[] {
  return categoryHierarchy[parentCategory] ?? []
}
