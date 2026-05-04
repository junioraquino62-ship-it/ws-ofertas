type LocalAccount = {
  id: string
  name: string
  email: string
  password: string
}

const accountKey = 'ws-ofertas-admin-accounts'
const sessionKey = 'ws-ofertas-admin-session'
export const adminEmail = 'admin@wsofertas.com'
const defaultLocalAdminEmail = adminEmail
const defaultLocalAdminPassword = 'admin@ws88'
const defaultLocalAdminName = 'Administrador'

function ensureDefaultAdminAccount(accounts: LocalAccount[]) {
  const defaultIndex = accounts.findIndex(
    (item) => item.email.toLowerCase() === defaultLocalAdminEmail,
  )

  if (defaultIndex === -1) {
    return [
      ...accounts,
      {
        id: crypto.randomUUID(),
        name: defaultLocalAdminName,
        email: defaultLocalAdminEmail,
        password: defaultLocalAdminPassword,
      },
    ]
  }

  const current = accounts[defaultIndex]
  if (
    current.password === defaultLocalAdminPassword &&
    current.name === defaultLocalAdminName
  ) {
    return accounts
  }

  const next = [...accounts]
  next[defaultIndex] = {
    ...current,
    name: defaultLocalAdminName,
    password: defaultLocalAdminPassword,
  }
  return next
}

function getAccounts(): LocalAccount[] {
  const raw = localStorage.getItem(accountKey)
  if (!raw) {
    const seededAccounts = ensureDefaultAdminAccount([])
    saveAccounts(seededAccounts)
    return seededAccounts
  }

  try {
    const parsedAccounts = JSON.parse(raw) as LocalAccount[]
    const syncedAccounts = ensureDefaultAdminAccount(parsedAccounts)
    if (syncedAccounts !== parsedAccounts) {
      saveAccounts(syncedAccounts)
    }
    return syncedAccounts
  } catch {
    const seededAccounts = ensureDefaultAdminAccount([])
    saveAccounts(seededAccounts)
    return seededAccounts
  }
}

function saveAccounts(accounts: LocalAccount[]) {
  localStorage.setItem(accountKey, JSON.stringify(accounts))
}

export function isLocalAdminLoggedIn() {
  return Boolean(localStorage.getItem(sessionKey))
}

export function logoutLocalAdmin() {
  localStorage.removeItem(sessionKey)
}

export function loginLocalAdmin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !password.trim()) {
    throw new Error('Informe e-mail e senha do admin.')
  }

  const accounts = getAccounts()
  const account = accounts.find(
    (item) => item.email.toLowerCase() === normalizedEmail,
  )

  if (!account || account.password !== password) {
    throw new Error('Credenciais invalidas.')
  }

  localStorage.setItem(sessionKey, account.id)
}

export function registerLocalAdmin(name: string, email: string, password: string) {
  const cleanName = name.trim()
  const normalizedEmail = email.trim().toLowerCase()

  if (!cleanName || !normalizedEmail || !password.trim()) {
    throw new Error('Preencha nome, e-mail e senha.')
  }

  const accounts = getAccounts()
  const exists = accounts.some((item) => item.email.toLowerCase() === normalizedEmail)
  if (exists) {
    throw new Error('Ja existe uma conta com esse e-mail.')
  }

  const next: LocalAccount = {
    id: crypto.randomUUID(),
    name: cleanName,
    email: normalizedEmail,
    password,
  }

  saveAccounts([...accounts, next])
  localStorage.setItem(sessionKey, next.id)
}
