/**
 * Le bilan mensuel de l'officine.
 *
 * POURQUOI CET ÉCRAN N'EST PAS UN RAPPORT DE PLUS
 *
 * Les rapports existants répondent à des questions qu'on leur pose : « combien
 * ai-je vendu en mars ? ». Encore faut-il penser à les poser, choisir la
 * période, comparer soi-même.
 *
 * Le bilan répond à la seule question qu'un gérant se pose vraiment, une fois
 * par mois : **est-ce que le mois a été bon, et pourquoi ?** Il tient sur une
 * feuille, se lit assis, et se montre à un banquier.
 *
 * CE QUI EST COMPARÉ, ET POURQUOI
 *
 * Un chiffre seul ne dit rien. « 4 200 000 FCFA » n'est ni bon ni mauvais tant
 * qu'on ne sait pas ce qu'était le mois d'avant. Chaque montant est donc donné
 * avec son précédent et l'écart, y compris quand l'écart est mauvais — un
 * bilan qui ne sait annoncer que les bonnes nouvelles ne sert à rien.
 *
 * TROIS PRÉCAUTIONS DE CALCUL
 *
 *   — les ventes annulées sortent de tous les totaux, sans exception ;
 *   — la marge se calcule sur le coût RÉEL des lots sortis, pas sur le prix
 *     d'achat du catalogue : c'est la seule marge qui a été encaissée ;
 *   — les bornes du mois passent par les fonctions de journée locale, sinon
 *     les ventes du 1er et du 31 basculent d'un mois à l'autre selon le
 *     décalage horaire.
 */
import { base } from '../db'
import { debutDeJournee, finDeJournee } from './commun'

export interface LigneClassement {
  nom: string
  quantite: number
  montant: number
  marge: number
}

export interface BilanMensuel {
  /** Mois traité, au format AAAA-MM. */
  mois: string
  libelleMois: string
  libelleMoisPrecedent: string
  debut: string
  fin: string

  ventes: { nombre: number; precedent: number }
  chiffreAffaires: { montant: number; precedent: number }
  marge: { montant: number; precedent: number; taux: number }
  panierMoyen: { montant: number; precedent: number }

  /** Ce qui a été encaissé, par mode de règlement. */
  reglements: { mode: string; montant: number }[]

  meilleuresVentes: LigneClassement[]
  /** En stock, mais aucune vente sur les trois derniers mois. */
  produitsQuiDorment: { nom: string; stock: number; valeur: number; derniereVente: string | null }[]

  stock: { valeur: number; references: number; ruptures: number }
  peremptions: { dansTroisMois: number; valeur: number; deja: number }
  creances: { total: number; clients: number }
  caisse: { sessions: number; ecartTotal: number; sessionsAvecEcart: number }
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
]

function libelle(mois: string): string {
  const [annee, m] = mois.split('-')
  return `${MOIS[Number(m) - 1] ?? m} ${annee}`
}

/** Premier et dernier jour civil d'un mois AAAA-MM. */
function bornes(mois: string): { debut: string; fin: string } {
  const [annee, m] = mois.split('-').map(Number)
  const dernierJour = new Date(Date.UTC(annee!, m!, 0)).getUTCDate()
  return {
    debut: debutDeJournee(`${mois}-01`),
    fin: finDeJournee(`${mois}-${String(dernierJour).padStart(2, '0')}`)
  }
}

function moisPrecedent(mois: string): string {
  const [annee, m] = mois.split('-').map(Number)
  return m! === 1
    ? `${annee! - 1}-12`
    : `${annee}-${String(m! - 1).padStart(2, '0')}`
}

/** Totaux d'un mois : une seule requête, réutilisée pour la comparaison. */
function totauxDuMois(mois: string): { nombre: number; chiffre: number; cout: number } {
  const { debut, fin } = bornes(mois)
  const ligne = base()
    .prepare(
      `SELECT COUNT(*) nombre,
              COALESCE(SUM(total), 0) chiffre,
              COALESCE(SUM(cout_total), 0) cout
       FROM ventes
       WHERE statut = 'finalisee' AND at >= ? AND at <= ?`
    )
    .get(debut, fin) as { nombre: number; chiffre: number; cout: number }
  return ligne
}

export function bilanMensuel(mois?: string): BilanMensuel {
  // Par défaut le mois en cours : c'est celui qu'on consulte en s'asseyant.
  const cible = mois?.trim() || new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cible)) {
    throw new Error('Mois attendu au format AAAA-MM.')
  }

  const precedent = moisPrecedent(cible)
  const { debut, fin } = bornes(cible)
  const ici = totauxDuMois(cible)
  const avant = totauxDuMois(precedent)

  const marge = ici.chiffre - ici.cout
  const margeAvant = avant.chiffre - avant.cout

  const reglements = base()
    .prepare(
      `SELECT p.mode, COALESCE(SUM(p.montant), 0) montant
       FROM vente_paiements p
       JOIN ventes v ON v.id = p.vente_id
       WHERE v.statut = 'finalisee' AND v.at >= ? AND v.at <= ?
       GROUP BY p.mode
       ORDER BY montant DESC`
    )
    .all(debut, fin) as unknown as { mode: string; montant: number }[]

  const meilleuresVentes = base()
    .prepare(
      `SELECT l.designation nom,
              SUM(l.quantite) quantite,
              SUM(l.montant) montant,
              SUM(l.montant - l.cout_unitaire * l.quantite) marge
       FROM vente_lignes l
       JOIN ventes v ON v.id = l.vente_id
       WHERE v.statut = 'finalisee' AND v.at >= ? AND v.at <= ?
       GROUP BY l.designation
       ORDER BY montant DESC
       LIMIT 10`
    )
    .all(debut, fin) as unknown as LigneClassement[]

  // Trois mois sans une seule vente : ce n'est plus un creux, c'est de
  // l'argent immobilisé. On part de la fin du mois traité, pas d'aujourd'hui,
  // pour qu'un bilan ancien reste juste.
  const troisMoisAvant = new Date(new Date(fin).getTime() - 92 * 86_400_000).toISOString()
  const produitsQuiDorment = base()
    .prepare(
      `SELECT p.nom_commercial nom,
              e.stock_disponible stock,
              e.valeur_achat valeur,
              (SELECT MAX(v.at) FROM vente_lignes l
                 JOIN ventes v ON v.id = l.vente_id
                WHERE l.produit_id = p.id AND v.statut = 'finalisee') derniereVente
       FROM produits p
       JOIN v_produit_etat e ON e.id = p.id
       WHERE p.archived_at IS NULL
         AND e.stock_disponible > 0
         AND (derniereVente IS NULL OR derniereVente < ?)
       ORDER BY e.valeur_achat DESC
       LIMIT 8`
    )
    .all(troisMoisAvant) as unknown as {
    nom: string
    stock: number
    valeur: number
    derniereVente: string | null
  }[]

  const stock = base()
    .prepare(
      `SELECT COALESCE(SUM(valeur_achat), 0) valeur,
              COUNT(*) references_,
              COALESCE(SUM(CASE WHEN stock_disponible <= 0 THEN 1 ELSE 0 END), 0) ruptures
       FROM v_produit_etat WHERE archived_at IS NULL`
    )
    .get() as { valeur: number; references_: number; ruptures: number }

  const dansTroisMois = new Date(new Date(fin).getTime() + 92 * 86_400_000).toISOString().slice(0, 10)
  const peremptions = base()
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN date_peremption > ? AND date_peremption <= ? THEN 1 ELSE 0 END), 0) proches,
              COALESCE(SUM(CASE WHEN date_peremption > ? AND date_peremption <= ?
                                THEN quantite_restante * prix_achat ELSE 0 END), 0) valeur,
              COALESCE(SUM(CASE WHEN date_peremption <= ? THEN 1 ELSE 0 END), 0) deja
       FROM lots
       WHERE quantite_restante > 0 AND date_peremption IS NOT NULL`
    )
    .get(
      fin.slice(0, 10), dansTroisMois,
      fin.slice(0, 10), dansTroisMois,
      fin.slice(0, 10)
    ) as { proches: number; valeur: number; deja: number }

  const creances = base()
    .prepare(
      `SELECT COALESCE(SUM(solde_du), 0) total,
              COALESCE(SUM(CASE WHEN solde_du > 0 THEN 1 ELSE 0 END), 0) clients
       FROM v_creance_client WHERE solde_du > 0`
    )
    .get() as { total: number; clients: number }

  const caisse = base()
    .prepare(
      `SELECT COUNT(*) sessions,
              COALESCE(SUM(ecart), 0) ecartTotal,
              COALESCE(SUM(CASE WHEN ecart <> 0 THEN 1 ELSE 0 END), 0) sessionsAvecEcart
       FROM caisse_sessions
       WHERE statut = 'fermee' AND ouverte_at >= ? AND ouverte_at <= ?`
    )
    .get(debut, fin) as { sessions: number; ecartTotal: number; sessionsAvecEcart: number }

  return {
    mois: cible,
    libelleMois: libelle(cible),
    libelleMoisPrecedent: libelle(precedent),
    debut,
    fin,
    ventes: { nombre: ici.nombre, precedent: avant.nombre },
    chiffreAffaires: { montant: ici.chiffre, precedent: avant.chiffre },
    marge: {
      montant: marge,
      precedent: margeAvant,
      // Le taux se lit sur le chiffre d'affaires du mois, pas sur le coût :
      // c'est la part de chaque franc encaissé qui reste à l'officine.
      taux: ici.chiffre > 0 ? Math.round((marge / ici.chiffre) * 1000) / 10 : 0
    },
    panierMoyen: {
      montant: ici.nombre > 0 ? Math.round(ici.chiffre / ici.nombre) : 0,
      precedent: avant.nombre > 0 ? Math.round(avant.chiffre / avant.nombre) : 0
    },
    reglements,
    meilleuresVentes,
    produitsQuiDorment,
    stock: { valeur: stock.valeur, references: stock.references_, ruptures: stock.ruptures },
    peremptions: {
      dansTroisMois: peremptions.proches,
      valeur: peremptions.valeur,
      deja: peremptions.deja
    },
    creances,
    caisse
  }
}
