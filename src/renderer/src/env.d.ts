/// <reference types="vite/client" />

interface ErreurPharmina { message: string; code: string; detail?: string }
type ReponsePharmina<T> = { ok: true; donnees: T } | { ok: false; erreur: ErreurPharmina }

interface Window {
  pharmina: {
    appeler<T = unknown>(canal: string, charge?: unknown): Promise<T>
    essayer<T = unknown>(canal: string, charge?: unknown): Promise<ReponsePharmina<T>>
  }
}
