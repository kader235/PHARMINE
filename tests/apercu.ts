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

  // Le banc ne doit rien envoyer sur une imprimante reelle : on desactive
  // l'impression directe, ce qui fait retomber le logiciel sur la boite de
  // dialogue — elle-meme neutralisee plus bas. Un test qui imprime pour de
  // vrai est un test qu'on finit par ne plus lancer.
  configuration.definirParametres({ 'impression.silencieuse': '0' }, admin)

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

  // --- Le tableau de bord doit tenir dans l'ecran ----------------------------
  // Un tableau de bord qu'il faut faire defiler ne remplit pas son office : on
  // l'ouvre pour savoir ou on en est d'un coup d'oeil. La mesure porte sur le
  // conteneur reel, pas sur une impression a l'oeil.
  const mesureDebordement = `
    (() => {
      const c = document.querySelector('.contenu')
      const p = document.querySelector('.pilotage')
      return {
        pilotage: !!p,
        contenu: c.clientHeight,
        defilement: c.scrollHeight,
        deborde: c.scrollHeight > c.clientHeight + 2
      }
    })()`

  for (const disposition of ['confort', 'compacte', 'tactile']) {
    await fenetre.webContents.executeJavaScript(apparence('clair', disposition))
    await new Promise((r) => setTimeout(r, 500))
    const mesure = (await fenetre.webContents.executeJavaScript(mesureDebordement)) as {
      pilotage: boolean
      contenu: number
      defilement: number
      deborde: boolean
    }
    console.log(`  tableau de bord en ${disposition} : ${JSON.stringify(mesure)}`)
    if (!mesure.pilotage) {
      erreurs.push(`Tableau de bord : grille absente en disposition ${disposition}`)
    } else if (mesure.deborde) {
      erreurs.push(
        `Tableau de bord : deborde de ${mesure.defilement - mesure.contenu} px en ${disposition}`
      )
    }
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

  // --- Saisie assistee d'un produit ------------------------------------------
  // Le repertoire livre avec le logiciel doit reellement remplir la fiche :
  // on le verifie de bout en bout, depuis le clavier jusqu'aux champs.
  const indexProduits = (await fenetre.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.nav-lien'))
      .findIndex((b) => b.textContent && b.textContent.trim().startsWith('Produits'))`)) as number

  if (indexProduits < 0) {
    erreurs.push('Module Produits introuvable dans la navigation')
  } else {
    await fenetre.webContents.executeJavaScript(
      `document.querySelectorAll('.nav-lien')[${indexProduits}].click()`
    )
    await new Promise((r) => setTimeout(r, 900))

    const ouvert = await fenetre.webContents.executeJavaScript(`
      (() => {
        const b = Array.from(document.querySelectorAll('button'))
          .find((e) => e.textContent && e.textContent.trim() === 'Ajouter un produit')
        if (b) { b.click(); return true }
        return false
      })()`)
    await new Promise((r) => setTimeout(r, 600))

    if (!ouvert) {
      erreurs.push('Produits : bouton « Ajouter un produit » introuvable')
    } else {
      await photographier(fenetre, 'produit-assistant', 400)

      await fenetre.webContents.executeJavaScript(`(${SAISIR})('.assistant-saisie', 'parac')`)

      // On attend que les propositions arrivent plutot que de dormir un delai
      // fixe : la premiere recherche charge le moteur, et un banc qui echoue
      // par intermittence finit par etre ignore.
      const propositions = (await fenetre.webContents.executeJavaScript(`
        (async () => {
          const compter = () => document.querySelectorAll('.suggestion').length
          for (let essai = 0; essai < 40 && compter() === 0; essai++) {
            await new Promise((r) => setTimeout(r, 100))
          }
          const s = Array.from(document.querySelectorAll('.suggestion'))
          return {
            nombre: s.length,
            premiere: s[0] ? s[0].textContent.trim().slice(0, 60) : null
          }
        })()`)) as { nombre: number; premiere: string | null }

      console.log(`  repertoire « parac » -> ${JSON.stringify(propositions)}`)
      if (propositions.nombre === 0) {
        erreurs.push('Repertoire : aucune proposition pour « parac »')
      }
      await photographier(fenetre, 'produit-suggestions', 400)

      // On choisit la premiere fiche : le formulaire doit s'ouvrir rempli.
      await fenetre.webContents.executeJavaScript(
        `document.querySelector('.suggestion')?.click()`
      )
      await new Promise((r) => setTimeout(r, 700))

      const prerempli = (await fenetre.webContents.executeJavaScript(`
        (() => {
          const valeur = (libelle) => {
            const champ = Array.from(document.querySelectorAll('.champ'))
              .find((c) => c.querySelector('label') &&
                           c.querySelector('label').textContent.startsWith(libelle))
            const e = champ && (champ.querySelector('input') || champ.querySelector('select'))
            return e ? e.value : null
          }
          return {
            origine: !!document.querySelector('.fiche-origine'),
            nom: valeur('Nom commercial'),
            dosage: valeur('Dosage'),
            principe: valeur('Principe actif'),
            forme: valeur('Forme'),
            prixVente: valeur('Prix de vente')
          }
        })()`)) as Record<string, unknown>

      console.log(`  fiche pre-remplie -> ${JSON.stringify(prerempli)}`)
      if (!prerempli.origine) erreurs.push('Repertoire : la fiche d origine n est pas rappelee')
      if (!prerempli.nom) erreurs.push('Repertoire : le nom commercial n est pas pre-rempli')
      if (!prerempli.principe) erreurs.push('Repertoire : le principe actif n est pas pre-rempli')
      if (!prerempli.forme) erreurs.push('Repertoire : la forme pharmaceutique n est pas pre-remplie')
      // Le repertoire ne connait aucun prix : il ne doit surtout pas en inventer.
      if (prerempli.prixVente && prerempli.prixVente !== '0' && prerempli.prixVente !== '') {
        erreurs.push(`Repertoire : un prix de vente a ete pre-rempli (${prerempli.prixVente})`)
      }

      await photographier(fenetre, 'produit-fiche-prete', 400)

      // Le prix d'achat saisi doit proposer un prix de vente : c'est le
      // dernier geste que l'assistance peut epargner au pharmacien.
      await fenetre.webContents.executeJavaScript(`
        (() => {
          const champ = Array.from(document.querySelectorAll('.champ'))
            .find((c) => c.querySelector('label') &&
                         c.querySelector('label').textContent.startsWith('Prix d’'))
          const input = champ && champ.querySelector('input')
          if (!input) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setter.call(input, '1000')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`)
      await new Promise((r) => setTimeout(r, 500))

      const propose = (await fenetre.webContents.executeJavaScript(`
        (() => {
          const champ = Array.from(document.querySelectorAll('.champ'))
            .find((c) => c.querySelector('label') &&
                         c.querySelector('label').textContent.startsWith('Prix de vente'))
          const input = champ && champ.querySelector('input')
          return input ? input.value : null
        })()`)) as string | null

      console.log(`  prix de vente propose pour 1 000 d achat -> ${propose}`)
      if (!propose || Number(propose) <= 1000) {
        erreurs.push(`Repertoire : aucun prix de vente propose (${propose})`)
      }

      await photographier(fenetre, 'produit-prix-propose', 400)

      await fenetre.webContents.executeJavaScript(`
        (() => {
          const b = Array.from(document.querySelectorAll('button'))
            .find((e) => e.textContent && e.textContent.trim() === 'Annuler')
          if (b) b.click()
          return !!b
        })()`)
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  // --- Verrouillage du poste --------------------------------------------------
  // Un poste laisse ouvert, c'est la caisse ouverte. On verifie que l'ecran
  // couvre reellement le travail, que le lecteur de codes-barres se tait
  // derriere, et qu'un mauvais mot de passe ne laisse pas entrer.
  // On se place au comptoir : c'est la que le lecteur remplit un panier, donc
  // le seul endroit ou « le scan ne passe pas » veut dire quelque chose.
  await fenetre.webContents.executeJavaScript(`document.querySelectorAll('.nav-lien')[1].click()`)
  await new Promise((r) => setTimeout(r, 1200))

  // Temoin : dans cet etat precis, un scan ajoute bien une ligne. Sans ce
  // controle, verifier plus bas que rien ne s'ajoute ne prouverait rien.
  // On attend le résultat au lieu de dormir un délai fixe : un banc qui échoue
  // une fois sur cinq pour cause de lenteur ne sert plus à rien — on finit par
  // ignorer ce qu'il dit.
  const temoinScan = (await fenetre.webContents.executeJavaScript(`
    (async () => {
      const compter = () => document.querySelectorAll('.panier-ligne').length
      const avant = compter()
      for (const c of '3400930000001') {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: c, code: 'Digit' + c, bubbles: true, cancelable: true
        }))
      }
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
      }))
      for (let essai = 0; essai < 30 && compter() === avant; essai++) {
        await new Promise((r) => setTimeout(r, 100))
      }
      return { avant, apres: compter() }
    })()`)) as { avant: number; apres: number }

  console.log(`  temoin : scan poste ouvert -> ${JSON.stringify(temoinScan)}`)
  if (temoinScan.apres <= temoinScan.avant) {
    erreurs.push('Verrouillage : le temoin est invalide, le scan n ajoute rien meme deverrouille')
  }

  await fenetre.webContents.executeJavaScript(
    `document.querySelector('.barre-utilisateur')?.click()`
  )
  await new Promise((r) => setTimeout(r, 500))

  const verrouille = await fenetre.webContents.executeJavaScript(`
    (() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((e) => e.textContent && e.textContent.trim() === 'Verrouiller le poste')
      if (b) { b.click(); return true }
      return false
    })()`)
  await new Promise((r) => setTimeout(r, 600))

  if (!verrouille) {
    erreurs.push('Verrouillage : bouton « Verrouiller le poste » introuvable')
  } else {
    const couverture = (await fenetre.webContents.executeJavaScript(`
      (() => {
        const v = document.querySelector('.verrou')
        if (!v) return { present: false }
        const r = v.getBoundingClientRect()
        return {
          present: true,
          couvreEcran: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
          champFocalise: document.activeElement === document.getElementById('verrou-mot-de-passe')
        }
      })()`)) as { present: boolean; couvreEcran?: boolean; champFocalise?: boolean }

    console.log(`  verrouillage -> ${JSON.stringify(couverture)}`)
    if (!couverture.present) erreurs.push('Verrouillage : ecran absent apres declenchement')
    if (couverture.present && !couverture.couvreEcran) {
      erreurs.push('Verrouillage : l ecran ne couvre pas toute la fenetre')
    }
    if (couverture.present && !couverture.champFocalise) {
      erreurs.push('Verrouillage : le champ mot de passe n a pas le focus')
    }

    await photographier(fenetre, 'poste-verrouille', 400)

    // Une douchette passee sur une boite ne doit rien remplir derriere le voile.
    const scanBloque = (await fenetre.webContents.executeJavaScript(`
      (async () => {
        const avant = document.querySelectorAll('.panier-ligne').length
        for (const c of '3400930000001') {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: c, code: 'Digit' + c, bubbles: true, cancelable: true
          }))
        }
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
        }))
        await new Promise((r) => setTimeout(r, 600))
        return { avant, apres: document.querySelectorAll('.panier-ligne').length }
      })()`)) as { avant: number; apres: number }

    console.log(`  scan derriere le verrou -> ${JSON.stringify(scanBloque)}`)
    if (scanBloque.apres !== scanBloque.avant) {
      erreurs.push('Verrouillage : un code-barres a ete accepte poste verrouille')
    }

    // Mauvais mot de passe : on reste dehors, et on le dit.
    await fenetre.webContents.executeJavaScript(
      `(${SAISIR})('#verrou-mot-de-passe', 'MauvaisMotDePasse')`
    )
    await fenetre.webContents.executeJavaScript(`
      (() => {
        const b = Array.from(document.querySelectorAll('.verrou button'))
          .find((e) => e.textContent && e.textContent.includes('Déverrouiller'))
        if (b) b.click()
        return !!b
      })()`)
    await new Promise((r) => setTimeout(r, 900))

    const refus = (await fenetre.webContents.executeJavaScript(`
      (() => ({
        toujoursVerrouille: !!document.querySelector('.verrou'),
        message: document.querySelector('.verrou-erreur')?.textContent ?? null
      }))()`)) as { toujoursVerrouille: boolean; message: string | null }

    console.log(`  mot de passe errone -> ${JSON.stringify(refus)}`)
    if (!refus.toujoursVerrouille) {
      erreurs.push('Verrouillage : un mauvais mot de passe a ouvert le poste')
    }
    if (!refus.message) erreurs.push('Verrouillage : aucun message apres un mot de passe errone')

    await photographier(fenetre, 'verrou-mot-de-passe-refuse', 300)

    // Le bon mot de passe rend la main, et le travail est toujours la.
    await fenetre.webContents.executeJavaScript(
      `(${SAISIR})('#verrou-mot-de-passe', 'Officine2026')`
    )
    await fenetre.webContents.executeJavaScript(`
      (() => {
        const b = Array.from(document.querySelectorAll('.verrou button'))
          .find((e) => e.textContent && e.textContent.includes('Déverrouiller'))
        if (b) b.click()
        return !!b
      })()`)
    await new Promise((r) => setTimeout(r, 900))

    const ouvert = await fenetre.webContents.executeJavaScript(
      `!document.querySelector('.verrou')`
    )
    console.log(`  deverrouillage -> ${ouvert ? 'ouvert' : 'TOUJOURS VERROUILLE'}`)
    if (!ouvert) erreurs.push('Verrouillage : le bon mot de passe n a pas ouvert le poste')
  }

  // --- Imprimantes vues par le poste -------------------------------------------
  const imprimantes = (await fenetre.webContents.executeJavaScript(
    `window.pharmina.appeler('impression.imprimantes')`
  )) as { nom: string }[]
  console.log(`  imprimantes detectees : ${imprimantes.length}`)

  // --- Reglages : impression et protection des donnees -------------------------
  const indexParametres = (await fenetre.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.nav-lien'))
      .findIndex((b) => b.textContent && b.textContent.trim().startsWith('Paramètres'))`)) as number

  if (indexParametres < 0) {
    erreurs.push('Module Parametres introuvable dans la navigation')
  } else {
    const onglet = (nom: string): string =>
      `(() => {
        const b = Array.from(document.querySelectorAll('.segments button'))
          .find((e) => e.textContent && e.textContent.trim() === ${JSON.stringify(nom)})
        if (b) { b.click(); return true }
        return false
      })()`

    await fenetre.webContents.executeJavaScript(
      `document.querySelectorAll('.nav-lien')[${indexParametres}].click()`
    )
    await new Promise((r) => setTimeout(r, 900))

    await fenetre.webContents.executeJavaScript(onglet('Règles'))
    await new Promise((r) => setTimeout(r, 700))

    // Le choix d'imprimante doit etre une liste des imprimantes reellement
    // installees, pas un champ ou l'on tape un nom au hasard.
    const choixImprimante = (await fenetre.webContents.executeJavaScript(`
      (() => {
        const champ = Array.from(document.querySelectorAll('.champ'))
          .find((c) => c.querySelector('label') &&
                       c.querySelector('label').textContent.startsWith('Imprimante des tickets'))
        const select = champ && champ.querySelector('select')
        return { liste: !!select, options: select ? select.options.length : 0 }
      })()`)) as { liste: boolean; options: number }

    console.log(`  choix de l imprimante -> ${JSON.stringify(choixImprimante)}`)
    if (!choixImprimante.liste) {
      erreurs.push('Reglages : l imprimante des tickets ne se choisit pas dans une liste')
    }
    await photographier(fenetre, 'parametres-regles', 1100)

    await fenetre.webContents.executeJavaScript(onglet('Licence et données'))
    await new Promise((r) => setTimeout(r, 900))

    // Aucune destination externe n'est configuree dans le jeu de demonstration :
    // le logiciel doit le dire franchement, pas laisser croire au contraire.
    const protection = (await fenetre.webContents.executeJavaScript(`
      (() => {
        const t = document.body.innerText
        return {
          avertit: t.includes('Aucune copie ne quitte cet ordinateur'),
          bouton: t.includes('Choisir un dossier')
        }
      })()`)) as { avertit: boolean; bouton: boolean }

    console.log(`  protection des donnees -> ${JSON.stringify(protection)}`)
    if (!protection.avertit) {
      erreurs.push('Sauvegardes : l absence de copie externe n est pas signalee')
    }
    if (!protection.bouton) {
      erreurs.push('Sauvegardes : aucun moyen de choisir la destination externe')
    }
    await photographier(fenetre, 'parametres-sauvegardes', 1100)

    // --- Reprise de donnees ---------------------------------------------------
    // Le choix du fichier passe par une fenetre native que le banc ne peut pas
    // piloter : on ecrit le fichier nous-memes et on appelle le canal reel,
    // ce qui exerce toute la chaine sauf le selecteur.
    const fichierReprise = join(dossierTravail, 'ancien-logiciel.csv')
    writeFileSync(
      fichierReprise,
      [
        'Designation;Dosage;Prix achat;Prix vente;Qte;Peremption',
        'Metformine;850 mg;1 200;2 100;24;06/2028',
        'Losartan;50 mg;1.850,00;3 200;18;31/10/2027',
        'Ligne fautive;;100;xxx;2;'
      ].join('\n'),
      'utf8'
    )

    await fenetre.webContents.executeJavaScript(onglet('Reprise'))
    await new Promise((r) => setTimeout(r, 800))
    await photographier(fenetre, 'parametres-reprise', 1100)

    const simulation = (await fenetre.webContents.executeJavaScript(`
      window.pharmina.appeler('reprise.simuler', {
        chemin: ${JSON.stringify(fichierReprise)},
        type: 'produits',
        correspondance: { nom: 0, dosage: 1, prixAchat: 2, prixVente: 3, stock: 4, peremption: 5 },
        mettreAJour: false
      })`)) as {
      lignesLues: number
      crees: number
      refuses: number
      lotsCrees: number
      anomalies: { ligne: number; motif: string }[]
    }

    console.log(`  simulation de reprise -> ${JSON.stringify(simulation)}`)

    if (simulation.crees !== 2) {
      erreurs.push(`Reprise : 2 creations attendues, ${simulation.crees} obtenue(s)`)
    }
    if (simulation.refuses !== 1) {
      erreurs.push(`Reprise : 1 ligne fautive attendue, ${simulation.refuses} obtenue(s)`)
    }
    if (!simulation.anomalies.some((a) => a.ligne === 4)) {
      erreurs.push('Reprise : la ligne fautive n est pas designee par son numero')
    }

    // Une simulation ne doit rien ecrire : le catalogue est inchange.
    const catalogueApres = (await fenetre.webContents.executeJavaScript(
      `window.pharmina.appeler('produits.lister', { parPage: 1 }).then((p) => p.total)`
    )) as number
    console.log(`  catalogue apres simulation : ${catalogueApres} produits`)
    if (catalogueApres !== 12) {
      erreurs.push(`Reprise : la simulation a modifie le catalogue (${catalogueApres} produits)`)
    }

  }

  // --- Un code inconnu ne bloque pas le comptoir -----------------------------
  // Au Tchad, une meme reference arrive avec des codes differents selon
  // l'importateur. Renvoyer le pharmacien dans la fiche produit, client devant,
  // etait la mauvaise reponse : on scanne, on designe, c'est retenu.
  await fenetre.webContents.executeJavaScript(`document.querySelectorAll('.nav-lien')[1].click()`)
  await new Promise((r) => setTimeout(r, 1000))

  const scannerInconnu = `
    (async () => {
      const code = '6161100999888'
      for (const c of code) {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: c, code: 'Digit' + c, bubbles: true, cancelable: true
        }))
      }
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
      }))
      for (let essai = 0; essai < 40 && !document.querySelector('.rattachement'); essai++) {
        await new Promise((r) => setTimeout(r, 100))
      }
      return !!document.querySelector('.rattachement')
    })()`

  const panneauOuvert = await fenetre.webContents.executeJavaScript(scannerInconnu)
  console.log(`  code inconnu -> panneau de rattachement : ${panneauOuvert ? 'oui' : 'NON'}`)
  if (!panneauOuvert) erreurs.push('Code inconnu : aucun panneau de rattachement ne s ouvre')
  else {
    await photographier(fenetre, 'code-inconnu', 400)

    // Le champ doit deja etre actif : au comptoir, on ne clique pas.
    const pret = await fenetre.webContents.executeJavaScript(
      `document.activeElement === document.querySelector('.rattachement-saisie')`
    )
    console.log(`  champ deja actif : ${pret ? 'oui' : 'NON'}`)
    if (!pret) erreurs.push('Rattachement : le champ de recherche n est pas actif')

    await fenetre.webContents.executeJavaScript(`(${SAISIR})('.rattachement-saisie', 'doli')`)

    const propose = await fenetre.webContents.executeJavaScript(`
      (async () => {
        for (let essai = 0; essai < 40 && !document.querySelector('.rattachement-choix'); essai++) {
          await new Promise((r) => setTimeout(r, 100))
        }
        return document.querySelectorAll('.rattachement-choix').length
      })()`)
    console.log(`  produits proposes : ${propose}`)
    if (!propose) erreurs.push('Rattachement : aucun produit propose pour « doli »')

    await photographier(fenetre, 'code-inconnu-choix', 300)

    // On designe le produit : le code doit etre retenu ET le produit entrer au
    // panier. Deux effets d'un seul geste.
    const resultat = await fenetre.webContents.executeJavaScript(`
      (async () => {
        const avant = document.querySelectorAll('.panier-ligne').length
        document.querySelector('.rattachement-choix').click()
        for (let essai = 0; essai < 40; essai++) {
          await new Promise((r) => setTimeout(r, 100))
          if (!document.querySelector('.rattachement')) break
        }
        await new Promise((r) => setTimeout(r, 500))
        return {
          panneauFerme: !document.querySelector('.rattachement'),
          avant,
          apres: document.querySelectorAll('.panier-ligne').length
        }
      })()`)

    console.log(`  apres designation -> ${JSON.stringify(resultat)}`)
    if (!resultat.panneauFerme) erreurs.push('Rattachement : le panneau reste ouvert')
    if (resultat.apres <= resultat.avant) {
      erreurs.push('Rattachement : le produit n entre pas au panier')
    }

    // Et le code doit desormais etre connu : on le rescanne.
    const reconnu = await fenetre.webContents.executeJavaScript(`
      (async () => {
        // Panier vide : rescanner incrementerait sinon la ligne existante, et
        // on ne verrait pas si le code a ete retenu.
        const vider = Array.from(document.querySelectorAll('button'))
          .find((b) => b.textContent && b.textContent.includes('Vider'))
        if (vider) vider.click()
        await new Promise((r) => setTimeout(r, 400))

        const avant = document.querySelectorAll('.panier-ligne').length
        for (const c of '6161100999888') {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: c, code: 'Digit' + c, bubbles: true, cancelable: true
          }))
        }
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
        }))
        for (let essai = 0; essai < 40; essai++) {
          await new Promise((r) => setTimeout(r, 100))
          if (document.querySelectorAll('.panier-ligne').length > avant) break
        }
        return {
          sansPanneau: !document.querySelector('.rattachement'),
          ajoute: document.querySelectorAll('.panier-ligne').length > avant
        }
      })()`) as { sansPanneau: boolean; ajoute: boolean }
    console.log(`  code rescanne -> ${JSON.stringify(reconnu)}`)
    if (!reconnu.sansPanneau || !reconnu.ajoute) {
      erreurs.push('Rattachement : le code n est pas retenu, il redemande un rattachement')
    }

    await photographier(fenetre, 'code-retenu', 400)
  }

  // --- La licence doit etre trouvable ----------------------------------------
  // Un ecran d'activation accessible seulement depuis un bandeau en bas
  // d'ecran n'existe pas : personne ne cherche sa licence a cet endroit, et le
  // bandeau disparait des que le poste est active. Le code d'installation doit
  // rester lisible dans les parametres, y compris des annees plus tard, le
  // jour ou l'officine change d'ordinateur.
  const indexReglages = (await fenetre.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('.nav-lien'))
      .findIndex((b) => b.textContent && b.textContent.trim().startsWith('Param'))`)) as number

  if (indexReglages < 0) {
    erreurs.push('Module Parametres introuvable')
  } else {
    await fenetre.webContents.executeJavaScript(
      `document.querySelectorAll('.nav-lien')[${indexReglages}].click()`
    )
    await new Promise((r) => setTimeout(r, 900))

    const surOnglet = await fenetre.webContents.executeJavaScript(`
      (() => {
        const b = Array.from(document.querySelectorAll('.segments button'))
          .find((e) => e.textContent && e.textContent.includes('Licence'))
        if (b) { b.click(); return true }
        return false
      })()`)
    await new Promise((r) => setTimeout(r, 900))

    if (!surOnglet) {
      erreurs.push('Parametres : onglet « Licence et donnees » introuvable')
    } else {
      const licenceVisible = (await fenetre.webContents.executeJavaScript(`
        (() => {
          const texte = document.body.innerText
          const bouton = Array.from(document.querySelectorAll('button'))
            .find((b) => b.textContent && b.textContent.includes('activation'))
          return {
            panneau: texte.includes('Licence du logiciel'),
            code: /[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.test(texte),
            bouton: !!bouton
          }
        })()`)) as { panneau: boolean; code: boolean; bouton: boolean }

      console.log(`  licence dans les parametres -> ${JSON.stringify(licenceVisible)}`)
      if (!licenceVisible.panneau) erreurs.push('Licence : le panneau est absent des parametres')
      if (!licenceVisible.code) erreurs.push('Licence : le code d installation n est pas affiche')
      if (!licenceVisible.bouton) erreurs.push('Licence : aucun bouton pour saisir la cle')

      await photographier(fenetre, 'licence-parametres', 400)
    }
  }

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
