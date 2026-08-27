import { base, type ValeurSQL } from '../db'
import type { Indicateur, ResultatRecherche, TableauDeBord } from '@shared/types'
import { aujourdhui, debutDeJournee, decalerJours, finDeJournee, parametreEntier } from './commun'
import { etatCaisse } from './caisse'
import { etatCopieExterne } from './configuration'

function indicateur(valeur: number, precedent: number | null): Indicateur {
  const variation =
    precedent === null || precedent === 0 ? null : Math.round(((valeur - precedent) / precedent) * 1000) / 10
  return { valeur, precedent, variation }
}

function bornes(jour: string): [string, string] {
  return [debutDeJournee(jour), finDeJournee(jour)]
}

/**
 * Tableau de bord.
 *
 * Toutes les valeurs sont calculées depuis la base. Lorsqu'il n'y a pas encore
 * de données, `aucuneDonnee` vaut vrai et l'interface affiche un état d'accueil
 * honnête plutôt que des chiffres inventés.
 */
export function tableauDeBord(): TableauDeBord {
  const db = base()
  const jour = aujourdhui()
  const hier = decalerJours(jour, -1)
  const [debut, fin] = bornes(jour)
  const [debutHier, finHier] = bornes(hier)

  const ventesDu = (d: string, f: string) =>
    db
      .prepare(
        `SELECT COUNT(*) n, COALESCE(SUM(total), 0) ca, COALESCE(SUM(cout_total), 0) cout
         FROM ventes WHERE statut = 'finalisee' AND at BETWEEN ? AND ?`
      )
      .get(d, f) as unknown as { n: number; ca: number; cout: number }

  const ceJour = ventesDu(debut, fin)
  const laVeille = ventesDu(debutHier, finHier)

  const depensesDu = (d: string) =>
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(montant), 0) s FROM depenses WHERE archived_at IS NULL AND date = ?`
        )
        .get(d) as unknown as { s: number }
    ).s

  const caisse = etatCaisse()
  const seuil = parametreEntier('peremption.seuil_alerte_jours', 90)

  const stock = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN etat_stock = 'rupture' THEN 1 END) ruptures,
         COUNT(CASE WHEN etat_stock = 'faible'  THEN 1 END) faibles
       FROM v_produit_etat WHERE archived_at IS NULL AND vente_autorisee = 1`
    )
    .get() as unknown as { ruptures: number; faibles: number }

  const peremption = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN palier = 'expire' THEN 1 END) expires,
         COALESCE(SUM(CASE WHEN palier = 'expire' THEN valeur END), 0) valeurExpiree,
         COUNT(CASE WHEN palier IN ('j7','j30','j90') AND jours_restants <= ? THEN 1 END) proches
       FROM v_peremptions`
    )
    .get(seuil) as unknown as { expires: number; valeurExpiree: number; proches: number }

  const dettes = (db.prepare('SELECT COALESCE(SUM(solde_du), 0) s FROM v_dette_fournisseur').get() as unknown as { s: number }).s
  const creances = (
    db.prepare('SELECT COALESCE(SUM(solde_du), 0) s FROM v_creance_client WHERE solde_du > 0').get() as unknown as { s: number }
  ).s

  // L'activité récente est un assemblage des opérations réellement enregistrées.
  const activite = db
    .prepare(
      `SELECT * FROM (
         SELECT v.at, 'vente' AS type, v.reference AS libelle,
                COALESCE(c.nom, 'Client de passage') AS detail, v.total AS montant,
                u.nom_complet AS utilisateur
         FROM ventes v
         LEFT JOIN clients c ON c.id = v.client_id
         JOIN utilisateurs u ON u.id = v.utilisateur_id
         WHERE v.statut = 'finalisee'
         UNION ALL
         SELECT a.validated_at AS at, 'achat', a.reference, f.nom, a.total, u.nom_complet
         FROM achats a
         JOIN fournisseurs f ON f.id = a.fournisseur_id
         JOIN utilisateurs u ON u.id = a.created_by
         WHERE a.validated_at IS NOT NULL
         UNION ALL
         SELECT d.created_at AS at, 'depense', d.reference, d.libelle, -d.montant, u.nom_complet
         FROM depenses d JOIN utilisateurs u ON u.id = d.created_by
         WHERE d.archived_at IS NULL
         UNION ALL
         SELECT i.valide_at AS at, 'inventaire', i.reference, i.libelle, i.ecart_valeur, u.nom_complet
         FROM inventaires i JOIN utilisateurs u ON u.id = i.ouvert_par
         WHERE i.valide_at IS NOT NULL
       )
       WHERE at IS NOT NULL
       ORDER BY at DESC LIMIT 12`
    )
    .all() as unknown as TableauDeBord['activite']

  // --- Chiffres de la journee -------------------------------------------
  // Le tableau de bord ne montre plus de courbe : ce qu'on regarde le matin,
  // c'est le panier moyen, ce qui est parti a credit, et si la journee se
  // tient par rapport aux precedentes. Une courbe de quatorze points ne
  // repond a aucune de ces trois questions.

  const articles = (
    db
      .prepare(
        `SELECT COALESCE(SUM(vl.quantite), 0) n
         FROM vente_lignes vl JOIN ventes v ON v.id = vl.vente_id
         WHERE v.statut = 'finalisee' AND v.at BETWEEN ? AND ?`
      )
      .get(debut, fin) as unknown as { n: number }
  ).n

  const credit = db
    .prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(reste_a_payer), 0) montant
       FROM ventes
       WHERE statut = 'finalisee' AND reste_a_payer > 0 AND at BETWEEN ? AND ?`
    )
    .get(debut, fin) as unknown as { n: number; montant: number }

  // Moyenne des sept jours precedents, aujourd'hui exclu : comparer la
  // journee en cours a une moyenne qui la contient la lisserait.
  const septJours = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) ca, COUNT(*) n
       FROM ventes
       WHERE statut = 'finalisee' AND at >= ? AND at < ?`
    )
    .get(debutDeJournee(decalerJours(jour, -7)), debut) as unknown as { ca: number; n: number }

  // Une sauvegarde qui ne quitte pas la machine ne protège de rien : le
  // tableau de bord le réclame jusqu'à ce que ce soit fait.
  const copie = etatCopieExterne()

  const journee: TableauDeBord['journee'] = {
    panierMoyen: ceJour.n > 0 ? Math.round(ceJour.ca / ceJour.n) : 0,
    articles,
    ventesCredit: credit.n,
    montantCredit: credit.montant,
    chiffreHier: laVeille.ca,
    moyenneSeptJours: Math.round(septJours.ca / 7)
  }

  const meilleuresVentes = db
    .prepare(
      `SELECT p.nom_commercial AS nom, SUM(vl.quantite) AS quantite, SUM(vl.montant) AS montant
       FROM vente_lignes vl
       JOIN ventes v ON v.id = vl.vente_id
       JOIN produits p ON p.id = vl.produit_id
       WHERE v.statut = 'finalisee' AND v.at >= ?
       GROUP BY vl.produit_id
       ORDER BY quantite DESC
       LIMIT 6`
    )
    .all(debutDeJournee(decalerJours(jour, -6))) as unknown as TableauDeBord['meilleuresVentes']

  const reglements = db
    .prepare(
      `SELECT vp.mode, SUM(vp.montant) AS montant
       FROM vente_paiements vp
       JOIN ventes v ON v.id = vp.vente_id
       WHERE v.statut = 'finalisee' AND v.at BETWEEN ? AND ?
       GROUP BY vp.mode
       ORDER BY montant DESC`
    )
    .all(debut, fin) as unknown as TableauDeBord['reglements']

  const nbProduits = (
    db.prepare('SELECT COUNT(*) n FROM produits WHERE archived_at IS NULL').get() as unknown as { n: number }
  ).n
  const nbVentesTotal = (db.prepare('SELECT COUNT(*) n FROM ventes').get() as unknown as { n: number }).n

  return {
    date: jour,
    chiffreAffaires: indicateur(ceJour.ca, laVeille.ca),
    nbVentes: indicateur(ceJour.n, laVeille.n),
    beneficeEstime: indicateur(ceJour.ca - ceJour.cout, laVeille.ca - laVeille.cout),
    depenses: indicateur(depensesDu(jour), depensesDu(hier)),
    caisse: {
      ouverte: !!caisse.session,
      depuis: caisse.session?.ouverte_at ?? null,
      theorique: caisse.theoriqueEspeces,
      responsable: caisse.session?.utilisateur ?? null
    },
    sauvegarde: {
      configuree: copie.configuree,
      enRetard: copie.enRetard,
      joursDepuis: copie.joursDepuis,
      accessible: copie.accessible
    },
    surveillance: {
      ruptures: stock.ruptures,
      stockFaible: stock.faibles,
      expires: peremption.expires,
      peremptionProche: peremption.proches,
      valeurExpiree: peremption.valeurExpiree,
      dettesFournisseurs: dettes,
      creancesClients: creances
    },
    journee,
    meilleuresVentes,
    reglements,
    activite,
    aucuneDonnee: nbProduits === 0 && nbVentesTotal === 0
  }
}

/** Recherche globale : produits, ventes, clients, fournisseurs, achats. */
export function rechercheGlobale(saisie: string, limiteParType = 5): ResultatRecherche[] {
  const terme = saisie.trim()
  if (terme.length < 2) return []

  const db = base()
  const flou = `%${terme}%`
  const resultats: ResultatRecherche[] = []

  const produits = db
    .prepare(
      `SELECT id, nom_commercial, dosage, code_interne, stock_disponible, prix_vente
       FROM v_produit_etat
       WHERE archived_at IS NULL
         AND (nom_commercial LIKE ? OR nom_generique LIKE ? OR code_interne = ?
              OR id IN (SELECT produit_id FROM produit_codes_barres WHERE code = ?))
       ORDER BY nom_commercial LIMIT ?`
    )
    .all(flou, flou, terme, terme, limiteParType) as unknown as {
    id: number
    nom_commercial: string
    dosage: string | null
    code_interne: string
    stock_disponible: number
    prix_vente: number
  }[]

  for (const p of produits) {
    resultats.push({
      categorie: 'produit',
      id: p.id,
      titre: [p.nom_commercial, p.dosage].filter(Boolean).join(' '),
      sousTitre: p.code_interne,
      complement: `${p.stock_disponible} en stock`
    })
  }

  const ventes = db
    .prepare(
      `SELECT v.id, v.reference, v.at, v.total, c.nom
       FROM ventes v LEFT JOIN clients c ON c.id = v.client_id
       WHERE v.reference LIKE ? ORDER BY v.at DESC LIMIT ?`
    )
    .all(flou, limiteParType) as unknown as { id: number; reference: string; at: string; total: number; nom: string | null }[]

  for (const v of ventes) {
    resultats.push({
      categorie: 'vente',
      id: v.id,
      titre: v.reference,
      sousTitre: v.nom ?? 'Client de passage',
      complement: String(v.total)
    })
  }

  const clients = db
    .prepare(
      `SELECT id, nom, telephone, code FROM clients
       WHERE archived_at IS NULL AND (nom LIKE ? OR telephone LIKE ? OR code = ?)
       ORDER BY nom LIMIT ?`
    )
    .all(flou, flou, terme, limiteParType) as unknown as {
    id: number
    nom: string
    telephone: string | null
    code: string
  }[]

  for (const c of clients) {
    resultats.push({ categorie: 'client', id: c.id, titre: c.nom, sousTitre: c.telephone ?? c.code })
  }

  const fournisseurs = db
    .prepare(
      `SELECT id, nom, telephone FROM fournisseurs
       WHERE archived_at IS NULL AND (nom LIKE ? OR telephone LIKE ?) ORDER BY nom LIMIT ?`
    )
    .all(flou, flou, limiteParType) as unknown as { id: number; nom: string; telephone: string | null }[]

  for (const f of fournisseurs) {
    resultats.push({ categorie: 'fournisseur', id: f.id, titre: f.nom, sousTitre: f.telephone ?? '—' })
  }

  const achats = db
    .prepare(
      `SELECT a.id, a.reference, a.total, f.nom FROM achats a
       JOIN fournisseurs f ON f.id = a.fournisseur_id
       WHERE a.reference LIKE ? ORDER BY a.date_reception DESC LIMIT ?`
    )
    .all(flou, limiteParType) as unknown as { id: number; reference: string; total: number; nom: string }[]

  for (const a of achats) {
    resultats.push({
      categorie: 'achat',
      id: a.id,
      titre: a.reference,
      sousTitre: a.nom,
      complement: String(a.total)
    })
  }

  return resultats
}

// ---------------------------------------------------------------------------
// Rapports
// ---------------------------------------------------------------------------

export function rapportVentes(
  depuis: string,
  jusqua: string,
  granularite: 'jour' | 'semaine' | 'mois'
): { periode: string; nb: number; chiffreAffaires: number; marge: number }[] {
  const expression =
    granularite === 'mois'
      ? "substr(at, 1, 7)"
      : granularite === 'semaine'
        ? "strftime('%Y-S%W', at)"
        : 'substr(at, 1, 10)'

  return base()
    .prepare(
      `SELECT ${expression} AS periode, COUNT(*) nb,
              COALESCE(SUM(total), 0) chiffreAffaires,
              COALESCE(SUM(total - cout_total), 0) marge
       FROM ventes
       WHERE statut = 'finalisee' AND at BETWEEN ? AND ?
       GROUP BY periode ORDER BY periode`
    )
    .all(debutDeJournee(depuis), finDeJournee(jusqua)) as unknown as never
}

export function rapportProduits(
  depuis: string,
  jusqua: string,
  sens: 'meilleures' | 'faibles'
): {
  produit_id: number
  nom_commercial: string
  quantite: number
  chiffreAffaires: number
  marge: number
  stock_disponible: number
}[] {
  return base()
    .prepare(
      `SELECT vl.produit_id, p.nom_commercial,
              SUM(vl.quantite) quantite,
              SUM(vl.montant) chiffreAffaires,
              SUM(vl.montant - vl.cout_unitaire * vl.quantite) marge,
              e.stock_disponible
       FROM vente_lignes vl
       JOIN ventes v ON v.id = vl.vente_id
       JOIN produits p ON p.id = vl.produit_id
       LEFT JOIN v_produit_etat e ON e.id = vl.produit_id
       WHERE v.statut = 'finalisee' AND v.at BETWEEN ? AND ?
       GROUP BY vl.produit_id
       ORDER BY quantite ${sens === 'meilleures' ? 'DESC' : 'ASC'}
       LIMIT 30`
    )
    .all(debutDeJournee(depuis), finDeJournee(jusqua)) as unknown as never
}

export function rapportStock(): {
  valeurTotale: number
  nbReferences: number
  nbLots: number
  parCategorie: { categorie: string; references: number; valeur: number }[]
} {
  const db = base()
  const global = db
    .prepare(
      `SELECT COALESCE(SUM(s.valeur_achat), 0) valeur,
              COUNT(DISTINCT p.id) refs,
              (SELECT COUNT(*) FROM lots WHERE quantite_restante > 0) lots
       FROM produits p JOIN v_stock_produit s ON s.produit_id = p.id
       WHERE p.archived_at IS NULL`
    )
    .get() as unknown as { valeur: number; refs: number; lots: number }

  const parCategorie = db
    .prepare(
      `SELECT COALESCE(c.nom, 'Sans catégorie') categorie,
              COUNT(*) references_, COALESCE(SUM(e.valeur_achat), 0) valeur
       FROM v_produit_etat e LEFT JOIN categories c ON c.nom = e.categorie
       WHERE e.archived_at IS NULL
       GROUP BY c.nom ORDER BY valeur DESC`
    )
    .all() as unknown as { categorie: string; references_: number; valeur: number }[]

  return {
    valeurTotale: global.valeur,
    nbReferences: global.refs,
    nbLots: global.lots,
    parCategorie: parCategorie.map((c) => ({ categorie: c.categorie, references: c.references_, valeur: c.valeur }))
  }
}

export function journal(filtre: { depuis?: string; utilisateurId?: number; entite?: string; limite?: number } = {}): {
  id: number
  at: string
  action: string
  entite: string
  entite_id: number | null
  resume: string
  resultat: string
  utilisateur: string | null
}[] {
  const conditions: string[] = []
  const params: Record<string, ValeurSQL> = { limite: filtre.limite ?? 200 }

  if (filtre.depuis) (conditions.push('j.at >= :depuis'), (params.depuis = filtre.depuis))
  if (filtre.utilisateurId) (conditions.push('j.utilisateur_id = :uid'), (params.uid = filtre.utilisateurId))
  if (filtre.entite) (conditions.push('j.entite = :entite'), (params.entite = filtre.entite))

  return base()
    .prepare(
      `SELECT j.id, j.at, j.action, j.entite, j.entite_id, j.resume, j.resultat,
              u.nom_complet AS utilisateur
       FROM journal_activite j LEFT JOIN utilisateurs u ON u.id = j.utilisateur_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY j.at DESC, j.id DESC LIMIT :limite`
    )
    .all(params) as unknown as never
}
