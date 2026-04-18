import { supabase } from './supabaseClient'
export { isSupabaseEnabled } from './supabaseClient'
import type { Product, ProductInput } from '../types'

// No localhost sempre usa storage local, independente do Supabase configurado
const isLocalMode =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

const storageKey = 'ws-ofertas-products'

const defaultProducts: Product[] = [
  {
    id: crypto.randomUUID(),
    name: 'Smart TV 50" 4K',
    parentCategory: 'Eletronicos',
    subcategory: 'TV e Video',
    brand: 'Samsung',
    category: 'Eletronicos',
    price: 2299,
    oldPrice: 3199,
    description: 'Frete gratis para Sul e Sudeste',
    imageUrl: null,
    stock: 4,
    unavailable: false,
    hideWhenOutOfStock: false,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Air Fryer 5L',
    parentCategory: 'Eletrodomesticos',
    subcategory: 'Cozinha',
    brand: 'Arno',
    category: 'Casa',
    price: 329,
    oldPrice: 459,
    description: 'Cupom extra de 10% ate meia-noite',
    imageUrl: null,
    stock: 7,
    unavailable: false,
    hideWhenOutOfStock: false,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Kit Inverno Urbano',
    parentCategory: 'Cosmeticos',
    subcategory: 'Perfumes',
    brand: 'Natura',
    category: 'Moda',
    price: 189,
    oldPrice: 279,
    description: '3 pecas com troca gratis em 30 dias',
    imageUrl: null,
    stock: 0,
    unavailable: true,
    hideWhenOutOfStock: true,
    active: true,
    createdAt: new Date().toISOString(),
  },
]

type ProductRow = {
  id: string
  name: string
  parent_category?: string
  subcategory?: string
  brand?: string
  category: string
  price: number
  old_price: number | null
  description: string
  image_url?: string | null
  stock?: number
  unavailable?: boolean
  hide_when_out_of_stock?: boolean
  active: boolean
  created_at: string
}

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    parentCategory: row.parent_category ?? 'Outros',
    subcategory: row.subcategory ?? row.category,
    brand: row.brand ?? 'Outras',
    category: row.category,
    price: row.price,
    oldPrice: row.old_price,
    description: row.description,
    imageUrl: row.image_url ?? null,
    stock: row.stock ?? 10,
    unavailable: row.unavailable ?? false,
    hideWhenOutOfStock: row.hide_when_out_of_stock ?? false,
    active: row.active,
    createdAt: row.created_at,
  }
}

function toRowInput(product: ProductInput) {
  return {
    name: product.name,
    parent_category: product.parentCategory,
    subcategory: product.subcategory,
    brand: product.brand,
    category: product.category,
    price: product.price,
    old_price: product.oldPrice,
    description: product.description,
    image_url: product.imageUrl,
    stock: product.stock,
    unavailable: product.unavailable,
    hide_when_out_of_stock: product.hideWhenOutOfStock,
    active: true,
  }
}

function toRowUpdateInput(product: ProductInput) {
  return {
    name: product.name,
    parent_category: product.parentCategory,
    subcategory: product.subcategory,
    brand: product.brand,
    category: product.category,
    price: product.price,
    old_price: product.oldPrice,
    description: product.description,
    image_url: product.imageUrl,
    stock: product.stock,
    unavailable: product.unavailable,
    hide_when_out_of_stock: product.hideWhenOutOfStock,
  }
}

function getLocalProducts(): Product[] {
  const raw = localStorage.getItem(storageKey)
  if (!raw) {
    localStorage.setItem(storageKey, JSON.stringify(defaultProducts))
    return defaultProducts
  }

  try {
    const parsed = JSON.parse(raw) as Array<
      Product & {
        imageUrl?: string | null
        parentCategory?: string
        subcategory?: string
        brand?: string
        stock?: number
        unavailable?: boolean
        hideWhenOutOfStock?: boolean
      }
    >
    return parsed.map((item) => ({
      ...item,
      imageUrl: item.imageUrl ?? null,
      parentCategory: item.parentCategory ?? 'Outros',
      subcategory: item.subcategory ?? item.category,
      brand: item.brand ?? 'Outras',
      stock: item.stock ?? 10,
      unavailable: item.unavailable ?? false,
      hideWhenOutOfStock: item.hideWhenOutOfStock ?? false,
    }))
  } catch {
    localStorage.setItem(storageKey, JSON.stringify(defaultProducts))
    return defaultProducts
  }
}

function saveLocalProducts(products: Product[]) {
  localStorage.setItem(storageKey, JSON.stringify(products))
}

export async function listProducts(): Promise<Product[]> {
  if (!supabase || isLocalMode) {
    return getLocalProducts().sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    )
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapRow(row as ProductRow))
}

export async function createProduct(input: ProductInput): Promise<void> {
  if (!supabase || isLocalMode) {
    const next: Product = {
      id: crypto.randomUUID(),
      ...input,
      active: true,
      createdAt: new Date().toISOString(),
    }
    const products = getLocalProducts()
    saveLocalProducts([next, ...products])
    return
  }

  const { error } = await supabase.from('products').insert(toRowInput(input))
  if (!error) {
    return
  }

  const normalizedError = error.message.toLowerCase()
  if (
    [
      'image_url',
      'parent_category',
      'subcategory',
      'brand',
      'stock',
      'unavailable',
      'hide_when_out_of_stock',
    ].some((fragment) => normalizedError.includes(fragment))
  ) {
    const fallbackInput = {
      name: input.name,
      category: input.category,
      price: input.price,
      old_price: input.oldPrice,
      description: input.description,
      active: true,
    }
    const { error: fallbackError } = await supabase
      .from('products')
      .insert(fallbackInput)
    if (fallbackError) {
      throw new Error(fallbackError.message)
    }
    return
  }

  throw new Error(error.message)
}

export async function toggleProductActive(
  id: string,
  active: boolean,
): Promise<void> {
  if (!supabase || isLocalMode) {
    const products = getLocalProducts().map((item) =>
      item.id === id ? { ...item, active } : item,
    )
    saveLocalProducts(products)
    return
  }

  const { error } = await supabase.from('products').update({ active }).eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<void> {
  if (!supabase || isLocalMode) {
    const products = getLocalProducts().map((item) =>
      item.id === id ? { ...item, ...input } : item,
    )
    saveLocalProducts(products)
    return
  }

  const { error } = await supabase
    .from('products')
    .update(toRowUpdateInput(input))
    .eq('id', id)

  if (!error) {
    return
  }

  if (
    [
      'image_url',
      'parent_category',
      'subcategory',
      'brand',
      'stock',
      'unavailable',
      'hide_when_out_of_stock',
    ].some((fragment) => error.message.toLowerCase().includes(fragment))
  ) {
    const fallbackInput = {
      name: input.name,
      category: input.category,
      price: input.price,
      old_price: input.oldPrice,
      description: input.description,
    }
    const { error: fallbackError } = await supabase
      .from('products')
      .update(fallbackInput)
      .eq('id', id)
    if (fallbackError) {
      throw new Error(fallbackError.message)
    }
    return
  }

  throw new Error(error.message)
}

export async function deleteProduct(id: string): Promise<void> {
  if (!supabase || isLocalMode) {
    const products = getLocalProducts().filter((item) => item.id !== id)
    saveLocalProducts(products)
    return
  }

  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function loginAdmin(email: string, password: string): Promise<void> {
  if (!supabase) {
    return
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(error.message)
  }
}

export async function logoutAdmin(): Promise<void> {
  if (!supabase) {
    return
  }
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

export async function isAdminLoggedIn(): Promise<boolean> {
  if (!supabase) {
    return true
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data.session)
}
