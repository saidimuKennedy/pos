export interface PDFSettings {
  companyName: string
  tagline: string
  logoDataUrl: string      // base64 data URL or empty string
  primaryColor: string     // hex e.g. "#2563eb"
  currency: string
  footerText: string
}

export const DEFAULT_SETTINGS: PDFSettings = {
  companyName: 'My Business',
  tagline: '',
  logoDataUrl: '',
  primaryColor: '#2563eb',
  currency: 'KES',
  footerText: 'Thank you for your business.',
}

const KEY = 'pos-pdf-settings'

export function loadSettings(): PDFSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: PDFSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

/** Convert "#rrggbb" → [r, g, b] */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const n = parseInt(clean, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
