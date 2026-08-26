/**
 * Impression directe.
 *
 * Jusqu'ici chaque document ouvrait la boîte de dialogue de Windows. Au
 * comptoir, un samedi, c'est un clic de trop par client — et le personnel
 * finit par imprimer sur la mauvaise imprimante.
 *
 * Le document part maintenant directement sur l'imprimante choisie pour son
 * format : la thermique pour les tickets, la bureautique pour les factures.
 * La boîte de dialogue reste disponible, par réglage, et sert de secours
 * automatique si l'impression directe échoue.
 *
 * Papier continu : une imprimante à rouleau ne connaît pas la hauteur de
 * page. On la calcule d'après la hauteur réellement occupée par le document,
 * sinon l'imprimante déroule — et coupe — trente centimètres pour un ticket
 * de trois lignes.
 */
import type { WebContents } from 'electron'
import { parametre, parametreBooleen } from './commun'

export type FormatImpression = 'ticket' | 'ticket57' | 'a5' | 'a4'

/** Un pixel CSS vaut 1/96 de pouce ; un pouce vaut 25 400 microns. */
const MICRONS_PAR_PIXEL = 25_400 / 96

const LARGEUR_ROULEAU: Partial<Record<FormatImpression, number>> = {
  ticket: 80_000,
  ticket57: 57_000
}

/** Un rouleau ne descend pas en dessous de quelques centimètres exploitables. */
const HAUTEUR_MINIMALE = 40_000

const CLE_IMPRIMANTE: Record<FormatImpression, string> = {
  ticket: 'impression.imprimante_ticket',
  ticket57: 'impression.imprimante_ticket',
  a5: 'impression.imprimante_a5',
  a4: 'impression.imprimante_a4'
}

export interface Imprimante {
  nom: string
  description: string
  /**
   * Electron n'expose pas l'imprimante par défaut de façon portable : on la
   * déduit des options du système quand il veut bien les donner.
   */
  defaut: boolean
}

/** Imprimantes vues par le système, pour que le réglage soit un choix et non une saisie. */
export async function imprimantes(contenu: WebContents): Promise<Imprimante[]> {
  const liste = await contenu.getPrintersAsync()
  return liste.map((i) => {
    const options = (i.options ?? {}) as Record<string, unknown>
    const marque = options['printer-is-default'] ?? options['is-default'] ?? options['default']
    return {
      nom: i.name,
      description: i.displayName || i.description || i.name,
      defaut: marque === true || marque === 'true' || marque === '1'
    }
  })
}

export interface DemandeImpression {
  format: FormatImpression
  /** Hauteur occupée par le document à l'écran, en pixels CSS. */
  hauteurPx?: number
  /** Force la boîte de dialogue, quel que soit le réglage. */
  avecDialogue?: boolean
  copies?: number
}

export interface ResultatImpression {
  imprime: boolean
  imprimante: string | null
  /** Vrai si l'appelant doit se rabattre sur la boîte de dialogue du navigateur. */
  repliDialogue: boolean
  motif?: string
}

type TaillePage = 'A4' | 'A5' | { width: number; height: number }

function pageDe(format: FormatImpression, hauteurPx: number | undefined): TaillePage {
  const largeur = LARGEUR_ROULEAU[format]
  if (!largeur) return format === 'a5' ? 'A5' : 'A4'

  const hauteur = Math.max(
    HAUTEUR_MINIMALE,
    Math.round((hauteurPx ?? 0) * MICRONS_PAR_PIXEL) + 6_000
  )
  return { width: largeur, height: hauteur }
}

export async function imprimer(
  contenu: WebContents,
  demande: DemandeImpression
): Promise<ResultatImpression> {
  const silencieuse = parametreBooleen('impression.silencieuse', true)

  if (demande.avecDialogue || !silencieuse) {
    return { imprime: false, imprimante: null, repliDialogue: true }
  }

  const choisie = (parametre(CLE_IMPRIMANTE[demande.format]) ?? '').trim()

  // Une imprimante réglée puis débranchée ne doit pas faire disparaître le
  // ticket en silence : on le dit, et on rend la main à la boîte de dialogue.
  if (choisie) {
    const disponibles = await imprimantes(contenu)
    if (!disponibles.some((i) => i.nom === choisie)) {
      return {
        imprime: false,
        imprimante: choisie,
        repliDialogue: true,
        motif: `L'imprimante « ${choisie} » est introuvable sur ce poste.`
      }
    }
  }

  const options = {
    silent: true,
    printBackground: false,
    copies: Math.max(1, Math.min(demande.copies ?? 1, 5)),
    pageSize: pageDe(demande.format, demande.hauteurPx),
    // Sur un rouleau, la marge d'imprimante gaspille du papier et décale la
    // coupe : la mise en page du document porte déjà ses propres retraits.
    margins: LARGEUR_ROULEAU[demande.format]
      ? ({ marginType: 'none' } as const)
      : ({ marginType: 'default' } as const),
    ...(choisie ? { deviceName: choisie } : {})
  }

  return new Promise<ResultatImpression>((resoudre) => {
    contenu.print(options, (succes, motif) => {
      if (succes) {
        resoudre({ imprime: true, imprimante: choisie || null, repliDialogue: false })
        return
      }

      // « cancelled » : l'utilisateur a interrompu, ce n'est pas une panne.
      const annule = typeof motif === 'string' && motif.toLowerCase().includes('cancel')
      resoudre({
        imprime: false,
        imprimante: choisie || null,
        repliDialogue: !annule,
        motif: annule ? undefined : motif
      })
    })
  })
}

/**
 * Page de contrôle : sert à vérifier qu'une imprimante répond, et surtout
 * qu'elle est la bonne — sur un comptoir à trois imprimantes, le réglage se
 * vérifie en imprimant, pas en lisant un nom dans une liste.
 */
export async function testerImprimante(
  contenu: WebContents,
  format: FormatImpression
): Promise<ResultatImpression> {
  return imprimer(contenu, { format, hauteurPx: 260 })
}
