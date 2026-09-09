/**
 * L'officine de démonstration, partagée par la plaquette et la vidéo.
 *
 * POURQUOI UN MODULE PLUTÔT QU'UNE COPIE
 *
 * La plaquette et la vidéo montrent le même logiciel au même prospect. Deux
 * jeux de données séparés finiraient par diverger — un prix ici, un produit
 * là — et le client verrait deux officines différentes selon le support.
 *
 * Tout est tchadien : une plaquette qui montre « Abidjan » à un pharmacien de
 * N'Djamena se disqualifie toute seule.
 */
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

import * as configuration from '../src/main/services/configuration'
import * as produits from '../src/main/services/produits'
import * as stock from '../src/main/services/stock'
import * as caisse from '../src/main/services/caisse'
import * as ventes from '../src/main/services/ventes'
import * as partenaires from '../src/main/services/partenaires'

/** Les permissions sont vérifiées par appartenance exacte : « * » n'est pas un joker. */
const DROITS = ['ventes.creer', 'ventes.credit', 'ventes.remise']

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function base32(octets: Buffer): string {
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

function debase32(texte: string): Buffer {
  let tampon = 0
  let bits = 0
  const octets: number[] = []
  for (const caractere of texte) {
    const valeur = ALPHABET.indexOf(caractere.toUpperCase())
    if (valeur < 0) continue
    tampon = (tampon << 5) | valeur
    bits += 5
    if (bits >= 8) {
      octets.push((tampon >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(octets)
}

/**
 * Une licence Premium perpétuelle pour le poste de démonstration.
 *
 * Sans activation, le bandeau « DÉMONSTRATION — 2 ventes encore possibles »
 * s'affiche en bas de chaque image : on vendrait un logiciel bridé. Et le
 * Premium ouvre le bilan mensuel, qu'on veut montrer.
 */
export function licencePremiumPour(code: string, cheminCle: string): string {
  const empreinte = debase32(code.replace(/[\s-]/g, '')).subarray(0, 10)
  const entete = Buffer.from([1, 0, 0, 1])
  const message = Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, empreinte])
  const signature = sign(null, message, createPrivateKey(readFileSync(cheminCle)))
  return base32(Buffer.concat([entete, signature]))
}

export interface OfficineDemo {
  /** Identifiants des produits, dans l'ordre du catalogue ci-dessous. */
  produits: number[]
}

const CATALOGUE = [
  { nom: 'Doliprane', dci: 'Paracétamol', dosage: '500 mg', achat: 900, vente: 1500, qte: 97, lieu: 'Rayon A-12', jours: 420 },
  { nom: 'Efferalgan', dci: 'Paracétamol', dosage: '1 g', achat: 1300, vente: 2200, qte: 38, lieu: 'Rayon A-12', jours: 52 },
  { nom: 'Amoxicilline', dci: 'Amoxicilline', dosage: '500 mg', achat: 3100, vente: 4800, qte: 28, lieu: 'Rayon A-14', ord: true, jours: 300 },
  { nom: 'Augmentin', dci: 'Amoxicilline', dosage: '1 g', achat: 5200, vente: 7900, qte: 11, lieu: 'Rayon A-14', ord: true, jours: 210 },
  { nom: 'Ibuprofène', dci: 'Ibuprofène', dosage: '400 mg', achat: 700, vente: 1200, qte: 52, lieu: 'Rayon A-15', jours: 380 },
  { nom: 'Gel hydroalcoolique', dci: null, dosage: '250 ml', achat: 1400, vente: 2400, qte: 35, lieu: 'Rayon C-02', jours: 500 },
  { nom: 'Sérum physiologique', dci: null, dosage: '5 ml x20', achat: 1200, vente: 2000, qte: 26, lieu: 'Rayon C-04', jours: 640 },
  { nom: 'Lait infantile 1er âge', dci: null, dosage: '400 g', achat: 6000, vente: 9000, qte: 4, lieu: 'Rayon D-01', jours: 24 },
  { nom: 'Pansements adhésifs', dci: null, dosage: 'boîte de 40', achat: 900, vente: 1600, qte: 38, lieu: 'Rayon C-06', jours: 900 },
  { nom: 'Thermomètre frontal', dci: null, dosage: 'infrarouge', achat: 6800, vente: 11000, qte: 8, lieu: 'Matériel 02', jours: 0 },
  { nom: 'Tensiomètre bras', dci: null, dosage: 'digital', achat: 15400, vente: 22000, qte: 6, lieu: 'Matériel 01', jours: 0 },
  { nom: 'Vitamine C', dci: 'Acide ascorbique', dosage: '1000 mg', achat: 1500, vente: 2300, qte: 43, lieu: 'Rayon B-03', jours: 260 }
]

/** Monte une officine tchadienne crédible : catalogue, stock, clients, ventes. */
export function garnirOfficine(): OfficineDemo {
  configuration.configurerPharmacie({
    pharmacie: {
      nom: 'Pharmacie Santé Pour Tous',
      ville: 'N’Djaména',
      pays: 'Tchad',
      telephone: '+235 22 51 44 20',
      devise: 'XAF',
      deviseSymbole: 'FCFA',
      deviseDecimales: 0
    },
    administrateur: {
      // Le nom qui s'affiche en haut a droite pendant toute la video : ce doit
      // etre celui d'une officine, pas celui de l'editeur.
      nomComplet: 'Tchadien',
      identifiant: 'tchadien',
      motDePasse: 'Officine2026'
    }
  })

  const admin = 1
  const dans = (jours: number): string | null =>
    jours > 0 ? new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10) : null

  const identifiants: number[] = []
  for (const p of CATALOGUE) {
    const id = produits.creerProduit(
      {
        nomCommercial: p.nom,
        principeActif: p.dci,
        dosage: p.dosage,
        prixAchat: p.achat,
        prixVente: p.vente,
        stockMin: Math.max(4, Math.round(p.qte / 5)),
        emplacement: p.lieu,
        ordonnanceRequise: p.ord === true
      },
      admin
    )
    identifiants.push(id)
    if (p.qte > 0) {
      stock.entrerStock(
        { produitId: id, quantite: p.qte, prixAchat: p.achat, datePeremption: dans(p.jours) },
        admin
      )
    }
  }

  for (const client of [
    { nom: 'Aminata Hassane', telephone: '+235 66 11 22 33', plafondCredit: 50_000 },
    { nom: 'Mahamat Saleh', telephone: '+235 63 44 21 07', plafondCredit: 30_000 },
    { nom: 'Clinique du Sahel', telephone: '+235 22 51 30 44', plafondCredit: 200_000 }
  ]) {
    partenaires.enregistrerClient(null, client, admin)
  }

  caisse.ouvrirCaisse(50_000, admin)

  // Quelques ventes, pour que les écrans ne soient pas vides.
  const paniers = [
    [{ produitId: identifiants[0]!, quantite: 2 }],
    [{ produitId: identifiants[4]!, quantite: 1 }, { produitId: identifiants[5]!, quantite: 1 }],
    [{ produitId: identifiants[11]!, quantite: 3 }],
    [{ produitId: identifiants[0]!, quantite: 1 }, { produitId: identifiants[8]!, quantite: 2 }],
    [{ produitId: identifiants[6]!, quantite: 2 }],
    [{ produitId: identifiants[4]!, quantite: 4 }],
    [{ produitId: identifiants[11]!, quantite: 1 }, { produitId: identifiants[0]!, quantite: 2 }],
    [{ produitId: identifiants[9]!, quantite: 1 }]
  ]
  for (const lignes of paniers) {
    const controle = ventes.verifierVente({ lignes, paiements: [] }, DROITS)
    ventes.enregistrerVente(
      { lignes, paiements: [{ mode: 'especes', montant: controle.total }] },
      admin,
      DROITS
    )
  }

  // Une vente à crédit, pour que le compte client ait une histoire.
  const aCredit = [{ produitId: identifiants[3]!, quantite: 1 }]
  const controleCredit = ventes.verifierVente({ lignes: aCredit, paiements: [] }, DROITS)
  ventes.enregistrerVente(
    {
      lignes: aCredit,
      clientId: 1,
      paiements: [{ mode: 'especes', montant: Math.round(controleCredit.total / 3) }]
    },
    admin,
    DROITS
  )

  return { produits: identifiants }
}
