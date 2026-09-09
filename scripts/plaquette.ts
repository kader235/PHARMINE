/**
 * Produit la plaquette commerciale en PDF.
 *
 * POURQUOI UN SCRIPT PLUTÔT QU'UN DOCUMENT ÉCRIT À LA MAIN
 *
 * Les captures d'écran d'une plaquette vieillissent mal : le logiciel change,
 * le document reste. Ici les images sont prises au moment de produire le PDF,
 * sur le logiciel tel qu'il est ce jour-là. Une plaquette ne peut donc jamais
 * montrer un écran qui n'existe plus.
 *
 * TROIS PRÉCAUTIONS QUE PREND CE SCRIPT
 *
 *   — l'officine de démonstration est tchadienne. Une plaquette montrant
 *     « Abidjan » à un pharmacien de N'Djamena se disqualifie toute seule ;
 *   — le logiciel est ACTIVÉ avant les captures, sinon le bandeau
 *     « DÉMONSTRATION — 2 ventes encore possibles » s'affiche en bas de chaque
 *     image, et la plaquette vend un logiciel bridé ;
 *   — la barre du bas et les mentions d'écran sont conservées : ce que voit le
 *     prospect est ce qu'il aura, sans retouche.
 *
 * Sortie : Plaquette-PHARMINA.pdf, à la racine du dépôt.
 */
import { app, BrowserWindow } from 'electron'
import { createPrivateKey, sign } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fermerBase, ouvrirBase } from '../src/main/db'
import { chemins, enregistrerCanaux } from '../src/main/ipc'
import * as configuration from '../src/main/services/configuration'
import * as licence from '../src/main/services/licence'
import * as produits from '../src/main/services/produits'
import * as stock from '../src/main/services/stock'
import * as caisse from '../src/main/services/caisse'
import * as ventes from '../src/main/services/ventes'
import * as partenaires from '../src/main/services/partenaires'

const STANDARD = '275 000 FCFA'
const PREMIUM = '350 000 FCFA'
// Un mobile tchadien fait huit chiffres : on les groupe par deux, comme ils se
// dictent au telephone.
const TELEPHONES = ['+235 97 69 11 12', '69 18 67 66']
const COURRIEL = 'gtb235td@gmail.com'
const EDITEUR = 'GLOBALTECH BUSINESS TD'

// Les permissions sont verifiees par appartenance exacte : « * » n'est pas un
// joker. On nomme donc celles dont la mise en scene a besoin.
const DROITS = ['ventes.creer', 'ventes.credit', 'ventes.remise']

const dossierTravail = mkdtempSync(join(tmpdir(), 'pharmina-plaquette-'))
const cheminBase = join(dossierTravail, 'donnees', 'pharmina.db')
const sortie = join(process.cwd(), 'Plaquette-PHARMINA.pdf')
const CLE_PRIVEE = join(process.cwd(), 'licence-privee.pem')

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function base32(octets: Buffer): string {
  let tampon = 0
  let bits = 0
  let sortieTexte = ''
  for (const octet of octets) {
    tampon = (tampon << 8) | octet
    bits += 8
    while (bits >= 5) {
      sortieTexte += ALPHABET[(tampon >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) sortieTexte += ALPHABET[(tampon << (5 - bits)) & 31]
  return sortieTexte
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

/** Une licence perpétuelle pour le poste de démonstration. */
function licencePour(code: string): string {
  const empreinte = debase32(code.replace(/[\s-]/g, '')).subarray(0, 10)
  // Premium : le bilan mensuel lui est reserve, et c'est lui qu'on veut
  // montrer sur la page des formules.
  const entete = Buffer.from([1, 0, 0, 1])
  const message = Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, empreinte])
  const signature = sign(null, message, createPrivateKey(readFileSync(CLE_PRIVEE)))
  return base32(Buffer.concat([entete, signature]))
}

/** Une officine tchadienne crédible, en quelques minutes d'activité. */
function garnir(): void {
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
      nomComplet: 'Kader Caman',
      identifiant: 'kader',
      motDePasse: 'Officine2026'
    }
  })

  const admin = 1
  const catalogue = [
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

  const dans = (jours: number): string | null =>
    jours > 0 ? new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10) : null

  const identifiants: number[] = []
  for (const p of catalogue) {
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

  // Quelques ventes, pour que les ecrans ne soient pas vides.
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
    const total = controle.total
    ventes.enregistrerVente(
      { lignes, paiements: [{ mode: 'especes', montant: total }] },
      admin,
      DROITS
    )
  }

  // Une vente a credit, pour que le compte client ait une histoire.
  const clientId = 1
  const aCredit = [{ produitId: identifiants[3]!, quantite: 1 }]
  const controleCredit = ventes.verifierVente({ lignes: aCredit, paiements: [] }, DROITS)
  ventes.enregistrerVente(
    {
      lignes: aCredit,
      clientId,
      paiements: [{ mode: 'especes', montant: Math.round(controleCredit.total / 3) }]
    },
    admin,
    DROITS
  )
}

async function produire(): Promise<void> {
  if (!existsSync(CLE_PRIVEE)) {
    console.log('\n  La clé de licence est introuvable : le bandeau de démonstration')
    console.log('  resterait visible sur toutes les captures.\n')
    process.exit(1)
  }

  licence.definirDossierLicence(join(dossierTravail, 'donnees'))
  ouvrirBase(cheminBase)
  garnir()

  // ACTIVER avant les captures : sinon chaque image porte « DÉMONSTRATION »
  // en bas, et la plaquette vend un logiciel bridé.
  const etat = licence.etat(0)
  licence.activer(licencePour(etat.codeInstallation), 1)
  console.log(`  poste activé : ${etat.codeInstallation}`)

  chemins(cheminBase, join(dossierTravail, 'sauvegardes'))
  enregistrerCanaux()

  const fenetre = new BrowserWindow({
    width: 1500,
    height: 940,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  await fenetre.loadFile(join(__dirname, '../renderer/index.html'))
  await new Promise((r) => setTimeout(r, 1800))

  // Connexion.
  await fenetre.webContents.executeJavaScript(`
    (async () => {
      const poser = (selecteur, valeur) => {
        const champ = document.querySelector(selecteur)
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(champ, valeur)
        champ.dispatchEvent(new Event('input', { bubbles: true }))
      }
      poser('input[name=identifiant], input[autocomplete=username]', 'kader')
      poser('input[type=password]', 'Officine2026')
      await new Promise((r) => setTimeout(r, 200))
      document.querySelector('form button[type=submit], form .bouton.principal')?.click()
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 100))
        if (document.querySelector('.nav-lien')) return true
      }
      return false
    })()`)
  await new Promise((r) => setTimeout(r, 1200))

  const allerA = async (libelle: string): Promise<void> => {
    await fenetre.webContents.executeJavaScript(`
      (async () => {
        const lien = Array.from(document.querySelectorAll('.nav-lien'))
          .find((a) => a.textContent && a.textContent.trim().startsWith(${JSON.stringify(libelle)}))
        if (lien) lien.click()
        await new Promise((r) => setTimeout(r, 900))
        return true
      })()`)
    await new Promise((r) => setTimeout(r, 500))
  }

  const images: Record<string, string> = {}
  const photographier = async (nom: string): Promise<void> => {
    const image = await fenetre.webContents.capturePage()
    images[nom] = image.toPNG().toString('base64')
  }

  await allerA('Tableau de bord')
  await photographier('tableau')

  await allerA('Ventes')
  // Un panier en cours, pour que l'ecran raconte une vente.
  await fenetre.webContents.executeJavaScript(`
    (async () => {
      const champ = document.querySelector('.vente-recherche input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(champ, 'doli')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 900))
      document.querySelector('.produit-ligne')?.click()
      await new Promise((r) => setTimeout(r, 500))
      setter.call(champ, 'amox')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 900))
      document.querySelector('.produit-ligne')?.click()
      await new Promise((r) => setTimeout(r, 500))
      setter.call(champ, 'para')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 900))
      return true
    })()`)
  await photographier('comptoir')

  for (const [libelle, nom] of [
    ['Stock', 'stock'],
    ['Péremptions', 'peremptions'],
    ['Caisse', 'caisse'],
    ['Clients', 'clients'],
    ['Rapports', 'rapports'],
    ['Alertes', 'alertes']
  ] as const) {
    await allerA(libelle)
    await photographier(nom)
  }

  // Le bilan mensuel : un document, pas un ecran. On l'imprime dans la zone
  // masquee et on le photographie tel qu'il sortira de l'imprimante.
  await allerA('Rapports')
  await fenetre.webContents.executeJavaScript(`
    (async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))
      for (let essai = 0; essai < 60; essai++) {
        await new Promise((r) => setTimeout(r, 100))
        if (document.querySelector('#impression .bilan')) return true
      }
      return false
    })()`)
  await new Promise((r) => setTimeout(r, 800))

  const bilanPresent = await fenetre.webContents.executeJavaScript(
    `!!document.querySelector('#impression .bilan')`
  )
  if (bilanPresent) {
    // La zone d'impression est masquee a l'ecran par une regle display:none.
    // Un style en ligne qui ne redefinit pas `display` ne la revele donc pas —
    // c'est ce qui faisait photographier l'ecran des rapports a sa place.
    //
    // ATTENTION : aucun accent grave dans ce script injecte. Il terminerait le
    // litteral TypeScript qui l'entoure, et le code envoye serait tronque.
    const diagnostic = await fenetre.webContents.executeJavaScript(`
      (() => {
        // Un position:fixed ne suffit pas : si un ancetre porte transform,
        // filter ou contain, il devient le bloc englobant et la zone reste
        // derriere l'application. On masque donc le reste de l'ecran plutot
        // que de tenter de passer par-dessus.
        //
        // ATTENTION : aucun accent grave ici. Il terminerait le litteral
        // TypeScript qui entoure ce script, et le code envoye serait tronque.
        const zone = document.getElementById('impression')
        const racine = zone.parentElement
        for (const enfant of Array.from(racine.children)) {
          if (enfant !== zone) enfant.style.display = 'none'
        }
        racine.style.display = 'block'
        zone.style.cssText = 'display:block;background:#fff;color:#000;padding:10mm 12mm;'
        document.body.style.cssText = 'background:#fff;overflow:auto;'

        const doc = zone.querySelector('.bilan')
        const r = doc ? doc.getBoundingClientRect() : null
        return {
          display: getComputedStyle(zone).display,
          hautDoc: r ? Math.round(r.top) : -1,
          hauteurDoc: r ? Math.round(r.height) : 0,
          largeurDoc: r ? Math.round(r.width) : 0
        }
      })()`)
    console.log(`  zone d impression -> ${JSON.stringify(diagnostic)}`)

    await new Promise((r) => setTimeout(r, 600))
    await photographier('bilan')
    // Le bilan sert aussi de piece a relire : on le pose a cote des captures
    // du banc, pour l'examiner sans rouvrir le PDF.
    writeFileSync(
      join(process.cwd(), 'apercu', 'bilan-mensuel.png'),
      Buffer.from(images.bilan!, 'base64')
    )
    console.log('  bilan mensuel photographie')
  } else {
    console.log('  ATTENTION : le bilan mensuel n a pas pu etre photographie')
  }

  fenetre.destroy()

  // --- Le document ---------------------------------------------------------
  const fenetreDoc = new BrowserWindow({ width: 900, height: 1200, show: false })
  const html = documentHtml(images)
  // Le document vit a cote du PDF plutot qu'en dossier temporaire : c'est
  // aussi une piece a relire quand la mise en page surprend.
  const fichierHtml = join(process.cwd(), 'plaquette.html')
  writeFileSync(fichierHtml, html, 'utf8')
  console.log(`  document : ${Math.round(html.length / 1024)} Ko — ${fichierHtml}`)
  // `loadFile` bute sur les chemins Windows melant les deux barres obliques :
  // on lui donne une URL de fichier construite proprement.
  await fenetreDoc.loadURL(pathToFileURL(fichierHtml).href)
  await new Promise((r) => setTimeout(r, 1200))

  const pdf = await fenetreDoc.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  })

  writeFileSync(sortie, pdf)
  console.log(`  ${Object.keys(images).length} captures`)
  console.log(`  ${sortie} — ${Math.round(pdf.length / 1024)} Ko`)

  fenetreDoc.destroy()
  fermerBase()
  rmSync(dossierTravail, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
}

function documentHtml(images: Record<string, string>): string {
  const img = (nom: string): string =>
    images[nom] ? `<img src="data:image/png;base64,${images[nom]}" alt="">` : ''

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font: 10.5pt/1.5 "Segoe UI", system-ui, sans-serif;
    color: #1a2420;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 210mm; height: 297mm;
    padding: 16mm 15mm 14mm;
    display: flex; flex-direction: column;
    page-break-after: always;
    position: relative;
    background: #fff;
  }
  .page:last-child { page-break-after: auto; }

  .pied {
    position: absolute; bottom: 8mm; left: 15mm; right: 15mm;
    display: flex; justify-content: space-between;
    font-size: 7.5pt; color: #8b9a94;
    border-top: 0.3mm solid #e2e8e5; padding-top: 2mm;
  }

  h1 { font-size: 30pt; letter-spacing: -0.5pt; line-height: 1.05; }
  h2 {
    font-size: 15pt; color: #15654e; margin-bottom: 4mm;
    letter-spacing: -0.2pt;
  }
  h3 { font-size: 11pt; margin-bottom: 1.5mm; }
  p { margin-bottom: 3mm; }
  .accroche { font-size: 13pt; color: #3d514a; line-height: 1.45; }
  .discret { color: #6b7c75; }

  img {
    width: 100%; display: block;
    border: 0.3mm solid #dbe4e0; border-radius: 1.5mm;
    /* Une capture non bornee pousse le pied de page hors de la feuille. On
       montre le haut de l'ecran, qui porte l'essentiel. */
    max-height: 88mm;
    object-fit: cover;
    object-position: top left;
  }
  figure { margin-bottom: 4mm; }
  .page > figure:last-of-type { margin-bottom: 3mm; }
  figcaption { font-size: 8.5pt; color: #6b7c75; margin-top: 1.5mm; }

  .couverture {
    background: #15654e; color: #fff;
    justify-content: flex-start;
    gap: 8mm;
  }
  /* La capture de couverture garde ses proportions : la rogner pour remplir
     la page ne montrerait que le coin superieur gauche de l'ecran. */
  .couverture .illustration { margin: 0 -3mm; }
  .couverture .illustration img {
    max-height: none;
    object-fit: fill;
    border-color: #2d7a63;
  }
  .couverture h1 { color: #fff; }
  .couverture .accroche { color: #cfe4dc; }
  .couverture .pied { color: #8fc0b0; border-top-color: #2d7a63; }

  .marque { font-size: 9pt; letter-spacing: 3pt; color: #8fc0b0; margin-bottom: 4mm; }

  .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }

  .bloc {
    border-left: 1mm solid #15654e;
    padding-left: 4mm; margin-bottom: 5mm;
  }

  .formules { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin: 4mm 0 6mm; }
  .formule {
    border: 0.4mm solid #d5e0dc; border-radius: 2mm;
    padding: 6mm 5mm; display: flex; flex-direction: column;
  }
  /* La formule la plus complete se distingue par la couleur, pas par une
     etiquette « recommande » : le pharmacien choisit, on ne le pousse pas. */
  .formule.pleine { background: #15654e; border-color: #15654e; color: #fff; }
  .formule .nom {
    font-size: 9pt; letter-spacing: 2.5pt; text-transform: uppercase;
    color: #6b7c75; margin-bottom: 3mm;
  }
  .formule.pleine .nom { color: #8fc0b0; }
  .formule .montant { font-size: 21pt; font-weight: 700; letter-spacing: -0.6pt; line-height: 1; }
  .formule .tranche { font-size: 9.5pt; color: #6b7c75; margin-top: 1.5mm; margin-bottom: 4mm; }
  .formule.pleine .tranche { color: #cfe4dc; }
  .formule ul { font-size: 9.5pt; }
  .formule li { margin-bottom: 2mm; padding-left: 5mm; }
  .formule li::before { top: 1.9mm; width: 1.6mm; height: 1.6mm; }
  .formule.pleine li::before { background: #8fc0b0; }

  ul { list-style: none; }
  li { padding-left: 6mm; position: relative; margin-bottom: 2.5mm; }
  li::before {
    content: '';
    position: absolute; left: 0; top: 2.2mm;
    width: 2mm; height: 2mm; border-radius: 50%;
    background: #15654e;
  }

  .contact {
    border: 0.4mm solid #15654e; border-radius: 2mm;
    padding: 6mm; margin-top: auto;
  }
  .contact .ligne { display: flex; justify-content: space-between; margin-bottom: 2mm; }
  .contact .ligne:last-child { margin-bottom: 0; }
  .contact .telephones strong { font-variant-numeric: tabular-nums; }
</style></head><body>

<!-- Couverture -->
<section class="page couverture">
  <div>
    <div class="marque">${EDITEUR}</div>
    <h1>PHARMINA</h1>
    <p class="accroche" style="margin-top:5mm">
      Le logiciel qui tient votre pharmacie :<br>
      les ventes, le stock, la caisse et vos clients.
    </p>
  </div>

  <div class="illustration">${img('comptoir')}</div>

  <p class="accroche" style="font-size:11pt;margin-bottom:6mm">
    Conçu pour les officines du Tchad. Fonctionne sans Internet.
  </p>
  <div class="pied"><span>PHARMINA</span><span>${EDITEUR}</span></div>
</section>

<!-- Ce que vous y gagnez -->
<section class="page">
  <h2>Ce qu'une pharmacie perd sans le savoir</h2>
  <p class="accroche" style="margin-bottom:6mm">
    L'argent ne disparaît pas d'un coup. Il s'en va par petites fuites, tous les
    jours, et personne ne les voit.
  </p>

  <div class="bloc">
    <h3>Les boîtes qui périment sur l'étagère</h3>
    <p class="discret">Elles ont été payées. Elles seront jetées. Entre les deux,
    personne n'a regardé la date.</p>
  </div>

  <div class="bloc">
    <h3>La caisse qui ne tombe jamais juste</h3>
    <p class="discret">Quelques milliers de francs chaque soir. À la fin du mois,
    la somme est réelle — mais elle n'a plus d'explication.</p>
  </div>

  <div class="bloc">
    <h3>Les clients qui doivent, et qu'on oublie</h3>
    <p class="discret">Le carnet se perd, la page se déchire, et la dette avec.</p>
  </div>

  <p style="margin-top:5mm">
    PHARMINA ne supprime pas ces pertes. <strong>Il les rend visibles.</strong>
    Ce qui se voit se corrige.
  </p>

  <figure style="margin-top:auto">
    ${img('tableau')}
    <figcaption>Chaque matin, l'essentiel en un écran : ce qui manque, ce qui périme, ce qui a été vendu.</figcaption>
  </figure>

  <div class="pied"><span>PHARMINA</span><span>${EDITEUR}</span></div>
</section>

<!-- Au comptoir -->
<section class="page">
  <h2>Au comptoir, servir vite</h2>
  <p style="margin-bottom:5mm">
    Vous scannez la boîte, le prix s'affiche, vous encaissez, le ticket sort.
    Tout se fait au clavier : vos mains ne quittent pas le comptoir.
  </p>

  <figure>
    ${img('comptoir')}
    <figcaption>Le logiciel vous dit où trouver la boîte, quand elle périme, et par quoi la remplacer si elle manque.</figcaption>
  </figure>

  <div class="duo" style="margin-top:2mm">
    <div>
      <h3>Il vous prévient avant l'erreur</h3>
      <p class="discret">Un produit sous ordonnance, un lot bientôt périmé, un
      stock insuffisant : l'avertissement s'affiche avant la vente, pas après.</p>
    </div>
    <div>
      <h3>Il sert toujours le plus ancien</h3>
      <p class="discret">Quand plusieurs lots existent, c'est celui qui périme le
      premier qui part. Vous n'avez rien à surveiller.</p>
    </div>
  </div>

  <div class="duo" style="margin-top:3mm">
    <div>
      <h3>Une boîte sans code-barres ?</h3>
      <p class="discret">Le logiciel en fabrique un et l'imprime. Dix étiquettes
      par feuille, à découper et à coller.</p>
    </div>
    <div>
      <h3>Vendre à crédit</h3>
      <p class="discret">Vous choisissez le client, il paie ce qu'il peut, le
      reste devient sa dette. Son relevé s'imprime quand il vient payer.</p>
    </div>
  </div>

  <div class="pied"><span>PHARMINA</span><span>${EDITEUR}</span></div>
</section>

<!-- Stock et péremptions -->
<section class="page">
  <h2>Savoir ce que vous avez</h2>
  <p style="margin-bottom:4mm">
    Chaque entrée, chaque sortie est enregistrée avec son motif. Vous savez ce
    qui reste, où il se trouve, et ce qu'il vaut.
  </p>

  <figure>
    ${img('stock')}
    <figcaption>Le stock, produit par produit, avec ce qui est en rupture et ce qui passe sous le seuil.</figcaption>
  </figure>

  <figure>
    ${img('peremptions')}
    <figcaption>Les lots classés par date : vous écoulez ce qui approche avant qu'il ne soit trop tard.</figcaption>
  </figure>

  <div class="duo">
    <div>
      <h3>L'inventaire par rayon</h3>
      <p class="discret">Un quart d'heure, sans fermer l'officine. Vous comptez,
      vous saisissez, les écarts sont gardés en mémoire.</p>
    </div>
    <div>
      <h3>La liste de ce qu'il faut commander</h3>
      <p class="discret">Le logiciel la prépare d'après vos ventes. Vous
      l'ajustez et vous appelez le grossiste.</p>
    </div>
  </div>

  <div class="pied"><span>PHARMINA</span><span>${EDITEUR}</span></div>
</section>

<!-- L'argent -->
<section class="page">
  <h2>Savoir où va l'argent</h2>

  <figure>
    ${img('caisse')}
    <figcaption>La caisse s'ouvre le matin, se clôture le soir. L'écart est calculé, et vous l'expliquez pendant que vous vous en souvenez.</figcaption>
  </figure>

  <figure>
    ${img('clients')}
    <figcaption>Chaque client, ce qu'il doit, ce qu'il a payé. Le relevé s'imprime et se remet en main propre.</figcaption>
  </figure>

  <div class="trio">
    <div>
      <h3>Vos chiffres</h3>
      <p class="discret">Ventes du jour, du mois, marges, produits qui dorment.</p>
    </div>
    <div>
      <h3>Qui a fait quoi</h3>
      <p class="discret">Chaque vente, chaque annulation porte le nom de son auteur.</p>
    </div>
    <div>
      <h3>Vos données protégées</h3>
      <p class="discret">Une sauvegarde à chaque fermeture. Trente conservées.</p>
    </div>
  </div>

  <div class="pied"><span>PHARMINA</span><span>${EDITEUR}</span></div>
</section>

<!-- Le prix -->
<section class="page">
  <h2>Deux formules</h2>
  <p style="margin-bottom:1mm">
    Le logiciel est le même dans les deux cas. Ce qui change, c'est
    l'accompagnement.
  </p>

  <div class="formules">
    <div class="formule">
      <div class="nom">Standard</div>
      <div class="montant">${STANDARD}</div>
      <div class="tranche">payable en une tranche</div>
      <ul>
        <li>Le logiciel complet, sans limite de durée ni d'utilisation.</li>
        <li>L'installation sur votre ordinateur et la reprise de vos produits.</li>
        <li>La formation de votre équipe.</li>
        <li>Le guide d'utilisation imprimé.</li>
        <li>L'assistance pendant la mise en route.</li>
      </ul>
    </div>

    <div class="formule pleine">
      <div class="nom">Premium</div>
      <div class="montant">${PREMIUM}</div>
      <div class="tranche">payable en une tranche</div>
      <ul>
        <li>Tout ce que comprend la formule Standard.</li>
        <li><strong>Le bilan du mois</strong> : une feuille qui dit ce que vous avez gagné, comparé au mois d'avant.</li>
        <li>L'export de vos chiffres vers un tableur, pour votre comptable.</li>
        <li>Les nouvelles versions, qui s'installent depuis le logiciel lui-même.</li>
        <li>L'assistance par téléphone quand vous en avez besoin.</li>
      </ul>
    </div>
  </div>

  <div class="duo" style="margin-bottom:5mm">
    <div>
      <h3>Sans Internet</h3>
      <p class="discret">Le logiciel travaille sur votre ordinateur. Une coupure
      de réseau n'arrête pas votre comptoir.</p>
    </div>
    <div>
      <h3>Vos données restent chez vous</h3>
      <p class="discret">Rien n'est envoyé nulle part. Elles sont protégées et ne
      s'ouvrent que sur votre poste.</p>
    </div>
  </div>

  <figure>
    ${img('bilan')}
    <figcaption>Le bilan du mois, compris dans la formule Premium : une feuille à imprimer, à lire assis, à montrer à son banquier.</figcaption>
  </figure>

  <div class="contact">
    <div class="ligne"><strong>${EDITEUR}</strong><span class="discret">N'Djaména, Tchad</span></div>
    <div class="ligne telephones">
      <span class="discret">Téléphone</span>
      <strong>${TELEPHONES.join(' &nbsp;·&nbsp; ')}</strong>
    </div>
    <div class="ligne"><span class="discret">Courriel</span><strong>${COURRIEL}</strong></div>
  </div>

  <div class="pied"><span>PHARMINA</span><span>${EDITEUR}</span></div>
</section>

</body></html>`
}

// Detruire la fenetre des captures declenche `window-all-closed`, dont le
// comportement par defaut est de fermer l'application. La fenetre du document
// se chargeait alors pendant l'extinction, et echouait sans raison apparente.
app.on('window-all-closed', () => {
  /* on decide nous-memes quand rendre la main, a la fin de `produire` */
})

app.whenReady().then(() =>
  produire().catch((erreur) => {
    console.error('ÉCHEC :', (erreur as Error).message)
    process.exit(1)
  })
)
