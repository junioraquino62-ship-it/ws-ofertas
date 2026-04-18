type LocalAccount = {
  id: string
  name: string
  email: string
  password: string
}

const accountKey = 'ws-ofertas-admin-accounts'
const sessionKey = 'ws-ofertas-admin-session'

function getAccounts(): LocalAccount[] {
  const raw = localStorage.getItem(accountKey)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as LocalAccount[]
  } catch {
    return []
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
  if (accounts.length === 0) {
    const bootstrappedAdmin: LocalAccount = {
      id: crypto.randomUUID(),
      name: 'Administrador',
      email: normalizedEmail,
      password,
    }
    saveAccounts([bootstrappedAdmin])
    localStorage.setItem(sessionKey, bootstrappedAdmin.id)
    return
  }

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
