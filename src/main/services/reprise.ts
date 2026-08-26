/**
 * Reprise de données.
 *
 * Une officine qui change de logiciel a déjà tout : trois mille références,
 * leurs prix, leurs stocks, ses clients et ce qu'ils doivent. Lui demander de
 * ressaisir, c'est lui demander de ne pas changer de logiciel. C'est le coût
 * caché qui décide réellement d'un achat.
 *
 * Le principe est ici : on lit un fichier exporté par l'ancien outil — aucun
 * n'exporte les mêmes colonnes — et c'est l'utilisateur qui dit quelle colonne
 * est quoi. Puis on simule. La simulation lit tout, valide tout, compte tout,
 * et n'écrit rien : elle rend la liste des lignes qui poseront problème,
 * avec leur numéro. On corrige, on recommence, et on n'importe que lorsque le
 * rapport est propre.
 *
 * L'import lui-même est une transaction unique : il passe entièrement ou ne
 * laisse rien. Un catalogue à moitié importé serait pire que pas d'import.
 */
import { readFileSync } from 'node:fs'
import { base, transaction } from '../db'
import { ErreurMetier, journaliser } from './commun'
import { creerProduit, modifierProduit } from './produits'
import { enregistrerClient, enregistrerFournisseur } from './partenaires'
import { entrerStock } from './stock'

export type TypeReprise = 'produits' | 'clients' | 'fournisseurs'

export interface ChampReprise {
  cle: string
  libelle: string
  obligatoire: boolean
  aide?: string
}

/**
 * Champs repris, par nature de fichier.
 *
 * Volontairement court : on reprend ce qui coûte cher à ressaisir, pas tout ce
 * que le logiciel sait stocker. Les notes internes et les préférences se
 * remplissent à l'usage.
 */
const CHAMPS: Record<TypeReprise, ChampReprise[]> = {
  produits: [
    { cle: 'nom', libelle: 'Nom du produit', obligatoire: true },
    { cle: 'dosage', libelle: 'Dosage', obligatoire: false },
    { cle: 'dci', libelle: 'Principe actif (DCI)', obligatoire: false },
    { cle: 'prixAchat', libelle: 'Prix d’achat', obligatoire: false },
    { cle: 'prixVente', libelle: 'Prix de vente', obligatoire: true },
    { cle: 'stock', libelle: 'Quantité en stock', obligatoire: false, aide: 'Crée un lot d’ouverture.' },
    { cle: 'peremption', libelle: 'Date de péremption', obligatoire: false, aide: 'Du lot d’ouverture.' },
    { cle: 'lot', libelle: 'Numéro de lot', obligatoire: false },
    { cle: 'stockMin', libelle: 'Seuil minimum', obligatoire: false },
    { cle: 'codeBarres', libelle: 'Code-barres', obligatoire: false },
    { cle: 'emplacement', libelle: 'Emplacement', obligatoire: false },
    { cle: 'ordonnance', libelle: 'Sur ordonnance', obligatoire: false, aide: 'oui/non, 1/0, O/N.' }
  ],
  clients: [
    { cle: 'nom', libelle: 'Nom du client', obligatoire: true },
    { cle: 'telephone', libelle: 'Téléphone', obligatoire: false },
    { cle: 'email', libelle: 'Adresse électronique', obligatoire: false },
    { cle: 'adresse', libelle: 'Adresse', obligatoire: false },
    { cle: 'plafond', libelle: 'Plafond de crédit', obligatoire: false },
    {
      cle: 'solde',
      libelle: 'Créance à reprendre',
      obligatoire: false,
      aide: 'Ce que le client doit aujourd’hui. Repris comme une vente d’ouverture à crédit.'
    }
  ],
  fournisseurs: [
    { cle: 'nom', libelle: 'Nom du fournisseur', obligatoire: true },
    { cle: 'contact', libelle: 'Contact', obligatoire: false },
    { cle: 'telephone', libelle: 'Téléphone', obligatoire: false },
    { cle: 'email', libelle: 'Adresse électronique', obligatoire: false },
    { cle: 'adresse', libelle: 'Adresse', obligatoire: false },
    { cle: 'ville', libelle: 'Ville', obligatoire: false },
    { cle: 'conditions', libelle: 'Conditions de paiement', obligatoire: false }
  ]
}

export function champs(type: TypeReprise): ChampReprise[] {
  return CHAMPS[type] ?? []
}

// ---------------------------------------------------------------------------
// Lecture du fichier
// ---------------------------------------------------------------------------

/**
 * Décodage du fichier.
 *
 * Les exports d'anciens logiciels de gestion sont rarement en UTF-8 : sous
 * Windows, c'est le plus souvent du Windows-1252. Sans détection, tous les
 * accents deviennent illisibles — et l'utilisateur croit que le logiciel est
 * cassé.
 */
function decoder(brut: Buffer): string {
  // BOM UTF-8 : le fichier annonce lui-même son encodage.
  if (brut.length >= 3 && brut[0] === 0xef && brut[1] === 0xbb && brut[2] === 0xbf) {
    return brut.subarray(3).toString('utf8')
  }

  const utf8 = brut.toString('utf8')
  // U+FFFD = octet indécodable en UTF-8 : c'était donc autre chose.
  if (!utf8.includes('�')) return utf8

  return new TextDecoder('windows-1252').decode(brut)
}

/** Le séparateur est celui qui découpe le plus régulièrement les premières lignes. */
function detecterSeparateur(texte: string): string {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  if (lignes.length === 0) return ';'

  let meilleur = ';'
  let meilleurScore = -1

  for (const candidat of [';', ',', '\t', '|']) {
    const comptes = lignes.map((l) => decouper(l, candidat).length)
    const premier = comptes[0]!
    if (premier < 2) continue
    // Un bon séparateur donne le même nombre de colonnes à chaque ligne.
    const regulier = comptes.every((n) => n === premier)
    const score = (regulier ? 1000 : 0) + premier
    if (score > meilleurScore) {
      meilleurScore = score
      meilleur = candidat
    }
  }

  return meilleur
}

/** Découpe une ligne en respectant les guillemets et les doublements. */
function decouper(ligne: string, separateur: string): string[] {
  const cellules: string[] = []
  let courante = ''
  let dansGuillemets = false

  for (let i = 0; i < ligne.length; i++) {
    const caractere = ligne[i]!

    if (dansGuillemets) {
      if (caractere === '"') {
        if (ligne[i + 1] === '"') {
          courante += '"'
          i++
        } else {
          dansGuillemets = false
        }
      } else {
        courante += caractere
      }
      continue
    }

    if (caractere === '"') {
      dansGuillemets = true
    } else if (caractere === separateur) {
      cellules.push(courante.trim())
      courante = ''
    } else {
      courante += caractere
    }
  }

  cellules.push(courante.trim())
  return cellules
}

export interface AnalyseFichier {
  colonnes: string[]
  apercu: string[][]
  lignes: number
  separateur: string
  /** Correspondance devinée d'après les en-têtes, à confirmer par l'utilisateur. */
  suggestion: Record<string, number>
}

/** Retire accents, ponctuation et casse : « Prix de vente » et « PRIX_VENTE » se ressemblent alors. */
function aplatir(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Mots par lesquels une colonne se reconnaît, du plus précis au plus vague.
 *
 * La suggestion n'est qu'une proposition : elle fait gagner du temps sur les
 * exports courants, et l'utilisateur corrige ce qui ne va pas. On ne devine
 * jamais en silence.
 */
const INDICES: Record<TypeReprise, Record<string, string[]>> = {
  produits: {
    nom: ['nomcommercial', 'designation', 'libelle', 'produit', 'article', 'nom'],
    dosage: ['dosage', 'dose', 'grammage'],
    dci: ['principeactif', 'dci', 'generique', 'moleculaire', 'molecule'],
    prixAchat: ['prixachat', 'pxachat', 'pa', 'achat', 'cout', 'prixdachat'],
    prixVente: ['prixvente', 'pxvente', 'pv', 'vente', 'prixpublic', 'ppv', 'prix'],
    stock: ['stock', 'quantite', 'qte', 'qty', 'disponible'],
    peremption: ['peremption', 'peremp', 'expiration', 'dlu', 'dluo', 'datexp', 'exp'],
    lot: ['lot', 'numerolot', 'nlot', 'batch'],
    stockMin: ['stockmin', 'seuil', 'minimum', 'seuilalerte'],
    codeBarres: ['codebarres', 'codebarre', 'ean', 'ean13', 'gencod', 'barcode'],
    emplacement: ['emplacement', 'rayon', 'localisation', 'place', 'casier'],
    ordonnance: ['ordonnance', 'prescription', 'listee', 'reglementation']
  },
  clients: {
    nom: ['nom', 'client', 'raisonsociale', 'designation', 'libelle'],
    telephone: ['telephone', 'tel', 'portable', 'mobile', 'gsm'],
    email: ['email', 'mail', 'courriel', 'adresseelectronique'],
    adresse: ['adresse', 'rue', 'quartier'],
    plafond: ['plafond', 'limite', 'encoursmax', 'plafondcredit'],
    solde: ['solde', 'creance', 'du', 'restedu', 'impaye', 'ardoise', 'dette']
  },
  fournisseurs: {
    nom: ['nom', 'fournisseur', 'raisonsociale', 'designation', 'libelle'],
    contact: ['contact', 'interlocuteur', 'responsable'],
    telephone: ['telephone', 'tel', 'portable', 'mobile', 'gsm'],
    email: ['email', 'mail', 'courriel'],
    adresse: ['adresse', 'rue'],
    ville: ['ville', 'localite'],
    conditions: ['conditions', 'paiement', 'reglement', 'delai']
  }
}

function deviner(type: TypeReprise, colonnes: string[]): Record<string, number> {
  const aplaties = colonnes.map(aplatir)
  const suggestion: Record<string, number> = {}
  const prises = new Set<number>()

  for (const champ of CHAMPS[type]) {
    const indices = INDICES[type][champ.cle] ?? []

    // Correspondance exacte d'abord : « prix » ne doit pas capturer
    // « prix d'achat » quand une colonne s'appelle exactement « prix vente ».
    let trouve = aplaties.findIndex((c, i) => !prises.has(i) && indices.includes(c))
    if (trouve < 0) {
      trouve = aplaties.findIndex((c, i) => !prises.has(i) && indices.some((m) => c.includes(m)))
    }

    if (trouve >= 0) {
      suggestion[champ.cle] = trouve
      prises.add(trouve)
    }
  }

  return suggestion
}

export function analyser(chemin: string, type: TypeReprise): AnalyseFichier {
  let texte: string
  try {
    texte = decoder(readFileSync(chemin))
  } catch (erreur) {
    throw new ErreurMetier(`Fichier illisible : ${(erreur as Error).message}`, 'fichier')
  }

  const lignes = texte.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lignes.length < 2) {
    throw new ErreurMetier(
      'Le fichier doit contenir une ligne d’en-têtes et au moins une ligne de données.',
      'fichier'
    )
  }

  const separateur = detecterSeparateur(texte)
  const colonnes = decouper(lignes[0]!, separateur)

  return {
    colonnes,
    apercu: lignes.slice(1, 6).map((l) => decouper(l, separateur)),
    lignes: lignes.length - 1,
    separateur,
    suggestion: deviner(type, colonnes)
  }
}

// ---------------------------------------------------------------------------
// Conversions tolérantes
// ---------------------------------------------------------------------------

/**
 * Montant écrit à la main ou exporté par un tableur.
 *
 * « 1 500 », « 1.500,00 », « 1,500.00 », « 1500 FCFA » désignent tous la même
 * chose. Règle retenue : quand les deux séparateurs sont présents, le dernier
 * est le séparateur décimal. Quand un seul l'est et qu'il précède exactement
 * trois chiffres, c'est un séparateur de milliers.
 */
export function lireMontant(brut: string): number | null {
  const texte = brut.replace(/[^\d.,-]/g, '').trim()
  if (!texte) return null

  const dernierPoint = texte.lastIndexOf('.')
  const derniereVirgule = texte.lastIndexOf(',')
  let normalise: string

  if (dernierPoint >= 0 && derniereVirgule >= 0) {
    const decimal = Math.max(dernierPoint, derniereVirgule)
    normalise = texte.slice(0, decimal).replace(/[.,]/g, '') + '.' + texte.slice(decimal + 1)
  } else if (dernierPoint >= 0 || derniereVirgule >= 0) {
    const position = Math.max(dernierPoint, derniereVirgule)
    const apres = texte.length - position - 1
    normalise =
      apres === 3
        ? texte.replace(/[.,]/g, '')
        : texte.slice(0, position).replace(/[.,]/g, '') + '.' + texte.slice(position + 1)
  } else {
    normalise = texte
  }

  const valeur = Number(normalise)
  return Number.isFinite(valeur) ? valeur : null
}

/** Quantité entière, tolérante aux décimales inutiles d'un tableur (« 12,00 »). */
export function lireEntier(brut: string): number | null {
  const valeur = lireMontant(brut)
  return valeur === null ? null : Math.round(valeur)
}

/** Date en jj/mm/aaaa, aaaa-mm-jj, jj-mm-aa… ramenée à la forme ISO. */
export function lireDate(brut: string): string | null {
  const texte = brut.trim()
  if (!texte) return null

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(texte)
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`

  const jour = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(texte)
  if (jour) {
    const annee = jour[3]!.length === 2 ? `20${jour[3]}` : jour[3]!
    return `${annee}-${jour[2]!.padStart(2, '0')}-${jour[1]!.padStart(2, '0')}`
  }

  // Certains exports ne donnent que le mois : on prend le dernier jour, car
  // une péremption au 03/2027 court jusqu'au 31 mars.
  const mois = /^(\d{1,2})[-/.](\d{4})$/.exec(texte)
  if (mois) {
    const dernier = new Date(Number(mois[2]), Number(mois[1]), 0).getDate()
    return `${mois[2]}-${mois[1]!.padStart(2, '0')}-${dernier}`
  }

  return null
}

export function lireBooleen(brut: string): boolean {
  const texte = aplatir(brut)
  return ['1', 'oui', 'o', 'yes', 'y', 'true', 'vrai', 'x'].includes(texte)
}

// ---------------------------------------------------------------------------
// Simulation et import
// ---------------------------------------------------------------------------

export interface DemandeReprise {
  chemin: string
  type: TypeReprise
  /** Champ → index de colonne dans le fichier. */
  correspondance: Record<string, number>
  /** Vrai : mettre à jour ce qui existe déjà. Faux : l'ignorer. */
  mettreAJour: boolean
}

export interface AnomalieLigne {
  ligne: number
  motif: string
  valeur?: string
}

export interface RapportReprise {
  lignesLues: number
  crees: number
  misAJour: number
  ignores: number
  refuses: number
  /** Au plus cinquante : au-delà, c'est le fichier qu'il faut reprendre, pas les lignes. */
  anomalies: AnomalieLigne[]
  /** Lots d'ouverture créés, pour les produits. */
  lotsCrees: number
  /** Créances reprises, pour les clients. */
  creancesReprises: number
  simulation: boolean
}

const MAX_ANOMALIES = 50

function cellule(ligne: string[], correspondance: Record<string, number>, champ: string): string {
  const index = correspondance[champ]
  if (index === undefined || index < 0) return ''
  return (ligne[index] ?? '').trim()
}

function lireLignes(demande: DemandeReprise): string[][] {
  const texte = decoder(readFileSync(demande.chemin))
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const separateur = detecterSeparateur(texte)
  return lignes.slice(1).map((l) => decouper(l, separateur))
}

/**
 * Lit tout, valide tout, n'écrit rien.
 *
 * C'est l'étape qui donne confiance : on voit combien de produits seront
 * créés, combien mis à jour, et exactement quelles lignes coincent — avec
 * leur numéro dans le fichier, celui que le tableur affiche.
 */
export function simuler(demande: DemandeReprise): RapportReprise {
  return executer(demande, null, true)
}

export function importer(demande: DemandeReprise, utilisateurId: number): RapportReprise {
  const rapport = transaction(() => executer(demande, utilisateurId, false))

  journaliser({
    utilisateurId,
    action: 'Reprise de données',
    entite: demande.type,
    resume: `${rapport.crees} créé(s), ${rapport.misAJour} mis à jour, ${rapport.refuses} refusé(s)`
  })

  return rapport
}

function executer(
  demande: DemandeReprise,
  utilisateurId: number | null,
  simulation: boolean
): RapportReprise {
  const manquants = CHAMPS[demande.type]
    .filter((c) => c.obligatoire && demande.correspondance[c.cle] === undefined)
    .map((c) => c.libelle)

  if (manquants.length) {
    throw new ErreurMetier(
      `Colonnes obligatoires non associées : ${manquants.join(', ')}.`,
      'correspondance'
    )
  }

  const lignes = lireLignes(demande)
  const rapport: RapportReprise = {
    lignesLues: lignes.length,
    crees: 0,
    misAJour: 0,
    ignores: 0,
    refuses: 0,
    anomalies: [],
    lotsCrees: 0,
    creancesReprises: 0,
    simulation
  }

  const signaler = (ligne: number, motif: string, valeur?: string): void => {
    rapport.refuses++
    if (rapport.anomalies.length < MAX_ANOMALIES) rapport.anomalies.push({ ligne, motif, valeur })
  }

  // Doublons internes au fichier : deux lignes du même produit passeraient
  // les contrôles une par une et créeraient deux fiches.
  const vus = new Set<string>()

  lignes.forEach((ligne, index) => {
    // +2 : l'en-tête compte pour une ligne, et les tableurs numérotent à partir de 1.
    const numero = index + 2
    const nom = cellule(ligne, demande.correspondance, 'nom')

    if (!nom) {
      signaler(numero, 'Nom vide')
      return
    }

    const cle = aplatir(nom) + '|' + aplatir(cellule(ligne, demande.correspondance, 'dosage'))
    if (vus.has(cle)) {
      signaler(numero, 'Doublon dans le fichier', nom)
      return
    }
    vus.add(cle)

    try {
      if (demande.type === 'produits') reprendreProduit(ligne, demande, rapport, utilisateurId, numero, signaler)
      else if (demande.type === 'clients') reprendreClient(ligne, demande, rapport, utilisateurId)
      else reprendreFournisseur(ligne, demande, rapport, utilisateurId)
    } catch (erreur) {
      signaler(numero, (erreur as Error).message, nom)
    }
  })

  return rapport
}

function reprendreProduit(
  ligne: string[],
  demande: DemandeReprise,
  rapport: RapportReprise,
  utilisateurId: number | null,
  numero: number,
  signaler: (ligne: number, motif: string, valeur?: string) => void
): void {
  const lire = (champ: string): string => cellule(ligne, demande.correspondance, champ)

  const nom = lire('nom')
  const dosage = lire('dosage') || null
  const prixVente = lireMontant(lire('prixVente'))

  if (prixVente === null || prixVente < 0) {
    signaler(numero, 'Prix de vente illisible', lire('prixVente'))
    return
  }

  const prixAchat = lireMontant(lire('prixAchat')) ?? 0
  const codeBarres = lire('codeBarres').replace(/\s/g, '')

  // Un produit existant se reconnaît d'abord à son code-barres — c'est le seul
  // identifiant fiable — puis au couple nom + dosage.
  const parCode = codeBarres
    ? (base()
        .prepare(
          `SELECT p.id FROM produits p
           JOIN produit_codes_barres b ON b.produit_id = p.id
           WHERE b.code = ? AND p.archived_at IS NULL`
        )
        .get(codeBarres) as unknown as { id: number } | undefined)
    : undefined

  const existant =
    parCode ??
    (base()
      .prepare(
        `SELECT id FROM produits
         WHERE archived_at IS NULL AND LOWER(nom_commercial) = LOWER(?)
           AND LOWER(COALESCE(dosage, '')) = LOWER(?)`
      )
      .get(nom, dosage ?? '') as unknown as { id: number } | undefined)

  if (existant && !demande.mettreAJour) {
    rapport.ignores++
    return
  }

  const champsProduit = {
    nomCommercial: nom,
    dosage,
    principeActif: lire('dci') || null,
    nomGenerique: lire('dci') || null,
    prixAchat: Math.round(prixAchat),
    prixVente: Math.round(prixVente),
    stockMin: lireEntier(lire('stockMin')) ?? 10,
    emplacement: lire('emplacement') || null,
    ordonnanceRequise: lireBooleen(lire('ordonnance')),
    codesBarres: codeBarres ? [codeBarres] : []
  }

  let produitId: number

  if (existant) {
    if (rapport.simulation) {
      rapport.misAJour++
      compterLotSimule(ligne, demande, rapport)
      return
    }
    modifierProduit(existant.id, champsProduit, utilisateurId!)
    produitId = existant.id
    rapport.misAJour++
  } else {
    if (rapport.simulation) {
      rapport.crees++
      compterLotSimule(ligne, demande, rapport)
      return
    }
    produitId = creerProduit(champsProduit, utilisateurId!)
    rapport.crees++
  }

  // Stock d'ouverture : une entrée de stock tracée, pas un chiffre posé dans
  // une colonne. Elle apparaît dans les mouvements comme toute autre entrée.
  const quantite = lireEntier(lire('stock')) ?? 0
  if (quantite > 0) {
    // Reprendre deux fois le même fichier ne doit pas doubler le stock : le
    // lot d'ouverture ne se crée qu'une fois par produit.
    const dejaRepris = base()
      .prepare(
        `SELECT 1 x FROM mouvements_stock
         WHERE produit_id = ? AND motif = 'Reprise de données' LIMIT 1`
      )
      .get(produitId)

    if (dejaRepris) {
      rapport.ignores++
      return
    }

    const peremptionBrute = lire('peremption')
    const peremption = lireDate(peremptionBrute)

    if (peremptionBrute && !peremption) {
      signaler(numero, 'Date de péremption illisible', peremptionBrute)
    }

    entrerStock(
      {
        produitId,
        quantite,
        prixAchat: Math.round(prixAchat),
        numeroLot: lire('lot') || null,
        datePeremption: peremption,
        motif: 'Reprise de données',
        type: 'entree'
      },
      utilisateurId!
    )
    rapport.lotsCrees++
  }
}

function compterLotSimule(
  ligne: string[],
  demande: DemandeReprise,
  rapport: RapportReprise
): void {
  const quantite = lireEntier(cellule(ligne, demande.correspondance, 'stock')) ?? 0
  if (quantite > 0) rapport.lotsCrees++
}

function reprendreClient(
  ligne: string[],
  demande: DemandeReprise,
  rapport: RapportReprise,
  utilisateurId: number | null
): void {
  const lire = (champ: string): string => cellule(ligne, demande.correspondance, champ)
  const nom = lire('nom')

  const existant = base()
    .prepare('SELECT id FROM clients WHERE archived_at IS NULL AND LOWER(nom) = LOWER(?)')
    .get(nom) as unknown as { id: number } | undefined

  if (existant && !demande.mettreAJour) {
    rapport.ignores++
    return
  }

  const solde = lireMontant(lire('solde')) ?? 0

  if (rapport.simulation) {
    if (existant) rapport.misAJour++
    else rapport.crees++
    if (solde > 0) rapport.creancesReprises++
    return
  }

  const clientId = enregistrerClient(
    existant?.id ?? null,
    {
      nom,
      telephone: lire('telephone') || null,
      email: lire('email') || null,
      adresse: lire('adresse') || null,
      plafondCredit: Math.round(lireMontant(lire('plafond')) ?? 0)
    },
    utilisateurId!
  )

  if (existant) rapport.misAJour++
  else rapport.crees++

  if (solde > 0 && reprendreCreance(clientId, Math.round(solde), utilisateurId!)) {
    rapport.creancesReprises++
  }
}

/**
 * Créance d'ouverture.
 *
 * Le solde repris n'est pas écrit dans une colonne « il doit tant » : les
 * créances du logiciel sont toujours calculées depuis les ventes. On enregistre
 * donc une vente d'ouverture, entièrement à crédit, sans ligne de produit —
 * elle ne touche donc aucun stock — et le compte client la présente comme le
 * report qu'elle est.
 *
 * C'est ce qui garantit que le relevé de compte reste juste : le solde du
 * client redevient une somme d'opérations, pas une valeur posée à la main.
 */
function reprendreCreance(clientId: number, montant: number, utilisateurId: number): boolean {
  const reference = `REPRISE-${String(clientId).padStart(5, '0')}`

  // Une référence unique par client : reprendre deux fois le même fichier ne
  // peut donc pas doubler l'ardoise.
  if (base().prepare('SELECT 1 x FROM ventes WHERE reference = ?').get(reference)) return false

  base()
    .prepare(
      `INSERT INTO ventes
         (reference, client_id, utilisateur_id, statut, sous_total, remise, taxe,
          total, cout_total, montant_recu, monnaie_rendue, reste_a_payer, note)
       VALUES (?, ?, ?, 'finalisee', ?, 0, 0, ?, 0, 0, 0, ?, ?)`
    )
    .run(
      reference,
      clientId,
      utilisateurId,
      montant,
      montant,
      montant,
      'Report de solde — reprise de l’ancien logiciel'
    )

  return true
}

function reprendreFournisseur(
  ligne: string[],
  demande: DemandeReprise,
  rapport: RapportReprise,
  utilisateurId: number | null
): void {
  const lire = (champ: string): string => cellule(ligne, demande.correspondance, champ)
  const nom = lire('nom')

  const existant = base()
    .prepare('SELECT id FROM fournisseurs WHERE archived_at IS NULL AND LOWER(nom) = LOWER(?)')
    .get(nom) as unknown as { id: number } | undefined

  if (existant && !demande.mettreAJour) {
    rapport.ignores++
    return
  }

  if (rapport.simulation) {
    if (existant) rapport.misAJour++
    else rapport.crees++
    return
  }

  enregistrerFournisseur(
    existant?.id ?? null,
    {
      nom,
      contactPrincipal: lire('contact') || null,
      telephone: lire('telephone') || null,
      email: lire('email') || null,
      adresse: lire('adresse') || null,
      ville: lire('ville') || null,
      conditionsPaiement: lire('conditions') || null
    },
    utilisateurId!
  )

  if (existant) rapport.misAJour++
  else rapport.crees++
}
