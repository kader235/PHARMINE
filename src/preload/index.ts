import { contextBridge, ipcRenderer } from 'electron'

export interface ErreurPharmina {
  message: string
  code: string
  detail?: string
}

type Reponse<T> = { ok: true; donnees: T } | { ok: false; erreur: ErreurPharmina }

/**
 * Seule passerelle entre l'interface et le métier.
 *
 * `appeler` lève une exception porteuse du message destiné à l'utilisateur ;
 * `essayer` renvoie le résultat ou l'erreur sans lever, pour les écrans qui
 * préfèrent afficher l'erreur en place.
 */
const api = {
  async appeler<T = unknown>(canal: string, charge?: unknown): Promise<T> {
    const reponse = (await ipcRenderer.invoke('pharmina', canal, charge)) as Reponse<T>
    if (reponse.ok) return reponse.donnees
    const erreur = new Error(reponse.erreur.message) as Error & ErreurPharmina
    erreur.code = reponse.erreur.code
    erreur.message = reponse.erreur.message
    if (reponse.erreur.detail) erreur.detail = reponse.erreur.detail
    throw erreur
  },

  async essayer<T = unknown>(canal: string, charge?: unknown): Promise<Reponse<T>> {
    return (await ipcRenderer.invoke('pharmina', canal, charge)) as Reponse<T>
  }
}

contextBridge.exposeInMainWorld('pharmina', api)

export type ApiPharmina = typeof api
