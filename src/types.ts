export type Product = {
  id: string
  name: string
  parentCategory: string
  subcategory: string
  brand: string
  category: string
  price: number
  oldPrice: number | null
  description: string
  imageUrl: string | null
  stock: number
  unavailable: boolean
  hideWhenOutOfStock: boolean
  active: boolean
  createdAt: string
}

export type ProductInput = {
  name: string
  parentCategory: string
  subcategory: string
  brand: string
  category: string
  price: number
  oldPrice: number | null
  description: string
  imageUrl: string | null
  stock: number
  unavailable: boolean
  hideWhenOutOfStock: boolean
}
