/**
 * Scénario de bout en bout : une journée de pharmacie.
 *
 * Exerce les services réels sur une base neuve, exactement comme le fera
 * l'application. Aucune donnée n'est simulée : chaque chiffre vérifié est
 * calculé par le logiciel.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { VERSION_SCHEMA, base, enClair, fermerBase, ouvrirBase } from '../src/main/db'
import * as auth from '../src/main/services/auth'
import * as configuration from '../src/main/services/configuration'
import * as produits from '../src/main/services/produits'
import Moteur from 'better-sqlite3-multiple-ciphers'
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto'
import { homedir, hostname, userInfo } from 'node:os'

import * as coffre from '../src/main/services/coffre'
import * as licence from '../src/main/services/licence'
import * as repertoire from '../src/main/services/repertoire'
import * as reprise from '../src/main/services/reprise'
import * as stock from '../src/main/services/stock'
import * as secours from '../src/main/secours'
import * as codesBarres from '../src/main/services/codesBarres'
import * as achats from '../src/main/services/achats'
import * as caisse from '../src/main/services/caisse'
import * as ventes from '../src/main/services/ventes'
import * as partenaires from '../src/main/services/partenaires'
import * as inventaire from '../src/main/services/inventaire'
import * as finances from '../src/main/services/finances'
import * as pilotage from '../src/main/services/pilotage'
import * as alertes from '../src/main/services/alertes'
import {
  aujourdhui,
  debutDeJournee,
  decalerJours,
  finDeJournee,
  maintenant
} from '../src/main/services/commun'

let reussis = 0
let echoues = 0
const echecs: string[] = []

function verifier(condition: boolean, description: string, observe?: unknown): void {
  if (condition) {
    reussis++
    console.log(`  OK    | ${description}`)
  } else {
    echoues++
    echecs.push(description)
    console.log(`  ECHEC | ${description}${observe !== undefined ? ` -> ${JSON.stringify(observe)}` : ''}`)
  }
}

function refuse(description: string, action: () => unknown, motifAttendu?: string): void {
  try {
    action()
    echoues++
    echecs.push(description)
    console.log(`  ECHEC | ${description} -> accepte alors que cela devait etre refuse`)
  } catch (erreur) {
    const message = (erreur as Error).message
    const bon = !motifAttendu || message.toLowerCase().includes(motifAttendu.toLowerCase())
    if (bon) {
      reussis++
      console.log(`  OK    | ${description}`)
    } else {
      echoues++
      echecs.push(description)
      console.log(`  ECHEC | ${description} -> refuse pour une autre raison : ${message}`)
    }
  }
}

function titre(texte: string): void {
  console.log(`\n-- ${texte} ${'-'.repeat(Math.max(0, 62 - texte.length))}`)
}

const dossier = mkdtempSync(join(tmpdir(), 'pharmina-e2e-'))
const cheminBase = join(dossier, 'donnees', 'pharmina.db')

try {
  ouvrirBase(cheminBase)

  // ==========================================================================
  titre('Première configuration')

  verifier(auth.besoinConfiguration(), 'une base neuve exige la configuration initiale')

  refuse(
    'un mot de passe trop court est refusé',
    () =>
      configuration.configurerPharmacie({
        pharmacie: { nom: 'X', devise: 'XOF', deviseSymbole: 'FCFA', deviseDecimales: 0 },
        administrateur: { nomComplet: 'A', identifiant: 'admin', motDePasse: 'abc1' }
      }),
    'au moins 8'
  )

  const { utilisateurId: adminId } = configuration.configurerPharmacie({
    pharmacie: {
      nom: 'Pharmacie du Plateau',
      ville: 'Abidjan',
      pays: "Côte d'Ivoire",
      telephone: '+225 27 20 00 00 00',
      devise: 'XOF',
      deviseSymbole: 'FCFA',
      deviseDecimales: 0
    },
    administrateur: {
      nomComplet: 'Marie Dupont',
      identifiant: 'marie',
      motDePasse: 'Officine2026'
    }
  })

  verifier(adminId > 0, "l'administrateur est créé")
  verifier(!auth.besoinConfiguration(), 'le logiciel est configuré')
  refuse(
    'une seconde configuration est refusée',
    () =>
      configuration.configurerPharmacie({
        pharmacie: { nom: 'Autre', devise: 'XOF', deviseSymbole: 'FCFA', deviseDecimales: 0 },
        administrateur: { nomComplet: 'B', identifiant: 'b', motDePasse: 'Officine2026' }
      }),
    'déjà configuré'
  )

  // ==========================================================================
  titre('Connexion et sécurité')

  refuse('un mot de passe erroné est refusé', () => auth.connecter('marie', 'mauvais'), 'incorrect')
  refuse('un identifiant inconnu est refusé', () => auth.connecter('inconnu', 'Officine2026'), 'incorrect')

  const session = auth.connecter('marie', 'Officine2026')
  verifier(session.utilisateur.nom_complet === 'Marie Dupont', 'connexion réussie')
  verifier(session.permissions.length === 50, "l'administrateur reçoit les 50 permissions", session.permissions.length)

  const caissierId = auth.creerUtilisateur(
    { nomComplet: 'Jean Kouassi', identifiant: 'jean', motDePasse: 'Comptoir2026', roleId: 3 },
    adminId
  )
  const permissionsCaissier = auth.permissionsDe(caissierId)
  verifier(permissionsCaissier.includes('ventes.creer'), 'le caissier peut vendre')
  verifier(!permissionsCaissier.includes('produits.prix'), 'le caissier ne peut pas modifier un prix')
  verifier(!permissionsCaissier.includes('ventes.remise'), 'le caissier ne peut pas appliquer de remise')

  refuse(
    'le dernier administrateur ne peut pas être désactivé',
    () => auth.modifierUtilisateur(adminId, { actif: false }, caissierId),
    'dernier administrateur'
  )

  // ==========================================================================
  titre('Catalogue')

  const refs = produits.referentiels()
  verifier(refs.formes.length >= 18 && refs.unites.length >= 8, 'le référentiel pharmaceutique est disponible')

  const doliprane = produits.creerProduit(
    {
      nomCommercial: 'Doliprane',
      nomGenerique: 'Paracétamol',
      principeActif: 'paracétamol',
      dosage: '500 mg',
      categorieId: 1,
      formeId: 1,
      uniteId: 2,
      prixAchat: 900,
      prixVente: 1500,
      stockMin: 20,
      emplacement: 'Rayon A-12',
      codesBarres: ['3400930000001']
    },
    adminId
  )

  const amoxicilline = produits.creerProduit(
    {
      nomCommercial: 'Amoxicilline',
      nomGenerique: 'Amoxicilline',
      dosage: '500 mg',
      categorieId: 1,
      formeId: 2,
      prixAchat: 3100,
      prixVente: 4800,
      stockMin: 10,
      ordonnanceRequise: true,
      emplacement: 'Rayon A-14'
    },
    adminId
  )

  const gel = produits.creerProduit(
    {
      nomCommercial: 'Gel hydroalcoolique',
      dosage: '250 ml',
      categorieId: 3,
      prixAchat: 1150,
      prixVente: 2000,
      stockMin: 8,
      emplacement: 'Rayon C-02'
    },
    adminId
  )

  verifier(produits.produit(doliprane)?.stock === 0, 'un produit créé démarre à zéro en stock')
  verifier(
    produits.produit(doliprane)?.etat_stock === 'rupture',
    'un produit sans stock est en rupture'
  )

  refuse(
    'un code-barres déjà attribué est refusé',
    () =>
      produits.creerProduit(
        { nomCommercial: 'Copie', prixAchat: 1, prixVente: 2, stockMin: 1, codesBarres: ['3400930000001'] },
        adminId
      ),
    'déjà attribué'
  )

  verifier(produits.rechercheRapide('paracetamol').length === 1, 'recherche sans accent : « paracetamol »')
  verifier(produits.rechercheRapide('DOLIP').length === 1, 'recherche partielle en majuscules : « DOLIP »')
  verifier(
    produits.rechercheRapide('3400930000001')[0]?.id === doliprane,
    'recherche par code-barres exact'
  )

  // ==========================================================================
  titre('Bornes de journee et fuseau horaire')

  // Les horodatages sont en UTC, mais un pharmacien raisonne en jours locaux.
  // Sans conversion explicite, la fenetre du jour se decale du fuseau horaire
  // et le chiffre d affaires tombe a zero des que les deux dates different.
  const jour = aujourdhui()
  const instant = maintenant()
  verifier(
    debutDeJournee(jour) <= instant && instant <= finDeJournee(jour),
    'l instant present tombe dans les bornes du jour local',
    { debut: debutDeJournee(jour), instant, fin: finDeJournee(jour) }
  )
  verifier(
    debutDeJournee(jour) < finDeJournee(jour),
    'le debut de journee precede la fin'
  )
  verifier(
    finDeJournee(decalerJours(jour, -1)) < debutDeJournee(jour),
    'deux journees consecutives ne se chevauchent pas'
  )

  titre('Lecture des codes-barres')

  verifier(
    produits.parCodeBarres('3400930000001')?.id === doliprane,
    'un code-barres exact designe le bon produit'
  )
  verifier(produits.parCodeBarres('  3400930000001  ')?.id === doliprane, 'les espaces sont ignores')
  verifier(
    produits.parCodeBarres('03400930000001')?.id === doliprane,
    'un zero de tete supplementaire est tolere'
  )
  const codeInterneDoliprane = produits.produit(doliprane)!.code_interne
  verifier(
    produits.parCodeBarres(codeInterneDoliprane)?.id === doliprane,
    `le code interne (${codeInterneDoliprane}) est accepte comme code lu`
  )
  verifier(produits.parCodeBarres('0000000000000') === null, 'un code inconnu ne renvoie rien')
  verifier(produits.parCodeBarres('') === null, 'un code vide ne renvoie rien')

  titre('Parametres d impression')

  const reglages = configuration.reglagesInterface()
  verifier(
    ['ticket', 'ticket57', 'a5', 'a4'].includes(reglages.formatImpressionDefaut),
    'le format d impression par defaut est connu',
    reglages.formatImpressionDefaut
  )
  verifier(reglages.piedTicket.length > 0, 'le pied de ticket a une valeur par defaut')
  verifier(reglages.scanAjouteDirectement === true, 'le scan ajoute au panier par defaut')
  // La version attendue vient de la source, pas d'un nombre ecrit ici :
  // ajouter une migration ne doit pas casser ce test.
  const versionBase = (
    base().prepare('SELECT MAX(version) v FROM schema_migrations').get() as unknown as { v: number }
  ).v
  verifier(
    versionBase === VERSION_SCHEMA,
    `la base est a la derniere version du schema (${VERSION_SCHEMA})`,
    versionBase
  )

  // ==========================================================================
  titre('Codes-barres multiples')

  // Au Tchad, une meme reference arrive avec des codes differents selon
  // l'importateur. Le catalogue doit donc accepter plusieurs codes par produit,
  // et le pharmacien doit pouvoir rattacher un code inconnu sans quitter le
  // comptoir.
  const codeImportateur = '6161100234567'
  produits.rattacherCodeBarres(doliprane, codeImportateur, adminId)

  verifier(
    produits.parCodeBarres(codeImportateur)?.id === doliprane,
    'un second code-barres désigne le même produit'
  )
  verifier(
    produits.parCodeBarres('3400930000001')?.id === doliprane,
    'le code d’origine continue de fonctionner'
  )

  const fiche = produits.produit(doliprane)
  verifier(
    (fiche?.codes_barres ?? []).length >= 2,
    'la fiche porte les deux codes',
    fiche?.codes_barres
  )

  // Rattacher deux fois le meme code au meme produit ne doit pas echouer :
  // au comptoir, on rescanne sans y penser.
  produits.rattacherCodeBarres(doliprane, codeImportateur, adminId)
  verifier(
    produits.produit(doliprane)?.codes_barres.filter((c) => c === codeImportateur).length === 1,
    'rescanner le même code ne le duplique pas'
  )

  // Un code deja pris par un AUTRE produit doit etre refuse, en nommant lequel.
  // Se tromper de produit, dans une officine, c'est le mauvais medicament dans
  // le sachet.
  refuse(
    'un code déjà attribué à un autre produit est refusé',
    () => produits.rattacherCodeBarres(amoxicilline, codeImportateur, adminId),
    'déjà celui de'
  )
  verifier(
    produits.parCodeBarres(codeImportateur)?.id === doliprane,
    'le code refusé n’a pas changé de produit'
  )

  refuse(
    'un code trop court est refusé',
    () => produits.rattacherCodeBarres(doliprane, '12', adminId),
    'trop court'
  )
  refuse(
    'rattacher à un produit inexistant est refusé',
    () => produits.rattacherCodeBarres(999_999, '7770001112223', adminId),
    'n’existe pas'
  )

  // L'operation est tracee : on doit pouvoir savoir qui a rapproche quoi.
  const traceCode = base()
    .prepare(
      `SELECT COUNT(*) n FROM journal_activite
       WHERE action = 'Code-barres rattaché' AND entite_id = ?`
    )
    .get(doliprane) as unknown as { n: number }
  verifier(traceCode.n >= 1, 'le rattachement est inscrit au journal', traceCode.n)

  titre('Réception fournisseur et création des lots')

  const labo = partenaires.enregistrerFournisseur(
    null,
    { nom: 'Laboratoire SantéPlus', telephone: '+225 07 00 00 00 00', conditionsPaiement: '30 jours' },
    adminId
  )

  refuse(
    'une date de péremption déjà dépassée est refusée',
    () =>
      achats.enregistrerReception(
        {
          fournisseurId: labo,
          lignes: [
            { produitId: doliprane, quantite: 10, prixAchat: 900, numeroLot: 'X', datePeremption: decalerJours(aujourdhui(), -5) }
          ]
        },
        adminId
      ),
    'déjà dépassée'
  )

  const reception = achats.enregistrerReception(
    {
      fournisseurId: labo,
      lignes: [
        // Volontairement dans le désordre : le lot le plus lointain est saisi en premier.
        { produitId: doliprane, quantite: 60, prixAchat: 900, numeroLot: 'LOT-TARD', datePeremption: decalerJours(aujourdhui(), 400) },
        { produitId: doliprane, quantite: 40, prixAchat: 880, numeroLot: 'LOT-TOT', datePeremption: decalerJours(aujourdhui(), 45) },
        { produitId: amoxicilline, quantite: 25, prixAchat: 3100, numeroLot: 'AMX-01', datePeremption: decalerJours(aujourdhui(), 300) },
        { produitId: gel, quantite: 30, prixAchat: 1150, numeroLot: 'GEL-01', datePeremption: decalerJours(aujourdhui(), 700) }
      ],
      montantPaye: 50_000,
      modePaiement: 'virement'
    },
    adminId
  )

  verifier(reception.total === 60 * 900 + 40 * 880 + 25 * 3100 + 30 * 1150, 'le total de la réception est correct', reception.total)
  verifier(produits.produit(doliprane)?.stock === 100, 'le stock du Doliprane est de 100 après réception')
  verifier(produits.produit(doliprane)?.etat_stock === 'disponible', 'le produit repasse en disponible')

  const dette = partenaires.listerFournisseurs().find((f) => f.id === labo)
  verifier(dette?.solde_du === reception.total - 50_000, 'la dette fournisseur est calculée', dette?.solde_du)

  // ==========================================================================
  titre('FEFO — premier périmé, premier sorti')

  const allocation = stock.allouerFEFO(doliprane, 50)
  verifier(allocation.lignes[0]?.numero === 'LOT-TOT', 'le lot qui expire le plus tôt est servi en premier')
  verifier(allocation.lignes[0]?.quantite === 40, 'ce lot est vidé avant de passer au suivant')
  verifier(allocation.lignes[1]?.numero === 'LOT-TARD', 'le reste vient du lot suivant')
  verifier(allocation.lignes[1]?.quantite === 10, 'la quantité complémentaire est correcte')
  verifier(allocation.lignes.length === 2, 'exactement deux lots sont mobilisés')

  refuse(
    'une allocation au-delà du stock est refusée',
    () => stock.allouerFEFO(doliprane, 500),
    'insuffisant'
  )

  // ==========================================================================
  titre('Caisse')

  refuse(
    'vendre sans caisse ouverte est refusé',
    () =>
      ventes.enregistrerVente(
        { lignes: [{ produitId: gel, quantite: 1 }], paiements: [{ mode: 'especes', montant: 2000 }] },
        adminId,
        session.permissions
      ),
    'caisse'
  )

  const sessionCaisse = caisse.ouvrirCaisse(50_000, adminId)
  verifier(sessionCaisse.statut === 'ouverte', 'la caisse est ouverte')
  refuse('deux caisses ouvertes sont impossibles', () => caisse.ouvrirCaisse(10_000, adminId), 'déjà ouverte')

  // ==========================================================================
  titre('Vente au comptoir')

  const controle = ventes.verifierVente(
    { lignes: [{ produitId: amoxicilline, quantite: 2 }], paiements: [{ mode: 'especes', montant: 10_000 }] },
    session.permissions
  )
  verifier(controle.total === 9600, 'le total est calculé avant validation', controle.total)
  verifier(controle.monnaieRendue === 400, 'la monnaie à rendre est calculée', controle.monnaieRendue)
  verifier(
    controle.avertissements.some((a) => a.code === 'ordonnance_requise' && !a.bloquant),
    'un produit sous ordonnance déclenche un avertissement non bloquant'
  )

  const vente1 = ventes.enregistrerVente(
    {
      lignes: [
        { produitId: doliprane, quantite: 45 },
        { produitId: gel, quantite: 2 }
      ],
      paiements: [{ mode: 'especes', montant: 71_500 }]
    },
    adminId,
    session.permissions
  )

  verifier(vente1.total === 45 * 1500 + 2 * 2000, 'le total de la vente est correct', vente1.total)
  verifier(vente1.monnaie_rendue === 0, 'aucune monnaie à rendre sur compte juste')
  verifier(vente1.reste_a_payer === 0, 'la vente est intégralement réglée')

  const lignesDoliprane = vente1.lignes.filter((l) => l.produit_id === doliprane)
  verifier(lignesDoliprane.length === 2, 'la vente est ventilée sur les deux lots servis')
  verifier(
    lignesDoliprane.reduce((s, l) => s + l.quantite, 0) === 45,
    'la somme des lots servis correspond à la quantité vendue'
  )
  verifier(
    vente1.cout_total === 40 * 880 + 5 * 900 + 2 * 1150,
    'le coût de revient suit les lots réellement sortis',
    vente1.cout_total
  )
  verifier(produits.produit(doliprane)?.stock === 55, 'le stock est décrémenté de 45', produits.produit(doliprane)?.stock)

  const lotTot = stock.lotsDe(doliprane, true).find((l) => l.numero === 'LOT-TOT')
  verifier(lotTot?.quantite_restante === 0, 'le lot le plus proche de la péremption est épuisé')

  const mouvements = stock.mouvements({ produitId: doliprane })
  verifier(
    mouvements.filter((m) => m.type === 'vente').length === 2,
    'un mouvement de stock par lot sorti'
  )

  // ==========================================================================
  titre('Prévention des erreurs')

  const trop = ventes.verifierVente(
    { lignes: [{ produitId: gel, quantite: 999 }], paiements: [{ mode: 'especes', montant: 10 }] },
    session.permissions
  )
  verifier(
    trop.avertissements.some((a) => a.code === 'stock_insuffisant' && a.bloquant),
    'un stock insuffisant est signalé comme bloquant'
  )

  refuse(
    'une vente au-delà du stock est refusée',
    () =>
      ventes.enregistrerVente(
        { lignes: [{ produitId: gel, quantite: 999 }], paiements: [{ mode: 'especes', montant: 10 }] },
        adminId,
        session.permissions
      ),
    'insuffisant'
  )

  const remise = ventes.verifierVente(
    {
      lignes: [{ produitId: gel, quantite: 1, remise: 1500 }],
      paiements: [{ mode: 'especes', montant: 500 }]
    },
    session.permissions
  )
  verifier(
    remise.avertissements.some((a) => a.code === 'remise_excessive' && a.bloquant),
    'une remise de 75 % dépasse le maximum autorisé'
  )

  const sansDroit = ventes.verifierVente(
    { lignes: [{ produitId: gel, quantite: 1, remise: 100 }], paiements: [{ mode: 'especes', montant: 1900 }] },
    permissionsCaissier
  )
  verifier(
    sansDroit.avertissements.some((a) => a.code === 'remise_excessive' && a.bloquant),
    'un caissier sans droit de remise est bloqué'
  )

  // Deux lignes du même produit ne doivent pas allouer chacune tout le stock.
  const doublon = ventes.verifierVente(
    {
      lignes: [
        { produitId: gel, quantite: 20 },
        { produitId: gel, quantite: 20 }
      ],
      paiements: [{ mode: 'especes', montant: 80_000 }]
    },
    session.permissions
  )
  verifier(
    doublon.avertissements.some((a) => a.code === 'stock_insuffisant'),
    'deux lignes du même produit sont cumulées avant contrôle du stock'
  )

  // ==========================================================================
  titre('Vente à crédit et règlement')

  const client = partenaires.enregistrerClient(
    null,
    { nom: 'Aminata Traoré', telephone: '+225 07 11 22 33 44', plafondCredit: 20_000 },
    adminId
  )

  const horsPlafond = ventes.verifierVente(
    {
      clientId: client,
      lignes: [{ produitId: amoxicilline, quantite: 6 }],
      paiements: [{ mode: 'especes', montant: 1000 }]
    },
    session.permissions
  )
  verifier(
    horsPlafond.avertissements.some((a) => a.code === 'plafond_credit' && a.bloquant),
    'un dépassement de plafond de crédit est bloqué'
  )

  const venteCredit = ventes.enregistrerVente(
    {
      clientId: client,
      lignes: [{ produitId: amoxicilline, quantite: 3 }],
      paiements: [{ mode: 'especes', montant: 5000 }]
    },
    adminId,
    session.permissions
  )
  verifier(venteCredit.total === 14_400, 'total de la vente à crédit', venteCredit.total)
  verifier(venteCredit.reste_a_payer === 9400, 'le reste à payer devient une créance', venteCredit.reste_a_payer)

  const avantReglement = partenaires.listerClients().find((c) => c.id === client)
  verifier(avantReglement?.solde_du === 9400, 'la créance client est calculée', avantReglement?.solde_du)

  refuse(
    'un règlement supérieur à la créance est refusé',
    () => partenaires.encaisserCreance(client, 50_000, 'especes', null, adminId),
    'dépasse'
  )

  partenaires.encaisserCreance(client, 4000, 'especes', venteCredit.id, adminId)
  verifier(
    partenaires.listerClients().find((c) => c.id === client)?.solde_du === 5400,
    'la créance diminue après règlement partiel'
  )

  refuse(
    "un client avec créance ne peut pas être archivé",
    () => partenaires.archiverClient(client, true, adminId),
    'créance'
  )

  // ==========================================================================
  titre('Annulation de vente')

  const stockAvantAnnulation = produits.produit(amoxicilline)!.stock
  ventes.annulerVente(venteCredit.id, 'Erreur de saisie du pharmacien', adminId)

  verifier(
    produits.produit(amoxicilline)?.stock === stockAvantAnnulation + 3,
    'le stock est restitué dans son lot d’origine'
  )
  verifier(ventes.detailVente(venteCredit.id)?.statut === 'annulee', 'la vente est marquée annulée')
  refuse(
    'une vente déjà annulée ne peut pas l’être deux fois',
    () => ventes.annulerVente(venteCredit.id, 'test', adminId),
    'déjà annulée'
  )

  // ==========================================================================
  titre('Dépenses')

  const depense = finances.enregistrerDepense(
    { date: aujourdhui(), categorieId: 5, libelle: 'Transport livraison', montant: 15_000 },
    adminId
  )
  verifier(depense > 0, 'la dépense est enregistrée')
  refuse(
    'une dépense datée du futur est refusée',
    () =>
      finances.enregistrerDepense(
        { date: decalerJours(aujourdhui(), 3), categorieId: 5, libelle: 'Futur', montant: 100 },
        adminId
      ),
    'futur'
  )

  // ==========================================================================
  titre('Inventaire')

  const inv = inventaire.ouvrirInventaire(
    { libelle: 'Inventaire général', perimetre: 'total' },
    adminId
  )
  verifier(inv.nb_lignes! > 0, 'les lignes d’inventaire sont générées depuis les lots en stock', inv.nb_lignes)
  refuse(
    'un second inventaire simultané est refusé',
    () => inventaire.ouvrirInventaire({ libelle: 'Autre', perimetre: 'total' }, adminId),
    'déjà en cours'
  )

  const detailInv = inventaire.inventaire(inv.id)!
  const ligneGel = detailInv.lignes.find((l) => l.produit_id === gel)!
  // Le comptage physique révèle deux unités manquantes.
  inventaire.saisirComptage(ligneGel.id, ligneGel.stock_theorique - 2, 'Casse constatée en rayon', adminId)

  const stockGelAvant = produits.produit(gel)!.stock
  const resultat = inventaire.validerInventaire(inv.id, adminId)

  verifier(resultat.lignesAjustees === 1, 'un seul écart est ajusté', resultat.lignesAjustees)
  verifier(resultat.ecartUnites === -2, 'l’écart en unités est correct', resultat.ecartUnites)
  verifier(resultat.ecartValeur === -2 * 1150, 'l’écart est valorisé au prix d’achat', resultat.ecartValeur)
  verifier(produits.produit(gel)?.stock === stockGelAvant - 2, 'le stock est corrigé après validation')

  const mouvementInventaire = stock.mouvements({ produitId: gel }).find((m) => m.type === 'inventaire')
  verifier(!!mouvementInventaire, 'l’ajustement laisse un mouvement de stock tracé')
  verifier(
    mouvementInventaire?.motif === 'Casse constatée en rayon',
    'la justification du comptage est conservée'
  )

  // ==========================================================================
  titre('Alertes')

  // On force une rupture pour vérifier que l'alerte apparaît puis disparaît.
  stock.sortirStock(gel, produits.produit(gel)!.stock, 'perte', 'Dégât des eaux', adminId)

  // Le lot à 45 jours a été entièrement vendu plus haut : on reçoit un lot
  // réellement proche de la péremption pour exercer la surveillance.
  achats.enregistrerReception(
    {
      fournisseurId: labo,
      lignes: [
        { produitId: amoxicilline, quantite: 5, prixAchat: 3100, numeroLot: 'AMX-URGENT', datePeremption: decalerJours(aujourdhui(), 20) }
      ]
    },
    adminId
  )

  alertes.rafraichirAlertes()

  const listeAlertes = alertes.listerAlertes()
  verifier(
    listeAlertes.some((a) => a.type === 'rupture' && a.entite_id === gel),
    'la rupture déclenche une alerte urgente'
  )
  verifier(
    listeAlertes.some((a) => a.type === 'peremption_proche'),
    'un lot expirant dans 20 jours déclenche une alerte de péremption'
  )
  verifier(
    stock.peremptions().some((l) => l.numero === 'AMX-URGENT' && l.palier === 'j30'),
    'ce lot est classé dans le palier « moins de 30 jours »'
  )
  verifier(
    listeAlertes.some((a) => a.type === 'dette_fournisseur'),
    'la dette fournisseur est signalée'
  )

  achats.enregistrerReception(
    {
      fournisseurId: labo,
      lignes: [{ produitId: gel, quantite: 40, prixAchat: 1150, numeroLot: 'GEL-02', datePeremption: decalerJours(aujourdhui(), 500) }]
    },
    adminId
  )
  alertes.rafraichirAlertes()
  verifier(
    !alertes.listerAlertes().some((a) => a.type === 'rupture' && a.entite_id === gel),
    'l’alerte disparaît d’elle-même une fois le stock réapprovisionné'
  )

  // ==========================================================================
  titre('Tableau de bord')

  const bord = pilotage.tableauDeBord()
  const ventesDuJour = ventes.listerVentes({ statut: 'finalisee' })
  const caAttendu = ventesDuJour.reduce((s, v) => s + v.total, 0)

  verifier(!bord.aucuneDonnee, 'le tableau de bord dispose de données réelles')
  verifier(bord.chiffreAffaires.valeur === caAttendu, "le chiffre d'affaires correspond aux ventes", {
    tableau: bord.chiffreAffaires.valeur,
    attendu: caAttendu
  })
  verifier(bord.nbVentes.valeur === ventesDuJour.length, 'le nombre de ventes correspond')
  verifier(bord.depenses.valeur === 15_000, 'les dépenses du jour remontent', bord.depenses.valeur)
  verifier(bord.caisse.ouverte, 'la caisse est signalée ouverte')
  verifier(bord.activite.length > 0, 'l’activité récente est alimentée')
  verifier(
    bord.activite.every((a) => a.at !== null && a.libelle !== null),
    'chaque ligne d’activité provient d’une opération réelle'
  )

  // ==========================================================================
  titre('Clôture de caisse')

  const etat = caisse.etatCaisse()
  const especesVente1 = 71_500 - vente1.monnaie_rendue
  const especesCredit = 5000
  const theoriqueAttendu = 50_000 + especesVente1 + especesCredit - 15_000 - especesCredit

  verifier(
    etat.theoriqueEspeces === theoriqueAttendu,
    'le théorique en espèces intègre ventes, dépense et remboursement d’annulation',
    { calcule: etat.theoriqueEspeces, attendu: theoriqueAttendu }
  )

  refuse(
    'un écart de caisse sans justification est refusé',
    () => caisse.cloturerCaisse(etat.theoriqueEspeces - 5000, null, adminId),
    'justification'
  )

  const cloture = caisse.cloturerCaisse(etat.theoriqueEspeces - 5000, 'Erreur de rendu de monnaie', adminId)
  verifier(cloture.ecart === -5000, 'l’écart de caisse est calculé', cloture.ecart)
  verifier(caisse.sessionOuverte() === null, 'aucune caisse ne reste ouverte après clôture')

  // ==========================================================================
  titre('Synthèse financière')

  const synthese = finances.synthese(aujourdhui(), aujourdhui())
  const margeAttendue = synthese.chiffreAffaires - synthese.coutMarchandises

  verifier(synthese.chiffreAffaires === caAttendu, 'le chiffre d’affaires de la synthèse concorde')
  verifier(synthese.margeBrute === margeAttendue, 'la marge brute est cohérente')
  verifier(synthese.resultat === margeAttendue - 15_000, 'le résultat déduit les dépenses')
  verifier(synthese.valeurStock > 0, 'la valeur du stock est calculée', synthese.valeurStock)
  verifier(
    synthese.parModePaiement.some((m) => m.mode === 'especes'),
    'la répartition par mode de paiement est renseignée'
  )

  // ==========================================================================
  titre('Journal d’activité')

  const journal = pilotage.journal({ limite: 500 })
  const attendues = [
    'Connexion',
    'Pharmacie configurée',
    'Produit créé',
    'Réception enregistrée',
    'Caisse ouverte',
    'Vente enregistrée',
    'Vente annulée',
    'Inventaire validé',
    'Caisse clôturée',
    'Dépense enregistrée'
  ]
  for (const action of attendues) {
    verifier(journal.some((j) => j.action === action), `le journal trace « ${action} »`)
  }
  verifier(
    journal.every((j) => j.at && j.resume !== null),
    'chaque entrée du journal est horodatée et décrite'
  )

  // ==========================================================================
  titre('Répertoire intégré')

  const etatRep = repertoire.etat()
  verifier(etatRep.disponible, 'le répertoire livré avec le logiciel est lisible', etatRep.motif)
  verifier(etatRep.produits >= 300, 'le répertoire contient au moins 300 fiches', etatRep.produits)
  verifier(etatRep.empreinte !== null, 'le répertoire porte une empreinte')

  const surParac = repertoire.rechercher('parac')
  verifier(surParac.length > 0, 'recherche « parac » : le répertoire répond')
  verifier(
    surParac.some((f) => f.dci?.toLowerCase().includes('paracétamol')),
    'recherche « parac » : le paracétamol remonte'
  )

  // Sans accent et en majuscules : c'est ainsi qu'on tape au comptoir.
  verifier(repertoire.rechercher('AMOXICILLINE').length > 0, 'recherche insensible à la casse')
  verifier(repertoire.rechercher('metronidazole').length > 0, 'recherche tolérante aux accents')
  verifier(repertoire.rechercher('d').length > 0, 'une seule lettre suffit à obtenir des propositions')
  verifier(repertoire.rechercher('zzzzzz').length === 0, 'un terme absent ne renvoie rien')

  // Une fiche ne remplit jamais un prix : ils dépendent de l'officine.
  const ficheRep = surParac[0]!
  verifier(
    !('prixAchat' in ficheRep) && !('prixVente' in ficheRep),
    'une fiche du répertoire ne porte aucun prix'
  )
  verifier(
    ficheRep.nomCourt.length > 0 && !/\d+\s*(mg|g|ml)$/i.test(ficheRep.nomCourt),
    'le nom pré-rempli ne répète pas le dosage',
    ficheRep.nomCourt
  )

  // Le répertoire pointe vers le référentiel réel : une forme ou une catégorie
  // fantôme remplirait les fiches avec des identifiants sans correspondance.
  const refsBase = produits.referentiels()
  const formesConnues = new Set(refsBase.formes.map((f) => f.id))
  const categoriesConnues = new Set(refsBase.categories.map((c) => c.id))
  const unitesConnues = new Set(refsBase.unites.map((u) => u.id))

  const echantillon = [
    ...repertoire.rechercher('a', 50),
    ...repertoire.rechercher('e', 50),
    ...repertoire.rechercher('i', 50)
  ]
  verifier(
    echantillon.every((f) => f.formeId === null || formesConnues.has(f.formeId)),
    'chaque forme du répertoire existe dans le référentiel'
  )
  verifier(
    echantillon.every((f) => f.categorieId === null || categoriesConnues.has(f.categorieId)),
    'chaque catégorie du répertoire existe dans le référentiel'
  )
  verifier(
    echantillon.every((f) => f.uniteId === null || unitesConnues.has(f.uniteId)),
    'chaque unité de vente du répertoire existe dans le référentiel'
  )

  // Le produit « Doliprane » a été créé plus haut : le répertoire doit le
  // signaler comme déjà présent, pour éviter un doublon au catalogue.
  const surDoli = repertoire.rechercher('doliprane')
  verifier(
    surDoli.some((f) => f.dejaAuCatalogue === true),
    'une fiche déjà au catalogue est signalée comme telle'
  )
  verifier(
    surDoli.some((f) => f.dejaAuCatalogue === false),
    'une fiche absente du catalogue n’est pas signalée à tort'
  )

  // La marge par défaut permet de proposer un prix de vente dès la saisie du
  // prix d'achat : sans elle, l'assistance de saisie perdrait son dernier pas.
  const reglagesSaisie = configuration.reglagesInterface()
  verifier(
    reglagesSaisie.margeParDefaut > 0 && reglagesSaisie.margeParDefaut < 500,
    'la marge par défaut proposée est exploitable',
    reglagesSaisie.margeParDefaut
  )

  // ==========================================================================
  titre('Sauvegarde')

  const sauvegarde = configuration.creerSauvegarde(cheminBase, join(dossier, 'sauvegardes'), 'manuelle', adminId)
  verifier(sauvegarde.taille > 0, 'la sauvegarde produit un fichier', `${Math.round(sauvegarde.taille / 1024)} Ko`)

  const controleSauvegarde = configuration.controlerSauvegarde(sauvegarde.fichier)
  verifier(controleSauvegarde.valide, 'la sauvegarde est relisible et intègre')
  verifier(
    configuration.controlerSauvegarde(join(dossier, 'inexistant.db')).valide === false,
    'un fichier inexistant est rejeté'
  )

  // ==========================================================================
  titre('Démonstration et licences')

  licence.definirDossierLicence(join(dossier, 'licence'))
  mkdirSync(join(dossier, 'licence'), { recursive: true })

  // Vendre exige une caisse ouverte : la clôture a eu lieu plus haut, on en
  // rouvre une pour éprouver le quota dans les conditions réelles.
  caisse.ouvrirCaisse(0, adminId)

  verifier(!licence.activee(), 'le logiciel démarre en démonstration')
  verifier(
    licence.codeInstallation().split('-').length === 4,
    'le code d’installation tient en quatre groupes dictables',
    licence.codeInstallation()
  )

  // Le quota du jour. On compte ce qui existe deja, puis on pousse jusqu'a la
  // limite : c'est le comportement reel, pas une simulation.
  const dejaVendu = ventes.ventesDuJourEffectif()
  const encorePossibles = licence.VENTES_PAR_JOUR_DEMO - dejaVendu
  verifier(encorePossibles > 0, 'la démonstration laisse encore vendre', encorePossibles)

  const venteDemo = (): void => {
    ventes.enregistrerVente(
      {
        lignes: [{ produitId: doliprane, quantite: 1 }],
        paiements: [{ mode: 'especes', montant: 1500 }]
      },
      adminId,
      auth.permissionsDe(adminId)
    )
  }

  for (let i = 0; i < encorePossibles; i++) venteDemo()

  verifier(
    ventes.ventesDuJourEffectif() === licence.VENTES_PAR_JOUR_DEMO,
    'la démonstration accepte exactement dix ventes dans la journée',
    ventes.ventesDuJourEffectif()
  )

  refuse(
    'la onzième vente du jour est refusée en démonstration',
    () => venteDemo(),
    'démonstration permet'
  )

  // Reculer l'horloge est le contournement evident : il ne doit rien donner.
  const jourAvant = licence.jourEffectif()

  // Trois jours en arrière, comme le ferait quelqu'un qui veut rouvrir son
  // quota en changeant la date de Windows.
  const troisJoursAvant = decalerJours(jourAvant, -3)
  verifier(
    licence.jourEffectif(troisJoursAvant) === jourAvant,
    'reculer la date de l’ordinateur ne fait pas revenir la veille',
    licence.jourEffectif(troisJoursAvant)
  )

  // Le quota reste celui du jour retenu : la journée ne recommence pas.
  refuse(
    'le quota reste atteint malgré l’horloge reculée',
    () => venteDemo(),
    'démonstration permet'
  )

  const etatHorloge = licence.etat(ventes.ventesDuJourEffectif())
  verifier(etatHorloge.horlogeSuspecte, 'le recul d’horloge est enregistré et signalé')
  verifier(etatHorloge.reculs >= 1, 'le nombre de reculs est compté', etatHorloge.reculs)

  // Les fonctions reservees.
  refuse(
    'les rapports sont refusés en démonstration',
    () => licence.exigerLicence('rapports'),
    'démonstration'
  )
  refuse(
    'l’export est refusé en démonstration',
    () => licence.exigerLicence('export'),
    'démonstration'
  )

  // Une cle inventee ne doit rien ouvrir.
  refuse(
    'une clé d’activation inventée est refusée',
    () => licence.activer('ABCDE-FGHJK-MNPQR-STVWX-YZ012-34567-89ABC-DEFGH-JKMNP-QRSTV-WXYZ0', adminId),
    'pas valable'
  )
  refuse('une clé vide est refusée', () => licence.activer('', adminId), 'pas valable')
  verifier(!licence.activee(), 'une clé refusée n’active rien')

  // Activation reelle, avec une licence signee par la cle privee de l'editeur.
  // Sans ce fichier — sur une machine de compilation, par exemple — le
  // contrôle est annoncé comme non exécuté plutôt que silencieusement absent.
  const clePrivee = join(process.cwd(), 'licence-privee.pem')

  if (!existsSync(clePrivee)) {
    console.log('  NOTE  | activation non vérifiée : licence-privee.pem absent de ce poste')
  } else {
    const empreinte = createHash('sha256')
      .update(
        'PHARMINA-poste ' +
          [
            hostname(),
            userInfo().username,
            homedir(),
            process.env.COMPUTERNAME ?? '',
            process.env.USERDOMAIN ?? ''
          ].join(' ')
      )
      .digest()
      .subarray(0, 10)

    const entete = Buffer.from([1, 0, 0, 0])
    const signature = sign(
      null,
      Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, empreinte]),
      createPrivateKey(readFileSync(clePrivee))
    )

    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    const encoder = (octets: Buffer): string => {
      let tampon = 0
      let bits = 0
      let sortie = ''
      for (const octet of octets) {
        tampon = (tampon << 8) | octet
        bits += 8
        while (bits >= 5) {
          sortie += ALPHABET[(tampon >>> (bits - 5)) & 31]
          bits -= 5
        }
      }
      if (bits > 0) sortie += ALPHABET[(tampon << (5 - bits)) & 31]
      return sortie
    }

    const cle = encoder(Buffer.concat([entete, signature]))

    // Une licence signée pour un AUTRE poste ne doit pas passer.
    const pourAutrePoste = sign(
      null,
      Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, Buffer.alloc(10, 7)]),
      createPrivateKey(readFileSync(clePrivee))
    )
    refuse(
      'une licence signée pour un autre ordinateur est refusée',
      () => licence.activer(encoder(Buffer.concat([entete, pourAutrePoste])), adminId),
      'pas valable'
    )

    const apresActivation = licence.activer(cle, adminId)
    verifier(apresActivation.activee, 'une licence valable active le logiciel')
    verifier(licence.activee(), 'l’activation est retenue')
    verifier(apresActivation.expiration === null, 'une licence sans durée est perpétuelle')

    // Et les limites tombent.
    venteDemo()
    verifier(
      ventes.ventesDuJourEffectif() > licence.VENTES_PAR_JOUR_DEMO,
      'le quota de ventes ne s’applique plus une fois activé',
      ventes.ventesDuJourEffectif()
    )
    licence.exigerLicence('rapports')
    verifier(true, 'les rapports redeviennent accessibles')

    // La clé est conservée telle quelle : on doit pouvoir redémarrer sans
    // ressaisir quoi que ce soit.
    licence.definirDossierLicence(join(dossier, 'licence'))
    verifier(licence.activee(), 'l’activation survit à un redémarrage')
  }

  caisse.cloturerCaisse(caisse.etatCaisse().theoriqueEspeces, null, adminId)

  // ==========================================================================
  titre('Réglages attendus par le logiciel')

  // Une migration déjà appliquée chez un client ne sera plus jamais rejouée :
  // toute clé ajoutée après coup à un fichier publié n'atteint que les bases
  // neuves. C'est arrivé pour « interface.theme », et cela s'est vu par un
  // écran de paramètres incomplet, sans la moindre erreur.
  //
  // Ce contrôle relie le code à la base : chaque réglage que les services
  // lisent doit exister après migration. Un réglage ajouté au code sans
  // migration correspondante fait échouer ce test avant la livraison.
  const REGLAGES_LUS = [
    'caisse.ecart_tolere',
    'caisse.exiger_ouverture',
    'comptoir.avertir_scan_inconnu',
    'comptoir.scan_ajoute_directement',
    'impression.copies_facture',
    'impression.format_defaut',
    'impression.pied_ticket',
    'impression.silencieuse',
    'impression.ticket_automatique',
    'interface.theme',
    'peremption.avertir_vente_proche',
    'peremption.bloquer_vente_expire',
    'peremption.seuil_alerte_jours',
    'produits.marge_par_defaut',
    'sauvegarde.alerte_jours',
    'sauvegarde.chiffrement',
    'sauvegarde.conserver_nombre',
    'sauvegarde.destination_externe',
    'securite.tentatives_max',
    'securite.verrouillage_minutes',
    'securite.verrouillage_poste_minutes',
    'stock.avertir_quantite_inhabituelle',
    'ventes.remise_max_pourcent'
  ]

  const declares = new Set(
    (base().prepare('SELECT cle FROM parametres').all() as unknown as { cle: string }[]).map(
      (p) => p.cle
    )
  )
  const absents = REGLAGES_LUS.filter((cle) => !declares.has(cle))

  verifier(
    absents.length === 0,
    'chaque réglage lu par le code existe en base après migration',
    absents
  )

  // Les deux verrouillages portent des noms proches et des sens opposés :
  // l'un ferme un compte après des échecs, l'autre ferme un écran laissé seul.
  // Les confondre reviendrait à verrouiller un compte pendant dix minutes ou à
  // laisser un poste ouvert un quart d'heure.
  verifier(
    declares.has('securite.verrouillage_minutes') && declares.has('securite.verrouillage_poste_minutes'),
    'le verrouillage de compte et celui du poste sont deux réglages distincts'
  )

  // La dernière migration réaffirme l'ensemble des réglages : c'est elle qui
  // fait converger une base ancienne vers une base neuve. Si elle en oublie,
  // les officines mises à jour n'auront pas le même logiciel que les nouvelles.
  const parametresConnus = (
    base().prepare('SELECT COUNT(*) n FROM parametres').get() as unknown as { n: number }
  ).n
  verifier(
    parametresConnus >= REGLAGES_LUS.length,
    'la base déclare au moins autant de réglages que le code en lit',
    parametresConnus
  )

  // ==========================================================================
  titre('Reprise de données')

  // Les exports des anciens logiciels ne se ressemblent pas : point-virgule ou
  // virgule, accents Windows-1252, montants a la francaise, dates a l'anglaise.
  // On reprend ici un fichier volontairement retors.
  const fichierProduits = join(dossier, 'ancien-catalogue.csv')
  writeFileSync(
    fichierProduits,
    [
      'Designation;Dosage;Molecule;Prix achat;Prix vente;Qte;Peremption;Code barre;Rayon;Ordonnance',
      'Doliprane;500 mg;Paracetamol;900;1 500;12;31/12/2027;3400930000001;A-12;non',
      'Zinnat;250 mg;Cefuroxime;3.100,50;5 400,75;8;03/2028;3400930000900;A-20;oui',
      'Betadine;10%;Povidone iodee;1200;2000;5;2027-06-30;;C-01;non',
      'Compresses;;;450;800;40;;;C-06;non',
      // Ligne fautive : le prix de vente est illisible.
      'Produit casse;;;100;abc;3;;;;',
      // Doublon interne au fichier.
      'Betadine;10%;Povidone iodee;1200;2000;5;2027-06-30;;C-01;non'
    ].join('\n'),
    'latin1'
  )

  const analyse = reprise.analyser(fichierProduits, 'produits')
  verifier(analyse.separateur === ';', 'le séparateur point-virgule est détecté', analyse.separateur)
  verifier(analyse.lignes === 6, 'les lignes de données sont comptées sans l’en-tête', analyse.lignes)
  verifier(
    analyse.colonnes.length === 10,
    'toutes les colonnes sont reconnues',
    analyse.colonnes.length
  )

  // Les en-têtes de l'ancien logiciel ne portent pas nos noms : la
  // correspondance doit être devinée, sinon l'utilisateur associe dix colonnes
  // à la main pour chaque fichier.
  verifier(analyse.suggestion.nom === 0, 'la colonne « Designation » est reconnue comme le nom')
  verifier(analyse.suggestion.prixAchat === 3, 'le prix d’achat est reconnu')
  verifier(analyse.suggestion.prixVente === 4, 'le prix de vente est distingué du prix d’achat')
  verifier(analyse.suggestion.stock === 5, 'la quantité est reconnue')
  verifier(analyse.suggestion.codeBarres === 7, 'le code-barres est reconnu')

  // Montants : la même valeur s'écrit de quatre façons selon le tableur.
  verifier(reprise.lireMontant('1 500') === 1500, 'montant avec espace insécable')
  verifier(reprise.lireMontant('3.100,50') === 3100.5, 'montant à la française')
  verifier(reprise.lireMontant('3,100.50') === 3100.5, 'montant à l’anglaise')
  verifier(reprise.lireMontant('2000 FCFA') === 2000, 'montant suivi de sa devise')
  verifier(reprise.lireMontant('abc') === null, 'montant illisible signalé, pas remplacé par zéro')

  verifier(reprise.lireDate('31/12/2027') === '2027-12-31', 'date jour/mois/année')
  verifier(reprise.lireDate('2027-06-30') === '2027-06-30', 'date déjà en ISO')
  // Une péremption au 03/2028 court jusqu'au dernier jour du mois.
  verifier(reprise.lireDate('03/2028') === '2028-03-31', 'péremption au mois : dernier jour retenu')
  verifier(reprise.lireDate('n’importe quoi') === null, 'date illisible signalée')

  const correspondance = analyse.suggestion
  const demande = { chemin: fichierProduits, type: 'produits' as const, correspondance, mettreAJour: false }

  // La simulation lit tout, valide tout, et n'écrit rien.
  const produitsAvantSimulation = (
    base().prepare('SELECT COUNT(*) n FROM produits').get() as unknown as { n: number }
  ).n
  const simulation = reprise.simuler(demande)
  const produitsApresSimulation = (
    base().prepare('SELECT COUNT(*) n FROM produits').get() as unknown as { n: number }
  ).n

  verifier(
    produitsAvantSimulation === produitsApresSimulation,
    'une simulation n’écrit rien dans la base'
  )
  verifier(simulation.refuses === 2, 'la simulation compte les deux lignes fautives', simulation.refuses)
  verifier(
    simulation.anomalies.some((a) => a.ligne === 6 && a.motif.includes('Prix de vente')),
    'la ligne au prix illisible est désignée par son numéro',
    simulation.anomalies
  )
  verifier(
    simulation.anomalies.some((a) => a.ligne === 7 && a.motif.includes('Doublon')),
    'le doublon interne au fichier est repéré'
  )

  // Le Doliprane existe déjà au catalogue : sans « mettre à jour », il est ignoré.
  verifier(simulation.ignores >= 1, 'un produit déjà présent est ignoré', simulation.ignores)

  const importe = reprise.importer(demande, adminId)
  verifier(importe.crees === 3, 'trois produits nouveaux sont créés', importe.crees)
  verifier(importe.refuses === 2, 'les lignes fautives restent refusées', importe.refuses)

  const zinnat = base()
    .prepare("SELECT * FROM v_produit_etat WHERE nom_commercial = 'Zinnat'")
    .get() as unknown as {
    id: number
    dosage: string
    prix_achat: number
    prix_vente: number
    stock: number
    ordonnance_requise: number
    emplacement: string
  }

  verifier(!!zinnat, 'le produit repris existe au catalogue')
  // « Cefuroxime » vient d'un fichier Windows-1252 : sans décodage, on lirait
  // des caractères de remplacement à la place des accents.
  verifier(zinnat.prix_achat === 3101, 'le prix à la française est repris et arrondi', zinnat.prix_achat)
  verifier(zinnat.prix_vente === 5401, 'le prix de vente est repris', zinnat.prix_vente)
  verifier(zinnat.stock === 8, 'le stock d’ouverture est créé', zinnat.stock)
  verifier(zinnat.ordonnance_requise === 1, 'le « oui » de la colonne ordonnance est compris')
  verifier(zinnat.emplacement === 'A-20', 'l’emplacement est repris')

  const lotZinnat = base()
    .prepare('SELECT date_peremption FROM lots WHERE produit_id = ?')
    .get(zinnat.id) as unknown as { date_peremption: string }
  verifier(
    lotZinnat.date_peremption === '2028-03-31',
    'la péremption au mois devient le dernier jour du mois',
    lotZinnat.date_peremption
  )

  // Le stock repris est un mouvement tracé, pas un chiffre posé dans une colonne.
  const mouvementReprise = base()
    .prepare(
      "SELECT COUNT(*) n FROM mouvements_stock WHERE motif = 'Reprise de données' AND produit_id = ?"
    )
    .get(zinnat.id) as unknown as { n: number }
  verifier(mouvementReprise.n === 1, 'le stock d’ouverture apparaît dans les mouvements')

  // Reprendre deux fois le même fichier ne doit rien doubler.
  const secondPassage = reprise.importer(demande, adminId)
  const stockApres = (
    base().prepare('SELECT stock FROM v_produit_etat WHERE id = ?').get(zinnat.id) as unknown as {
      stock: number
    }
  ).stock
  verifier(secondPassage.crees === 0, 'un second import ne recrée aucun produit', secondPassage.crees)
  verifier(stockApres === 8, 'un second import ne double pas le stock', stockApres)

  // --- Clients et créances ---------------------------------------------------
  const fichierClients = join(dossier, 'ancien-clients.csv')
  writeFileSync(
    fichierClients,
    [
      'Nom,Telephone,Ardoise',
      'Awa Traore,+225 07 00 00 01,12500',
      'Ibrahim Diallo,+225 07 00 00 02,0',
      'Fatou Kone,+225 07 00 00 03,3 200'
    ].join('\n'),
    'utf8'
  )

  const analyseClients = reprise.analyser(fichierClients, 'clients')
  verifier(analyseClients.separateur === ',', 'le séparateur virgule est détecté')
  verifier(analyseClients.suggestion.solde === 2, 'la colonne « Ardoise » est reconnue comme la créance')

  const importClients = reprise.importer(
    {
      chemin: fichierClients,
      type: 'clients',
      correspondance: analyseClients.suggestion,
      mettreAJour: false
    },
    adminId
  )
  verifier(importClients.crees === 3, 'les trois clients sont créés', importClients.crees)
  verifier(importClients.creancesReprises === 2, 'seules les créances non nulles sont reprises')

  const awa = base()
    .prepare("SELECT id FROM clients WHERE nom = 'Awa Traore'")
    .get() as unknown as { id: number }
  const compteAwa = partenaires.apercuCompte(awa.id)
  verifier(compteAwa?.encours === 12500, 'la créance reprise apparaît au compte client', compteAwa?.encours)

  // La créance n'est pas un chiffre posé a la main : c'est une opération, donc
  // elle figure au relevé et le solde reste une somme d'operations.
  const releveAwa = partenaires.releveCompte(awa.id)
  verifier(releveAwa.length === 1, 'la reprise figure au relevé du client', releveAwa.length)

  const doubleClients = reprise.importer(
    {
      chemin: fichierClients,
      type: 'clients',
      correspondance: analyseClients.suggestion,
      mettreAJour: true
    },
    adminId
  )
  verifier(doubleClients.creancesReprises === 0, 'un second import ne double pas l’ardoise')
  verifier(
    partenaires.apercuCompte(awa.id)?.encours === 12500,
    'le solde du client est inchangé après un second import'
  )

  // Une colonne obligatoire non associée doit être refusée avant toute écriture.
  refuse(
    'un import sans colonne « nom » est refusé',
    () =>
      reprise.simuler({
        chemin: fichierClients,
        type: 'clients',
        correspondance: { telephone: 1 },
        mettreAJour: false
      }),
    'obligatoires'
  )

  // ==========================================================================
  titre('Copie des sauvegardes hors de la machine')

  // Tant qu'aucune destination n'est configurée, le logiciel doit le dire
  // plutôt que de laisser croire que les données sont protégées.
  const avant = configuration.etatCopieExterne()
  verifier(!avant.configuree, 'sans destination, la copie externe est signalée absente')
  verifier(avant.enRetard, 'sans destination, une alerte est levée dès le premier jour')

  verifier(
    configuration.controlerDestinationExterne('').valide === false,
    'un dossier vide est refusé'
  )
  verifier(
    configuration.controlerDestinationExterne('Z:\\\\pharmina-inexistant-' + adminId).valide === false,
    'un dossier inaccessible est refusé avant d’être enregistré'
  )

  const dossierExterne = join(dossier, 'copie-externe')
  const controleDestination = configuration.controlerDestinationExterne(dossierExterne)
  verifier(controleDestination.valide, 'un dossier accessible en écriture est accepté')

  configuration.definirParametres({ 'sauvegarde.destination_externe': dossierExterne }, adminId)

  const avecCopie = configuration.creerSauvegarde(
    cheminBase,
    join(dossier, 'sauvegardes'),
    'manuelle',
    adminId
  )
  const copies = readdirSync(dossierExterne).filter((f) => f.endsWith('.pharmina') || f.endsWith('.db'))
  verifier(copies.length === 1, 'la sauvegarde est recopiée dans la destination externe', copies)
  verifier(
    statSync(join(dossierExterne, copies[0]!)).size === avecCopie.taille,
    'la copie externe fait exactement la taille de l’originale'
  )

  const ligneCopie = base()
    .prepare('SELECT externe, statut FROM sauvegardes ORDER BY at DESC LIMIT 1')
    .get() as unknown as { externe: string | null; statut: string }
  verifier(ligneCopie.externe !== null, 'la base retient où la copie est partie')
  verifier(
    configuration.controlerSauvegarde(join(dossierExterne, copies[0]!)).valide,
    'la copie externe est une base relisible, pas un fichier tronqué'
  )

  const apres = configuration.etatCopieExterne()
  verifier(apres.configuree && apres.accessible, 'la destination est reconnue joignable')
  verifier(!apres.enRetard, 'une copie du jour lève l’alerte')

  // Une clé USB débranchée ne doit jamais faire perdre la sauvegarde locale.
  configuration.definirParametres(
    { 'sauvegarde.destination_externe': 'Z:\\\\pharmina-debranchee' },
    adminId
  )
  const sansCopie = configuration.creerSauvegarde(
    cheminBase,
    join(dossier, 'sauvegardes'),
    'manuelle',
    adminId
  )
  verifier(sansCopie.taille > 0, 'une destination injoignable n’empêche pas la sauvegarde locale')

  const ligneSansCopie = base()
    .prepare('SELECT externe, statut, message FROM sauvegardes ORDER BY at DESC LIMIT 1')
    .get() as unknown as { externe: string | null; statut: string; message: string | null }
  verifier(ligneSansCopie.statut === 'ok', 'la sauvegarde locale reste marquée réussie')
  verifier(ligneSansCopie.externe === null, 'aucune copie externe n’est inventée')
  verifier(
    (ligneSansCopie.message ?? '').includes('Copie externe impossible'),
    'l’échec de la copie est consigné, pas tu',
    ligneSansCopie.message
  )
  verifier(configuration.etatCopieExterne().accessible === false, 'la destination est signalée injoignable')

  configuration.definirParametres({ 'sauvegarde.destination_externe': dossierExterne }, adminId)

  // ==========================================================================
  titre('Verrouillage du poste')

  verifier(
    auth.controlerMotDePasse(adminId, 'Officine2026'),
    'le bon mot de passe déverrouille le poste'
  )
  verifier(
    !auth.controlerMotDePasse(adminId, 'PasLeBon'),
    'un mot de passe erroné ne déverrouille pas'
  )
  verifier(
    !auth.controlerMotDePasse(999_999, 'Officine2026'),
    'un utilisateur inexistant ne déverrouille pas'
  )

  // Le déverrouillage ne rouvre pas de session : il rend la main à celle qui
  // était déjà ouverte. Aucune connexion supplémentaire ne doit être tracée.
  const sessionsAvant = (
    base().prepare('SELECT COUNT(*) n FROM sessions').get() as unknown as { n: number }
  ).n
  auth.controlerMotDePasse(adminId, 'Officine2026')
  const sessionsApres = (
    base().prepare('SELECT COUNT(*) n FROM sessions').get() as unknown as { n: number }
  ).n
  verifier(sessionsAvant === sessionsApres, 'déverrouiller ne crée pas une nouvelle session')

  // Les essais ratés comptent : un poste abandonné n'est pas un terrain d'essai.
  const compteur = (
    base()
      .prepare('SELECT tentatives_echouees n FROM utilisateurs WHERE id = ?')
      .get(adminId) as unknown as { n: number }
  ).n
  verifier(compteur === 0, 'un déverrouillage réussi remet le compteur d’essais à zéro', compteur)

  // ==========================================================================
  titre('Chiffrement de la base et des sauvegardes')

  // La base vivante ne doit plus s'annoncer comme une base SQLite : c'est le
  // premier reflexe de quiconque ouvre le fichier avec un outil tiers.
  verifier(!enClair(cheminBase), 'le fichier de l’officine est chiffré')

  const octetsBase = readFileSync(cheminBase)
  verifier(
    !octetsBase.includes(Buffer.from('SQLite format 3')),
    'le fichier ne porte pas l’en-tête SQLite'
  )
  verifier(
    !octetsBase.includes(Buffer.from('Doliprane')),
    'aucun nom de produit n’est lisible dans la base'
  )
  verifier(
    !octetsBase.includes(Buffer.from('Kouadio')),
    'aucun nom de client n’est lisible dans la base'
  )

  const dossierCoffre = join(dossier, 'coffre')
  const scellee = configuration.creerSauvegarde(cheminBase, dossierCoffre, 'manuelle', adminId)

  verifier(scellee.fichier.endsWith('.pharmina'), 'la sauvegarde porte l’extension chiffrée')
  verifier(coffre.estChiffre(scellee.fichier), 'le fichier porte la signature du coffre')
  verifier(
    !existsSync(scellee.fichier.replace(/\.pharmina$/, '.db')),
    'aucune version en clair ne subsiste à côté'
  )

  const octets = readFileSync(scellee.fichier)
  verifier(
    !octets.includes(Buffer.from('SQLite format 3')),
    'la sauvegarde ne s’annonce pas comme une base SQLite'
  )
  verifier(
    !octets.includes(Buffer.from('Doliprane')),
    'aucun nom de produit n’est lisible dans la sauvegarde'
  )

  // Et elle doit rester exploitable par le logiciel, sans que personne n'ait
  // rien a saisir : c'est tout l'objet du modele retenu.
  const controleScelle = configuration.controlerSauvegarde(scellee.fichier)
  verifier(controleScelle.valide, 'le logiciel relit la sauvegarde sans rien demander', controleScelle.motif)
  verifier(controleScelle.chiffree === true, 'le contrôle signale que la sauvegarde est chiffrée')

  // Deux sauvegardes du meme contenu ne doivent pas se ressembler : sinon on
  // deduit du fichier ce qui a change entre deux jours.
  const seconde = configuration.creerSauvegarde(cheminBase, dossierCoffre, 'manuelle', adminId)
  const octetsSeconde = readFileSync(seconde.fichier)
  verifier(
    !octets.subarray(0, 200).equals(octetsSeconde.subarray(0, 200)),
    'deux sauvegardes successives ne se ressemblent pas'
  )

  // Intégrité : GCM doit refuser un fichier retouché, même d'un seul octet.
  const falsifiee = join(dossierCoffre, 'falsifiee.pharmina')
  const copieOctets = Buffer.from(octets)
  copieOctets[copieOctets.length - 5] ^= 0x01
  writeFileSync(falsifiee, copieOctets)
  verifier(
    !configuration.controlerSauvegarde(falsifiee).valide,
    'une sauvegarde modifiée d’un octet est refusée, pas restaurée en silence'
  )

  // Un fichier etranger ne doit pas passer pour une sauvegarde.
  const etranger = join(dossierCoffre, 'etranger.pharmina')
  writeFileSync(etranger, Buffer.from('ceci n’est pas une sauvegarde PHARMINA'))
  verifier(
    !configuration.controlerSauvegarde(etranger).valide,
    'un fichier étranger est refusé'
  )

  // Les sauvegardes d'avant le chiffrement doivent rester restaurables :
  // refuser l'historique d'une officine parce que le format a change serait
  // inacceptable.
  configuration.definirParametres({ 'sauvegarde.chiffrement': '0' }, adminId)
  const enClairSauvegarde = configuration.creerSauvegarde(cheminBase, dossierCoffre, 'manuelle', adminId)
  verifier(enClairSauvegarde.fichier.endsWith('.db'), 'le chiffrement se désactive quand on le demande')
  verifier(!coffre.estChiffre(enClairSauvegarde.fichier), 'la sauvegarde est alors en clair')
  verifier(
    configuration.controlerSauvegarde(enClairSauvegarde.fichier).valide,
    'une sauvegarde en clair reste contrôlable'
  )
  configuration.definirParametres({ 'sauvegarde.chiffrement': '1' }, adminId)

  const protection = configuration.etatProtection()
  verifier(protection.baseChiffree, 'l’écran de protection annonce une base chiffrée')
  verifier(protection.sauvegardesChiffrees, 'l’écran de protection annonce des sauvegardes chiffrées')

  // ==========================================================================
  titre('Restauration')

  const produitsAvantRestauration = (
    base().prepare('SELECT COUNT(*) n FROM produits').get() as unknown as { n: number }
  ).n

  const pointDeRetour = configuration.creerSauvegarde(cheminBase, dossierCoffre, 'manuelle', adminId)

  // On abîme volontairement la base : c'est ce qu'une restauration doit défaire.
  produits.creerProduit(
    { nomCommercial: 'Produit saisi par erreur', prixAchat: 1, prixVente: 2, stockMin: 1 },
    adminId
  )
  const produitsAbimes = (
    base().prepare('SELECT COUNT(*) n FROM produits').get() as unknown as { n: number }
  ).n
  verifier(produitsAbimes === produitsAvantRestauration + 1, 'la base contient bien le produit de trop')

  refuse(
    'restaurer un fichier illisible est refusé avant de toucher aux données',
    () =>
      configuration.restaurerSauvegarde(
        { fichier: falsifiee },
        cheminBase,
        join(dossier, 'sauvegardes'),
        adminId
      ),
    'refusée'
  )
  verifier(
    (base().prepare('SELECT COUNT(*) n FROM produits').get() as unknown as { n: number }).n ===
      produitsAbimes,
    'un refus de restauration ne modifie rien'
  )

  const restauration = configuration.restaurerSauvegarde(
    { fichier: pointDeRetour.fichier },
    cheminBase,
    join(dossier, 'sauvegardes'),
    adminId
  )
  verifier(restauration.restaure, 'la restauration aboutit')
  verifier(
    existsSync(restauration.copieDeSecurite),
    'la base précédente est mise de côté avant remplacement',
    restauration.copieDeSecurite
  )

  // La base a été fermée par la restauration : c'est le logiciel redémarré qui
  // la rouvre. On fait ici ce que fera le démarrage.
  ouvrirBase(cheminBase)
  const produitsApresRestauration = (
    base().prepare('SELECT COUNT(*) n FROM produits').get() as unknown as { n: number }
  ).n
  verifier(
    produitsApresRestauration === produitsAvantRestauration,
    'le produit saisi par erreur a disparu',
    produitsApresRestauration
  )
  verifier(
    (base().prepare('PRAGMA integrity_check').get() as unknown as { integrity_check: string })
      .integrity_check === 'ok',
    'la base restaurée est intègre'
  )

  // La copie de securite doit vraiment contenir l'etat d'avant : c'est le
  // dernier point de retour si la restauration etait une erreur.
  verifier(
    configuration.controlerSauvegarde(restauration.copieDeSecurite).valide,
    'la copie de sécurité est elle-même relisible'
  )

  // ==========================================================================
  titre('La base n’appartient qu’à cet ordinateur')

  // Le scenario redoute : quelqu'un copie pharmina.db sur une cle et l'emporte.
  // Sur l'autre machine, PHARMINA cree sa propre cle de poste — et le fichier
  // recopie ne s'ouvre pas. On le reproduit ici en copiant la base dans un
  // dossier neuf, ou aucun sceau n'existe.
  fermerBase()

  const ailleurs = join(dossier, 'autre-ordinateur')
  mkdirSync(ailleurs, { recursive: true })
  const baseVolee = join(ailleurs, 'pharmina.db')
  copyFileSync(cheminBase, baseVolee)

  verifier(!enClair(baseVolee), 'la base emportée est bien chiffrée')

  // Et le fichier lui-meme ne livre rien a un outil tiers.
  const octetsVoles = readFileSync(baseVolee)
  verifier(
    !octetsVoles.includes(Buffer.from('SQLite format 3')) &&
      !octetsVoles.includes(Buffer.from('Doliprane')),
    'la base emportée ne livre ni en-tête ni données lisibles'
  )

  // Une base scellée par une AUTRE clé — c'est ce qu'est une base venue d'un
  // autre ordinateur — doit être refusée au lieu de s'ouvrir vide ou de
  // planter au milieu d'un écran.
  const baseEtrangere = join(ailleurs, 'etrangere.db')
  const etrangere = new Moteur(baseEtrangere)
  etrangere.pragma("cipher='sqlcipher'")
  etrangere.key(randomBytes(32))
  etrangere.exec('CREATE TABLE t (v TEXT)')
  etrangere.close()

  let ouvertureEtrangere = 'refusée'
  try {
    ouvrirBase(baseEtrangere)
    ouvertureEtrangere = 'ACCEPTÉE'
    fermerBase()
  } catch {
    /* refus attendu */
  }
  verifier(
    ouvertureEtrangere === 'refusée',
    'une base scellée par une autre clé est refusée',
    ouvertureEtrangere
  )

  // En revanche, une SAUVEGARDE doit repartir sur cet « autre ordinateur » :
  // c'est toute la distinction demandee entre une copie et une sauvegarde.
  const baseAilleurs = join(ailleurs, 'restauree', 'pharmina.db')
  mkdirSync(join(ailleurs, 'restauree'), { recursive: true })

  // On simule l'installation neuve : aucun sceau, donc une autre cle de poste.
  ouvrirBase(baseAilleurs)
  const restaurationAilleurs = configuration.restaurerSauvegarde(
    { fichier: scellee.fichier },
    baseAilleurs,
    join(ailleurs, 'sauvegardes'),
    1
  )
  fermerBase()
  verifier(restaurationAilleurs.restaure, 'une sauvegarde se restaure sur un autre poste')

  ouvrirBase(baseAilleurs)
  const produitsAilleurs = (
    base().prepare('SELECT COUNT(*) n FROM produits').get() as unknown as { n: number }
  ).n
  verifier(produitsAilleurs > 0, 'les données sont bien là après restauration ailleurs', produitsAilleurs)
  verifier(!enClair(baseAilleurs), 'la base restaurée est rescellée à son nouveau poste')
  fermerBase()

  // ==========================================================================
  titre('Une base illisible ne referme plus le logiciel en silence')

  // Le scenario du poste infeste : un antivirus met le fichier en quarantaine,
  // un rancongiciel le chiffre, une coupure de courant l'abime. Jusqu'ici le
  // logiciel ecrivait dans une console que personne ne lit, puis se refermait :
  // le pharmacien double-cliquait sur l'icone et il ne se passait rien.
  {
    const posteInfeste = join(dossier, 'poste-infeste')
    const baseAbimee = join(posteInfeste, 'pharmina.db')
    mkdirSync(posteInfeste, { recursive: true })

    // Une base saine, sa sauvegarde, puis le sinistre.
    ouvrirBase(baseAbimee)
    const avant = (base().prepare('SELECT COUNT(*) n FROM produits').get() as { n: number }).n
    // Aucun utilisateur n'existe encore sur ce poste neuf : la sauvegarde est
    // donc anonyme, comme elle le serait sur une installation fraîche.
    const sauvegardeSaine = configuration.creerSauvegarde(
      baseAbimee,
      join(posteInfeste, 'sauvegardes'),
      'manuelle',
      null
    )
    fermerBase()

    verifier(
      configuration.controlerSauvegarde(sauvegardeSaine.fichier).valide,
      'la sauvegarde prise avant le sinistre est relisible'
    )

    // Le sinistre lui-meme : le fichier est ecrase par du bruit.
    writeFileSync(baseAbimee, randomBytes(4096))

    let ouvertureAbimee = 'refusée'
    try {
      ouvrirBase(baseAbimee)
      ouvertureAbimee = 'ACCEPTÉE'
      fermerBase()
    } catch {
      /* refus attendu */
    }
    verifier(ouvertureAbimee === 'refusée', 'une base abîmée est refusée à l’ouverture', ouvertureAbimee)

    // Le secours : restaurer sans base ouverte, sans journal, sans utilisateur.
    secours.restaurerEnUrgence(sauvegardeSaine.fichier, baseAbimee)
    ouvrirBase(baseAbimee)

    const apres = (base().prepare('SELECT COUNT(*) n FROM produits').get() as { n: number }).n
    verifier(apres === avant, 'le secours ramène exactement les données sauvegardées', { avant, apres })
    verifier(
      (base().prepare('PRAGMA integrity_check').get() as { integrity_check: string })
        .integrity_check === 'ok',
      'la base secourue est intègre'
    )
    verifier(!enClair(baseAbimee), 'la base secourue est rescellée à ce poste')
    fermerBase()

    // Le fichier abime n'est JAMAIS efface : il se repare parfois, et c'est
    // tout ce qui reste le jour ou les sauvegardes manquent aussi.
    const conserves = readdirSync(posteInfeste).filter((f) => f.includes('illisible'))
    verifier(conserves.length === 1, 'le fichier illisible est conservé, jamais effacé', conserves)

    // Et le secours doit savoir presenter les sauvegardes, la plus recente
    // d'abord : c'est celle qu'on proposera au pharmacien.
    const disponibles = secours.sauvegardesDisponibles(join(posteInfeste, 'sauvegardes'))
    verifier(disponibles.length > 0, 'le secours retrouve les sauvegardes du dossier', disponibles.length)
    verifier(
      disponibles.every((s, i) => i === 0 || disponibles[i - 1]!.at >= s.at),
      'les sauvegardes sont présentées de la plus récente à la plus ancienne'
    )
    verifier(
      secours.sauvegardesDisponibles(join(posteInfeste, 'dossier-inexistant')).length === 0,
      'un dossier de sauvegardes absent ne fait pas tomber le secours'
    )
  }

  // Retour a la base de l'essai pour la suite des controles.
  ouvrirBase(cheminBase)

  // ==========================================================================
  titre('Le contexte du comptoir')

  // Emplacement, peremption et equivalents : les trois choses qu'on regarde,
  // client devant, avant de servir. Elles doivent etre justes ou muettes,
  // jamais approximatives.
  {
    const efferalgan = produits.creerProduit(
      {
        nomCommercial: 'Efferalgan',
        principeActif: 'Paracétamol',
        dosage: '500 mg',
        prixAchat: 400,
        prixVente: 600,
        stockMin: 5,
        emplacement: 'Rayon A · Étagère 2'
      },
      adminId
    )
    const teva = produits.creerProduit(
      {
        nomCommercial: 'Paracétamol Teva',
        // Meme molecule, ecrite differemment : c'est le cas reel, et la
        // comparaison doit resister a la casse comme aux espaces.
        principeActif: '  PARACÉTAMOL ',
        dosage: '500 mg',
        prixAchat: 350,
        prixVente: 500,
        stockMin: 5
      },
      adminId
    )
    const rupture = produits.creerProduit(
      { nomCommercial: 'Panadol', principeActif: 'Paracétamol', prixAchat: 300, prixVente: 450, stockMin: 1 },
      adminId
    )

    const dans = (jours: number): string =>
      new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10)

    stock.entrerStock({ produitId: efferalgan, quantite: 10, prixAchat: 400, datePeremption: dans(400) }, adminId)
    stock.entrerStock({ produitId: teva, quantite: 30, prixAchat: 350, datePeremption: dans(200) }, adminId)

    const ctx = produits.contexteProduit(efferalgan)

    verifier(ctx.emplacement === 'Rayon A · Étagère 2', 'le contexte donne l’emplacement du produit')
    verifier(
      ctx.joursAvantPeremption !== null && Math.abs(ctx.joursAvantPeremption - 400) <= 1,
      'le contexte compte les jours avant péremption',
      ctx.joursAvantPeremption
    )
    verifier(
      ctx.equivalents.some((e) => e.id === teva),
      'le contexte propose l’équivalent de même principe actif'
    )
    verifier(
      ctx.equivalents.find((e) => e.id === teva)?.nom === 'Paracétamol Teva',
      'la casse et les espaces du principe actif n’empêchent pas le rapprochement'
    )
    verifier(!ctx.equivalents.some((e) => e.id === efferalgan), 'le contexte ne se propose pas lui-même')
    verifier(
      !ctx.equivalents.some((e) => e.id === rupture),
      'un équivalent en rupture n’est jamais proposé',
      ctx.equivalents.map((e) => e.nom)
    )
    verifier(
      !ctx.equivalents.some((e) => e.id === amoxicilline),
      'une autre molécule n’apparaît pas dans les équivalents'
    )

    // Un lot plus proche prend la main : c'est celui-la qui sera servi.
    stock.entrerStock({ produitId: efferalgan, quantite: 4, prixAchat: 400, datePeremption: dans(15) }, adminId)
    const apres = produits.contexteProduit(efferalgan)
    verifier(
      apres.joursAvantPeremption !== null && Math.abs(apres.joursAvantPeremption - 15) <= 1,
      'la péremption affichée est celle du lot le plus proche',
      apres.joursAvantPeremption
    )
    verifier(apres.lotsActifs === 2, 'le contexte compte les lots actifs', apres.lotsActifs)

    // Sans principe actif renseigne, aucun equivalent ne peut etre devine : le
    // nom commercial ne dit rien de la molecule.
    const anonyme = produits.creerProduit(
      { nomCommercial: 'Sirop maison', prixAchat: 100, prixVente: 200, stockMin: 1 },
      adminId
    )
    stock.entrerStock({ produitId: anonyme, quantite: 3, prixAchat: 100 }, adminId)
    const muet = produits.contexteProduit(anonyme)
    verifier(muet.equivalents.length === 0, 'sans principe actif, aucun équivalent n’est proposé')
    verifier(muet.joursAvantPeremption === null, 'sans lot daté, la péremption reste muette')
  }

  // ==========================================================================
  titre('Enregistrement rapide et codes-barres fabriques')

  // Une livraison de quarante references attend sur le comptoir. Six champs
  // suffisent ; le reste se completera plus tard, ou jamais.
  {
    const rapide = produits.creerProduitRapide(
      {
        nom: 'Ibuprofene 400 mg',
        prixVente: 800,
        quantite: 24,
        emplacement: 'Rayon B · Étagère 1',
        datePeremption: '2028-06-30'
      },
      adminId
    )

    verifier(rapide.id > 0, 'l’enregistrement rapide crée le produit')
    verifier(rapide.codeEngendre, 'sans code lu, un code interne est fabriqué')
    verifier(
      codesBarres.estEan13Valide(rapide.codeBarres ?? ''),
      'le code fabriqué est un EAN-13 valide, chiffre de contrôle compris',
      rapide.codeBarres
    )
    verifier(
      codesBarres.estCodeInterne(rapide.codeBarres ?? ''),
      'le code fabriqué commence par 2 — plage réservée à l’usage interne',
      rapide.codeBarres
    )

    // Le stock doit etre entre, avec sa peremption : c'est tout l'interet
    // d'avoir demande la quantite.
    const ctx = produits.contexteProduit(rapide.id)
    verifier(ctx.emplacement === 'Rayon B · Étagère 1', 'l’emplacement saisi est retenu')
    verifier(ctx.datePeremption === '2028-06-30', 'la péremption saisie crée bien le lot', ctx.datePeremption)
    verifier(
      stock.stockDisponible(rapide.id) === 24,
      'la quantité saisie entre en stock',
      stock.stockDisponible(rapide.id)
    )

    // Le code fabrique doit se scanner : c'est la seule chose qui compte.
    const parScan = produits.rechercheRapide(rapide.codeBarres!)
    verifier(
      parScan.length === 1 && parScan[0]!.id === rapide.id,
      'le code fabriqué retrouve son produit à la douchette'
    )

    // Reinterroger le meme produit redonne le meme code : reimprimer une
    // etiquette perdue ne doit pas creer un second code pour la meme boite.
    const rappel = codesBarres.engendrerCodeInterne(rapide.id, adminId)
    verifier(!rappel.nouveau, 'réimprimer ne fabrique pas un second code')
    verifier(rappel.code === rapide.codeBarres, 'le même produit retrouve le même code')

    // Deux produits n'obtiennent jamais le meme code.
    const autre = produits.creerProduitRapide(
      { nom: 'Vitamine C 500', prixVente: 300, quantite: 0 },
      adminId
    )
    verifier(autre.codeBarres !== rapide.codeBarres, 'deux produits reçoivent deux codes distincts')
    verifier(stock.stockDisponible(autre.id) === 0, 'une quantité nulle n’invente aucun lot')

    // Un code lu sur la boite est conserve tel quel, sans en fabriquer un.
    const avecCode = produits.creerProduitRapide(
      { nom: 'Aspirine 500', prixVente: 400, quantite: 5, codeBarres: '3401579804567' },
      adminId
    )
    verifier(!avecCode.codeEngendre, 'un code lu sur la boîte n’en fait pas fabriquer un autre')
    verifier(avecCode.codeBarres === '3401579804567', 'le code lu est conservé tel quel')

    // Et un code deja pris est refuse en NOMMANT le produit concerne.
    let refus = ''
    try {
      produits.creerProduitRapide(
        { nom: 'Doublon', prixVente: 100, quantite: 1, codeBarres: '3401579804567' },
        adminId
      )
    } catch (erreur) {
      refus = (erreur as Error).message
    }
    verifier(refus.includes('Aspirine 500'), 'un code déjà pris est refusé en nommant le produit', refus)

    // Refus sans ecriture : le doublon ne doit pas avoir laisse de fiche.
    verifier(
      produits.rechercheRapide('Doublon').length === 0,
      'le refus n’a laissé aucune fiche derrière lui'
    )

    // Les garde-fous de saisie.
    const refuse = (demande: produits.DemandeRapide, quoi: string): void => {
      let message = ''
      try {
        produits.creerProduitRapide(demande, adminId)
      } catch (erreur) {
        message = (erreur as Error).message
      }
      verifier(message !== '', `l’enregistrement rapide refuse ${quoi}`, message)
    }
    refuse({ nom: '   ', prixVente: 500, quantite: 1 }, 'un nom vide')
    refuse({ nom: 'Sans prix', prixVente: 0, quantite: 1 }, 'un prix nul')
    refuse({ nom: 'Prix negatif', prixVente: -5, quantite: 1 }, 'un prix négatif')
    refuse({ nom: 'Quantite cassee', prixVente: 500, quantite: -2 }, 'une quantité négative')
    refuse({ nom: 'Code court', prixVente: 500, quantite: 1, codeBarres: '123' }, 'un code trop court')
    refuse(
      { nom: 'Code non numerique', prixVente: 500, quantite: 1, codeBarres: '34015ABC04567' },
      'un code non numérique'
    )

    // Le chiffre de controle, sur des cas connus.
    verifier(codesBarres.chiffreControleEan13('400638133393') === 1, 'chiffre de contrôle EAN-13 exact')
    verifier(!codesBarres.estEan13Valide('4006381333931'.slice(0, 12) + '2'), 'un contrôle faux est rejeté')
    verifier(!codesBarres.estEan13Valide('123'), 'une longueur fausse est rejetée')

    // La planche d'etiquettes ne propose que les codes fabriques : reimprimer
    // le code du fabricant n'aurait aucun sens, il est deja sur la boite.
    const aEtiqueter = codesBarres.produitsAEtiqueter()
    verifier(
      aEtiqueter.some((p) => p.produitId === rapide.id),
      'la planche propose les produits à code fabriqué'
    )
    verifier(
      !aEtiqueter.some((p) => p.code === '3401579804567'),
      'la planche ne propose pas les codes lus sur les boîtes'
    )
    verifier(
      aEtiqueter.every((p) => codesBarres.estCodeInterne(p.code)),
      'la planche ne contient que des codes internes valides'
    )
  }

  // ==========================================================================
  titre('Intégrité finale de la base')

  const integrite = base().prepare('PRAGMA integrity_check').get() as { integrity_check: string }
  verifier(integrite.integrity_check === 'ok', 'la base est intègre après le scénario complet')

  const violations = base().prepare('PRAGMA foreign_key_check').all()
  verifier(violations.length === 0, 'aucune violation de clé étrangère', violations.length)

  const lotsIncoherents = base()
    .prepare('SELECT COUNT(*) n FROM lots WHERE quantite_restante < 0 OR quantite_restante > quantite_initiale')
    .get() as { n: number }
  verifier(lotsIncoherents.n === 0, 'aucun lot dans un état impossible')

  // Le stock affiché doit toujours égaler la somme des mouvements enregistrés.
  const ecartsStock = base()
    .prepare(
      `SELECT p.id, p.nom_commercial, s.stock,
              COALESCE((SELECT SUM(quantite) FROM mouvements_stock WHERE produit_id = p.id), 0) AS somme
       FROM produits p JOIN v_stock_produit s ON s.produit_id = p.id
       WHERE s.stock <> COALESCE((SELECT SUM(quantite) FROM mouvements_stock WHERE produit_id = p.id), 0)`
    )
    .all()
  verifier(
    ecartsStock.length === 0,
    'le stock de chaque produit égale la somme de ses mouvements',
    ecartsStock
  )
} catch (erreur) {
  echoues++
  console.log('\nERREUR NON RATTRAPEE :', (erreur as Error).message)
  console.log((erreur as Error).stack)
} finally {
  try {
    fermerBase()
  } catch {
    /* déjà fermée */
  }
  // Windows relâche ses verrous de fichier avec un instant de retard : sans
  // patience, le ménage de fin échoue et masque le résultat des vérifications.
  // Le banc ne doit jamais tomber sur son propre nettoyage.
  try {
    rmSync(dossier, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  } catch (erreur) {
    console.log(`  (dossier d'essai non supprimé : ${(erreur as Error).message})`)
  }
}

console.log(`\n${'='.repeat(66)}`)
console.log(`  ${reussis} verification(s) reussie(s), ${echoues} echec(s)`)
if (echecs.length) {
  console.log('\n  Echecs :')
  for (const e of echecs) console.log(`    - ${e}`)
}
console.log(`${'='.repeat(66)}\n`)

process.exit(echoues ? 1 : 0)
