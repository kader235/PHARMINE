/**
 * Formatage. Les montants arrivent en entiers, dans la plus petite unité de la
 * devise : la conversion en texte se fait ici et nulle part ailleurs.
 */

let symbole = 'FCFA'
let decimales = 0

export function configurerDevise(nouveauSymbole: string, nouvellesDecimales: number): void {
  symbole = nouveauSymbole
  decimales = nouvellesDecimales
}

export function symboleDevise(): string {
  return symbole
}

export function montant(valeur: number | null | undefined, avecSymbole = true): string {
  if (valeur === null || valeur === undefined) return '—'
  const reel = decimales > 0 ? valeur / 10 ** decimales : valeur
  const texte = reel.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  })
  return avecSymbole ? `${texte} ${symbole}` : texte
}

/** Convertit une saisie utilisateur en entier stockable. */
export function versEntier(saisie: string): number {
  const nettoye = saisie.replace(/\s/g, '').replace(',', '.')
  const nombre = Number(nettoye)
  if (!Number.isFinite(nombre)) return 0
  return Math.round(nombre * 10 ** decimales)
}

export function nombre(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined) return '—'
  return valeur.toLocaleString('fr-FR')
}

export function pourcentage(valeur: number | null | undefined, chiffres = 1): string {
  if (valeur === null || valeur === undefined) return '—'
  return `${valeur.toFixed(chiffres).replace('.', ',')} %`
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
]
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** 'YYYY-MM-DD' ou ISO complet vers « 24 août 2026 ». */
export function date(valeur: string | null | undefined): string {
  if (!valeur) return '—'
  const d = new Date(valeur.length === 10 ? valeur + 'T00:00:00' : valeur)
  if (Number.isNaN(d.getTime())) return valeur
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

export function dateCourte(valeur: string | null | undefined): string {
  if (!valeur) return '—'
  const d = new Date(valeur.length === 10 ? valeur + 'T00:00:00' : valeur)
  if (Number.isNaN(d.getTime())) return valeur
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function dateLongue(valeur: string): string {
  const d = new Date(valeur.length === 10 ? valeur + 'T00:00:00' : valeur)
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

export function heure(valeur: string | null | undefined): string {
  if (!valeur) return '—'
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/** « il y a 8 min », « hier, 14:20 », « 12/08/2026 » selon l'ancienneté. */
export function depuis(valeur: string | null | undefined): string {
  if (!valeur) return '—'
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return '—'

  const secondes = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secondes < 60) return "à l'instant"
  if (secondes < 3600) return `il y a ${Math.floor(secondes / 60)} min`

  const maintenant = new Date()
  if (d.toDateString() === maintenant.toDateString()) return `aujourd'hui, ${heure(valeur)}`

  const hier = new Date(maintenant)
  hier.setDate(hier.getDate() - 1)
  if (d.toDateString() === hier.toDateString()) return `hier, ${heure(valeur)}`

  return dateCourte(valeur)
}

/** Date du jour au format 'YYYY-MM-DD', en heure locale. */
export function aujourdhui(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Instant UTC correspondant au début d'un jour civil local.
 *
 * Même règle que côté métier : concaténer un « Z » sur une date locale décale
 * la fenêtre du fuseau horaire et fait disparaître les opérations du jour.
 */
export function debutDeJournee(jour: string): string {
  return new Date(`${jour}T00:00:00`).toISOString()
}

export function finDeJournee(jour: string): string {
  return new Date(`${jour}T23:59:59.999`).toISOString()
}

export function decalerJours(jour: string, jours: number): string {
  const d = new Date(jour + 'T00:00:00')
  d.setDate(d.getDate() + jours)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function debutDuMois(jour = aujourdhui()): string {
  return jour.slice(0, 8) + '01'
}

export function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join('')
}

const MODES: Record<string, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  carte: 'Carte',
  virement: 'Virement',
  cheque: 'Chèque',
  credit: 'Crédit'
}

export function modePaiement(mode: string): string {
  return MODES[mode] ?? mode
}

const TYPES_MOUVEMENT: Record<string, string> = {
  entree: 'Entrée',
  sortie: 'Sortie',
  vente: 'Vente',
  retour_client: 'Retour client',
  retour_fournisseur: 'Retour fournisseur',
  ajustement: 'Ajustement',
  perte: 'Perte',
  peremption: 'Péremption',
  inventaire: 'Inventaire',
  transfert: 'Transfert',
  annulation_vente: 'Annulation de vente'
}

export function typeMouvement(type: string): string {
  return TYPES_MOUVEMENT[type] ?? type
}

const ETATS_STOCK: Record<string, { libelle: string; ton: 'succes' | 'attention' | 'danger' | 'info' }> = {
  disponible: { libelle: 'Disponible', ton: 'succes' },
  faible: { libelle: 'Stock faible', ton: 'attention' },
  rupture: { libelle: 'Rupture', ton: 'danger' },
  surstock: { libelle: 'Surstock', ton: 'info' }
}

export function etatStock(etat: string): { libelle: string; ton: 'succes' | 'attention' | 'danger' | 'info' } {
  return ETATS_STOCK[etat] ?? { libelle: etat, ton: 'info' }
}
