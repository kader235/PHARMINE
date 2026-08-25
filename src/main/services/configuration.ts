import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { base, sauvegarder, transaction, verifierSauvegarde } from '../db'
import type { Pharmacie } from '@shared/types'
import {
  ErreurMetier,
  aujourdhui,
  journaliser,
  maintenant,
  parametre,
  parametreBooleen,
  parametreEntier
} from './commun'
import { creerUtilisateur, type DemandeUtilisateur } from './auth'

export interface DemandeConfiguration {
  pharmacie: {
    nom: string
    raisonSociale?: string | null
    adresse?: string | null
    ville?: string | null
    pays?: string | null
    telephone?: string | null
    email?: string | null
    registreCommerce?: string | null
    numeroOrdre?: string | null
    devise: string
    deviseSymbole: string
    deviseDecimales: number
  }
  administrateur: Omit<DemandeUtilisateur, 'roleId'>
}

/**
 * Première configuration. Crée la fiche de l'officine et son administrateur
 * dans une seule transaction : le logiciel ne peut pas se retrouver à moitié
 * configuré.
 */
export function configurerPharmacie(demande: DemandeConfiguration): { utilisateurId: number } {
  const deja = base().prepare('SELECT configure_at FROM pharmacie WHERE id = 1').get() as unknown as
    | { configure_at: string | null }
    | undefined
  if (deja?.configure_at) {
    throw new ErreurMetier('Ce logiciel est déjà configuré.', 'deja_configure')
  }

  if (!demande.pharmacie.nom?.trim()) throw new ErreurMetier('Le nom de la pharmacie est obligatoire.', 'nom')
  if (!demande.pharmacie.devise?.trim()) throw new ErreurMetier('La devise est obligatoire.', 'devise')

  return transaction(() => {
    const p = demande.pharmacie
    base()
      .prepare(
        `INSERT INTO pharmacie
           (id, nom, raison_sociale, adresse, ville, pays, telephone, email,
            registre_commerce, numero_ordre, devise, devise_symbole, devise_decimales, configure_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           nom = excluded.nom, raison_sociale = excluded.raison_sociale,
           adresse = excluded.adresse, ville = excluded.ville, pays = excluded.pays,
           telephone = excluded.telephone, email = excluded.email,
           registre_commerce = excluded.registre_commerce, numero_ordre = excluded.numero_ordre,
           devise = excluded.devise, devise_symbole = excluded.devise_symbole,
           devise_decimales = excluded.devise_decimales, configure_at = excluded.configure_at`
      )
      .run(
        p.nom.trim(),
        p.raisonSociale ?? null,
        p.adresse ?? null,
        p.ville ?? null,
        p.pays ?? null,
        p.telephone ?? null,
        p.email ?? null,
        p.registreCommerce ?? null,
        p.numeroOrdre ?? null,
        p.devise.trim(),
        p.deviseSymbole.trim(),
        p.deviseDecimales,
        maintenant()
      )

    const utilisateurId = creerUtilisateur({ ...demande.administrateur, roleId: 1 }, null)

    journaliser({
      utilisateurId,
      action: 'Pharmacie configurée',
      entite: 'pharmacie',
      entiteId: 1,
      resume: `${p.nom} — devise ${p.devise}`
    })

    return { utilisateurId }
  })
}

export function modifierPharmacie(champs: Partial<Pharmacie>, utilisateurId: number): void {
  const autorises: (keyof Pharmacie)[] = [
    'nom',
    'raison_sociale',
    'adresse',
    'ville',
    'pays',
    'telephone',
    'email',
    'devise_symbole'
  ]
  const parties: string[] = []
  const valeurs: unknown[] = []

  for (const cle of autorises) {
    if (champs[cle] !== undefined) {
      parties.push(`${cle} = ?`)
      valeurs.push(champs[cle])
    }
  }
  if (!parties.length) return

  transaction(() => {
    valeurs.push(maintenant())
    base().prepare(`UPDATE pharmacie SET ${parties.join(', ')}, updated_at = ? WHERE id = 1`).run(...(valeurs as never[]))
    journaliser({
      utilisateurId,
      action: 'Paramètres de la pharmacie modifiés',
      entite: 'pharmacie',
      entiteId: 1,
      resume: parties.map((p) => p.split(' ')[0]).join(', ')
    })
  })
}

export function listerParametres(): {
  cle: string
  valeur: string | null
  type: string
  categorie: string
  libelle: string
  description: string | null
}[] {
  return base()
    .prepare('SELECT cle, valeur, type, categorie, libelle, description FROM parametres ORDER BY categorie, cle')
    .all() as unknown as never
}

export function definirParametres(valeurs: Record<string, string>, utilisateurId: number): void {
  transaction(() => {
    const at = maintenant()
    for (const [cle, valeur] of Object.entries(valeurs)) {
      const existe = base().prepare('SELECT libelle FROM parametres WHERE cle = ?').get(cle) as unknown as
    | { libelle: string }
        | undefined
      if (!existe) continue
      base()
        .prepare('UPDATE parametres SET valeur = ?, updated_at = ?, updated_by = ? WHERE cle = ?')
        .run(valeur, at, utilisateurId, cle)
    }
    journaliser({
      utilisateurId,
      action: 'Paramètres modifiés',
      entite: 'parametre',
      resume: Object.keys(valeurs).join(', '),
      details: valeurs
    })
  })
}

// ---------------------------------------------------------------------------
// Sauvegardes
// ---------------------------------------------------------------------------

export function creerSauvegarde(
  cheminBase: string,
  dossier: string,
  declencheur: 'automatique' | 'manuelle' | 'avant_migration',
  utilisateurId: number | null
): { fichier: string; taille: number } {
  const horodatage = maintenant().replace(/[:.]/g, '-').slice(0, 19)
  const nom = `pharmina-${horodatage}.db`

  try {
    const resultat = sauvegarder(cheminBase, dossier, nom)

    base()
      .prepare(
        'INSERT INTO sauvegardes (fichier, taille, declencheur, statut, created_by) VALUES (?, ?, ?, ?, ?)'
      )
      .run(resultat.fichier, resultat.taille, declencheur, 'ok', utilisateurId)

    if (declencheur !== 'automatique') {
      journaliser({
        utilisateurId,
        action: 'Sauvegarde créée',
        entite: 'sauvegarde',
        resume: `${nom} (${Math.round(resultat.taille / 1024)} Ko)`
      })
    }

    purgerAnciennes(dossier)
    return resultat
  } catch (erreur) {
    base()
      .prepare(
        'INSERT INTO sauvegardes (fichier, declencheur, statut, message, created_by) VALUES (?, ?, ?, ?, ?)'
      )
      .run(nom, declencheur, 'echec', (erreur as Error).message, utilisateurId)
    throw new ErreurMetier(`La sauvegarde a échoué : ${(erreur as Error).message}`, 'sauvegarde')
  }
}

/** Conserve les N sauvegardes les plus récentes, supprime le reste. */
function purgerAnciennes(dossier: string): void {
  const aConserver = parametreEntier('sauvegarde.conserver_nombre', 30)
  try {
    const fichiers = readdirSync(dossier)
      .filter((f) => f.startsWith('pharmina-') && f.endsWith('.db'))
      .map((f) => ({ nom: f, chemin: `${dossier}/${f}`, at: statSync(`${dossier}/${f}`).mtimeMs }))
      .sort((a, b) => b.at - a.at)

    for (const vieux of fichiers.slice(aConserver)) {
      unlinkSync(vieux.chemin)
      base().prepare('DELETE FROM sauvegardes WHERE fichier = ?').run(vieux.chemin)
    }
  } catch {
    // Une purge impossible ne doit jamais faire échouer une sauvegarde réussie.
  }
}

export function listerSauvegardes(): {
  id: number
  fichier: string
  taille: number | null
  at: string
  declencheur: string
  statut: string
  message: string | null
}[] {
  return base()
    .prepare('SELECT id, fichier, taille, at, declencheur, statut, message FROM sauvegardes ORDER BY at DESC LIMIT 100')
    .all() as unknown as never
}

export function controlerSauvegarde(fichier: string): { valide: boolean; version?: number; motif?: string } {
  return verifierSauvegarde(fichier)
}

export function statistiquesBase(): {
  produits: number
  ventes: number
  lots: number
  mouvements: number
  depuis: string | null
  version: number
} {
  const db = base()
  const compte = (t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as unknown as { n: number }).n
  const premiere = db.prepare('SELECT MIN(at) a FROM ventes').get() as unknown as { a: string | null }
  const version = db.prepare('SELECT MAX(version) v FROM schema_migrations').get() as unknown as { v: number }

  return {
    produits: compte('produits'),
    ventes: compte('ventes'),
    lots: compte('lots'),
    mouvements: compte('mouvements_stock'),
    depuis: premiere.a,
    version: version.v
  }
}

export interface ReglagesInterface {
  themeDefaut: string
  formatImpressionDefaut: string
  ticketAutomatique: boolean
  piedTicket: string
  copiesFacture: number
  scanAjouteDirectement: boolean
  avertirScanInconnu: boolean
  remiseMaxPourcent: number
  exigerCaisseOuverte: boolean
  /** Marge proposee a la creation d'un produit, en pourcentage. */
  margeParDefaut: number
}

/**
 * Reglages dont l'interface a besoin pour se comporter correctement au
 * comptoir. Volontairement restreint et accessible a tout utilisateur
 * connecte : un caissier n'a pas le droit de consulter les parametres, mais
 * son ecran doit malgre tout savoir sur quel format imprimer.
 */
export function reglagesInterface(): ReglagesInterface {
  return {
    themeDefaut: parametre('interface.theme') ?? 'clair',
    formatImpressionDefaut: parametre('impression.format_defaut') ?? 'ticket',
    ticketAutomatique: parametreBooleen('impression.ticket_automatique', false),
    piedTicket: parametre('impression.pied_ticket') ?? 'Merci de votre visite',
    copiesFacture: parametreEntier('impression.copies_facture', 1),
    scanAjouteDirectement: parametreBooleen('comptoir.scan_ajoute_directement', true),
    avertirScanInconnu: parametreBooleen('comptoir.avertir_scan_inconnu', true),
    remiseMaxPourcent: parametreEntier('ventes.remise_max_pourcent', 10),
    exigerCaisseOuverte: parametreBooleen('caisse.exiger_ouverture', true),
    margeParDefaut: parametreEntier('produits.marge_par_defaut', 30)
  }
}

/** Thème de l'officine, lisible avant même la connexion. */
export function themeParDefaut(): string {
  try {
    return parametre('interface.theme') ?? 'clair'
  } catch {
    // Base pas encore migrée : le thème par défaut fera l'affaire.
    return 'clair'
  }
}

/** Date du jour côté processus principal : l'interface ne décide pas de la date métier. */
export function dateDuJour(): string {
  return aujourdhui()
}
