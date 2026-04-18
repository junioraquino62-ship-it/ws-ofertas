export type BannerTargetType = 'category' | 'product'

export type BannerItem = {
  id: string
  title: string
  subtitle: string
  cta: string
  imageUrl: string
  targetType: BannerTargetType
  targetValue: string
  isActive: boolean
}

const storageKey = 'ws-ofertas-banners'

const defaultBanners: BannerItem[] = [
  {
    id: 'banner-1',
    title: 'Semana dos Cosméticos',
    subtitle: 'Perfumes e cuidados com a pele com ofertas especiais.',
    cta: 'Ver cosméticos',
    imageUrl: '',
    targetType: 'category',
    targetValue: 'Cosmeticos',
    isActive: true,
  },
  {
    id: 'banner-2',
    title: 'Som Potente em Casa',
    subtitle: 'Caixas JBL e acessórios com entrega rápida.',
    cta: 'Explorar áudio',
    imageUrl: '',
    targetType: 'category',
    targetValue: 'Eletronicos',
    isActive: true,
  },
  {
    id: 'banner-3',
    title: 'Ventilação para o Verão',
    subtitle: 'Linha Arno e Philips com estoque limitado.',
    cta: 'Garantir agora',
    imageUrl: '',
    targetType: 'category',
    targetValue: 'Eletrodomesticos',
    isActive: true,
  },
]

function normalize(items: BannerItem[]) {
  return items.map((item) => ({
    ...item,
    title: item.title?.trim() || 'Banner',
    subtitle: item.subtitle?.trim() || '',
    cta: item.cta?.trim() || 'Saiba mais',
    imageUrl: item.imageUrl ?? '',
    targetType: item.targetType ?? 'category',
    targetValue: item.targetValue ?? 'Cosmeticos',
    isActive: item.isActive !== false,
  }))
}

export function listBanners(): BannerItem[] {
  const raw = localStorage.getItem(storageKey)
  if (!raw) {
    localStorage.setItem(storageKey, JSON.stringify(defaultBanners))
    return defaultBanners
  }

  try {
    const parsed = JSON.parse(raw) as BannerItem[]
    const normalized = normalize(parsed)
    localStorage.setItem(storageKey, JSON.stringify(normalized))
    return normalized
  } catch {
    localStorage.setItem(storageKey, JSON.stringify(defaultBanners))
    return defaultBanners
  }
}

export function saveBanners(items: BannerItem[]) {
  localStorage.setItem(storageKey, JSON.stringify(items))
}
