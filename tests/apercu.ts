/**
 * Banc d'aperçu : démarre l'application réelle, la pilote et photographie
 * chaque écran.
 *
 * Sert à vérifier de visu ce qu'un utilisateur voit, pas seulement ce que le
 * compilateur accepte. La base est temporaire et alimentée par les services
 * du logiciel — les données de démonstration vivent ici, jamais dans le produit.
 */
import { app, BrowserWindow } from 'electron'
import { mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fermerBase, ouvrirBase } from '../src/main/db'
import { chemins, enregistrerCanaux } from '../src/main/ipc'
import * as configuration from '../src/main/services/configuration'
import * as produits from '../src/main/services/produits'
import * as partenaires from '../src/main/services/partenaires'
import * as achats from '../src/main/services/achats'
import * as caisse from '../src/main/services/caisse'
import * as ventes from '../src/main/services/ventes'
import * as finances from '../src/main/services/finances'
import * as auth from '../src/main/services/auth'
import * as alertes from '../src/main/services/alertes'
import { aujourdhui, decalerJours } from '../src/main/services/commun'

const dossierTravail = mkdtempSync(join(tmpdir(), 'pharmina-apercu-'))
const cheminBase = join(dossierTravail, 'donnees', 'pharmina.db')
const sortie = process.env.PHARMINA_APERCU_SORTIE ?? join(process.cwd(), 'apercu')

let etapes = 0

async function photographier(fenetre: BrowserWindow, nom: string, attente = 700): Promise<void> {
  await new Promise((r) => setTimeout(r, attente))
  const image = await fenetre.webContents.capturePage()
  const fichier = join(sortie, `${String(++etapes).padStart(2, '0')}-${nom}.png`)
  writeFileSync(fichier, image.toPNG())
  console.log(`  capture : ${fichier}`)
}

/**
 * Photographie la page telle qu'elle sortira de l'imprimante : on force le
 * média « print » le temps de la capture, ce qui applique réellement les
 * règles @media print.
 */
async function photographierEnImpression(fenetre: BrowserWindow, nom: string): Promise<void> {
  const debogueur = fenetre.webContents.debugger
  try {
    debogueur.attach('1.3')
    await debogueur.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
    await photographier(fenetre, nom, 500)
    await debogueur.sendCommand('Emulation.setEmulatedMedia', { media: '' })
  } finally {
    try {
      debogueur.detach()
    } catch {
      /* déjà détaché */
    }
  }
}

/** Renseigne un champ React : le setter natif déclenche bien onChange. */
const SAISIR = `
  (selecteur, valeur) => {
    const champ = document.querySelector(selecteur)
    if (!champ) return false
    const setter = Object.getOwnPropertyDescriptor(
      champ instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    ).set
    setter.call(champ, valeur)
    champ.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }
`

function preparerDonnees(): void {
  configuration.configurerPharmacie({
    pharmacie: {
      nom: 'Pharmacie du Plateau',
      ville: 'Abidjan',
      pays: "Côte d'Ivoire",
      telephone: '+225 27 20 30 40 50',
      devise: 'XOF',
      deviseSymbole: 'FCFA',
      deviseDecimales: 0
    },
    administrateur: { nomComplet: 'Marie Dupont', identifiant: 'marie', motDePasse: 'Officine2026' }
  })

  const admin = 1
  auth.creerUtilisateur(
    { nomComplet: 'Jean Kouassi', identifiant: 'jean', motDePasse: 'Comptoir2026', roleId: 3 },
    admin
  )

  // nom, generique, dosage, categorie, forme, achat, vente, seuil, emplacement, ordonnance
  const catalogue: [string, string | null, string, number, number, number, number, number, string, boolean][] = [
    ['Doliprane', 'Paracétamol', '500 mg', 1, 1, 900, 1500, 20, 'Rayon A-12', false],
    ['Efferalgan', 'Paracétamol', '1 g', 1, 1, 1300, 2200, 15, 'Rayon A-12', false],
    ['Amoxicilline', 'Amoxicilline', '500 mg', 1, 2, 3100, 4800, 10, 'Rayon A-14', true],
    ['Augmentin', 'Amoxicilline + ac. clavulanique', '1 g', 1, 12, 5200, 8400, 8, 'Rayon A-14', true],
    ['Ibuprofène', 'Ibuprofène', '400 mg', 1, 1, 1050, 1800, 20, 'Rayon A-15', false],
    ['Vitamine C', 'Acide ascorbique', '1000 mg', 2, 1, 2100, 3200, 12, 'Rayon B-03', false],
    ['Gel hydroalcoolique', null, '250 ml', 3, 9, 1150, 2000, 10, 'Rayon C-02', false],
    ['Sérum physiologique', null, '5 ml x20', 3, 11, 1400, 2400, 12, 'Rayon C-04', false],
    ['Tensiomètre digital', null, 'bras', 4, 17, 13000, 18500, 3, 'Matériel 01', false],
    ['Thermomètre frontal', null, 'infrarouge', 4, 17, 6800, 11000, 4, 'Matériel 02', false],
    ['Pansements adhésifs', null, 'boîte de 40', 3, 17, 900, 1600, 15, 'Rayon C-06', false],
    ['Lait infantile 1er âge', null, '400 g', 5, 12, 4600, 6900, 6, 'Rayon D-01', false]
  ]

  const ids = catalogue.map(([nom, generique, dosage, categorie, forme, achat, vente, min, emplacement, ordonnance], index) =>
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
        stockMin: min,
        emplacement,
        ordonnanceRequise: ordonnance,
        // Un EAN-13 par produit : le banc peut ainsi simuler une douchette.
        codesBarres: [`340093000${String(index + 1).padStart(4, '0')}`]
      },
      admin
    )
  )

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
    { nom: 'Pharma Distribution CI', telephone: '+225 05 44 22 18 90', ville: 'Abidjan', conditionsPaiement: 'Comptant' },
    admin
  )

  // Réception principale : quantités et péremptions volontairement variées.
  achats.enregistrerReception(
    {
      fournisseurId: labo,
      lignes: [
        { produitId: ids[0]!, quantite: 80, prixAchat: 900, numeroLot: 'DOL-2611', datePeremption: decalerJours(aujourdhui(), 420) },
        { produitId: ids[0]!, quantite: 24, prixAchat: 880, numeroLot: 'DOL-2554', datePeremption: decalerJours(aujourdhui(), 52) },
        { produitId: ids[1]!, quantite: 40, prixAchat: 1300, numeroLot: 'EFF-1180', datePeremption: decalerJours(aujourdhui(), 380) },
        { produitId: ids[2]!, quantite: 30, prixAchat: 3100, numeroLot: 'AMX-0442', datePeremption: decalerJours(aujourdhui(), 310) },
        { produitId: ids[3]!, quantite: 12, prixAchat: 5200, numeroLot: 'AUG-0771', datePeremption: decalerJours(aujourdhui(), 26) },
        { produitId: ids[4]!, quantite: 55, prixAchat: 1050, numeroLot: 'IBU-3320', datePeremption: decalerJours(aujourdhui(), 500) }
      ],
      montantPaye: 100_000,
      modePaiement: 'virement'
    },
    admin
  )

  achats.enregistrerReception(
    {
      fournisseurId: distrib,
      lignes: [
        { produitId: ids[5]!, quantite: 45, prixAchat: 2100, numeroLot: 'VTC-9021', datePeremption: decalerJours(aujourdhui(), 600) },
        { produitId: ids[6]!, quantite: 36, prixAchat: 1150, numeroLot: 'GEL-4410', datePeremption: decalerJours(aujourdhui(), 700) },
        { produitId: ids[7]!, quantite: 28, prixAchat: 1400, numeroLot: 'SER-2210', datePeremption: decalerJours(aujourdhui(), 450) },
        { produitId: ids[8]!, quantite: 6, prixAchat: 13_000, numeroLot: null, datePeremption: null },
        { produitId: ids[9]!, quantite: 9, prixAchat: 6800, numeroLot: null, datePeremption: null },
        { produitId: ids[10]!, quantite: 40, prixAchat: 900, numeroLot: 'PAN-1002', datePeremption: decalerJours(aujourdhui(), 800) },
        // Volontairement sous le seuil : alimente l'alerte de stock faible.
        { produitId: ids[11]!, quantite: 4, prixAchat: 4600, numeroLot: 'LAI-0330', datePeremption: decalerJours(aujourdhui(), 240) }
      ],
      montantPaye: 0
    },
    admin
  )

  const clients = [
    partenaires.enregistrerClient(null, { nom: 'Aminata Traoré', telephone: '+225 07 11 22 33 44', plafondCredit: 50_000 }, admin),
    partenaires.enregistrerClient(null, { nom: 'Kouadio N’Guessan', telephone: '+225 05 66 77 88 99', plafondCredit: 30_000 }, admin),
    partenaires.enregistrerClient(null, { nom: 'Fatou Diallo', telephone: '+225 01 23 45 67 89' }, admin)
  ]

  caisse.ouvrirCaisse(50_000, admin)

  const permissions = auth.permissionsDe(admin)
  const paniers: { lignes: { produitId: number; quantite: number }[]; recu: number; clientId?: number }[] = [
    { lignes: [{ produitId: ids[0]!, quantite: 2 }, { produitId: ids[6]!, quantite: 1 }], recu: 5000 },
    { lignes: [{ produitId: ids[2]!, quantite: 1 }], recu: 5000, clientId: clients[0] },
    { lignes: [{ produitId: ids[4]!, quantite: 3 }, { produitId: ids[5]!, quantite: 2 }], recu: 12_000 },
    { lignes: [{ produitId: ids[9]!, quantite: 1 }], recu: 11_000 },
    { lignes: [{ produitId: ids[1]!, quantite: 2 }, { produitId: ids[10]!, quantite: 2 }], recu: 8000 },
    { lignes: [{ produitId: ids[3]!, quantite: 1 }], recu: 5000, clientId: clients[1] },
    { lignes: [{ produitId: ids[7]!, quantite: 2 }], recu: 4800 },
    { lignes: [{ produitId: ids[0]!, quantite: 4 }], recu: 6000 }
  ]

  for (const panier of paniers) {
    ventes.enregistrerVente(
      {
        clientId: panier.clientId ?? null,
        lignes: panier.lignes,
        paiements: [{ mode: 'especes', montant: panier.recu }]
      },
      admin,
      permissions
    )
  }

  finances.enregistrerDepense(
    { date: aujourdhui(), categorieId: 5, libelle: 'Transport livraison SantéPlus', montant: 15_000 },
    admin
  )
  finances.enregistrerDepense(
    { date: aujourdhui(), categorieId: 3, libelle: 'Facture d’électricité — août', montant: 42_000, mode: 'virement' },
    admin
  )

  alertes.rafraichirAlertes()
}

// Sans ce filet, une erreur laisse la fenêtre ouverte et le processus vivant.
function abandonner(erreur: unknown): never {
  console.error('ECHEC DU BANC :', erreur)
  try {
    fermerBase()
  } catch {
    /* la base n'est peut-être pas ouverte */
  }
  rmSync(dossierTravail, { recursive: true, force: true })
  app.exit(1)
  throw erreur
}

process.on('unhandledRejection', abandonner)
process.on('uncaughtException', abandonner)

app.whenReady().then(async () => {
  // On vide le dossier sans le supprimer : sous Windows, recréer un répertoire
  // juste après sa suppression échoue tant que le système ne l'a pas libéré.
  mkdirSync(sortie, { recursive: true })
  for (const f of readdirSync(sortie)) {
    if (f.endsWith('.png')) unlinkSync(join(sortie, f))
  }

  ouvrirBase(cheminBase)
  chemins(cheminBase, join(dossierTravail, 'sauvegardes'))
  enregistrerCanaux()

  console.log('\nPreparation du jeu de demonstration...')
  preparerDonnees()
  console.log('Donnees pretes.\n')

  const fenetre = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    backgroundColor: '#eef2f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const erreurs: string[] = []
  fenetre.webContents.on('console-message', (_e, niveau, message) => {
    if (niveau >= 2) erreurs.push(message)
  })

  await fenetre.loadFile(join(__dirname, '../renderer/index.html'))
  fenetre.show()

  console.log('Captures :')
  await photographier(fenetre, 'connexion', 1200)

  await fenetre.webContents.executeJavaScript(`(${SAISIR})('input[autocomplete=username]', 'marie')`)
  await fenetre.webContents.executeJavaScript(
    `(${SAISIR})('input[autocomplete=current-password]', 'Officine2026')`
  )
  await photographier(fenetre, 'connexion-remplie', 300)

  await fenetre.webContents.executeJavaScript(`document.querySelector('button[type=submit]').click()`)
  await photographier(fenetre, 'tableau-de-bord', 1600)

  // Diagnostic de mise en page, une fois l'application réellement affichée.
  const diagnostic = (await fenetre.webContents.executeJavaScript(`
    (() => Array.from(document.querySelectorAll('.bouton')).map((b) => {
      const s = getComputedStyle(b)
      const r = b.getBoundingClientRect()
      return {
        texte: b.textContent.trim().slice(0, 26),
        display: s.display,
        direction: s.flexDirection,
        hauteurCss: s.height,
        hauteurReelle: Math.round(r.height),
        largeur: Math.round(r.width),
        deborde: b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1
      }
    }))()
  `)) as Record<string, unknown>[]

  // Contrôle de la coque : deux collisions de classes CSS ont déjà déformé
  // cette mise en page (« principal », puis « barre »). On mesure désormais
  // les éléments de structure plutôt que de s'en remettre à l'œil.
  const coque = (await fenetre.webContents.executeJavaScript(`
    (() => {
      const mesure = (selecteur) => {
        const e = document.querySelector(selecteur)
        if (!e) return null
        const r = e.getBoundingClientRect()
        const s = getComputedStyle(e)
        return { hauteur: Math.round(r.height), largeur: Math.round(r.width), direction: s.flexDirection }
      }
      return {
        fenetre: { largeur: window.innerWidth, hauteur: window.innerHeight },
        nav: mesure('.nav'),
        barre: mesure('.barre'),
        fonctions: mesure('.barre-fonctions'),
        etat: mesure('.barre-etat')
      }
    })()
  `)) as Record<string, { hauteur: number; largeur: number; direction: string } | null> & {
    fenetre: { largeur: number; hauteur: number }
  }

  const anomalies: string[] = []
  if (!coque.barre || coque.barre.hauteur > 72) {
    anomalies.push(`barre superieure anormale : ${coque.barre?.hauteur ?? 'absente'} px`)
  }
  if (coque.barre && coque.barre.direction !== 'row') {
    anomalies.push(`barre superieure en ${coque.barre.direction}`)
  }
  if (!coque.nav || coque.nav.hauteur < coque.fenetre.hauteur * 0.8) {
    anomalies.push('la barre laterale ne remplit pas la hauteur')
  }
  if (!coque.fonctions || coque.fonctions.hauteur > 44) {
    anomalies.push(`barre de fonctions anormale : ${coque.fonctions?.hauteur ?? 'absente'} px`)
  }
  if (!coque.etat || coque.etat.hauteur > 36) {
    anomalies.push(`barre d etat anormale : ${coque.etat?.hauteur ?? 'absente'} px`)
  }

  console.log('')
  console.log('  Structure de la coque :')
  console.log('    ' + JSON.stringify(coque))
  console.log(
    anomalies.length ? '    -> ANOMALIES : ' + anomalies.join(' ; ') : '    -> structure conforme'
  )
  if (anomalies.length) erreurs.push('Mise en page : ' + anomalies.join(' ; '))

  console.log('')
  console.log('  Diagnostic des boutons :')
  for (const b of diagnostic) console.log('    ' + JSON.stringify(b))
  const anormaux = diagnostic.filter((b) => b.deborde || (b.hauteurReelle as number) > 34)
  console.log(`    -> ${anormaux.length} bouton(s) anormaux`)

  // --- Apparences ------------------------------------------------------------
  // Les cinq themes sur le tableau de bord, puis les deux autres dispositions :
  // c'est l'ecran ou une palette et une densite se jugent le mieux.
  await fenetre.webContents.executeJavaScript(`document.querySelectorAll('.nav-lien')[0].click()`)
  await new Promise((r) => setTimeout(r, 900))

  const apparence = (theme: string, disposition: string) =>
    `(() => {
      const r = document.documentElement
      const t = ${JSON.stringify(theme)}
      const d = ${JSON.stringify(disposition)}
      t === 'clair' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', t)
      d === 'confort' ? r.removeAttribute('data-disposition') : r.setAttribute('data-disposition', d)
      return true
    })()`

  // Mesure a chaque capture : une apparence qui ne s'applique pas se verrait
  // sinon seulement a l'oeil, sur une image.
  const etatVisuel = `
    (() => {
      const nav = document.querySelector('.nav')
      const r = document.documentElement
      return {
        theme: r.getAttribute('data-theme') || 'clair',
        disposition: r.getAttribute('data-disposition') || 'confort',
        navFond: getComputedStyle(nav).backgroundColor,
        navLargeur: Math.round(nav.getBoundingClientRect().width)
      }
    })()`

  for (const theme of ['clair', 'ocean', 'cobalt', 'ardoise', 'brique']) {
    await fenetre.webContents.executeJavaScript(apparence(theme, 'confort'))
    await new Promise((r) => setTimeout(r, 350))
    console.log('    ' + JSON.stringify(await fenetre.webContents.executeJavaScript(etatVisuel)))
    await photographier(fenetre, `theme-${theme}`, 400)
  }

  for (const disposition of ['compacte', 'tactile']) {
    await fenetre.webContents.executeJavaScript(apparence('ocean', disposition))
    await new Promise((r) => setTimeout(r, 350))
    console.log('    ' + JSON.stringify(await fenetre.webContents.executeJavaScript(etatVisuel)))
    await photographier(fenetre, `disposition-${disposition}`, 400)
  }

  // Aucune disposition ne doit enfermer l'utilisateur : le bouton du compte
  // ouvre le selecteur d'apparence, il doit rester atteignable partout. Le
  // masquer en tactile rendait le retour a la navigation laterale impossible.
  for (const disposition of ['confort', 'compacte', 'tactile']) {
    await fenetre.webContents.executeJavaScript(apparence('clair', disposition))
    await new Promise((r) => setTimeout(r, 350))
    const atteignable = await fenetre.webContents.executeJavaScript(`
      (() => {
        const b = document.querySelector('.barre-utilisateur')
        if (!b) return false
        const r = b.getBoundingClientRect()
        const s = getComputedStyle(b)
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
      })()`)
    console.log(`  compte atteignable en ${disposition} : ${atteignable ? 'oui' : 'NON'}`)
    if (!atteignable) erreurs.push(`Compte inatteignable en disposition ${disposition}`)
  }

  await fenetre.webContents.executeJavaScript(apparence('clair', 'confort'))
  await new Promise((r) => setTimeout(r, 400))

  // Parcours de tous les modules de la barre latérale.
  const modules = (await fenetre.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.nav-lien')).map(b => b.textContent.trim())`
  )) as string[]

  for (let i = 1; i < modules.length; i++) {
    await fenetre.webContents.executeJavaScript(
      `document.querySelectorAll('.nav-lien')[${i}].click()`
    )
    const nom = modules[i]!
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .replace(/\d+$/, '')
    await photographier(fenetre, nom || `module-${i}`, 1000)
  }

  // Retour au comptoir, avec un panier réel.
  await fenetre.webContents.executeJavaScript(`document.querySelectorAll('.nav-lien')[1].click()`)
  await new Promise((r) => setTimeout(r, 800))
  await fenetre.webContents.executeJavaScript(
    `(${SAISIR})('.vente-recherche input', 'doli')`
  )
  await new Promise((r) => setTimeout(r, 900))
  await fenetre.webContents.executeJavaScript(
    `document.querySelector('.produit-ligne:not([disabled])')?.click()`
  )
  await new Promise((r) => setTimeout(r, 400))
  await fenetre.webContents.executeJavaScript(`(${SAISIR})('.vente-recherche input', 'amox')`)
  await new Promise((r) => setTimeout(r, 900))
  await fenetre.webContents.executeJavaScript(
    `document.querySelector('.produit-ligne:not([disabled])')?.click()`
  )
  await photographier(fenetre, 'comptoir-panier', 900)

  // --- Vente complète, jusqu'au ticket imprimé -------------------------------
  // window.print ouvrirait une boîte de dialogue bloquante : on la neutralise,
  // puis on demande à Electron de produire le PDF avec les mêmes règles
  // @media print. C'est donc le document réellement sorti de l'imprimante
  // que l'on vérifie, pas une approximation.
  await fenetre.webContents.executeJavaScript('window.print = () => {}; true')

  const clic = (contient: string) => `
    (() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((e) => e.textContent && e.textContent.includes(${JSON.stringify(contient)}))
      if (b) { b.click(); return true }
      return false
    })()`

  await fenetre.webContents.executeJavaScript(clic('+5 000'))
  await photographier(fenetre, 'comptoir-reglement', 500)

  await fenetre.webContents.executeJavaScript(clic('Encaisser'))
  await photographier(fenetre, 'vente-encaissee', 1800)

  const imprime = await fenetre.webContents.executeJavaScript(clic('Imprimer'))
  await new Promise((r) => setTimeout(r, 900))

  if (imprime) {
    // Le PDF sert d'archive ; la capture en média « print » sert au contrôle
    // visuel, car elle montre exactement ce que la feuille de style
    // d'impression produit.
    const ticket = await fenetre.webContents.printToPDF({ pageSize: 'A4', printBackground: false })
    writeFileSync(join(sortie, 'ticket-de-caisse.pdf'), ticket)
    console.log(`  document : ticket-de-caisse.pdf (${ticket.length} octets)`)

    await photographierEnImpression(fenetre, 'ticket-imprime')
  } else {
    console.log('  ATTENTION : bouton d impression introuvable, ticket non verifie')
  }

  // Le recapitulatif doit etre referme : le lecteur de codes-barres est
  // volontairement inactif tant qu'une fenetre modale est ouverte.
  await fenetre.webContents.executeJavaScript(clic('Vente suivante'))
  await new Promise((r) => setTimeout(r, 600))

  // --- Lecteur de codes-barres ----------------------------------------------
  // Une douchette se comporte en clavier : elle emet les touches en rafale puis
  // un Entree. On reproduit exactement cela, sans toucher au champ de saisie.
  await fenetre.webContents.executeJavaScript(`document.querySelectorAll('.nav-lien')[1].click()`)
  await new Promise((r) => setTimeout(r, 900))

  const resultatScan = await fenetre.webContents.executeJavaScript(`
    (async () => {
      const code = '3400930000001'
      const touche = (c) => {
        const evenement = new KeyboardEvent('keydown', {
          key: c,
          code: c >= '0' && c <= '9' ? 'Digit' + c : 'Enter',
          bubbles: true,
          cancelable: true
        })
        document.body.dispatchEvent(evenement)
      }
      for (const c of code) touche(c)
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
      )
      await new Promise((r) => setTimeout(r, 800))
      const lignes = document.querySelectorAll('.panier-ligne')
      return {
        articles: lignes.length,
        premier: lignes[0] ? lignes[0].textContent.slice(0, 40) : null
      }
    })()`)

  console.log(`  scan simule -> ${JSON.stringify(resultatScan)}`)
  await photographier(fenetre, 'comptoir-apres-scan', 400)

  // --- Les trois formats de document ----------------------------------------
  await fenetre.webContents.executeJavaScript(`document.querySelectorAll('.nav-lien')[1].click()`)
  await new Promise((r) => setTimeout(r, 700))
  await fenetre.webContents.executeJavaScript(`
    (() => {
      const b = Array.from(document.querySelectorAll('.segments button'))
        .find((e) => e.textContent && e.textContent.trim() === 'Historique')
      if (b) b.click()
      return !!b
    })()`)
  await new Promise((r) => setTimeout(r, 900))
  await fenetre.webContents.executeJavaScript(`
    (() => {
      const ligne = document.querySelector('table.tableau tbody tr')
      if (ligne) ligne.click()
      return !!ligne
    })()`)
  await new Promise((r) => setTimeout(r, 900))

  for (const [format, nom] of [
    ['a4', 'facture-a4'],
    ['a5', 'facture-a5']
  ] as const) {
    const change = await fenetre.webContents.executeJavaScript(`
      (() => {
        const s = document.querySelector('.modale select[aria-label="Format de réimpression"]')
        if (!s) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        setter.call(s, ${JSON.stringify(format)})
        s.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`)
    if (!change) {
      console.log(`  ATTENTION : selecteur de format introuvable pour ${nom}`)
      continue
    }
    await new Promise((r) => setTimeout(r, 400))
    await fenetre.webContents.executeJavaScript(clic('Réimprimer'))
    await new Promise((r) => setTimeout(r, 800))
    await photographierEnImpression(fenetre, nom)
  }

  await fenetre.webContents.executeJavaScript(clic('Fermer'))
  await new Promise((r) => setTimeout(r, 500))

  // --- Compte client : releve imprime ---------------------------------------
  const indexClients = (await fenetre.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.nav-lien'))
      .findIndex((b) => b.textContent && b.textContent.includes('Clients'))
  `)) as number

  if (indexClients >= 0) {
    await fenetre.webContents.executeJavaScript(
      `document.querySelectorAll('.nav-lien')[${indexClients}].click()`
    )
    await photographier(fenetre, 'clients', 1100)

    // On filtre sur les debiteurs : un releve vide ne prouve rien.
    await fenetre.webContents.executeJavaScript(`
      (() => {
        const b = Array.from(document.querySelectorAll('.segments button'))
          .find((e) => e.textContent && e.textContent.startsWith('Débiteurs'))
        if (b) b.click()
        return !!b
      })()`)
    await new Promise((r) => setTimeout(r, 700))

    const ouvert = await fenetre.webContents.executeJavaScript(`
      (() => {
        const ligne = document.querySelector('table.tableau tbody tr')
        if (!ligne) return false
        ligne.click()
        return true
      })()`)

    if (ouvert) {
      await photographier(fenetre, 'compte-client', 1200)

      await fenetre.webContents.executeJavaScript(`
        (() => {
          const b = Array.from(document.querySelectorAll('button'))
            .find((e) => e.textContent && e.textContent.trim() === 'Relevé')
          if (b) { b.click(); return true }
          return false
        })()`)
      await photographier(fenetre, 'releve-de-compte', 900)

      const imprimeReleve = await fenetre.webContents.executeJavaScript(clic('Imprimer le'))
      await new Promise((r) => setTimeout(r, 900))
      if (imprimeReleve) {
        await photographierEnImpression(fenetre, 'releve-imprime')
      } else {
        console.log('  ATTENTION : bouton du releve introuvable')
      }
    }
  }

  console.log(`\n${etapes} capture(s) dans ${sortie}`)
  if (erreurs.length) {
    console.log(`\nAVERTISSEMENTS/ERREURS CONSOLE (${erreurs.length}) :`)
    for (const e of erreurs.slice(0, 15)) console.log('  - ' + e)
  } else {
    console.log('\nAucune erreur console dans le rendu.')
  }

  fermerBase()
  rmSync(dossierTravail, { recursive: true, force: true })
  app.exit(erreurs.length ? 1 : 0)
}).catch(abandonner)
