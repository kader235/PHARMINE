import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { base, transaction } from '../db'
import type { Pharmacie, SessionActive, Utilisateur } from '@shared/types'
import { ErreurMetier, journaliser, maintenant, parametreEntier, prochaineReference } from './commun'

const ITERATIONS = 210_000
const LONGUEUR_CLE = 32
const DIGEST = 'sha512'

export function hacher(motDePasse: string): { hash: string; sel: string; iterations: number } {
  const sel = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(motDePasse, sel, ITERATIONS, LONGUEUR_CLE, DIGEST).toString('hex')
  return { hash, sel, iterations: ITERATIONS }
}

function verifier(motDePasse: string, hash: string, sel: string, iterations: number): boolean {
  const calcule = pbkdf2Sync(motDePasse, sel, iterations, LONGUEUR_CLE, DIGEST)
  const attendu = Buffer.from(hash, 'hex')
  if (calcule.length !== attendu.length) return false
  return timingSafeEqual(calcule, attendu)
}

/** Refuse les mots de passe qu'un attaquant devinerait en quelques essais. */
export function validerMotDePasse(motDePasse: string): void {
  if (motDePasse.length < 8) {
    throw new ErreurMetier('Le mot de passe doit contenir au moins 8 caractères.', 'mot_de_passe')
  }
  const courants = ['12345678', 'password', 'motdepasse', 'azertyui', 'qwertyui', 'pharmacie']
  if (courants.includes(motDePasse.toLowerCase())) {
    throw new ErreurMetier('Ce mot de passe est trop courant. Choisissez-en un autre.', 'mot_de_passe')
  }
  if (!/[A-Za-z]/.test(motDePasse) || !/[0-9]/.test(motDePasse)) {
    throw new ErreurMetier(
      'Le mot de passe doit contenir au moins une lettre et un chiffre.',
      'mot_de_passe'
    )
  }
}

const SELECT_UTILISATEUR = `
  SELECT u.id, u.code, u.identifiant, u.nom_complet, u.role_id, u.telephone, u.email,
         u.actif, u.doit_changer_mdp, u.derniere_connexion_at,
         r.nom AS role, r.code AS role_code
  FROM utilisateurs u JOIN roles r ON r.id = u.role_id`

export function permissionsDe(utilisateurId: number): string[] {
  return base()
    .prepare(
      `SELECT p.code
       FROM permissions p
       LEFT JOIN role_permissions rp
              ON rp.permission_code = p.code
             AND rp.role_id = (SELECT role_id FROM utilisateurs WHERE id = :uid)
       LEFT JOIN utilisateur_permissions up
              ON up.permission_code = p.code AND up.utilisateur_id = :uid
       WHERE CASE
               WHEN up.accordee IS NOT NULL THEN up.accordee
               WHEN rp.permission_code IS NOT NULL THEN 1
               ELSE 0
             END = 1`
    )
    .all({ uid: utilisateurId })
    .map((r) => (r as { code: string }).code)
}

export function pharmacie(): Pharmacie | null {
  return (base().prepare('SELECT * FROM pharmacie WHERE id = 1').get() as unknown as Pharmacie | undefined) ?? null
}

/** Vrai tant que l'assistant de première configuration n'a pas été terminé. */
export function besoinConfiguration(): boolean {
  const fiche = pharmacie()
  const nbAdmins = (
    base()
      .prepare('SELECT COUNT(*) n FROM utilisateurs WHERE archived_at IS NULL AND actif = 1')
      .get() as unknown as { n: number }
  ).n
  return !fiche?.configure_at || nbAdmins === 0
}

export function connecter(identifiant: string, motDePasse: string): SessionActive {
  const ligne = base()
    .prepare(
      `SELECT u.*, r.nom AS role, r.code AS role_code
       FROM utilisateurs u JOIN roles r ON r.id = u.role_id
       WHERE u.identifiant = ? COLLATE NOCASE`
    )
    .get(identifiant.trim()) as unknown as
    | (Utilisateur & {
        mot_de_passe_hash: string
        mot_de_passe_sel: string
        mot_de_passe_iter: number
        tentatives_echouees: number
        verrouille_jusqu_a: string | null
        archived_at: string | null
      })
    | undefined

  // Message volontairement identique dans les deux cas : ne pas révéler
  // quels identifiants existent.
  const refus = new ErreurMetier('Identifiant ou mot de passe incorrect.', 'identifiants')

  if (!ligne || ligne.archived_at) {
    journaliser({
      utilisateurId: null,
      action: 'Connexion refusée',
      entite: 'utilisateur',
      resume: `Tentative sur un identifiant inconnu : ${identifiant}`,
      resultat: 'refuse'
    })
    throw refus
  }

  if (ligne.verrouille_jusqu_a && ligne.verrouille_jusqu_a > maintenant()) {
    const minutes = Math.ceil(
      (new Date(ligne.verrouille_jusqu_a).getTime() - Date.now()) / 60_000
    )
    throw new ErreurMetier(
      `Compte temporairement verrouillé. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      'verrouille'
    )
  }

  if (!ligne.actif) {
    throw new ErreurMetier(
      'Ce compte est désactivé. Contactez un administrateur.',
      'desactive'
    )
  }

  if (!verifier(motDePasse, ligne.mot_de_passe_hash, ligne.mot_de_passe_sel, ligne.mot_de_passe_iter)) {
    const tentatives = ligne.tentatives_echouees + 1
    const maxTentatives = parametreEntier('securite.tentatives_max', 5)
    const dureeVerrou = parametreEntier('securite.verrouillage_minutes', 15)
    const verrou =
      tentatives >= maxTentatives
        ? new Date(Date.now() + dureeVerrou * 60_000).toISOString()
        : null

    base()
      .prepare('UPDATE utilisateurs SET tentatives_echouees = ?, verrouille_jusqu_a = ? WHERE id = ?')
      .run(tentatives, verrou, ligne.id)

    journaliser({
      utilisateurId: ligne.id,
      action: 'Connexion refusée',
      entite: 'utilisateur',
      entiteId: ligne.id,
      resume: `Mot de passe incorrect (${tentatives}/${maxTentatives})`,
      resultat: 'refuse'
    })

    if (verrou) {
      throw new ErreurMetier(
        `Trop de tentatives. Compte verrouillé pendant ${dureeVerrou} minutes.`,
        'verrouille'
      )
    }
    throw refus
  }

  return transaction(() => {
    const at = maintenant()
    const sessionId = randomUUID()

    base()
      .prepare(
        `UPDATE utilisateurs
         SET tentatives_echouees = 0, verrouille_jusqu_a = NULL, derniere_connexion_at = ?
         WHERE id = ?`
      )
      .run(at, ligne.id)

    base()
      .prepare('INSERT INTO sessions (id, utilisateur_id, derniere_activite_at) VALUES (?, ?, ?)')
      .run(sessionId, ligne.id, at)

    journaliser({
      utilisateurId: ligne.id,
      action: 'Connexion',
      entite: 'utilisateur',
      entiteId: ligne.id,
      resume: `${ligne.nom_complet} s'est connecté`
    })

    const utilisateur = base()
      .prepare(`${SELECT_UTILISATEUR} WHERE u.id = ?`)
      .get(ligne.id) as unknown as Utilisateur

    return {
      utilisateur,
      permissions: permissionsDe(ligne.id),
      sessionId,
      pharmacie: pharmacie()!
    }
  })
}

export function deconnecter(sessionId: string, utilisateurId: number, motif = 'deconnexion'): void {
  base()
    .prepare('UPDATE sessions SET fermee_at = ?, motif_fermeture = ? WHERE id = ? AND fermee_at IS NULL')
    .run(maintenant(), motif, sessionId)

  journaliser({
    utilisateurId,
    action: 'Déconnexion',
    entite: 'utilisateur',
    entiteId: utilisateurId,
    resume: 'Fin de session'
  })
}

/**
 * Contrôle le mot de passe d'un utilisateur déjà connecté.
 *
 * Sert au déverrouillage du poste : la session n'est pas rouverte, elle est
 * seulement rendue à celui qui l'avait laissée. On ne repasse donc pas par
 * `connecter`, qui journaliserait une nouvelle connexion et remettrait à zéro
 * le compteur de tentatives.
 *
 * Les tentatives ratées sont malgré tout comptées et verrouillent le compte :
 * un poste abandonné ne doit pas devenir un terrain d'essai tranquille.
 */
export function controlerMotDePasse(utilisateurId: number, motDePasse: string): boolean {
  const ligne = base()
    .prepare(
      `SELECT mot_de_passe_hash, mot_de_passe_sel, mot_de_passe_iter, tentatives_echouees
       FROM utilisateurs WHERE id = ? AND actif = 1`
    )
    .get(utilisateurId) as unknown as
    | {
        mot_de_passe_hash: string
        mot_de_passe_sel: string
        mot_de_passe_iter: number
        tentatives_echouees: number
      }
    | undefined

  if (!ligne) return false

  const bon = verifier(motDePasse, ligne.mot_de_passe_hash, ligne.mot_de_passe_sel, ligne.mot_de_passe_iter)

  if (bon) {
    base().prepare('UPDATE utilisateurs SET tentatives_echouees = 0 WHERE id = ?').run(utilisateurId)
    return true
  }

  const tentatives = ligne.tentatives_echouees + 1
  const maxTentatives = parametreEntier('securite.tentatives_max', 5)

  if (tentatives >= maxTentatives) {
    const minutes = parametreEntier('securite.verrouillage_minutes', 15)
    base()
      .prepare(
        `UPDATE utilisateurs SET tentatives_echouees = ?, verrouille_jusqu_a = ? WHERE id = ?`
      )
      .run(tentatives, new Date(Date.now() + minutes * 60_000).toISOString(), utilisateurId)
    journaliser({
      utilisateurId,
      action: 'Compte verrouillé',
      entite: 'securite',
      resume: `${tentatives} échecs de déverrouillage du poste`,
      resultat: 'refuse'
    })
  } else {
    base().prepare('UPDATE utilisateurs SET tentatives_echouees = ? WHERE id = ?').run(tentatives, utilisateurId)
  }

  return false
}

export function changerMotDePasse(
  utilisateurId: number,
  ancien: string | null,
  nouveau: string
): void {
  const ligne = base()
    .prepare('SELECT * FROM utilisateurs WHERE id = ?')
    .get(utilisateurId) as unknown as
    | { mot_de_passe_hash: string; mot_de_passe_sel: string; mot_de_passe_iter: number; nom_complet: string }
    | undefined

  if (!ligne) throw new ErreurMetier('Utilisateur introuvable.')

  if (ancien !== null && !verifier(ancien, ligne.mot_de_passe_hash, ligne.mot_de_passe_sel, ligne.mot_de_passe_iter)) {
    throw new ErreurMetier('Le mot de passe actuel est incorrect.', 'mot_de_passe')
  }

  validerMotDePasse(nouveau)
  const { hash, sel, iterations } = hacher(nouveau)

  transaction(() => {
    base()
      .prepare(
        `UPDATE utilisateurs
         SET mot_de_passe_hash = ?, mot_de_passe_sel = ?, mot_de_passe_iter = ?, doit_changer_mdp = 0
         WHERE id = ?`
      )
      .run(hash, sel, iterations, utilisateurId)

    journaliser({
      utilisateurId,
      action: 'Mot de passe modifié',
      entite: 'utilisateur',
      entiteId: utilisateurId,
      resume: `Mot de passe de ${ligne.nom_complet} modifié`
    })
  })
}

export interface DemandeUtilisateur {
  nomComplet: string
  identifiant: string
  motDePasse: string
  roleId: number
  telephone?: string | null
  email?: string | null
  doitChangerMdp?: boolean
}

export function creerUtilisateur(demande: DemandeUtilisateur, parUtilisateurId: number | null): number {
  const identifiant = demande.identifiant.trim().toLowerCase()
  if (identifiant.length < 3) {
    throw new ErreurMetier("L'identifiant doit contenir au moins 3 caractères.", 'identifiant')
  }
  const existe = base()
    .prepare('SELECT 1 x FROM utilisateurs WHERE identifiant = ? COLLATE NOCASE')
    .get(identifiant)
  if (existe) throw new ErreurMetier('Cet identifiant est déjà utilisé.', 'identifiant')

  validerMotDePasse(demande.motDePasse)
  const { hash, sel, iterations } = hacher(demande.motDePasse)

  return transaction(() => {
    const code = prochaineReference('U', 'utilisateurs', 'code')
    const resultat = base()
      .prepare(
        `INSERT INTO utilisateurs
           (code, identifiant, nom_complet, mot_de_passe_hash, mot_de_passe_sel, mot_de_passe_iter,
            role_id, telephone, email, doit_changer_mdp, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        identifiant,
        demande.nomComplet.trim(),
        hash,
        sel,
        iterations,
        demande.roleId,
        demande.telephone ?? null,
        demande.email ?? null,
        demande.doitChangerMdp ? 1 : 0,
        parUtilisateurId
      )

    const id = Number(resultat.lastInsertRowid)
    journaliser({
      utilisateurId: parUtilisateurId,
      action: 'Utilisateur créé',
      entite: 'utilisateur',
      entiteId: id,
      resume: `${demande.nomComplet} (${identifiant})`
    })
    return id
  })
}

export function listerUtilisateurs(): Utilisateur[] {
  return base()
    .prepare(`${SELECT_UTILISATEUR} WHERE u.archived_at IS NULL ORDER BY u.nom_complet`)
    .all() as unknown as Utilisateur[]
}

export function listerRoles(): { id: number; code: string; nom: string; description: string | null; nb: number }[] {
  return base()
    .prepare(
      `SELECT r.id, r.code, r.nom, r.description, COUNT(rp.permission_code) nb
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
       GROUP BY r.id ORDER BY r.id`
    )
    .all() as unknown as { id: number; code: string; nom: string; description: string | null; nb: number }[]
}

export function modifierUtilisateur(
  id: number,
  champs: { nomComplet?: string; roleId?: number; telephone?: string | null; email?: string | null; actif?: boolean },
  parUtilisateurId: number
): void {
  if (champs.actif === false && id === parUtilisateurId) {
    throw new ErreurMetier('Vous ne pouvez pas désactiver votre propre compte.')
  }
  if (champs.actif === false) {
    const admins = (
      base()
        .prepare(
          `SELECT COUNT(*) n FROM utilisateurs
           WHERE actif = 1 AND archived_at IS NULL AND role_id = 1 AND id <> ?`
        )
        .get(id) as unknown as { n: number }
    ).n
    const cible = base().prepare('SELECT role_id FROM utilisateurs WHERE id = ?').get(id) as unknown as
    | { role_id: number }
      | undefined
    if (cible?.role_id === 1 && admins === 0) {
      throw new ErreurMetier(
        'Impossible : ce compte est le dernier administrateur actif du logiciel.'
      )
    }
  }

  transaction(() => {
    const parties: string[] = []
    const valeurs: unknown[] = []
    if (champs.nomComplet !== undefined) (parties.push('nom_complet = ?'), valeurs.push(champs.nomComplet.trim()))
    if (champs.roleId !== undefined) (parties.push('role_id = ?'), valeurs.push(champs.roleId))
    if (champs.telephone !== undefined) (parties.push('telephone = ?'), valeurs.push(champs.telephone))
    if (champs.email !== undefined) (parties.push('email = ?'), valeurs.push(champs.email))
    if (champs.actif !== undefined) (parties.push('actif = ?'), valeurs.push(champs.actif ? 1 : 0))
    if (!parties.length) return

    valeurs.push(id)
    base().prepare(`UPDATE utilisateurs SET ${parties.join(', ')} WHERE id = ?`).run(...(valeurs as never[]))

    journaliser({
      utilisateurId: parUtilisateurId,
      action: 'Utilisateur modifié',
      entite: 'utilisateur',
      entiteId: id,
      resume: Object.keys(champs).join(', '),
      details: champs
    })
  })
}

/** Dérogations individuelles : accorde (true) ou retire (false) une permission. */
export function definirPermissionIndividuelle(
  utilisateurId: number,
  code: string,
  etat: boolean | null,
  parUtilisateurId: number
): void {
  transaction(() => {
    if (etat === null) {
      base()
        .prepare('DELETE FROM utilisateur_permissions WHERE utilisateur_id = ? AND permission_code = ?')
        .run(utilisateurId, code)
    } else {
      base()
        .prepare(
          `INSERT INTO utilisateur_permissions (utilisateur_id, permission_code, accordee)
           VALUES (?, ?, ?)
           ON CONFLICT (utilisateur_id, permission_code) DO UPDATE SET accordee = excluded.accordee`
        )
        .run(utilisateurId, code, etat ? 1 : 0)
    }

    journaliser({
      utilisateurId: parUtilisateurId,
      action: 'Permission modifiée',
      entite: 'utilisateur',
      entiteId: utilisateurId,
      resume: `${code} → ${etat === null ? 'valeur du rôle' : etat ? 'accordée' : 'retirée'}`
    })
  })
}

export function catalogePermissions(): {
  code: string
  module: string
  libelle: string
  description: string | null
}[] {
  return base()
    .prepare('SELECT code, module, libelle, description FROM permissions ORDER BY ordre')
    .all() as unknown as { code: string; module: string; libelle: string; description: string | null }[]
}
