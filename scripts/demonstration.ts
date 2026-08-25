/**
 * Jeu de démonstration.
 *
 * Remplit la base de l'application avec une officine plausible : catalogue,
 * fournisseurs, clients, réceptions, et deux semaines de ventes réparties
 * jour par jour. Sert à évaluer le logiciel sans saisir vingt minutes de
 * données, et à le présenter à un pharmacien.
 *
 * Deux garde-fous :
 *
 *   — le script refuse de s'exécuter si la base contient déjà des ventes,
 *     pour ne jamais polluer une officine en activité ;
 *   — il ne touche pas à l'identité de la pharmacie ni aux comptes existants.
 *
 * Tout passe par les services réels : le stock, les lots, la caisse et le
 * journal restent donc cohérents, exactement comme si la journée avait été
 * saisie au comptoir.
 */
import { app } from 'electron'
import { join } from 'node:path'

import { base, fermerBase, ouvrirBase, transaction } from '../src/main/db'
import * as produits from '../src/main/services/produits'
import * as partenaires from '../src/main/services/partenaires'
import * as achats from '../src/main/services/achats'
import * as caisse from '../src/main/services/caisse'
import * as ventes from '../src/main/services/ventes'
import * as finances from '../src/main/services/finances'
import * as auth from '../src/main/services/auth'
import * as alertes from '../src/main/services/alertes'
import { aujourdhui, decalerJours } from '../src/main/services/commun'

// Lancé par `npx electron`, le processus s'appelle « Electron » et son dossier
// de données n'est pas celui du logiciel installé. On fixe le nom pour viser
// la bonne base, celle que l'application utilisera réellement.
app.setName('PHARMINA')

const cheminBase =
  process.env.PHARMINA_BASE ?? join(app.getPath('userData'), 'donnees', 'pharmina.db')

/** nom, générique, dosage, catégorie, forme, achat, vente, seuil, emplacement, ordonnance */
const CATALOGUE: [string, string | null, string, number, number, number, number, number, string, boolean][] = [
  ['Doliprane', 'Paracétamol', '500 mg', 1, 1, 900, 1500, 20, 'Rayon A-12', false],
  ['Doliprane', 'Paracétamol', '1000 mg', 1, 1, 1400, 2300, 15, 'Rayon A-12', false],
  ['Efferalgan', 'Paracétamol', '1 g', 1, 1, 1300, 2200, 15, 'Rayon A-12', false],
  ['Amoxicilline', 'Amoxicilline', '500 mg', 1, 2, 3100, 4800, 10, 'Rayon A-14', true],
  ['Augmentin', 'Amoxicilline + ac. clavulanique', '1 g', 1, 12, 5200, 8400, 8, 'Rayon A-14', true],
  ['Ciprofloxacine', 'Ciprofloxacine', '500 mg', 1, 1, 2800, 4400, 8, 'Rayon A-15', true],
  ['Ibuprofène', 'Ibuprofène', '400 mg', 1, 1, 1050, 1800, 20, 'Rayon A-15', false],
  ['Diclofénac', 'Diclofénac', '50 mg', 1, 1, 1200, 2000, 12, 'Rayon A-16', false],
  ['Métronidazole', 'Métronidazole', '500 mg', 1, 1, 1600, 2600, 10, 'Rayon A-16', true],
  ['Artéméther-Luméfantrine', null, '20/120 mg', 1, 1, 2400, 3900, 15, 'Rayon A-18', true],
  ['Quinine', 'Quinine', '300 mg', 1, 1, 1900, 3100, 10, 'Rayon A-18', true],
  ['Sels de réhydratation', null, 'sachet', 1, 13, 350, 700, 30, 'Rayon A-20', false],
  ['Vitamine C', 'Acide ascorbique', '1000 mg', 2, 1, 2100, 3200, 12, 'Rayon B-03', false],
  ['Fer + acide folique', null, 'boîte de 30', 2, 1, 1800, 2900, 12, 'Rayon B-04', false],
  ['Gel hydroalcoolique', null, '250 ml', 3, 9, 1150, 2000, 10, 'Rayon C-02', false],
  ['Sérum physiologique', null, '5 ml x20', 3, 11, 1400, 2400, 12, 'Rayon C-04', false],
  ['Pansements adhésifs', null, 'boîte de 40', 3, 17, 900, 1600, 15, 'Rayon C-06', false],
  ['Compresses stériles', null, 'boîte de 20', 3, 17, 1100, 1900, 12, 'Rayon C-07', false],
  ['Alcool à 70°', null, '250 ml', 3, 11, 700, 1300, 15, 'Rayon C-08', false],
  ['Thermomètre frontal', null, 'infrarouge', 4, 17, 6800, 11000, 4, 'Matériel 02', false],
  ['Tensiomètre digital', null, 'bras', 4, 17, 13000, 18500, 3, 'Matériel 01', false],
  ['Lait infantile 1er âge', null, '400 g', 5, 12, 4600, 6900, 6, 'Rayon D-01', false]
]

/**
 * Générateur pseudo-aléatoire à graine fixe : le jeu de démonstration est
 * varié mais toujours identique d'une exécution à l'autre, ce qui permet de
 * refaire deux fois la même présentation.
 */
function tirage(graine: number): () => number {
  let etat = graine
  return () => {
    etat = (etat * 1103515245 + 12345) % 2147483648
    return etat / 2147483648
  }
}

function main(): void {
  ouvrirBase(cheminBase)

  const nbVentes = (base().prepare('SELECT COUNT(*) n FROM ventes').get() as unknown as { n: number }).n
  if (nbVentes > 0) {
    console.error(
      `\nCette base contient déjà ${nbVentes} vente(s).\n` +
        'Le jeu de démonstration est refusé : il ne doit jamais se mélanger\n' +
        "à l'activité réelle d'une officine.\n"
    )
    fermerBase()
    app.exit(1)
    return
  }

  const admin = (
    base()
      .prepare('SELECT id FROM utilisateurs WHERE archived_at IS NULL ORDER BY id LIMIT 1')
      .get() as unknown as { id: number } | undefined
  )?.id

  if (!admin) {
    console.error('\nAucun utilisateur : configurez d’abord le logiciel.\n')
    fermerBase()
    app.exit(1)
    return
  }

  // Une session de caisse laissée ouverte lors d'un essai empêcherait
  // d'ouvrir les journées suivantes : on la solde, elle est forcément vide
  // puisque la base ne contient aucune vente.
  const dejaOuverte = caisse.sessionOuverte()
  if (dejaOuverte) {
    caisse.cloturerCaisse(caisse.etatCaisse().theoriqueEspeces, 'Solde avant jeu de démonstration', admin)
    console.log(`  caisse ${dejaOuverte.reference} clôturée (session d'essai)`)
  }

  const permissions = auth.permissionsDe(admin)
  const jour = aujourdhui()
  const hasard = tirage(20260825)

  console.log('\nConstitution du jeu de démonstration…')

  // --- Catalogue ------------------------------------------------------------
  const ids = CATALOGUE.map(
    ([nom, generique, dosage, categorie, forme, achat, vente, seuil, emplacement, ordonnance], i) =>
      produits.creerProduit(
        {
          nomCommercial: nom,
          nomGenerique: generique,
          principeActif: generique,
          dosage,
          categorieId: categorie,
          formeId: forme,
          uniteId: 2,
          prixAchat: achat,
          prixVente: vente,
          stockMin: seuil,
          emplacement,
          ordonnanceRequise: ordonnance,
          codesBarres: [`340093000${String(i + 1).padStart(4, '0')}`]
        },
        admin
      )
  )
  console.log(`  ${ids.length} produits`)

  // --- Fournisseurs ---------------------------------------------------------
  const labo = partenaires.enregistrerFournisseur(
    null,
    {
      nom: 'Laboratoire SantéPlus',
      contactPrincipal: 'Serge Amani',
      telephone: '+225 07 08 09 10 11',
      ville: 'Abidjan',
      conditionsPaiement: '30 jours fin de mois',
      delaiLivraisonJours: 3
    },
    admin
  )
  const distrib = partenaires.enregistrerFournisseur(
    null,
    {
      nom: 'Pharma Distribution CI',
      contactPrincipal: 'Awa Koné',
      telephone: '+225 05 44 22 18 90',
      ville: 'Abidjan',
      conditionsPaiement: 'Comptant'
    },
    admin
  )

  // --- Réceptions -----------------------------------------------------------
  // Péremptions volontairement échelonnées : certaines proches, une dépassée,
  // pour que la surveillance des lots ait quelque chose à montrer.
  const echeances = [420, 52, 380, 310, 26, 500, 240, 610, 700, 450, 800, 190, 600, 330, 700, 450, 800, 520, 400, 0, 0, 240]

  achats.enregistrerReception(
    {
      fournisseurId: labo,
      lignes: ids.slice(0, 11).map((id, i) => ({
        produitId: id,
        quantite: 30 + Math.floor(hasard() * 60),
        prixAchat: CATALOGUE[i]![5],
        numeroLot: `L${String(2500 + i)}`,
        datePeremption: echeances[i] ? decalerJours(jour, echeances[i]!) : null
      })),
      montantPaye: 250_000,
      modePaiement: 'virement'
    },
    admin
  )

  achats.enregistrerReception(
    {
      fournisseurId: distrib,
      lignes: ids.slice(11).map((id, i) => ({
        produitId: id,
        quantite: 12 + Math.floor(hasard() * 40),
        prixAchat: CATALOGUE[i + 11]![5],
        numeroLot: `D${String(4400 + i)}`,
        datePeremption: echeances[i + 11] ? decalerJours(jour, echeances[i + 11]!) : null
      })),
      montantPaye: 0
    },
    admin
  )
  console.log('  2 réceptions fournisseurs')

  // Un lot volontairement proche de la péremption : la surveillance doit
  // avoir un cas réel à signaler dès l'ouverture.
  achats.enregistrerReception(
    {
      fournisseurId: labo,
      lignes: [
        { produitId: ids[4]!, quantite: 6, prixAchat: 5200, numeroLot: 'L-URGENT', datePeremption: decalerJours(jour, 12) }
      ],
      montantPaye: 31_200,
      modePaiement: 'especes'
    },
    admin
  )

  // --- Clients --------------------------------------------------------------
  const clients = [
    partenaires.enregistrerClient(null, { nom: 'Aminata Traoré', telephone: '+225 07 11 22 33 44', plafondCredit: 50_000 }, admin),
    partenaires.enregistrerClient(null, { nom: 'Kouadio N’Guessan', telephone: '+225 05 66 77 88 99', plafondCredit: 30_000 }, admin),
    partenaires.enregistrerClient(null, { nom: 'Fatou Diallo', telephone: '+225 01 23 45 67 89', plafondCredit: 25_000 }, admin),
    partenaires.enregistrerClient(null, { nom: 'Ibrahim Cissé', telephone: '+225 07 45 61 20 33' }, admin),
    partenaires.enregistrerClient(null, { nom: 'Clinique Les Palmiers', telephone: '+225 27 22 44 55 66', plafondCredit: 200_000 }, admin)
  ]
  console.log(`  ${clients.length} comptes clients`)

  // --- Quatorze jours de ventes ---------------------------------------------
  let totalVentes = 0
  for (let recul = 13; recul >= 0; recul--) {
    const jourVente = decalerJours(jour, -recul)
    const session = caisse.ouvrirCaisse(50_000, admin)

    // Moins d'affluence le dimanche : une courbe plate se lirait comme une
    // donnée absente, pas comme une activité régulière.
    const dimanche = new Date(jourVente + 'T00:00:00').getDay() === 0
    const nbDuJour = dimanche ? 3 + Math.floor(hasard() * 3) : 7 + Math.floor(hasard() * 9)

    for (let v = 0; v < nbDuJour; v++) {
      const nbLignes = 1 + Math.floor(hasard() * 3)
      const lignes: { produitId: number; quantite: number }[] = []
      for (let l = 0; l < nbLignes; l++) {
        const produit = ids[Math.floor(hasard() * ids.length)]!
        if (lignes.some((x) => x.produitId === produit)) continue
        lignes.push({ produitId: produit, quantite: 1 + Math.floor(hasard() * 3) })
      }
      if (!lignes.length) continue

      // Le contrôle sert uniquement à connaître le total et à écarter les
      // paniers que le stock ne peut pas servir. Les avertissements de
      // règlement sont attendus ici : aucun paiement n'est encore saisi.
      const controle = ventes.verifierVente({ lignes, paiements: [] }, permissions)
      const impossible = controle.avertissements.some(
        (a) => a.bloquant && a.code !== 'plafond_credit'
      )
      if (impossible || controle.total <= 0) continue

      // Une vente sur huit part à crédit sur un compte client.
      const aCredit = hasard() < 0.12
      const client = aCredit ? clients[Math.floor(hasard() * 3)]! : null
      const mode = hasard() < 0.75 ? 'especes' : 'mobile_money'
      const regle = aCredit ? Math.floor(controle.total * 0.4) : controle.total

      try {
        ventes.enregistrerVente(
          {
            clientId: client,
            lignes,
            paiements: regle > 0 ? [{ mode, montant: regle }] : []
          },
          admin,
          permissions
        )
        totalVentes++
      } catch {
        // Stock épuisé sur ce produit : on passe à la vente suivante.
      }
    }

    // On antidate la journée. Les montants ne bougent pas : seul l'horodatage
    // change, ce qui laisse le stock, la caisse et le journal cohérents.
    if (recul > 0) {
      antidater(session.id, jourVente)
      caisse.cloturerCaisse(caisse.etatCaisse().theoriqueEspeces, null, admin)
      base()
        .prepare(
          `UPDATE caisse_sessions
           SET ouverte_at = :ouverture, fermee_at = :fermeture
           WHERE id = :id`
        )
        .run({
          id: session.id,
          ouverture: new Date(`${jourVente}T08:05:00`).toISOString(),
          fermeture: new Date(`${jourVente}T19:20:00`).toISOString()
        })
    }
  }
  console.log(`  ${totalVentes} ventes réparties sur 14 jours`)

  // --- Dépenses --------------------------------------------------------------
  finances.enregistrerDepense(
    { date: jour, categorieId: 5, libelle: 'Transport livraison SantéPlus', montant: 15_000 },
    admin
  )
  finances.enregistrerDepense(
    { date: decalerJours(jour, -3), categorieId: 3, libelle: 'Facture d’électricité', montant: 42_000, mode: 'virement' },
    admin
  )
  finances.enregistrerDepense(
    { date: decalerJours(jour, -8), categorieId: 2, libelle: 'Loyer du local', montant: 180_000, mode: 'virement' },
    admin
  )
  console.log('  3 dépenses')

  // --- Un règlement de créance ----------------------------------------------
  const debiteur = partenaires.listerClients().find((c) => (c.solde_du ?? 0) > 2000)
  if (debiteur) {
    partenaires.encaisserCreance(debiteur.id, Math.floor((debiteur.solde_du ?? 0) / 2), 'especes', null, admin)
    console.log('  1 règlement de créance')
  }

  alertes.rafraichirAlertes()

  const resume = base()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM produits) produits,
              (SELECT COUNT(*) FROM ventes) ventes,
              (SELECT COUNT(*) FROM lots) lots,
              (SELECT COUNT(*) FROM alertes WHERE resolue_at IS NULL) alertes`
    )
    .get() as unknown as { produits: number; ventes: number; lots: number; alertes: number }

  console.log(
    `\nPrêt : ${resume.produits} produits, ${resume.lots} lots, ${resume.ventes} ventes, ` +
      `${resume.alertes} alertes.\nLa caisse du jour est ouverte.\n`
  )

  fermerBase()
  app.exit(0)
}

/** Recule l'horodatage d'une journée de caisse et de tout ce qu'elle contient. */
function antidater(sessionId: number, jourVente: string): void {
  transaction(() => {
    const db = base()
    const debut = new Date(`${jourVente}T09:00:00`).toISOString()

    // Les ventes de la session sont étalées sur la journée pour que
    // l'historique ne montre pas quinze ventes à la même minute.
    const lignes = db
      .prepare('SELECT id FROM ventes WHERE caisse_session_id = ? ORDER BY id')
      .all(sessionId) as unknown as { id: number }[]

    lignes.forEach((v, i) => {
      const heure = 9 + Math.floor((i / Math.max(1, lignes.length)) * 9)
      const minute = (i * 17) % 60
      const at = new Date(`${jourVente}T${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).toISOString()
      db.prepare('UPDATE ventes SET at = ? WHERE id = ?').run(at, v.id)
      db.prepare("UPDATE caisse_mouvements SET at = ? WHERE reference_type = 'vente' AND reference_id = ?").run(at, v.id)
      db.prepare("UPDATE mouvements_stock SET at = ? WHERE reference_type = 'vente' AND reference_id = ?").run(at, v.id)
    })

    db.prepare("UPDATE caisse_mouvements SET at = ? WHERE session_id = ? AND type = 'fond_initial'").run(
      debut,
      sessionId
    )
  })
}

app.whenReady().then(() => {
  try {
    main()
  } catch (erreur) {
    console.error('\nÉchec :', (erreur as Error).message)
    try {
      fermerBase()
    } catch {
      /* déjà fermée */
    }
    app.exit(1)
  }
})
