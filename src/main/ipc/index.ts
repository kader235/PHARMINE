import { dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { writeFileSync } from 'node:fs'
import { ErreurMetier, journaliser } from '../services/commun'
import * as auth from '../services/auth'
import * as produits from '../services/produits'
import * as repertoire from '../services/repertoire'
import * as stock from '../services/stock'
import * as ventes from '../services/ventes'
import * as caisse from '../services/caisse'
import * as achats from '../services/achats'
import * as partenaires from '../services/partenaires'
import * as inventaire from '../services/inventaire'
import * as finances from '../services/finances'
import * as pilotage from '../services/pilotage'
import * as alertes from '../services/alertes'
import * as configuration from '../services/configuration'

/** Session courante. Une seule à la fois : c'est un poste de travail, pas un serveur. */
interface Contexte {
  utilisateurId: number
  permissions: Set<string>
  sessionId: string
}

let contexte: Contexte | null = null

export function contexteActuel(): Contexte | null {
  return contexte
}

export function terminerSession(motif: string): void {
  if (!contexte) return
  try {
    auth.deconnecter(contexte.sessionId, contexte.utilisateurId, motif)
  } catch {
    /* la base est peut-être déjà fermée */
  }
  contexte = null
}

type Gestionnaire = (payload: any, ctx: Contexte) => unknown

interface Canal {
  /** Permission exigée. `null` = accessible sans être connecté. */
  permission: string | null
  gestionnaire: Gestionnaire
}

const c = (permission: string | null, gestionnaire: Gestionnaire): Canal => ({ permission, gestionnaire })
/** Canal accessible à tout utilisateur connecté, sans permission particulière. */
const connecte = (gestionnaire: Gestionnaire): Canal => ({ permission: '', gestionnaire })

export function chemins(cheminBase: string, dossierSauvegardes: string): void {
  cheminBaseCourant = cheminBase
  dossierSauvegardesCourant = dossierSauvegardes
}
let cheminBaseCourant = ''
let dossierSauvegardesCourant = ''

const CANAUX: Record<string, Canal> = {
  // --- Ouverture, sans session ------------------------------------------------
  'app.etat': c(null, () => ({
    besoinConfiguration: auth.besoinConfiguration(),
    pharmacie: auth.pharmacie(),
    dateDuJour: configuration.dateDuJour(),
    // Lu avant toute connexion : l'écran d'accueil doit déjà porter le thème
    // de l'officine, sans quoi l'interface changerait de couleur au moment de
    // la connexion.
    themeDefaut: configuration.themeParDefaut()
  })),
  'app.configurer': c(null, (p) => configuration.configurerPharmacie(p)),
  'auth.connecter': c(null, (p: { identifiant: string; motDePasse: string }) => {
    const session = auth.connecter(p.identifiant, p.motDePasse)
    contexte = {
      utilisateurId: session.utilisateur.id,
      permissions: new Set(session.permissions),
      sessionId: session.sessionId
    }
    alertes.rafraichirAlertes()
    return session
  }),

  // --- Session ---------------------------------------------------------------
  'auth.deconnecter': connecte(() => {
    terminerSession('deconnexion')
    return true
  }),
  'auth.session': connecte((_, ctx) => ({
    utilisateur: auth.listerUtilisateurs().find((u) => u.id === ctx.utilisateurId) ?? null,
    permissions: [...ctx.permissions],
    sessionId: ctx.sessionId,
    pharmacie: auth.pharmacie()
  })),
  'app.reglages': connecte(() => configuration.reglagesInterface()),
  'auth.changerMotDePasse': connecte((p: { ancien: string | null; nouveau: string }, ctx) =>
    auth.changerMotDePasse(ctx.utilisateurId, p.ancien, p.nouveau)
  ),

  // --- Tableau de bord et recherche ------------------------------------------
  'pilotage.tableauDeBord': c('tableau_bord.voir', () => pilotage.tableauDeBord()),
  'pilotage.recherche': connecte((p: { saisie: string }) => pilotage.rechercheGlobale(p.saisie)),

  // --- Produits --------------------------------------------------------------
  'produits.lister': c('produits.voir', (p) => produits.listerProduits(p ?? {})),
  'produits.rechercheRapide': c('produits.voir', (p: { saisie: string }) => produits.rechercheRapide(p.saisie)),
  'produits.parCodeBarres': c('produits.voir', (p: { code: string }) => produits.parCodeBarres(p.code)),
  'produits.detail': c('produits.voir', (p: { id: number }) => produits.produit(p.id)),
  'produits.statistiques': c('produits.voir', (p: { id: number }) => produits.statistiquesProduit(p.id)),
  'produits.referentiels': c('produits.voir', () => produits.referentiels()),
  'produits.creer': c('produits.creer', (p, ctx) => produits.creerProduit(p, ctx.utilisateurId)),
  'produits.modifier': c('produits.modifier', (p: { id: number; donnees: never }, ctx) =>
    produits.modifierProduit(p.id, p.donnees, ctx.utilisateurId)
  ),
  'produits.archiver': c('produits.archiver', (p: { id: number; archiver: boolean }, ctx) =>
    produits.archiverProduit(p.id, p.archiver, ctx.utilisateurId)
  ),
  'produits.creerLaboratoire': c('produits.creer', (p: { nom: string }) => produits.creerLaboratoire(p.nom)),

  // --- Repertoire integre ----------------------------------------------------
  // Lecture seule : aucun canal n'ecrit dans le repertoire, par construction.
  'repertoire.rechercher': c('produits.voir', (p: { saisie: string; limite?: number }) =>
    repertoire.rechercher(p.saisie, p.limite)
  ),
  'repertoire.fiche': c('produits.voir', (p: { id: number }) => repertoire.fiche(p.id)),
  'repertoire.etat': connecte(() => repertoire.etat()),

  // --- Stock -----------------------------------------------------------------
  'stock.lots': c('stock.voir', (p: { produitId: number; inclureVides?: boolean }) =>
    stock.lotsDe(p.produitId, p.inclureVides)
  ),
  'stock.peremptions': c('stock.voir', (p: { palier?: never }) => stock.peremptions(p?.palier)),
  'stock.resumePeremptions': c('stock.voir', () => stock.resumePeremptions()),
  'stock.mouvements': c('stock.voir', (p) => stock.mouvements(p ?? {})),
  'stock.entree': c('stock.entree', (p, ctx) => stock.entrerStock(p, ctx.utilisateurId)),
  'stock.sortie': c('stock.sortie', (p: { produitId: number; quantite: number; type: never; motif: string }, ctx) =>
    stock.sortirStock(p.produitId, p.quantite, p.type, p.motif, ctx.utilisateurId)
  ),
  'stock.ajusterLot': c('stock.ajuster', (p: { lotId: number; quantite: number; motif: string }, ctx) =>
    stock.ajusterLot(p.lotId, p.quantite, p.motif, ctx.utilisateurId)
  ),
  'stock.bloquerLot': c('stock.bloquer_lot', (p: { lotId: number; bloque: boolean; motif: string | null }, ctx) =>
    stock.bloquerLot(p.lotId, p.bloque, p.motif, ctx.utilisateurId)
  ),
  'stock.suggestions': c('achats.voir', () => achats.suggestionsReapprovisionnement()),

  // --- Ventes ----------------------------------------------------------------
  'ventes.verifier': c('ventes.creer', (p, ctx) => ventes.verifierVente(p, [...ctx.permissions])),
  'ventes.enregistrer': c('ventes.creer', (p, ctx) =>
    ventes.enregistrerVente(p, ctx.utilisateurId, [...ctx.permissions])
  ),
  'ventes.lister': c('ventes.historique', (p) => ventes.listerVentes(p ?? {})),
  'ventes.detail': c('ventes.historique', (p: { id: number }) => ventes.detailVente(p.id)),
  'ventes.annuler': c('ventes.annuler', (p: { id: number; motif: string }, ctx) =>
    ventes.annulerVente(p.id, p.motif, ctx.utilisateurId)
  ),

  // --- Caisse ----------------------------------------------------------------
  'caisse.etat': connecte(() => caisse.etatCaisse()),
  'caisse.ouvrir': c('caisse.ouvrir', (p: { fondInitial: number }, ctx) =>
    caisse.ouvrirCaisse(p.fondInitial, ctx.utilisateurId)
  ),
  'caisse.cloturer': c('caisse.cloturer', (p: { totalCompte: number; justification: string | null }, ctx) =>
    caisse.cloturerCaisse(p.totalCompte, p.justification, ctx.utilisateurId)
  ),
  'caisse.mouvement': c('caisse.mouvement', (p, ctx) => caisse.mouvementCaisse(p, ctx.utilisateurId)),
  'caisse.historique': c('caisse.ecarts', () => caisse.historiqueSessions()),
  'caisse.mouvementsSession': c('caisse.ecarts', (p: { sessionId: number }) => caisse.mouvementsSession(p.sessionId)),

  // --- Achats ----------------------------------------------------------------
  'achats.lister': c('achats.voir', (p) => achats.listerAchats(p ?? {})),
  'achats.detail': c('achats.voir', (p: { id: number }) => achats.achat(p.id)),
  'achats.reception': c('achats.valider', (p, ctx) => achats.enregistrerReception(p, ctx.utilisateurId)),
  'achats.payer': c('achats.payer', (p: { id: number; montant: number; mode: never; reference: string | null }, ctx) =>
    achats.payerAchat(p.id, p.montant, p.mode, p.reference, ctx.utilisateurId)
  ),

  // --- Partenaires -----------------------------------------------------------
  'fournisseurs.lister': c('fournisseurs.voir', (p) => partenaires.listerFournisseurs(p?.recherche, p?.inclureArchives)),
  'fournisseurs.detail': c('fournisseurs.voir', (p: { id: number }) => partenaires.fournisseur(p.id)),
  'fournisseurs.enregistrer': c('fournisseurs.gerer', (p: { id: number | null; donnees: never }, ctx) =>
    partenaires.enregistrerFournisseur(p.id, p.donnees, ctx.utilisateurId)
  ),
  'fournisseurs.archiver': c('fournisseurs.gerer', (p: { id: number; archiver: boolean }, ctx) =>
    partenaires.archiverFournisseur(p.id, p.archiver, ctx.utilisateurId)
  ),
  'clients.lister': c('clients.voir', (p) => partenaires.listerClients(p?.recherche, p?.inclureArchives)),
  'clients.detail': c('clients.voir', (p: { id: number }) => partenaires.client(p.id)),
  'clients.enregistrer': c('clients.gerer', (p: { id: number | null; donnees: never }, ctx) =>
    partenaires.enregistrerClient(p.id, p.donnees, ctx.utilisateurId)
  ),
  'clients.archiver': c('clients.gerer', (p: { id: number; archiver: boolean }, ctx) =>
    partenaires.archiverClient(p.id, p.archiver, ctx.utilisateurId)
  ),
  'clients.apercuCompte': c('clients.voir', (p: { id: number }) => partenaires.apercuCompte(p.id)),
  'clients.releve': c('clients.voir', (p: { id: number; depuis?: string }) =>
    partenaires.releveCompte(p.id, p.depuis)
  ),
  'clients.reglement': c(
    'clients.reglement',
    (p: { clientId: number; montant: number; mode: never; venteId: number | null }, ctx) =>
      partenaires.encaisserCreance(p.clientId, p.montant, p.mode, p.venteId, ctx.utilisateurId)
  ),

  // --- Inventaire ------------------------------------------------------------
  'inventaire.lister': c('inventaire.voir', () => inventaire.listerInventaires()),
  'inventaire.detail': c('inventaire.voir', (p: { id: number }) => inventaire.inventaire(p.id)),
  'inventaire.enCours': c('inventaire.voir', () => inventaire.inventaireEnCours()),
  'inventaire.ouvrir': c('inventaire.creer', (p, ctx) => inventaire.ouvrirInventaire(p, ctx.utilisateurId)),
  'inventaire.compter': c(
    'inventaire.compter',
    (p: { ligneId: number; quantite: number; justification: string | null }, ctx) =>
      inventaire.saisirComptage(p.ligneId, p.quantite, p.justification, ctx.utilisateurId)
  ),
  'inventaire.valider': c('inventaire.valider', (p: { id: number }, ctx) =>
    inventaire.validerInventaire(p.id, ctx.utilisateurId)
  ),
  'inventaire.annuler': c('inventaire.creer', (p: { id: number; motif: string }, ctx) =>
    inventaire.annulerInventaire(p.id, p.motif, ctx.utilisateurId)
  ),

  // --- Finances --------------------------------------------------------------
  'finances.synthese': c('finances.voir', (p: { depuis: string; jusqua: string }) =>
    finances.synthese(p.depuis, p.jusqua)
  ),
  'depenses.lister': c('depenses.voir', (p) => finances.listerDepenses(p ?? {})),
  'depenses.categories': c('depenses.voir', () => finances.categoriesDepenses()),
  'depenses.enregistrer': c('depenses.creer', (p, ctx) => finances.enregistrerDepense(p, ctx.utilisateurId)),
  'depenses.archiver': c('depenses.archiver', (p: { id: number }, ctx) =>
    finances.archiverDepense(p.id, ctx.utilisateurId)
  ),

  // --- Rapports --------------------------------------------------------------
  'rapports.ventes': c('rapports.voir', (p: { depuis: string; jusqua: string; granularite: never }) =>
    pilotage.rapportVentes(p.depuis, p.jusqua, p.granularite)
  ),
  'rapports.produits': c('rapports.voir', (p: { depuis: string; jusqua: string; sens: never }) =>
    pilotage.rapportProduits(p.depuis, p.jusqua, p.sens)
  ),
  'rapports.stock': c('rapports.voir', () => pilotage.rapportStock()),

  // --- Alertes ---------------------------------------------------------------
  'alertes.lister': c('alertes.voir', (p) => alertes.listerAlertes(p?.inclureResolues)),
  'alertes.compter': connecte(() => alertes.compterAlertes()),
  'alertes.rafraichir': c('alertes.voir', () => {
    alertes.rafraichirAlertes()
    return alertes.listerAlertes()
  }),
  'alertes.marquerLues': c('alertes.traiter', (p: { cles: string[] }, ctx) =>
    alertes.marquerLues(p.cles, ctx.utilisateurId)
  ),

  // --- Utilisateurs et sécurité ----------------------------------------------
  'utilisateurs.lister': c('utilisateurs.voir', () => auth.listerUtilisateurs()),
  'utilisateurs.roles': c('utilisateurs.voir', () => auth.listerRoles()),
  'utilisateurs.permissions': c('utilisateurs.voir', () => auth.catalogePermissions()),
  'utilisateurs.permissionsDe': c('utilisateurs.voir', (p: { id: number }) => auth.permissionsDe(p.id)),
  'utilisateurs.creer': c('utilisateurs.gerer', (p, ctx) => auth.creerUtilisateur(p, ctx.utilisateurId)),
  'utilisateurs.modifier': c('utilisateurs.gerer', (p: { id: number; champs: never }, ctx) =>
    auth.modifierUtilisateur(p.id, p.champs, ctx.utilisateurId)
  ),
  'utilisateurs.definirPermission': c(
    'utilisateurs.permissions',
    (p: { utilisateurId: number; code: string; etat: boolean | null }, ctx) =>
      auth.definirPermissionIndividuelle(p.utilisateurId, p.code, p.etat, ctx.utilisateurId)
  ),
  'journal.lister': c('journal.voir', (p) => pilotage.journal(p ?? {})),

  // --- Paramètres et sauvegardes ---------------------------------------------
  'parametres.lister': c('parametres.voir', () => configuration.listerParametres()),
  'parametres.definir': c('parametres.modifier', (p: { valeurs: Record<string, string> }, ctx) =>
    configuration.definirParametres(p.valeurs, ctx.utilisateurId)
  ),
  'parametres.pharmacie': c('parametres.modifier', (p, ctx) => configuration.modifierPharmacie(p, ctx.utilisateurId)),
  'parametres.statistiquesBase': c('parametres.voir', () => configuration.statistiquesBase()),
  'sauvegardes.lister': c('parametres.voir', () => configuration.listerSauvegardes()),
  'sauvegardes.creer': c('sauvegardes.creer', (_, ctx) =>
    configuration.creerSauvegarde(cheminBaseCourant, dossierSauvegardesCourant, 'manuelle', ctx.utilisateurId)
  ),
  'sauvegardes.controler': c('sauvegardes.restaurer', (p: { fichier: string }) =>
    configuration.controlerSauvegarde(p.fichier)
  ),

  // --- Export de fichiers ----------------------------------------------------
  'exports.enregistrer': c('rapports.exporter', (p: { nomFichier: string; contenu: string }, ctx) =>
    exporter(p.nomFichier, p.contenu, ctx.utilisateurId)
  )
}

/**
 * Enregistre un fichier choisi par l'utilisateur. L'interface ne peut pas
 * ecrire sur le disque : elle passe par ici, et l'utilisateur choisit toujours
 * l'emplacement lui-meme.
 */
function exporter(nomFichier: string, contenu: string, utilisateurId: number): { fichier: string } | null {
  const choix = dialog.showSaveDialogSync({
    title: 'Enregistrer le fichier',
    defaultPath: nomFichier,
    filters: [
      { name: 'Fichier CSV', extensions: ['csv'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  })
  if (!choix) return null

  // BOM UTF-8 : sans lui, Excel affiche les accents de travers.
  writeFileSync(choix, '﻿' + contenu, 'utf8')

  journaliser({
    utilisateurId,
    action: 'Export',
    entite: 'rapport',
    resume: nomFichier
  })

  return { fichier: choix }
}

export function enregistrerCanaux(): void {
  ipcMain.handle('pharmina', async (_evenement: IpcMainInvokeEvent, canal: string, charge: unknown) => {
    const definition = CANAUX[canal]

    if (!definition) {
      return { ok: false, erreur: { message: `Opération inconnue : ${canal}`, code: 'canal_inconnu' } }
    }

    if (definition.permission !== null) {
      if (!contexte) {
        return { ok: false, erreur: { message: 'Session expirée. Reconnectez-vous.', code: 'non_connecte' } }
      }
      if (definition.permission !== '' && !contexte.permissions.has(definition.permission)) {
        journaliser({
          utilisateurId: contexte.utilisateurId,
          action: 'Accès refusé',
          entite: 'permission',
          resume: `${canal} exige ${definition.permission}`,
          resultat: 'refuse'
        })
        return {
          ok: false,
          erreur: {
            message: "Vous n'avez pas l'autorisation d'effectuer cette opération.",
            code: 'permission_refusee',
            detail: definition.permission
          }
        }
      }
    }

    try {
      return { ok: true, donnees: definition.gestionnaire(charge, contexte as Contexte) }
    } catch (erreur) {
      if (erreur instanceof ErreurMetier) {
        return { ok: false, erreur: { message: erreur.message, code: erreur.code, detail: erreur.detail } }
      }
      // Erreur technique : trace complète côté journal, message sobre côté interface.
      console.error(`[pharmina] ${canal}`, erreur)
      return {
        ok: false,
        erreur: {
          message: "Une erreur inattendue s'est produite. L'opération a été annulée.",
          code: 'technique',
          detail: (erreur as Error).message
        }
      }
    }
  })
}
