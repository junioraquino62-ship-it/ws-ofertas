import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Autoplay, Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import logoLoja from './assets/logo-loja.png'
import { listBanners, saveBanners, type BannerItem } from './lib/banners'
import {
  adminEmail,
  isLocalAdminLoggedIn,
  loginLocalAdmin,
  logoutLocalAdmin,
} from './lib/accounts'
import { categoryHierarchy, defaultBrands, getSubcategories } from './lib/taxonomy'
import {
  createProduct,
  deleteProduct,
  isAdminLoggedIn,
  isSupabaseEnabled,
  listProducts,
  loginAdmin,
  logoutAdmin,
  toggleProductActive,
  updateProduct,
} from './lib/catalog'
import {
  getAuthUser,
  getUserProfile,
  onAuthStateChange,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOut as signOutUser,
  updateUserProfile,
  type UserProfile,
} from './lib/auth'
import type { Product, ProductInput } from './types'
import type { User } from '@supabase/supabase-js'

type Tab = 'vitrine' | 'admin' | 'account'

type CartItem = {
  productId: string
  name: string
  price: number
  imageUrl: string | null
  quantity: number
  brand: string
  category: string
}

type PaymentMethod =
  | 'mercado_pago'
  | 'pix_whatsapp'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'dinheiro'

type OrderItem = {
  productId: string
  name: string
  price: number
  quantity: number
}

type Order = {
  id: string
  userEmail: string | null
  customerName: string
  customerPhone: string
  customerAddress: string
  total: number
  createdAt: string
  paymentMethod: PaymentMethod
  paymentInstallments?: number | null
  paymentNote?: string | null
  items: OrderItem[]
  status:
    | 'Pendente'
    | 'Finalizado'
    | 'Aguardando pagamento'
    | 'Em separacao'
    | 'Em transporte'
    | 'Entregue'
}

// Usa auth local (localStorage) apenas quando o Supabase nao estiver configurado
const useLocalAuth = !isSupabaseEnabled

const orderHistoryStorageKey = 'ws-ofertas-order-history'
const localUserAccountsStorageKey = 'ws-ofertas-user-accounts'
const localUserSessionStorageKey = 'ws-ofertas-user-session'

type LocalUserAccount = {
  email: string
  password: string
  name: string
  phone?: string
  address?: string
}

function loadStoredOrders(): Order[] {
  const raw = localStorage.getItem(orderHistoryStorageKey)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as Order[]
  } catch {
    return []
  }
}

function saveStoredOrder(order: Order) {
  const current = loadStoredOrders()
  localStorage.setItem(orderHistoryStorageKey, JSON.stringify([order, ...current]))
}

function createLocalAuthUser(email: string): User {
  return {
    id: `local-${email.toLowerCase()}`,
    email,
  } as User
}

function loadLocalUserAccounts(): LocalUserAccount[] {
  const raw = localStorage.getItem(localUserAccountsStorageKey)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as LocalUserAccount[]
  } catch {
    return []
  }
}

function saveLocalUserAccounts(accounts: LocalUserAccount[]) {
  localStorage.setItem(localUserAccountsStorageKey, JSON.stringify(accounts))
}

function getLocalAuthUser(): User | null {
  const email = localStorage.getItem(localUserSessionStorageKey)
  if (!email) {
    return null
  }

  return createLocalAuthUser(email)
}

function setLocalAuthUser(email: string) {
  localStorage.setItem(localUserSessionStorageKey, email)
}

function clearLocalAuthUser() {
  localStorage.removeItem(localUserSessionStorageKey)
}

function registerLocalUser(account: LocalUserAccount) {
  const accounts = loadLocalUserAccounts()
  const normalizedEmail = account.email.toLowerCase()
  const alreadyExists = accounts.some((item) => item.email.toLowerCase() === normalizedEmail)
  if (alreadyExists) {
    throw new Error('Este e-mail ja esta cadastrado.')
  }

  saveLocalUserAccounts([
    ...accounts,
    {
      ...account,
      email: normalizedEmail,
    },
  ])
}

function signInLocalUser(email: string, password: string): User {
  const normalizedEmail = email.toLowerCase()
  const account = loadLocalUserAccounts().find(
    (item) => item.email.toLowerCase() === normalizedEmail,
  )

  if (!account || account.password !== password) {
    throw new Error('E-mail ou senha invalidos.')
  }

  setLocalAuthUser(account.email)
  return createLocalAuthUser(account.email)
}

function getLocalUserProfile(email: string): UserProfile | null {
  const account = loadLocalUserAccounts().find(
    (item) => item.email.toLowerCase() === email.toLowerCase(),
  )

  if (!account) {
    return null
  }

  const now = new Date().toISOString()
  return {
    id: `local-${account.email.toLowerCase()}`,
    email: account.email,
    name: account.name,
    phone: account.phone,
    address: account.address,
    created_at: now,
    updated_at: now,
  }
}

function updateLocalUserProfile(
  email: string,
  updates: Partial<Pick<UserProfile, 'name' | 'phone' | 'address'>>,
) {
  const normalizedEmail = email.toLowerCase()
  const accounts = loadLocalUserAccounts()
  const nextAccounts = accounts.map((item) => {
    if (item.email.toLowerCase() !== normalizedEmail) {
      return item
    }

    return {
      ...item,
      name: updates.name ?? item.name,
      phone: updates.phone,
      address: updates.address,
    }
  })

  saveLocalUserAccounts(nextAccounts)
}

function isOrderInProgress(order: Order) {
  return (
    order.status === 'Pendente'
    || order.status === 'Aguardando pagamento'
    || order.status === 'Em separacao'
    || order.status === 'Em transporte'
  )
}

function formatPaymentMethodLabel(order: Order) {
  if (order.paymentMethod === 'cartao_credito') {
    return order.paymentInstallments && order.paymentInstallments > 1
      ? `Cartao de credito (${order.paymentInstallments}x)`
      : 'Cartao de credito (a vista)'
  }

  if (order.paymentMethod === 'cartao_debito') {
    return 'Cartao de debito'
  }

  if (order.paymentMethod === 'dinheiro') {
    return 'Dinheiro'
  }

  if (order.paymentMethod === 'pix' || order.paymentMethod === 'pix_whatsapp') {
    return 'Pix'
  }

  return 'Cartao/Pix (Mercado Pago)'
}

type AdminPanelTab = 'overview' | 'products' | 'banners'

type ShippingEstimate = {
  region: string
  deadlineDays: number
  fee: number
}

const emptyForm: ProductInput = {
  name: '',
  parentCategory: 'Cosmeticos',
  subcategory: 'Perfumes',
  brand: 'Natura',
  category: '',
  price: 0,
  oldPrice: null,
  description: '',
  imageUrl: null,
  stock: 0,
  unavailable: false,
  hideWhenOutOfStock: true,
}

const maxImageSizeInBytes = 2 * 1024 * 1024

const emptyBannerForm = {
  title: '',
  subtitle: '',
  cta: '',
  imageUrl: '',
  targetType: 'category' as BannerItem['targetType'],
  targetValue: 'Cosmeticos',
  isActive: true,
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Arquivo invalido'))
    }
    reader.onerror = () => reject(new Error('Falha ao ler a imagem'))
    reader.readAsDataURL(file)
  })
}

function fileToWebpDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const src = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const maxWidth = 1440
      const ratio = Math.min(1, maxWidth / image.width)
      const width = Math.max(1, Math.round(image.width * ratio))
      const height = Math.max(1, Math.round(image.height * ratio))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(src)
        reject(new Error('Nao foi possivel converter imagem'))
        return
      }

      context.drawImage(image, 0, 0, width, height)
      const result = canvas.toDataURL('image/webp', 0.85)
      URL.revokeObjectURL(src)
      resolve(result)
    }

    image.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error('Arquivo de imagem invalido'))
    }

    image.src = src
  })
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) {
    return digits
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function estimateShipping(cepDigits: string, price: number): ShippingEstimate {
  const firstDigit = Number(cepDigits[0])

  if (Number.isNaN(firstDigit)) {
    return { region: 'Brasil', deadlineDays: 7, fee: 24.9 }
  }

  let region = 'Brasil'
  let deadlineDays = 7
  let fee = 24.9

  if (firstDigit <= 2) {
    region = 'Sudeste'
    deadlineDays = 3
    fee = 14.9
  } else if (firstDigit <= 4) {
    region = 'Sul'
    deadlineDays = 4
    fee = 17.9
  } else if (firstDigit <= 6) {
    region = 'Centro-Oeste'
    deadlineDays = 6
    fee = 21.9
  } else if (firstDigit <= 8) {
    region = 'Nordeste'
    deadlineDays = 8
    fee = 27.9
  } else {
    region = 'Norte'
    deadlineDays = 10
    fee = 33.9
  }

  if (price >= 599) {
    fee = 0
  } else if (price >= 299) {
    fee = Math.max(0, fee - 8)
  }

  return { region, deadlineDays, fee }
}

function App() {
  const bannerSwiperRef = useRef<any>(null)
  const [tab, setTab] = useState<Tab>('vitrine')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userAccount, setUserAccount] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [accountMode, setAccountMode] = useState<'login' | 'register'>('login')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountPhone, setAccountPhone] = useState('')
  const [accountAddress, setAccountAddress] = useState('')
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountLoading, setAccountLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [isLogged, setIsLogged] = useState(false)
  const [credentials, setCredentials] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [form, setForm] = useState<ProductInput>(emptyForm)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedParentCategory, setSelectedParentCategory] = useState('Todas')
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas')
  const [selectedBrand, setSelectedBrand] = useState('Todas')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [adminSearchQuery, setAdminSearchQuery] = useState('')
  const [adminCategoryFilter, setAdminCategoryFilter] = useState('Todas')
  const [adminSubcategoryFilter, setAdminSubcategoryFilter] = useState('Todas')
  const [adminBrandFilter, setAdminBrandFilter] = useState('Todas')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [cartStep, setCartStep] = useState<'items' | 'form'>('items')
  const [stockToast, setStockToast] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [cardInstallments, setCardInstallments] = useState(1)
  const [cashChangeFor, setCashChangeFor] = useState('')
  const [checkoutForm, setCheckoutForm] = useState({
    name: '',
    phone: '',
    address: '',
  })
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [cepInput, setCepInput] = useState('')
  const [shippingResult, setShippingResult] = useState<ShippingEstimate | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [banners, setBanners] = useState<BannerItem[]>([])
  const [bannerForm, setBannerForm] = useState(emptyBannerForm)
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null)
  const [adminPanelTab, setAdminPanelTab] = useState<AdminPanelTab>('overview')

  async function loadProducts() {
    setLoading(true)
    setError(null)
    try {
      const data = await listProducts()
      setProducts(data)
      setBanners(listBanners())
    } catch (err) {
      setError('Nao foi possivel carregar os produtos.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
    setAllOrders(loadStoredOrders())
    if (isSupabaseEnabled && !useLocalAuth) {
      isAdminLoggedIn()
        .then((logged) => setIsLogged(logged))
        .catch(() => setIsLogged(false))

      getAuthUser()
        .then((user) => setUserAccount(user))
        .catch(() => setUserAccount(null))

      const { data } = onAuthStateChange((_, session) => {
        setUserAccount(session?.user ?? null)

        if (!session?.user) {
          setIsLogged(false)
          return
        }

        isAdminLoggedIn()
          .then((logged) => setIsLogged(logged))
          .catch(() => setIsLogged(false))
      })

      const handleVisibilityChangeSupabase = () => {
        if (document.visibilityState === 'visible') setAllOrders(loadStoredOrders())
      }
      document.addEventListener('visibilitychange', handleVisibilityChangeSupabase)

      return () => {
        data.subscription.unsubscribe()
        document.removeEventListener('visibilitychange', handleVisibilityChangeSupabase)
      }
    }

    setIsLogged(isLocalAdminLoggedIn())
    setUserAccount(getLocalAuthUser())

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        setAllOrders(loadStoredOrders())
      }
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key === 'ws-ofertas-order-history') {
        setAllOrders(loadStoredOrders())
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('storage', handleStorageChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  useEffect(() => {
    if (userAccount?.id && isSupabaseEnabled && !useLocalAuth) {
      setProfileLoading(true)
      getUserProfile(userAccount.id)
        .then((profile) => {
          setUserProfile(profile)
        })
        .catch((error) => {
          console.error('Erro ao carregar perfil:', error)
        })
        .finally(() => {
          setProfileLoading(false)
        })
    } else if (userAccount?.email) {
      setUserProfile(getLocalUserProfile(userAccount.email))
    } else {
      setUserProfile(null)
    }
  }, [isSupabaseEnabled, userAccount?.email, userAccount?.id])

  useEffect(() => {
    if (!isSupabaseEnabled || useLocalAuth) {
      return
    }

    if (!userAccount?.id) {
      setIsLogged(false)
      return
    }

    isAdminLoggedIn()
      .then((logged) => setIsLogged(logged))
      .catch(() => setIsLogged(false))
  }, [userAccount?.id])

  useEffect(() => {
    if (!userAccount?.email) {
      setOrders([])
      return
    }

    const userOrders = loadStoredOrders().filter((order) => order.userEmail === userAccount.email)
    setOrders(userOrders)
  }, [userAccount?.email])

  const activeProducts = useMemo(
    () => products.filter((product) => product.active),
    [products],
  )

  const ongoingOrders = useMemo(
    () => orders.filter((order) => isOrderInProgress(order)),
    [orders],
  )

  const completedOrders = useMemo(
    () => orders.filter((order) => !isOrderInProgress(order)),
    [orders],
  )

  const availableBrands = useMemo(() => {
    const merged = [...defaultBrands, ...products.map((product) => product.brand)]
    return Array.from(new Set(merged)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [products])

  const allSubcategories = useMemo(
    () => Array.from(new Set(products.map((product) => product.subcategory))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [products],
  )

  const availableSubcategoryOptions = useMemo(() => {
    if (selectedParentCategory === 'Todas') {
      return allSubcategories
    }

    const fromHierarchy = getSubcategories(selectedParentCategory)
    const fromProducts = products
      .filter((product) => product.parentCategory === selectedParentCategory)
      .map((product) => product.subcategory)

    return Array.from(new Set([...fromHierarchy, ...fromProducts])).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
  }, [allSubcategories, products, selectedParentCategory])

  const adminSubcategoryOptions = useMemo(() => {
    const fromHierarchy = getSubcategories(form.parentCategory)
    const fromProducts = products
      .filter((product) => product.parentCategory === form.parentCategory)
      .map((product) => product.subcategory)

    const merged = Array.from(
      new Set([
        ...fromHierarchy,
        ...fromProducts,
        form.subcategory,
        ...allSubcategories,
      ].filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    return merged.length > 0 ? merged : ['Geral']
  }, [allSubcategories, form.parentCategory, form.subcategory, products])

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('pt-BR')
    if (!q) {
      return []
    }

    const options = Array.from(
      new Set([
        ...products.map((product) => product.name),
        ...products.map((product) => product.subcategory),
        ...products.map((product) => product.brand),
      ]),
    )

    return options
      .filter((item) => item.toLocaleLowerCase('pt-BR').includes(q))
      .slice(0, 8)
  }, [products, searchQuery])

  const filteredProducts = useMemo(() => {
    let result = activeProducts

    if (selectedParentCategory !== 'Todas') {
      result = result.filter(
        (product) => product.parentCategory === selectedParentCategory,
      )
    }

    if (selectedSubcategory !== 'Todas') {
      result = result.filter((product) => product.subcategory === selectedSubcategory)
    }

    if (selectedBrand !== 'Todas') {
      result = result.filter((product) => product.brand === selectedBrand)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLocaleLowerCase('pt-BR')
      const exactName = (value: string) => value.toLocaleLowerCase('pt-BR') === q
      result = result.filter(
        (product) =>
          product.name.toLocaleLowerCase('pt-BR').includes(q) ||
          product.subcategory.toLocaleLowerCase('pt-BR').includes(q) ||
          product.brand.toLocaleLowerCase('pt-BR').includes(q) ||
          product.description.toLocaleLowerCase('pt-BR').includes(q) ||
          exactName(product.name),
      )
    }

    result = result.filter((product) => {
      if (product.stock > 0) {
        return true
      }

      if (!product.hideWhenOutOfStock) {
        return true
      }

      const q = searchQuery.trim().toLocaleLowerCase('pt-BR')
      if (!q) {
        return false
      }

      return product.name.toLocaleLowerCase('pt-BR') === q
    })

    return result
  }, [activeProducts, searchQuery, selectedBrand, selectedParentCategory, selectedSubcategory])

  const adminProducts = useMemo(() => {
    const q = adminSearchQuery.trim().toLocaleLowerCase('pt-BR')
    if (!q) {
      return products
    }

    return products.filter((product) =>
      [
        product.name,
        product.brand,
        product.parentCategory,
        product.subcategory,
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(q),
    )
  }, [adminSearchQuery, products])

  const adminCategoryOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.parentCategory))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [products],
  )

  const adminSubcategoryFilterOptions = useMemo(() => {
    const source =
      adminCategoryFilter === 'Todas'
        ? products
        : products.filter((product) => product.parentCategory === adminCategoryFilter)

    return Array.from(new Set(source.map((product) => product.subcategory))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
  }, [adminCategoryFilter, products])

  const adminBrandFilterOptions = useMemo(() => {
    const source =
      adminCategoryFilter === 'Todas'
        ? products
        : products.filter((product) => product.parentCategory === adminCategoryFilter)

    return Array.from(new Set(source.map((product) => product.brand))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    )
  }, [adminCategoryFilter, products])

  const adminFilteredProducts = useMemo(() => {
    let result = adminProducts

    if (adminCategoryFilter !== 'Todas') {
      result = result.filter((product) => product.parentCategory === adminCategoryFilter)
    }

    if (adminSubcategoryFilter !== 'Todas') {
      result = result.filter((product) => product.subcategory === adminSubcategoryFilter)
    }

    if (adminBrandFilter !== 'Todas') {
      result = result.filter((product) => product.brand === adminBrandFilter)
    }

    return result
  }, [adminBrandFilter, adminCategoryFilter, adminProducts, adminSubcategoryFilter])

  const adminProductsByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>()

    for (const product of adminFilteredProducts) {
      const key = product.parentCategory || 'Sem categoria'
      const current = groups.get(key) ?? []
      current.push(product)
      groups.set(key, current)
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([category, items]) => ({
        category,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      }))
  }, [adminFilteredProducts])

  const adminStats = useMemo(() => {
    const total = products.length
    const active = products.filter((product) => product.active).length
    const unavailable = products.filter((product) => product.unavailable).length
    const lowStock = products.filter(
      (product) => !product.unavailable && product.stock > 0 && product.stock <= 3,
    ).length

    return { total, active, unavailable, lowStock }
  }, [products])

  const salesInsights = useMemo(() => {
    const productById = new Map(products.map((product) => [product.id, product]))

    const aggregateBy = (resolver: (product: Product | undefined) => string) => {
      const buckets = new Map<string, {
        soldItems: number
        revenue: number
        orderIds: Set<string>
      }>()

      for (const order of allOrders) {
        for (const item of order.items) {
          const product = productById.get(item.productId)
          const key = resolver(product)
          const current = buckets.get(key) ?? {
            soldItems: 0,
            revenue: 0,
            orderIds: new Set<string>(),
          }

          current.soldItems += item.quantity
          current.revenue += item.price * item.quantity
          current.orderIds.add(order.id)
          buckets.set(key, current)
        }
      }

      return Array.from(buckets.entries())
        .map(([name, data]) => ({
          name,
          soldItems: data.soldItems,
          revenue: data.revenue,
          orders: data.orderIds.size,
        }))
        .sort((a, b) => {
          if (b.soldItems !== a.soldItems) {
            return b.soldItems - a.soldItems
          }
          return b.revenue - a.revenue
        })
    }

    const byCategory = aggregateBy((product) => product?.parentCategory ?? 'Sem categoria')
    const bySubcategory = aggregateBy((product) => product?.subcategory ?? 'Sem tipo')
    const byBrand = aggregateBy((product) => product?.brand ?? 'Sem marca')
    const totalSoldItems = allOrders.reduce(
      (sum, order) => sum + order.items.reduce((sub, item) => sub + item.quantity, 0),
      0,
    )
    const totalRevenue = allOrders.reduce((sum, order) => sum + order.total, 0)

    return {
      byCategory,
      bySubcategory,
      byBrand,
      totalSoldItems,
      totalRevenue,
      totalOrders: allOrders.length,
    }
  }, [allOrders, products])

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems],
  )

  const cartTotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity * item.price, 0),
    [cartItems],
  )

  const activeBanners = useMemo(
    () => banners.filter((banner) => banner.isActive),
    [banners],
  )

  function applyStoreFilters(params: {
    parentCategory?: string
    subcategory?: string
    brand?: string
    search?: string
  }) {
    setTab('vitrine')
    setSelectedParentCategory(params.parentCategory ?? 'Todas')
    setSelectedSubcategory(params.subcategory ?? 'Todas')
    setSelectedBrand(params.brand ?? 'Todas')
    setSearchQuery(params.search ?? '')
    setIsMenuOpen(false)
  }

  function handleBannerClick(banner: BannerItem) {
    if (banner.targetType === 'category') {
      applyStoreFilters({ parentCategory: banner.targetValue })
      return
    }

    const targetProduct = products.find((product) => product.id === banner.targetValue)
    if (targetProduct) {
      setTab('vitrine')
      handleOpenProduct(targetProduct)
      return
    }

    applyStoreFilters({ search: banner.targetValue })
  }

  async function handleBannerImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem valida para o banner.')
      event.target.value = ''
      return
    }

    try {
      const webpDataUrl = await fileToWebpDataUrl(file)
      setBannerForm((prev) => ({ ...prev, imageUrl: webpDataUrl }))
      setError(null)
    } catch {
      setError('Nao foi possivel converter a imagem do banner para WebP.')
    } finally {
      event.target.value = ''
    }
  }

  function handleSaveBanner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!bannerForm.title || !bannerForm.subtitle || !bannerForm.cta || !bannerForm.targetValue) {
      setError('Preencha titulo, subtitulo, CTA e destino do banner.')
      return
    }

    const nextBanner: BannerItem = {
      id: editingBannerId ?? crypto.randomUUID(),
      ...bannerForm,
    }

    const updated = editingBannerId
      ? banners.map((banner) => (banner.id === editingBannerId ? nextBanner : banner))
      : [nextBanner, ...banners]

    setBanners(updated)
    saveBanners(updated)
    setBannerForm(emptyBannerForm)
    setEditingBannerId(null)
    setError(null)
  }

  function handleEditBanner(banner: BannerItem) {
    setBannerForm({
      title: banner.title,
      subtitle: banner.subtitle,
      cta: banner.cta,
      imageUrl: banner.imageUrl,
      targetType: banner.targetType,
      targetValue: banner.targetValue,
      isActive: banner.isActive,
    })
    setEditingBannerId(banner.id)
    setAdminPanelTab('banners')
  }

  function handleToggleBannerActive(id: string, nextActive: boolean) {
    const updated = banners.map((banner) =>
      banner.id === id ? { ...banner, isActive: nextActive } : banner,
    )
    setBanners(updated)
    saveBanners(updated)
  }

  function handleDeleteBanner(id: string) {
    const updated = banners.filter((banner) => banner.id !== id)
    setBanners(updated)
    saveBanners(updated)
    if (editingBannerId === id) {
      setEditingBannerId(null)
      setBannerForm(emptyBannerForm)
    }
  }

  function handleAddToCart(product: Product) {
    if (product.unavailable || product.stock <= 0) {
      setError('Produto indisponivel no momento.')
      return
    }

    setCartItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id)
      if (existing) {
        if (existing.quantity >= product.stock) {
          return prev
        }
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          quantity: 1,
          brand: product.brand,
          category: product.subcategory || product.category,
        },
      ]
    })
    setIsCartOpen(true)
  }

  function handleChangeCartQuantity(productId: string, delta: number) {
    const product = products.find((p) => p.id === productId)
    const maxStock = product?.stock ?? Infinity
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item
          const next = item.quantity + delta
          if (delta > 0 && item.quantity >= maxStock) {
            setStockToast(true)
            setTimeout(() => setStockToast(false), 2000)
            return item
          }
          return { ...item, quantity: Math.min(next, maxStock) }
        })
        .filter((item) => item.quantity > 0),
    )
  }

  function handleRemoveFromCart(productId: string) {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId))
  }

  function handleOpenProduct(product: Product) {
    setSelectedProduct(product)
    setCepInput('')
    setShippingResult(null)
    setShippingError(null)
  }

  function handleCloseProduct() {
    setSelectedProduct(null)
    setCepInput('')
    setShippingResult(null)
    setShippingError(null)
  }

  function handleCalculateShipping() {
    if (!selectedProduct) {
      return
    }

    const digits = cepInput.replace(/\D/g, '')
    if (digits.length !== 8) {
      setShippingResult(null)
      setShippingError('Informe um CEP valido com 8 digitos.')
      return
    }

    const estimate = estimateShipping(digits, selectedProduct.price)
    setShippingResult(estimate)
    setShippingError(null)
  }

  async function handleCheckout() {
    if (cartItems.length === 0) {
      setError('Adicione produtos ao carrinho para finalizar a compra.')
      return
    }

    if (!checkoutForm.name || !checkoutForm.phone || !checkoutForm.address) {
      setError('Preencha nome, telefone e endereco para finalizar.')
      return
    }

    if (paymentMethod === 'cartao_credito' && (cardInstallments < 1 || cardInstallments > 12)) {
      setError('Escolha um parcelamento valido entre 1x e 12x.')
      return
    }

    setError(null)
    setIsCheckingOut(true)

    const payload = {
      customer: {
        name: checkoutForm.name,
        phone: checkoutForm.phone,
        address: checkoutForm.address,
      },
      payment: {
        method: paymentMethod,
        installments: paymentMethod === 'cartao_credito' ? cardInstallments : null,
        cashChangeFor:
          paymentMethod === 'dinheiro' && cashChangeFor.trim()
            ? Number(cashChangeFor.replace(',', '.'))
            : null,
      },
      items: cartItems.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      total: cartTotal,
    }

    const upcomingOrder: Order = {
      id: crypto.randomUUID(),
      userEmail: userAccount?.email ?? null,
      customerName: checkoutForm.name,
      customerPhone: checkoutForm.phone,
      customerAddress: checkoutForm.address,
      total: cartTotal,
      createdAt: new Date().toISOString(),
      paymentMethod,
      paymentInstallments: paymentMethod === 'cartao_credito' ? cardInstallments : null,
      paymentNote:
        paymentMethod === 'dinheiro' && cashChangeFor.trim()
          ? `Troco para ${formatCurrency(Number(cashChangeFor.replace(',', '.')) || 0)}`
          : null,
      items: payload.items,
      status: paymentMethod === 'pix' || paymentMethod === 'pix_whatsapp'
        ? 'Aguardando pagamento'
        : 'Em separacao',
    }

    const checkoutApi = import.meta.env.VITE_CHECKOUT_API_URL?.trim()
    if (
      checkoutApi
      && (
        paymentMethod === 'mercado_pago'
        || paymentMethod === 'cartao_credito'
        || paymentMethod === 'cartao_debito'
      )
    ) {
      try {
        const response = await fetch(checkoutApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          throw new Error('Erro ao criar sessao de pagamento')
        }

        const data = (await response.json()) as { checkoutUrl?: string }
        if (!data.checkoutUrl) {
          throw new Error('Checkout nao retornou URL de pagamento')
        }

        saveStoredOrder(upcomingOrder)
        setAllOrders((previous) => [upcomingOrder, ...previous])
        if (upcomingOrder.userEmail) {
          setOrders((previous) => [upcomingOrder, ...previous])
        }

        window.location.href = data.checkoutUrl
        return
      } catch (err) {
        console.error(err)
        setError('Falha no pagamento online. Use Pix/WhatsApp enquanto configura a API.')
      } finally {
        setIsCheckingOut(false)
      }
      return
    }

    saveStoredOrder(upcomingOrder)
    setAllOrders((previous) => [upcomingOrder, ...previous])
    if (upcomingOrder.userEmail) {
      setOrders((previous) => [upcomingOrder, ...previous])
    }

    setCartItems([])
    setCheckoutForm({ name: '', phone: '', address: '' })
    setCardInstallments(1)
    setCashChangeFor('')
    setIsCartOpen(false)
    setCartStep('items')
    setCheckoutSuccess(true)
    setTimeout(() => setCheckoutSuccess(false), 4000)

    if (!useLocalAuth) {
      const whatsapp = import.meta.env.VITE_WHATSAPP_NUMBER?.replace(/\D/g, '')
      const itemsText = cartItems
        .map((item) => `- ${item.name} x${item.quantity} (${formatCurrency(item.price)})`)
        .join('\n')
      const message = encodeURIComponent(
        [
          'Novo pedido - WS Ofertas e Cosméticos',
          '',
          `Cliente: ${checkoutForm.name}`,
          `Telefone: ${checkoutForm.phone}`,
          `Endereco: ${checkoutForm.address}`,
          '',
          'Itens:',
          itemsText,
          '',
          `Total: ${formatCurrency(cartTotal)}`,
          '',
          `Pagamento: ${formatPaymentMethodLabel(upcomingOrder)}`,
          upcomingOrder.paymentNote ? upcomingOrder.paymentNote : '',
        ].join('\n'),
      )
      const url = whatsapp
        ? `https://wa.me/${whatsapp}?text=${message}`
        : `https://wa.me/?text=${message}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    setIsCheckingOut(false)
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      if (isSupabaseEnabled && !useLocalAuth) {
        await loginAdmin(credentials.email, credentials.password)
      } else {
        loginLocalAdmin(credentials.email, credentials.password)
      }

      setIsLogged(true)
      setCredentials({
        name: '',
        email: '',
        password: '',
      })
      setAdminPanelTab('overview')
      setTab('admin')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Falha no login. Verifique e-mail e senha.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleUserAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAccountError(null)
    setAccountLoading(true)

    try {
      if (accountMode === 'register') {
        if (!accountName.trim()) {
          throw new Error('Nome é obrigatório')
        }
        if (isSupabaseEnabled && !useLocalAuth) {
          await signUpWithEmail(accountEmail, accountPassword, {
            name: accountName.trim(),
            phone: accountPhone.trim() || undefined,
            address: accountAddress.trim() || undefined,
          })
          setAccountError(
            'Cadastro enviado. Verifique seu email e confirme para continuar.',
          )
        } else {
          registerLocalUser({
            email: accountEmail.trim(),
            password: accountPassword,
            name: accountName.trim(),
            phone: accountPhone.trim() || undefined,
            address: accountAddress.trim() || undefined,
          })
          setAccountError('Conta criada com sucesso. Entre para continuar.')
        }
        setAccountMode('login')
        setAccountName('')
        setAccountPhone('')
        setAccountAddress('')
        return
      }

      if (isSupabaseEnabled && !useLocalAuth) {
        await signInWithEmail(accountEmail, accountPassword)

        const hasAdminAccess = await isAdminLoggedIn().catch(() => false)
        setIsLogged(hasAdminAccess)
        setTab(hasAdminAccess ? 'admin' : 'account')
      } else {
        // Se o e-mail for o do admin, autentica no painel admin diretamente
        if (accountEmail.trim().toLowerCase() === adminEmail.toLowerCase()) {
          loginLocalAdmin(accountEmail.trim(), accountPassword)
          setIsLogged(true)
          setAdminPanelTab('overview')
          setTab('admin')
          setAccountEmail('')
          setAccountPassword('')
          return
        }
        const user = signInLocalUser(accountEmail.trim(), accountPassword)
        setUserAccount(user)
        setTab('account')
      }
      setAccountEmail('')
      setAccountPassword('')
    } catch (err) {
      if (err instanceof Error) {
        setAccountError(err.message)
      } else {
        setAccountError('Falha na autenticacao. Verifique e tente novamente.')
      }
    } finally {
      setAccountLoading(false)
    }
  }

  async function handleUpdateProfile(updates: Partial<Pick<UserProfile, 'name' | 'phone' | 'address'>>) {
    if (!userAccount?.email) return

    setProfileLoading(true)
    try {
      if (isSupabaseEnabled && !useLocalAuth) {
        await updateUserProfile(userAccount.id, updates)
        const updatedProfile = await getUserProfile(userAccount.id)
        setUserProfile(updatedProfile)
      } else {
        updateLocalUserProfile(userAccount.email, updates)
        setUserProfile(getLocalUserProfile(userAccount.email))
      }
    } catch (err) {
      if (err instanceof Error) {
        setAccountError(err.message)
      } else {
        setAccountError('Erro ao atualizar perfil')
      }
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleUserLoginWithGoogle() {
    setAccountError(null)
    setAccountLoading(true)
    try {
      if (!isSupabaseEnabled || useLocalAuth) {
        throw new Error('Login com Google requer Supabase configurado. No ambiente de produção (Vercel) estará disponível.')
      }
      await signInWithGoogle()
    } catch (err) {
      if (err instanceof Error) {
        setAccountError(err.message)
      } else {
        setAccountError('Falha ao iniciar o login com Google.')
      }
    } finally {
      setAccountLoading(false)
    }
  }

  async function handleUserSignOut() {
    setAccountError(null)
    setAccountLoading(true)
    try {
      if (isSupabaseEnabled && !useLocalAuth) {
        await signOutUser()
      } else {
        clearLocalAuthUser()
      }
      setUserAccount(null)
      setTab('vitrine')
    } catch (err) {
      if (err instanceof Error) {
        setAccountError(err.message)
      } else {
        setAccountError('Falha ao sair da conta.')
      }
    } finally {
      setAccountLoading(false)
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!form.name || !form.category || !form.price || !form.description) {
      setError('Preencha nome, categoria, preco e descricao.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingProductId) {
        await updateProduct(editingProductId, form)
      } else {
        await createProduct(form)
      }
      setForm(emptyForm)
      setEditingProductId(null)
      await loadProducts()
    } catch {
      setError(
        editingProductId
          ? 'Nao foi possivel atualizar o produto.'
          : 'Nao foi possivel salvar o produto.',
      )
    } finally {
      setSaving(false)
    }
  }

  function handleStartEdit(product: Product) {
    setForm({
      name: product.name,
      parentCategory: product.parentCategory,
      subcategory: product.subcategory,
      brand: product.brand,
      category: product.category,
      price: product.price,
      oldPrice: product.oldPrice,
      description: product.description,
      imageUrl: product.imageUrl,
      stock: product.stock,
      unavailable: product.unavailable,
      hideWhenOutOfStock: product.hideWhenOutOfStock,
    })
    setEditingProductId(product.id)
    setError(null)
    setAdminPanelTab('products')
  }

  function handleCancelEdit() {
    setForm(emptyForm)
    setEditingProductId(null)
    setError(null)
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Escolha um arquivo de imagem valido.')
      event.target.value = ''
      return
    }

    if (file.size > maxImageSizeInBytes) {
      setError('A imagem deve ter no maximo 2 MB.')
      event.target.value = ''
      return
    }

    try {
      const dataUrl = await fileToDataUrl(file)
      setForm((prev) => ({ ...prev, imageUrl: dataUrl }))
      setError(null)
    } catch {
      setError('Nao foi possivel carregar a imagem.')
    } finally {
      event.target.value = ''
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    setSaving(true)
    setError(null)
    try {
      await toggleProductActive(id, active)
      await loadProducts()
    } catch {
      setError('Nao foi possivel atualizar o status do produto.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setSaving(true)
    setError(null)
    try {
      await deleteProduct(id)
      await loadProducts()
    } catch {
      setError('Nao foi possivel remover o produto.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    setSaving(true)
    setError(null)
    try {
      if (isSupabaseEnabled && !useLocalAuth) {
        await logoutAdmin()
      } else {
        logoutLocalAdmin()
      }
      setIsLogged(false)
      setTab('vitrine')
    } catch {
      setError('Nao foi possivel encerrar a sessao.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Navbar fixa no topo */}
      <header className="navbar">
        {isMenuOpen ? (
          <button
            type="button"
            className="nav-hamburger open"
            aria-label="Fechar menu"
            aria-expanded="true"
            aria-controls="nav-drawer"
            onClick={() => setIsMenuOpen(false)}
          >
            <span />
            <span />
            <span />
          </button>
        ) : (
          <button
            type="button"
            className="nav-hamburger"
            aria-label="Abrir menu"
            aria-expanded="false"
            aria-controls="nav-drawer"
            onClick={() => setIsMenuOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
        )}

        <button
          type="button"
          className="navbar-brand"
          onClick={() => applyStoreFilters({})}
        >
          <img className="nav-logo" src={logoLoja} alt="Logo WS Ofertas" />
          <span className="nav-title">WS Ofertas e Cosméticos</span>
        </button>

        <div className="nav-search">
          <svg className="nav-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <input
            className="nav-search-input"
            type="text"
            placeholder="Buscar produtos..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (tab !== 'vitrine') setTab('vitrine')
            }}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setIsSearchFocused(false), 120)
            }}
            aria-label="Buscar produtos"
          />
          {isSearchFocused && searchSuggestions.length > 0 ? (
            <div className="autocomplete-box" role="presentation" aria-label="Sugestoes de busca">
              {searchSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="autocomplete-item"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setSearchQuery(item)
                    setTab('vitrine')
                    setIsSearchFocused(false)
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          {searchQuery ? (
            <button
              type="button"
              className="nav-search-clear"
              aria-label="Limpar busca"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          ) : null}
        </div>

        <nav className="navbar-links" aria-label="Navegacao principal">
          <button
            type="button"
            className={tab === 'vitrine' ? 'nav-link active' : 'nav-link'}
            onClick={() => setTab('vitrine')}
          >
            Vitrine
          </button>
          {isLogged ? (
            <button
              type="button"
              className={tab === 'admin' ? 'nav-link active' : 'nav-link'}
              onClick={() => setTab('admin')}
            >
              Admin
            </button>
          ) : null}
          <button
            type="button"
            className={tab === 'account' ? 'nav-link active' : 'nav-link'}
            onClick={() => setTab('account')}
          >
            {userAccount ? (userAccount.email?.split('@')[0] ?? 'Minha conta') : 'Minha conta'}
          </button>
          {userAccount ? (
            <button
              type="button"
              className="nav-link"
              onClick={handleUserSignOut}
              disabled={accountLoading}
            >
              {accountLoading ? 'Saindo...' : 'Sair'}
            </button>
          ) : null}
        </nav>

        <button
          type="button"
          className="cart-toggle"
          onClick={() => setIsCartOpen((prev) => !prev)}
          aria-label="Abrir carrinho"
        >
          {/* Ícone sacola — visível só no mobile via CSS */}
          <svg className="cart-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <span className="cart-toggle-label">Carrinho</span>
          <span className="cart-badge">{cartCount}</span>
        </button>
      </header>

      {/* Overlay do drawer mobile */}
      {isMenuOpen || isCartOpen ? (
        <div
          className="nav-overlay"
          aria-hidden="true"
          onClick={() => {
            setIsMenuOpen(false)
            setIsCartOpen(false)
          }}
        />
      ) : null}

      {/* Drawer lateral */}
      <aside
        id="nav-drawer"
        className={isMenuOpen ? 'nav-drawer open' : 'nav-drawer'}
        aria-label="Menu lateral"
      >
        <p className="drawer-section">Navegação</p>
        <button
          type="button"
          className={tab === 'vitrine' ? 'drawer-item active' : 'drawer-item'}
          onClick={() => { setTab('vitrine'); setIsMenuOpen(false) }}
        >
          Vitrine
        </button>
        {isLogged ? (
          <button
            type="button"
            className={tab === 'admin' ? 'drawer-item active' : 'drawer-item'}
            onClick={() => { setTab('admin'); setIsMenuOpen(false) }}
          >
            Admin
          </button>
        ) : null}
        <button
          type="button"
          className={tab === 'account' ? 'drawer-item active' : 'drawer-item'}
          onClick={() => { setTab('account'); setIsMenuOpen(false) }}
        >
          Minha conta
        </button>
        {userAccount ? (
          <button
            type="button"
            className="drawer-item"
            onClick={() => {
              setIsMenuOpen(false)
              handleUserSignOut()
            }}
            disabled={accountLoading}
          >
            {accountLoading ? 'Saindo...' : 'Sair da conta'}
          </button>
        ) : null}

      </aside>

      <aside
        className={isCartOpen ? 'cart-drawer open' : 'cart-drawer'}
        aria-label="Carrinho de compras"
      >
        <div className="cart-header">
          <h3>{cartStep === 'form' ? 'Dados da compra' : 'Seu carrinho'}</h3>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (cartStep === 'form') {
                setCartStep('items')
              } else {
                setIsCartOpen(false)
              }
            }}
          >
            {cartStep === 'form' ? 'Voltar' : 'Fechar'}
          </button>
        </div>

        {cartItems.length === 0 ? (
          <p className="loading">Seu carrinho está vazio.</p>
        ) : cartStep === 'items' ? (
          <div className="cart-list">
            {cartItems.map((item) => (
              <div className="cart-item" key={item.productId}>
                {item.imageUrl ? (
                  <img className="cart-item-image" src={item.imageUrl} alt={item.name} />
                ) : (
                  <div className="cart-item-image cart-item-fallback">WS</div>
                )}
                <div className="cart-item-body">
                  <div className="cart-item-info">
                    <strong>{item.name}</strong>
                    <div className="cart-item-meta">
                      {item.brand ? <span>{item.brand}</span> : null}
                      {item.category ? <span>{item.category}</span> : null}
                    </div>
                    <p>{formatCurrency(item.price)}</p>
                  </div>
                  <div className="cart-item-actions">
                    <div className="cart-item-qty">
                      <button
                        type="button"
                        className="cart-item-qty-btn"
                        onClick={() => handleChangeCartQuantity(item.productId, -1)}
                      >−</button>
                      <span className="cart-item-qty-count">{item.quantity}</span>
                      <button
                        type="button"
                        className="cart-item-qty-btn"
                        onClick={() => handleChangeCartQuantity(item.productId, 1)}
                      >+</button>
                    </div>
                    <button
                      type="button"
                      className="cart-item-remove"
                      onClick={() => handleRemoveFromCart(item.productId)}
                      title="Remover item"
                    >remover</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="checkout-form">
            <label>
              Nome
              <input
                value={checkoutForm.name}
                onChange={(event) =>
                  setCheckoutForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Seu nome completo"
              />
            </label>
            <label>
              Telefone
              <input
                value={checkoutForm.phone}
                onChange={(event) =>
                  setCheckoutForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="(11) 99999-9999"
              />
            </label>
            <label>
              Endereco
              <input
                value={checkoutForm.address}
                onChange={(event) =>
                  setCheckoutForm((prev) => ({ ...prev, address: event.target.value }))
                }
                placeholder="Rua, numero e bairro"
              />
            </label>
            <label>
              Pagamento
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
              >
                <option value="pix">Pix</option>
                <option value="cartao_credito">Cartao de credito</option>
                <option value="cartao_debito">Cartao de debito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="mercado_pago">Checkout online (Mercado Pago)</option>
              </select>
            </label>

            {paymentMethod === 'cartao_credito' ? (
              <label>
                Parcelamento
                <select
                  value={cardInstallments}
                  onChange={(event) => setCardInstallments(Number(event.target.value))}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((installment) => (
                    <option value={installment} key={installment}>
                      {installment}x
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {paymentMethod === 'dinheiro' ? (
              <label>
                Troco para (opcional)
                <input
                  value={cashChangeFor}
                  onChange={(event) => setCashChangeFor(event.target.value)}
                  placeholder="Ex: 200,00"
                />
              </label>
            ) : null}
          </div>
        )}

        <div className="cart-footer">
          <div>
            <p>Total</p>
            <strong>{formatCurrency(cartTotal)}</strong>
          </div>
          {cartStep === 'items' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCartStep('form')}
              disabled={cartItems.length === 0}
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCheckout}
              disabled={isCheckingOut}
            >
              {isCheckingOut ? 'Processando...' : 'Finalizar compra'}
            </button>
          )}
          {checkoutSuccess ? (
            <p className="checkout-success">✓ Pedido realizado com sucesso!</p>
          ) : null}
        </div>
        {stockToast ? (
          <div className="stock-toast">Quantidade máxima em estoque atingida</div>
        ) : null}
      </aside>

      {selectedProduct ? (
        <div className="product-modal-overlay" onClick={handleCloseProduct} aria-hidden="true">
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Detalhes do produto ${selectedProduct.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-secondary product-modal-close"
              onClick={handleCloseProduct}
            >
              Fechar
            </button>

            <div className="product-modal-grid">
              <div className="product-modal-media">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name} />
                ) : (
                  <div className="product-modal-fallback">WS Ofertas</div>
                )}
              </div>

              <div className="product-modal-content">
                <p className="tag">
                  {selectedProduct.parentCategory} • {selectedProduct.subcategory} • {selectedProduct.brand}
                </p>
                <h2>{selectedProduct.name}</h2>
                <p className="price">
                  {formatCurrency(selectedProduct.price)}
                  {selectedProduct.oldPrice ? (
                    <span>{formatCurrency(selectedProduct.oldPrice)}</span>
                  ) : null}
                </p>
                <p className="meta">{selectedProduct.description}</p>
                <p className="stock-state">
                  {selectedProduct.unavailable
                    ? 'Indisponivel para compra'
                    : selectedProduct.stock > 0
                      ? `Disponivel em estoque: ${selectedProduct.stock}`
                      : 'Sem estoque'}
                </p>

                <ul className="product-info-list">
                  <li>Produto original com garantia de fabrica.</li>
                  <li>Troca facil em ate 7 dias apos o recebimento.</li>
                  <li>Atendimento rapido via WhatsApp para suporte.</li>
                </ul>

                <div className="shipping-box">
                  <h3>Calcular entrega por CEP</h3>
                  <div className="shipping-row">
                    <input
                      value={cepInput}
                      onChange={(event) => setCepInput(formatCep(event.target.value))}
                      placeholder="00000-000"
                      maxLength={9}
                      inputMode="numeric"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCalculateShipping}
                    >
                      Calcular
                    </button>
                  </div>
                  {shippingError ? <p className="shipping-error">{shippingError}</p> : null}
                  {shippingResult ? (
                    <p className="shipping-result">
                      Entrega para <strong>{shippingResult.region}</strong> em ate{' '}
                      <strong>{shippingResult.deadlineDays} dias uteis</strong> · Frete{' '}
                      <strong>
                        {shippingResult.fee === 0
                          ? 'gratis'
                          : formatCurrency(shippingResult.fee)}
                      </strong>
                    </p>
                  ) : null}
                </div>

                <div className="product-modal-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={selectedProduct.unavailable || selectedProduct.stock <= 0}
                    onClick={() => {
                      handleAddToCart(selectedProduct)
                      handleCloseProduct()
                    }}
                  >
                    {selectedProduct.unavailable || selectedProduct.stock <= 0
                      ? 'Produto indisponivel'
                      : 'Adicionar ao carrinho'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={selectedProduct.unavailable || selectedProduct.stock <= 0}
                    onClick={() => {
                      handleAddToCart(selectedProduct)
                      setIsCartOpen(true)
                      handleCloseProduct()
                    }}
                  >
                    {selectedProduct.unavailable || selectedProduct.stock <= 0
                      ? 'Aguardando reposicao'
                      : 'Comprar agora'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <main className="page">
        {tab === 'account' ? (
          <section className="account-page" aria-label="Minha conta">
            <div className="panel account-profile">
              <div className="panel-header">
                <span className="panel-eyebrow">Minha conta</span>
                <h3>
                  {userAccount ? 'Perfil do usuário' : 'Acesse sua conta'}
                </h3>
                <p className="panel-copy">
                  {userAccount
                    ? 'Veja seus dados e seu histórico de pedidos.'
                    : isSupabaseEnabled
                      ? 'Entre com Google ou use email e senha para ver seus pedidos.'
                      : 'Use e-mail e senha para testar no localhost. O Google precisa de Supabase.'}
                </p>
              </div>

              {userAccount ? (
                <div className="account-summary">
                  <p>
                    Conectado como <strong>{userAccount.email}</strong>
                  </p>
                  <div className="account-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setTab('vitrine')}
                    >
                      Voltar para loja
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleUserSignOut}
                      disabled={accountLoading}
                    >
                      Sair
                    </button>
                  </div>
                </div>
              ) : (
                <div className="account-auth">
                  <button
                    type="button"
                    className="btn-google"
                    onClick={handleUserLoginWithGoogle}
                    disabled={accountLoading}
                  >
                    <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Continuar com Google
                  </button>

                  <div className="account-divider"><span>ou</span></div>

                  {!isSupabaseEnabled ? (
                    <p className="panel-copy">
                      Ambiente local: cadastro e login de cliente funcionando por e-mail e senha.
                    </p>
                  ) : null}

                  <form className="auth-form" onSubmit={handleUserAuthSubmit}>
                    <label>
                      E-mail
                      <input
                        type="email"
                        required
                        value={accountEmail}
                        onChange={(event) => setAccountEmail(event.target.value)}
                      />
                    </label>
                    <label>
                      Senha
                      <div className="password-field">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={accountPassword}
                          onChange={(event) => setAccountPassword(event.target.value)}
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          {showPassword ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    </label>
                    {accountMode === 'register' && (
                      <>
                        <label>
                          Nome completo
                          <input
                            type="text"
                            required
                            value={accountName}
                            onChange={(event) => setAccountName(event.target.value)}
                          />
                        </label>
                        <label>
                          Telefone (opcional)
                          <input
                            type="tel"
                            value={accountPhone}
                            onChange={(event) => setAccountPhone(event.target.value)}
                          />
                        </label>
                        <label>
                          Endereço (opcional)
                          <textarea
                            value={accountAddress}
                            onChange={(event) => setAccountAddress(event.target.value)}
                            placeholder="Rua, número, bairro, cidade, estado, CEP"
                            rows={3}
                          />
                        </label>
                      </>
                    )}
                    <button type="submit" className="btn btn-primary auth-submit" disabled={accountLoading}>
                      {accountLoading
                        ? 'Processando...'
                        : accountMode === 'register'
                          ? 'Criar conta'
                          : 'Entrar'}
                    </button>
                    <p className="auth-switch">
                      {accountMode === 'login' ? (
                        <>Não tem conta?{' '}
                          <button type="button" className="btn-text-link" onClick={() => setAccountMode('register')}>Criar conta</button>
                        </>
                      ) : (
                        <>Já tem conta?{' '}
                          <button type="button" className="btn-text-link" onClick={() => setAccountMode('login')}>Entrar</button>
                        </>
                      )}
                    </p>
                  </form>
                </div>
              )}

              {accountError ? <p className="auth-error">{accountError}</p> : null}
            </div>

            {userAccount ? (
              <div className="panel account-profile-edit">
                <div className="panel-header">
                  <span className="panel-eyebrow">Dados pessoais</span>
                  <h3>Editar perfil</h3>
                </div>
                {profileLoading && !userProfile ? (
                  <p className="loading">Carregando perfil...</p>
                ) : (
                  <form
                    className="profile-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const formData = new FormData(event.currentTarget)
                      handleUpdateProfile({
                        name: String(formData.get('name') ?? '').trim(),
                        phone: String(formData.get('phone') ?? '').trim() || undefined,
                        address: String(formData.get('address') ?? '').trim() || undefined,
                      })
                    }}
                  >
                    <label>
                      Nome completo
                      <input
                        type="text"
                        name="name"
                        required
                        defaultValue={userProfile?.name ?? ''}
                      />
                    </label>
                    <label>
                      Telefone
                      <input type="tel" name="phone" defaultValue={userProfile?.phone ?? ''} />
                    </label>
                    <label>
                      Endereço
                      <textarea
                        name="address"
                        rows={3}
                        placeholder="Rua, número, bairro, cidade, estado, CEP"
                        defaultValue={userProfile?.address ?? ''}
                      />
                    </label>
                    <button type="submit" className="btn btn-primary" disabled={profileLoading}>
                      {profileLoading ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                  </form>
                )}
              </div>
            ) : null}

            {userAccount ? (
              <>
                <div className="panel order-history">
                  <div className="panel-header">
                    <span className="panel-eyebrow">Compras atuais</span>
                    <h3>Em andamento</h3>
                  </div>

                  {ongoingOrders.length === 0 ? (
                    <p className="loading">Você não possui compras em andamento.</p>
                  ) : (
                    <div className="orders-list">
                      {ongoingOrders.map((order) => (
                        <article className="order-card" key={order.id}>
                          <div className="order-card-header">
                            <strong>Pedido {order.id.slice(0, 8)}</strong>
                            <span>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <p className="order-status">Status: {order.status}</p>
                          <p><strong>Total:</strong> {formatCurrency(order.total)}</p>
                          <p><strong>Pagamento:</strong> {formatPaymentMethodLabel(order)}</p>
                          {order.paymentNote ? <p><strong>Obs. pagamento:</strong> {order.paymentNote}</p> : null}
                          <p><strong>Contato:</strong> {order.customerPhone}</p>
                          <p><strong>Entrega:</strong> {order.customerAddress}</p>
                          <ul>
                            {order.items.map((item) => (
                              <li key={item.productId}>
                                {item.name} x{item.quantity} — {formatCurrency(item.price)}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel order-history">
                  <div className="panel-header">
                    <span className="panel-eyebrow">Histórico</span>
                    <h3>Pedidos já feitos</h3>
                  </div>

                  {completedOrders.length === 0 ? (
                    <p className="loading">Você ainda não possui pedidos concluídos.</p>
                  ) : (
                    <div className="orders-list">
                      {completedOrders.map((order) => (
                        <article className="order-card" key={order.id}>
                          <div className="order-card-header">
                            <strong>Pedido {order.id.slice(0, 8)}</strong>
                            <span>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <p className="order-status">Status: {order.status}</p>
                          <p><strong>Total:</strong> {formatCurrency(order.total)}</p>
                          <p><strong>Pagamento:</strong> {formatPaymentMethodLabel(order)}</p>
                          {order.paymentNote ? <p><strong>Obs. pagamento:</strong> {order.paymentNote}</p> : null}
                          <ul>
                            {order.items.map((item) => (
                              <li key={item.productId}>
                                {item.name} x{item.quantity} — {formatCurrency(item.price)}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <>
            <section className="banner-carousel" aria-label="Banners promocionais">
              {activeBanners.length > 0 ? (
                <>
                  <button
                    className="banner-nav-btn banner-nav-prev"
                    aria-label="Banner anterior"
                    type="button"
                    onClick={() => bannerSwiperRef.current?.slidePrev()}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <button
                    className="banner-nav-btn banner-nav-next"
                    aria-label="Próximo banner"
                    type="button"
                    onClick={() => bannerSwiperRef.current?.slideNext()}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <Swiper
                    modules={[Autoplay, Pagination]}
                    autoplay={{
                      delay: 7000,
                      disableOnInteraction: false,
                      pauseOnMouseEnter: true,
                    }}
                    onSwiper={(swiper) => { bannerSwiperRef.current = swiper }}
                    loop
                    pagination={{ clickable: true }}
                    spaceBetween={12}
                    slidesPerView={1}
                  >
                    {activeBanners.map((banner) => (
                      <SwiperSlide key={banner.id}>
                        <button
                          type="button"
                          className="banner-slide"
                          onClick={() => handleBannerClick(banner)}
                        >
                          {banner.imageUrl ? (
                            <img className="banner-image" src={banner.imageUrl} alt={banner.title} />
                          ) : null}
                          <span className="banner-kicker">Oferta em destaque</span>
                          <h2>{banner.title}</h2>
                          <p>{banner.subtitle}</p>
                          <span className="banner-cta">{banner.cta}</span>
                        </button>
                      </SwiperSlide>
                    ))}
                  </Swiper>
                </>
              ) : (
                <div className="banner-empty">Nenhum banner ativo no momento.</div>
              )}
            </section>

        {/* Hero apenas com headline */}
        <header className="hero">
          <h1>
            As melhores ofertas
            <span> direto pra você</span>
          </h1>
          <p className="subtitle">
            Produtos selecionados com os melhores preços em cosméticos e muito mais.
            Confira as novidades e aproveite as promoções exclusivas da nossa loja.
          </p>
        </header>

        {/* Barra de categorias somente na vitrine */}
        {tab === 'vitrine' ? (
          <div className="category-bar" role="navigation" aria-label="Filtros da vitrine">
            <button
              type="button"
              className={selectedParentCategory === 'Todas' ? 'cat-pill active' : 'cat-pill'}
              onClick={() => {
                setSelectedParentCategory('Todas')
                setSelectedSubcategory('Todas')
              }}
            >
              Todos os departamentos
            </button>
            {Object.keys(categoryHierarchy).map((parent) => (
              <button
                type="button"
                key={parent}
                className={selectedParentCategory === parent ? 'cat-pill active' : 'cat-pill'}
                onClick={() => {
                  setSelectedParentCategory(parent)
                  setSelectedSubcategory('Todas')
                }}
              >
                {parent}
              </button>
            ))}
            <select
              value={selectedSubcategory}
              onChange={(event) => setSelectedSubcategory(event.target.value)}
              aria-label="Filtrar por tipo"
            >
              <option value="Todas">Todos os tipos</option>
              {availableSubcategoryOptions.map((subcategory) => (
                <option value={subcategory} key={subcategory}>
                  {subcategory}
                </option>
              ))}
            </select>
            <select
              value={selectedBrand}
              onChange={(event) => setSelectedBrand(event.target.value)}
              aria-label="Filtrar por marca"
            >
              <option value="Todas">Todas marcas</option>
              {availableBrands.map((brand) => (
                <option value={brand} key={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
        ) : null}

      {error ? <p className="alert">{error}</p> : null}

{tab === 'vitrine' ? (
        <section className="vitrine-layout" aria-label="Catalogo com filtros">
          <aside className="filter-sidebar" aria-label="Filtros dinamicos">
            <h3>Refinar busca</h3>
            <label>
              Departamento
              <select
                value={selectedParentCategory}
                onChange={(event) => {
                  setSelectedParentCategory(event.target.value)
                  setSelectedSubcategory('Todas')
                }}
              >
                <option value="Todas">Todas</option>
                {Object.keys(categoryHierarchy).map((parent) => (
                  <option value={parent} key={parent}>
                    {parent}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de produto
              <select
                value={selectedSubcategory}
                onChange={(event) => setSelectedSubcategory(event.target.value)}
              >
                <option value="Todas">Todas</option>
                {availableSubcategoryOptions.map((subcategory) => (
                  <option value={subcategory} key={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Marca
              <select
                value={selectedBrand}
                onChange={(event) => setSelectedBrand(event.target.value)}
              >
                <option value="Todas">Todas</option>
                {availableBrands.map((brand) => (
                  <option value={brand} key={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
          </aside>

          <div className="offers">
            {loading ? <p className="loading">Carregando produtos...</p> : null}
            {!loading && filteredProducts.length === 0 ? (
              <p className="loading">Nenhum produto ativo no momento.</p>
            ) : null}
            {filteredProducts.map((product, index) => (
              <article
                key={product.id}
                className={index === 0 ? 'card card-highlight' : 'card'}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenProduct(product)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleOpenProduct(product)
                  }
                }}
              >
                <div className="card-image-wrap">
                  {product.imageUrl ? (
                    <img
                      className="card-image"
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="card-image card-image-fallback" aria-hidden="true">
                      WS Ofertas
                    </div>
                  )}
                </div>
                <p className="tag">
                  {product.parentCategory} • {product.subcategory} • {product.brand}
                </p>
                <h2>{product.name}</h2>
                <p className="price">
                  {formatCurrency(product.price)}
                  {product.oldPrice ? <span>{formatCurrency(product.oldPrice)}</span> : null}
                </p>
                <p className="meta">{product.description}</p>
                <p className="stock-state">
                  {product.unavailable
                    ? 'Indisponivel'
                    : product.stock > 0
                      ? `Em estoque: ${product.stock}`
                      : 'Sem estoque'}
                </p>
                <button
                  type="button"
                  className="btn btn-primary cart-add-btn"
                  disabled={product.unavailable || product.stock <= 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleAddToCart(product)
                  }}
                >
                  {product.unavailable || product.stock <= 0
                    ? 'Produto indisponivel'
                    : 'Adicionar ao carrinho'}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="admin" aria-label="Painel de administracao">
          {!isLogged ? (
            <form className="panel" onSubmit={handleLogin}>
              <h3>
                {isSupabaseEnabled
                  ? 'Entrar no admin'
                  : 'Entrar no admin'}
              </h3>
              <label>
                E-mail
                <input
                  type="email"
                  required
                  value={credentials.email}
                  onChange={(event) =>
                    setCredentials((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))
                  }
                />
                {useLocalAuth ? (
                  <small>
                    No primeiro login local, o e-mail/senha informados viram as credenciais do admin.
                  </small>
                ) : null}
              </label>
              <label>
                Senha
                <input
                  type="password"
                  required
                  value={credentials.password}
                  onChange={(event) =>
                    setCredentials((previous) => ({
                      ...previous,
                      password: event.target.value,
                    }))
                  }
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving
                  ? 'Processando...'
                  : isSupabaseEnabled
                    ? 'Entrar'
                      : 'Entrar'}
              </button>
            </form>
          ) : (
            <div className="admin-shell">
              <div className="panel admin-hero">
                <div>
                  <span className="panel-eyebrow">Painel administrativo</span>
                  <h3>Organize a loja por blocos</h3>
                  <p className="panel-copy">
                    Agora o admin fica separado por abas para reduzir a poluicao visual
                    e facilitar a manutencao da loja.
                  </p>
                </div>
                <div className="admin-hero-actions">
                  <div className="admin-hero-badge">
                    <strong>{products.length}</strong>
                    <span>itens no catalogo</span>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={handleLogout}>
                    Sair do admin
                  </button>
                </div>
              </div>

              <section className="admin-section" aria-label="Secoes do admin">
                <div className="admin-tabs" role="tablist" aria-label="Secoes do admin">
                  {adminPanelTab === 'overview' ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected="true"
                      className="admin-tab is-active"
                      onClick={() => setAdminPanelTab('overview')}
                    >
                      Resumo
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="tab"
                      aria-selected="false"
                      className="admin-tab"
                      onClick={() => setAdminPanelTab('overview')}
                    >
                      Resumo
                    </button>
                  )}
                  {adminPanelTab === 'products' ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected="true"
                      className="admin-tab is-active"
                      onClick={() => setAdminPanelTab('products')}
                    >
                      Produtos
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="tab"
                      aria-selected="false"
                      className="admin-tab"
                      onClick={() => setAdminPanelTab('products')}
                    >
                      Produtos
                    </button>
                  )}
                  {adminPanelTab === 'banners' ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected="true"
                      className="admin-tab is-active"
                      onClick={() => setAdminPanelTab('banners')}
                    >
                      Banners
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="tab"
                      aria-selected="false"
                      className="admin-tab"
                      onClick={() => setAdminPanelTab('banners')}
                    >
                      Banners
                    </button>
                  )}
                </div>

                {adminPanelTab === 'overview' ? (
                  <>
                    <div className="admin-section-heading">
                      <span className="panel-eyebrow">Resumo</span>
                      <h3>Visao geral</h3>
                    </div>
                    <div className="admin-overview">
                      <div className="metric-card">
                        <p>Total de produtos</p>
                        <strong>{adminStats.total}</strong>
                      </div>
                      <div className="metric-card">
                        <p>Ativos na vitrine</p>
                        <strong>{adminStats.active}</strong>
                      </div>
                      <div className="metric-card">
                        <p>Indisponiveis</p>
                        <strong>{adminStats.unavailable}</strong>
                      </div>
                      <div className="metric-card">
                        <p>Estoque baixo</p>
                        <strong>{adminStats.lowStock}</strong>
                      </div>
                    </div>
                    <div className="panel admin-overview-note">
                      <div className="panel-header">
                        <div>
                          <span className="panel-eyebrow">Leitura rapida</span>
                          <h3>O que exige atencao agora</h3>
                          <p className="panel-copy">
                            Use as abas de produtos e banners para agir diretamente em cada area.
                          </p>
                        </div>
                      </div>
                      <div className="overview-notes">
                        <div className="overview-note-card">
                          <strong>{adminStats.lowStock}</strong>
                          <span>produtos com estoque baixo</span>
                        </div>
                        <div className="overview-note-card">
                          <strong>{adminStats.unavailable}</strong>
                          <span>produtos indisponiveis</span>
                        </div>
                        <div className="overview-note-card">
                          <strong>{activeBanners.length}</strong>
                          <span>banners ativos na home</span>
                        </div>
                      </div>
                    </div>

                    <div className="panel sales-insights">
                      <div className="panel-header">
                        <div>
                          <span className="panel-eyebrow">Vendas</span>
                          <h3>Itens vendidos por segmento</h3>
                          <p className="panel-copy">
                            Ranking por categoria, tipo e marca com base nos pedidos registrados.
                          </p>
                        </div>
                      </div>

                      <div className="overview-notes">
                        <div className="overview-note-card">
                          <strong>{salesInsights.totalOrders}</strong>
                          <span>pedidos registrados</span>
                        </div>
                        <div className="overview-note-card">
                          <strong>{salesInsights.totalSoldItems}</strong>
                          <span>itens vendidos</span>
                        </div>
                        <div className="overview-note-card">
                          <strong>{formatCurrency(salesInsights.totalRevenue)}</strong>
                          <span>faturamento bruto</span>
                        </div>
                      </div>

                      <div className="sales-grid">
                        <article className="sales-card">
                          <h4>Por categoria</h4>
                          {salesInsights.byCategory.length === 0 ? (
                            <p className="loading">Sem vendas ainda.</p>
                          ) : (
                            <ul className="sales-list">
                              {salesInsights.byCategory.slice(0, 6).map((entry) => (
                                <li key={`cat-${entry.name}`}>
                                  <div>
                                    <strong>{entry.name}</strong>
                                    <span>{entry.orders} pedidos</span>
                                  </div>
                                  <em>{entry.soldItems} itens</em>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>

                        <article className="sales-card">
                          <h4>Por tipo</h4>
                          {salesInsights.bySubcategory.length === 0 ? (
                            <p className="loading">Sem vendas ainda.</p>
                          ) : (
                            <ul className="sales-list">
                              {salesInsights.bySubcategory.slice(0, 6).map((entry) => (
                                <li key={`sub-${entry.name}`}>
                                  <div>
                                    <strong>{entry.name}</strong>
                                    <span>{entry.orders} pedidos</span>
                                  </div>
                                  <em>{entry.soldItems} itens</em>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>

                        <article className="sales-card">
                          <h4>Por marca</h4>
                          {salesInsights.byBrand.length === 0 ? (
                            <p className="loading">Sem vendas ainda.</p>
                          ) : (
                            <ul className="sales-list">
                              {salesInsights.byBrand.slice(0, 6).map((entry) => (
                                <li key={`brand-${entry.name}`}>
                                  <div>
                                    <strong>{entry.name}</strong>
                                    <span>{entry.orders} pedidos</span>
                                  </div>
                                  <em>{entry.soldItems} itens</em>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      </div>
                    </div>
                  </>
                ) : null}

                {adminPanelTab === 'products' ? (
                  <div className="admin-workspace">
                    <div className="admin-column">
                      <div className="panel">
                        <div className="panel-header">
                          <div>
                            <span className="panel-eyebrow">Catalogo</span>
                            <h3>{editingProductId ? 'Editar produto' : 'Cadastrar produto'}</h3>
                            <p className="panel-copy">
                              Centralize os dados principais do item em blocos menores.
                            </p>
                          </div>
                        </div>

                        <form className="admin-form" onSubmit={handleCreate}>
                          <div className="form-block">
                            <h4>Informacoes principais</h4>
                            <label>
                              Nome
                              <input
                                value={form.name}
                                onChange={(event) =>
                                  setForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label>
                              Departamento
                              <select
                                value={form.parentCategory}
                                onChange={(event) =>
                                  setForm((prev) => {
                                    const nextParent = event.target.value
                                    const subcategories = getSubcategories(nextParent)
                                    const nextSubcategory = subcategories[0] ?? prev.subcategory
                                    return {
                                      ...prev,
                                      parentCategory: nextParent,
                                      subcategory: nextSubcategory,
                                      category: nextSubcategory,
                                    }
                                  })
                                }
                                required
                              >
                                {Object.keys(categoryHierarchy).map((category) => (
                                  <option value={category} key={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Tipo de produto
                              <select
                                value={form.subcategory}
                                onChange={(event) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    subcategory: event.target.value,
                                    category: event.target.value,
                                  }))
                                }
                                required
                              >
                                {adminSubcategoryOptions.map((subcategory) => (
                                  <option value={subcategory} key={subcategory}>
                                    {subcategory}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Marca
                              <select
                                value={form.brand}
                                onChange={(event) =>
                                  setForm((prev) => ({ ...prev, brand: event.target.value }))
                                }
                                required
                              >
                                {availableBrands.map((brand) => (
                                  <option value={brand} key={brand}>
                                    {brand}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Descricao
                              <textarea
                                value={form.description}
                                onChange={(event) =>
                                  setForm((prev) => ({ ...prev, description: event.target.value }))
                                }
                                rows={3}
                                required
                              />
                            </label>
                          </div>

                          <div className="form-block">
                            <h4>Preco e estoque</h4>
                            <div className="row-2">
                              <label>
                                Preco atual
                                <input
                                  type="number"
                                  min={1}
                                  value={form.price || ''}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      price: Number(event.target.value),
                                    }))
                                  }
                                  required
                                />
                              </label>
                              <label>
                                Preco antigo
                                <input
                                  type="number"
                                  min={0}
                                  value={form.oldPrice ?? ''}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      oldPrice: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                Estoque
                                <input
                                  type="number"
                                  min={0}
                                  value={form.stock}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      stock: Number(event.target.value),
                                    }))
                                  }
                                  required
                                />
                              </label>
                            </div>
                          </div>

                          <div className="form-block">
                            <h4>Visibilidade</h4>
                            <div className="row-2 checkbox-grid">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={form.unavailable}
                                  onChange={(event) =>
                                    setForm((prev) => ({ ...prev, unavailable: event.target.checked }))
                                  }
                                />
                                Marcar produto como indisponivel
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={form.hideWhenOutOfStock}
                                  onChange={(event) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      hideWhenOutOfStock: event.target.checked,
                                    }))
                                  }
                                />
                                Esconder da vitrine quando sem estoque
                              </label>
                            </div>
                          </div>

                          <div className="form-block">
                            <h4>Midia</h4>
                            <label>
                              Foto do produto
                              <input type="file" accept="image/*" onChange={handleImageUpload} />
                            </label>
                            {form.imageUrl ? (
                              <div className="image-preview-wrap">
                                <img className="image-preview" src={form.imageUrl} alt="Preview da foto" />
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => setForm((prev) => ({ ...prev, imageUrl: null }))}
                                >
                                  Remover foto
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="hero-actions">
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                              {saving
                                ? 'Salvando...'
                                : editingProductId
                                  ? 'Salvar alteracoes'
                                  : 'Adicionar produto'}
                            </button>
                            {editingProductId ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleCancelEdit}
                              >
                                Cancelar edicao
                              </button>
                            ) : null}
                          </div>
                        </form>
                      </div>
                    </div>

                    <div className="admin-column admin-column-wide">
                      <div className="panel panel-list">
                        <div className="panel-header">
                          <div>
                            <span className="panel-eyebrow">Gestao</span>
                            <h3>Produtos cadastrados</h3>
                            <p className="panel-copy">
                              Busque, edite e controle o que entra ou sai da vitrine.
                            </p>
                          </div>
                        </div>
                        <div className="admin-list-toolbar">
                          <input
                            className="admin-search-input"
                            type="text"
                            placeholder="Buscar por nome, marca ou tipo..."
                            value={adminSearchQuery}
                            onChange={(event) => setAdminSearchQuery(event.target.value)}
                          />
                        </div>
                        {products.length > 0 ? (
                          <p className="admin-results-count">
                            Mostrando {adminFilteredProducts.length} de {products.length} produto(s)
                          </p>
                        ) : null}
                        <div className="admin-filter-tabs" aria-label="Filtros de produtos">
                          <div className="admin-filter-row" role="tablist" aria-label="Categorias de produtos">
                            <button
                              type="button"
                              role="tab"
                              className={adminCategoryFilter === 'Todas' ? 'admin-filter-chip is-active' : 'admin-filter-chip'}
                              onClick={() => {
                                setAdminCategoryFilter('Todas')
                                setAdminSubcategoryFilter('Todas')
                                setAdminBrandFilter('Todas')
                              }}
                            >
                              Todas categorias
                            </button>
                            {adminCategoryOptions.map((category) => (
                              <button
                                key={category}
                                type="button"
                                role="tab"
                                className={adminCategoryFilter === category ? 'admin-filter-chip is-active' : 'admin-filter-chip'}
                                onClick={() => {
                                  setAdminCategoryFilter(category)
                                  setAdminSubcategoryFilter('Todas')
                                  setAdminBrandFilter('Todas')
                                }}
                              >
                                {category}
                              </button>
                            ))}
                          </div>

                          <div className="admin-filter-grid">
                            <label>
                              Subcategoria
                              <select
                                value={adminSubcategoryFilter}
                                onChange={(event) => setAdminSubcategoryFilter(event.target.value)}
                              >
                                <option value="Todas">Todas</option>
                                {adminSubcategoryFilterOptions.map((subcategory) => (
                                  <option key={subcategory} value={subcategory}>
                                    {subcategory}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Marca
                              <select
                                value={adminBrandFilter}
                                onChange={(event) => setAdminBrandFilter(event.target.value)}
                              >
                                <option value="Todas">Todas</option>
                                {adminBrandFilterOptions.map((brand) => (
                                  <option key={brand} value={brand}>
                                    {brand}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                        {products.length === 0 ? <p>Nenhum produto cadastrado.</p> : null}
                        {products.length > 0 && adminFilteredProducts.length === 0 ? (
                          <p>Nenhum produto encontrado para essa busca.</p>
                        ) : null}
                        {adminProductsByCategory.map((group) => (
                          <section className="admin-category-group" key={group.category}>
                            <div className="admin-category-heading">
                              <h4>{group.category}</h4>
                              <span>{group.items.length} item(ns)</span>
                            </div>
                            {group.items.map((product) => (
                              <div className="product-row" key={product.id}>
                                <div>
                                  <strong>{product.name}</strong>
                                  <p>{product.brand} · {product.parentCategory} / {product.subcategory}</p>
                                  <p className="product-stock-row">
                                    <span
                                      className={
                                        product.unavailable || product.stock === 0
                                          ? 'stock-pill danger'
                                          : product.stock <= 3
                                            ? 'stock-pill warning'
                                            : 'stock-pill ok'
                                      }
                                    >
                                      Estoque: {product.stock}
                                    </span>
                                    {product.unavailable ? (
                                      <span className="status-pill">Indisponivel</span>
                                    ) : null}
                                  </p>
                                  <p>{formatCurrency(product.price)}</p>
                                </div>
                                <div className="row-actions">
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleStartEdit(product)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleToggleActive(product.id, !product.active)}
                                  >
                                    {product.active ? 'Retirar da vitrine' : 'Reativar'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => handleDelete(product.id)}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </div>
                            ))}
                          </section>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {adminPanelTab === 'banners' ? (
                  <div className="admin-workspace admin-workspace-single">
                    <div className="admin-column admin-column-wide">
                      <div className="panel panel-list banner-admin-panel">
                        <div className="panel-header">
                          <div>
                            <span className="panel-eyebrow">Banners</span>
                            <h3>{editingBannerId ? 'Editar banner' : 'Gerenciar banners'}</h3>
                            <p className="panel-copy">
                              Configure a comunicacao da home separando criacao e lista em um mesmo bloco.
                            </p>
                          </div>
                        </div>

                        <form className="banner-form" onSubmit={handleSaveBanner}>
                          <div className="form-block">
                            <h4>Conteudo</h4>
                            <label>
                              Titulo
                              <input
                                value={bannerForm.title}
                                onChange={(event) =>
                                  setBannerForm((prev) => ({ ...prev, title: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label>
                              Subtitulo
                              <input
                                value={bannerForm.subtitle}
                                onChange={(event) =>
                                  setBannerForm((prev) => ({ ...prev, subtitle: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label>
                              Texto do botao (CTA)
                              <input
                                value={bannerForm.cta}
                                onChange={(event) =>
                                  setBannerForm((prev) => ({ ...prev, cta: event.target.value }))
                                }
                                required
                              />
                            </label>
                          </div>

                          <div className="form-block">
                            <h4>Imagem</h4>
                            <label>
                              Upload da imagem (convertida para WebP)
                              <input type="file" accept="image/*" onChange={handleBannerImageUpload} />
                            </label>
                            {bannerForm.imageUrl ? (
                              <img className="banner-preview" src={bannerForm.imageUrl} alt="Preview do banner" />
                            ) : null}
                          </div>

                          <div className="form-block">
                            <h4>Destino e status</h4>
                            <div className="row-2">
                              <label>
                                Destino
                                <select
                                  value={bannerForm.targetType}
                                  onChange={(event) =>
                                    setBannerForm((prev) => ({
                                      ...prev,
                                      targetType: event.target.value as BannerItem['targetType'],
                                      targetValue:
                                        event.target.value === 'category'
                                          ? Object.keys(categoryHierarchy)[0] ?? 'Cosmeticos'
                                          : products[0]?.id ?? '',
                                    }))
                                  }
                                >
                                  <option value="category">Levar para categoria</option>
                                  <option value="product">Levar para produto</option>
                                </select>
                              </label>
                              <label>
                                Selecao de destino
                                <select
                                  value={bannerForm.targetValue}
                                  onChange={(event) =>
                                    setBannerForm((prev) => ({ ...prev, targetValue: event.target.value }))
                                  }
                                >
                                  {bannerForm.targetType === 'category'
                                    ? Object.keys(categoryHierarchy).map((category) => (
                                        <option value={category} key={category}>
                                          Categoria: {category}
                                        </option>
                                      ))
                                    : products.map((product) => (
                                        <option value={product.id} key={product.id}>
                                          Produto: {product.name}
                                        </option>
                                      ))}
                                </select>
                              </label>
                            </div>
                            <label className="switch-row">
                              <input
                                type="checkbox"
                                checked={bannerForm.isActive}
                                onChange={(event) =>
                                  setBannerForm((prev) => ({ ...prev, isActive: event.target.checked }))
                                }
                              />
                              Banner ativo no carrossel
                            </label>
                          </div>

                          <div className="hero-actions">
                            <button type="submit" className="btn btn-primary">
                              {editingBannerId ? 'Salvar banner' : 'Adicionar banner'}
                            </button>
                            {editingBannerId ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  setEditingBannerId(null)
                                  setBannerForm(emptyBannerForm)
                                }}
                              >
                                Cancelar
                              </button>
                            ) : null}
                          </div>
                        </form>

                        <div className="banner-list">
                          {banners.map((banner) => (
                            <div className="banner-row" key={banner.id}>
                              <div>
                                <strong>{banner.title}</strong>
                                <p>{banner.subtitle}</p>
                                <p>
                                  {banner.targetType === 'category'
                                    ? `Categoria: ${banner.targetValue}`
                                    : `Produto: ${products.find((p) => p.id === banner.targetValue)?.name ?? 'Nao encontrado'}`}
                                </p>
                              </div>
                              <div className="row-actions">
                                <label className="switch-inline">
                                  <input
                                    type="checkbox"
                                    checked={banner.isActive}
                                    onChange={(event) =>
                                      handleToggleBannerActive(banner.id, event.target.checked)
                                    }
                                  />
                                  Ativo
                                </label>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleEditBanner(banner)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => handleDeleteBanner(banner.id)}
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </section>
      )}
          </>
        )}

      <footer className="footnote">
        WS Ofertas e Cosméticos — atualize sua loja quando quiser.
      </footer>
    </main>
    </>
  )
}

export default App
