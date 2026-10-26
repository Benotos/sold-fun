/**
 * Minimal Solana wallet support with no adapter libraries.
 * Works with Phantom, Solflare, Backpack and anything exposing the standard injected provider.
 * Only connect and signMessage are used: nobody ever signs a transaction on SOLD.FUN.
 */
interface InjectedProvider {
  isPhantom?: boolean
  isSolflare?: boolean
  isBackpack?: boolean
  publicKey?: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } } | void>
  disconnect(): Promise<void>
  signMessage(msg: Uint8Array, enc?: string): Promise<{ signature: Uint8Array } | Uint8Array>
}

declare global {
  interface Window {
    phantom?: { solana?: InjectedProvider }
    solflare?: InjectedProvider
    backpack?: InjectedProvider
    solana?: InjectedProvider
  }
}

export function getProvider(): InjectedProvider | null {
  if (typeof window === 'undefined') return null
  return window.phantom?.solana ?? window.backpack ?? window.solflare ?? window.solana ?? null
}

export function walletName(): string {
  const p = getProvider()
  if (!p) return 'Wallet'
  if (p.isPhantom) return 'Phantom'
  if (p.isBackpack) return 'Backpack'
  if (p.isSolflare) return 'Solflare'
  return 'Wallet'
}

export async function connectWallet(silent = false): Promise<string | null> {
  const p = getProvider()
  if (!p) return null
  try {
    const res = await p.connect(silent ? { onlyIfTrusted: true } : undefined)
    const pk = (res && 'publicKey' in res ? res.publicKey : p.publicKey)?.toString()
    return pk ?? null
  } catch {
    return null
  }
}

export async function disconnectWallet() {
  try {
    await getProvider()?.disconnect()
  } catch {
    /* ignore */
  }
}

export async function signText(text: string): Promise<Uint8Array | null> {
  const p = getProvider()
  if (!p) return null
  try {
    const res = await p.signMessage(new TextEncoder().encode(text), 'utf8')
    return res instanceof Uint8Array ? res : res.signature
  } catch {
    return null
  }
}
