type LocalAccount = {
  id: string
  name: string
  email: string
  password: string
}

const accountKey = 'ws-ofertas-admin-accounts'
const sessionKey = 'ws-ofertas-admin-session'
export const LOCAL_ADMIN_EMAIL = 'admin@wsofertas.com'
export const LOCAL_ADMIN_PASSWORD = 'Admin@ws88'

const defaultAdmin: LocalAccount = {
  id: 'local-admin',
  name: 'Administrador',
  email: LOCAL_ADMIN_EMAIL,
  password: LOCAL_ADMIN_PASSWORD,
}

function ensureDefaultAccount(accounts: LocalAccount[]) {
  const withoutDefault = accounts.filter(
    (item) => item.email.toLowerCase() !== LOCAL_ADMIN_EMAIL,
  )
  return [defaultAdmin, ...withoutDefault]
}

function getAccounts(): LocalAccount[] {
  const raw = localStorage.getItem(accountKey)
  if (!raw) {
    const seeded = [defaultAdmin]
    saveAccounts(seeded)
    return seeded
  }

  try {
    const parsed = JSON.parse(raw) as LocalAccount[]
    const normalized = ensureDefaultAccount(parsed)
    saveAccounts(normalized)
    return normalized
  } catch {
    const seeded = [defaultAdmin]
    saveAccounts(seeded)
    return seeded
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
  if (normalizedEmail !== LOCAL_ADMIN_EMAIL) {
    throw new Error(`Use o e-mail de administrador: ${LOCAL_ADMIN_EMAIL}`)
  }

  if (password !== LOCAL_ADMIN_PASSWORD) {
    throw new Error('Senha do admin invalida.')
  }

  const account = getAccounts().find(
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

  if (normalizedEmail !== LOCAL_ADMIN_EMAIL) {
    throw new Error(`O e-mail do admin deve ser ${LOCAL_ADMIN_EMAIL}.`)
  }

  if (password !== LOCAL_ADMIN_PASSWORD) {
    throw new Error(`A senha do admin deve ser ${LOCAL_ADMIN_PASSWORD}.`)
  }

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
