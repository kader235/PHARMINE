/** Passerelle typée vers le processus principal. */
export async function appeler<T = unknown>(canal: string, charge?: unknown): Promise<T> {
  return window.pharmina.appeler<T>(canal, charge)
}

export interface ErreurAffichable {
  message: string
  code: string
  detail?: string
}

/** Normalise n'importe quelle exception en message destiné à l'utilisateur. */
export function messageErreur(erreur: unknown): ErreurAffichable {
  if (erreur && typeof erreur === 'object' && 'message' in erreur) {
    const e = erreur as ErreurAffichable
    return { message: e.message, code: e.code ?? 'inconnu', detail: e.detail }
  }
  return { message: "Une erreur inattendue s'est produite.", code: 'inconnu' }
}
