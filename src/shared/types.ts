/**
 * Types partagés entre le processus principal et l'interface.
 *
 * Rappel de convention : tout montant est un entier exprimé dans la plus
 * petite unité de la devise. Toute date est une chaîne ISO-8601.
 */

export type ModePaiement = 'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque' | 'credit'
export type EtatStock = 'rupture' | 'faible' | 'disponible' | 'surstock'
export type PalierPeremption = 'expire' | 'j7' | 'j30' | 'j90' | 'ok'
export type PrioriteAlerte = 'urgent' | 'important' | 'information'

export interface Utilisateur {
  id: number
  code: string
  identifiant: string
  nom_complet: string
  role_id: number
  role: string
  role_code: string
  telephone: string | null
  email: string | null
  actif: number
  doit_changer_mdp: number
  derniere_connexion_at: string | null
}

export interface SessionActive {
  utilisateur: Utilisateur
  permissions: string[]
  sessionId: string
  pharmacie: Pharmacie
}

export interface Pharmacie {
  id: number
  nom: string
  raison_sociale: string | null
  adresse: string | null
  ville: string | null
  pays: string | null
  telephone: string | null
  email: string | null
  registre_commerce: string | null
  numero_ordre: string | null
  devise: string
  devise_symbole: string
  devise_decimales: number
  configure_at: string | null
}

export interface Produit {
  id: number
  code_interne: string
  nom_commercial: string
  nom_generique: string | null
  principe_actif: string | null
  dosage: string | null
  categorie_id: number | null
  laboratoire_id: number | null
  forme_id: number | null
  unite_id: number | null
  prix_achat: number
  prix_vente: number
  taux_tva: number
  stock_min: number
  stock_max: number | null
  emplacement: string | null
  ordonnance_requise: number
  suivi_peremption: number
  vente_autorisee: number
  notes: string | null
  archived_at: string | null
}

/** Produit enrichi de son état de stock — c'est la forme utilisée par les écrans. */
export interface ProduitEtat extends Produit {
  categorie: string | null
  forme: string | null
  laboratoire: string | null
  unite: string | null
  stock: number
  stock_disponible: number
  valeur_achat: number
  prochaine_peremption: string | null
  lots_actifs: number
  etat_stock: EtatStock
  codes_barres?: string[]
}

export interface Lot {
  id: number
  produit_id: number
  numero: string | null
  fournisseur_id: number | null
  achat_id: number | null
  date_reception: string
  date_peremption: string | null
  quantite_initiale: number
  quantite_restante: number
  prix_achat: number
  bloque: number
  motif_blocage: string | null
}

export interface LotPeremption {
  lot_id: number
  numero: string | null
  date_peremption: string
  quantite_restante: number
  prix_achat: number
  valeur: number
  produit_id: number
  nom_commercial: string
  dosage: string | null
  emplacement: string | null
  jours_restants: number
  palier: PalierPeremption
}

export interface MouvementStock {
  id: number
  at: string
  produit_id: number
  nom_commercial?: string
  lot_id: number | null
  numero_lot?: string | null
  type: string
  quantite: number
  stock_avant: number
  stock_apres: number
  cout_unitaire: number
  motif: string | null
  reference_type: string | null
  reference_id: number | null
  utilisateur: string | null
}

export interface Fournisseur {
  id: number
  code: string
  nom: string
  contact_principal: string | null
  telephone: string | null
  email: string | null
  adresse: string | null
  ville: string | null
  pays: string | null
  conditions_paiement: string | null
  delai_livraison_jours: number | null
  notes: string | null
  archived_at: string | null
  total_achats?: number
  total_paye?: number
  solde_du?: number
  dernier_achat?: string | null
}

export interface Client {
  id: number
  code: string
  nom: string
  telephone: string | null
  email: string | null
  adresse: string | null
  date_naissance: string | null
  plafond_credit: number
  notes: string | null
  archived_at: string | null
  total_achats?: number
  solde_du?: number
  derniere_visite?: string | null
}

/** Situation d'un compte client, telle qu'affichée au comptoir. */
export interface ApercuCompte {
  clientId: number
  nom: string
  telephone: string | null
  plafond: number
  encours: number
  /** null lorsqu'aucun plafond n'est fixé. */
  disponible: number | null
  nbVentes: number
  totalAchats: number
  derniereVisite: string | null
  dernierReglement: string | null
}

/** Ligne de relevé de compte, avec son solde cumulé. */
export interface LigneReleve {
  at: string
  type: 'vente' | 'reglement'
  reference: string
  libelle: string
  debit: number
  credit: number
  solde: number
  utilisateur: string | null
}

export interface LigneCommande {
  produitId: number
  quantite: number
  prixUnitaire?: number
  remise?: number
}

export interface LigneAllouee {
  lotId: number
  numero: string | null
  quantite: number
  prixAchat: number
  datePeremption: string | null
}

export interface Allocation {
  produitId: number
  demande: number
  servi: number
  lignes: LigneAllouee[]
  manquant: number
}

export interface PaiementVente {
  mode: ModePaiement
  montant: number
  reference?: string
}

export interface DemandeVente {
  clientId?: number | null
  lignes: LigneCommande[]
  paiements: PaiementVente[]
  remiseGlobale?: number
  note?: string
}

export interface Vente {
  id: number
  reference: string
  caisse_session_id: number | null
  client_id: number | null
  client_nom?: string | null
  utilisateur_id: number
  utilisateur?: string
  at: string
  statut: 'finalisee' | 'annulee' | 'remboursee'
  sous_total: number
  remise: number
  taxe: number
  total: number
  cout_total: number
  montant_recu: number
  monnaie_rendue: number
  reste_a_payer: number
  note: string | null
  nb_articles?: number
}

export interface VenteLigne {
  id: number
  produit_id: number
  lot_id: number | null
  numero_lot?: string | null
  designation: string
  quantite: number
  prix_unitaire: number
  remise: number
  montant: number
  cout_unitaire: number
}

export interface VenteDetail extends Vente {
  lignes: VenteLigne[]
  paiements: { mode: ModePaiement; montant: number; reference: string | null }[]
}

/** Avertissement bloquant ou non levé avant la finalisation d'une vente. */
export interface Avertissement {
  code:
    | 'stock_insuffisant'
    | 'produit_expire'
    | 'peremption_proche'
    | 'quantite_inhabituelle'
    | 'ordonnance_requise'
    | 'plafond_credit'
    | 'remise_excessive'
    | 'caisse_fermee'
    | 'vente_non_autorisee'
  bloquant: boolean
  produitId?: number
  message: string
  detail?: string
}

export interface CaisseSession {
  id: number
  reference: string
  utilisateur_id: number
  utilisateur?: string
  ouverte_at: string
  fond_initial: number
  fermee_at: string | null
  total_theorique: number | null
  total_compte: number | null
  ecart: number | null
  justification: string | null
  statut: 'ouverte' | 'fermee'
}

export interface EtatCaisse {
  session: CaisseSession | null
  fondInitial: number
  encaisseEspeces: number
  autresEncaissements: { mode: ModePaiement; montant: number }[]
  sorties: number
  depenses: number
  theoriqueEspeces: number
  nbVentes: number
  totalVentes: number
}

export interface LigneReception {
  produitId: number
  quantite: number
  prixAchat: number
  numeroLot?: string | null
  datePeremption?: string | null
}

export interface Achat {
  id: number
  reference: string
  fournisseur_id: number
  fournisseur?: string
  statut: 'brouillon' | 'commande' | 'recu_partiel' | 'recu' | 'annule'
  date_commande: string | null
  date_reception: string | null
  sous_total: number
  remise: number
  taxe: number
  frais: number
  total: number
  montant_paye: number
  note: string | null
  nb_lignes?: number
}

export interface Inventaire {
  id: number
  reference: string
  libelle: string
  perimetre: 'total' | 'categorie' | 'emplacement' | 'selection'
  perimetre_ref: string | null
  statut: 'en_cours' | 'valide' | 'annule'
  ouvert_at: string
  ouvert_par: number
  ouvert_par_nom?: string
  valide_at: string | null
  ecart_valeur: number
  note: string | null
  nb_lignes?: number
  nb_comptees?: number
}

export interface InventaireLigne {
  id: number
  produit_id: number
  nom_commercial: string
  dosage: string | null
  emplacement: string | null
  lot_id: number | null
  numero_lot: string | null
  date_peremption: string | null
  prix_achat: number
  stock_theorique: number
  stock_compte: number | null
  ecart: number | null
  justification: string | null
}

export interface Depense {
  id: number
  reference: string
  date: string
  categorie_id: number
  categorie?: string
  libelle: string
  montant: number
  mode: Exclude<ModePaiement, 'credit'>
  beneficiaire: string | null
  sur_caisse: number
  note: string | null
  utilisateur?: string
}

export interface Alerte {
  id: number
  cle: string
  type: string
  priorite: PrioriteAlerte
  titre: string
  message: string
  entite: string | null
  entite_id: number | null
  created_at: string
  lue_at: string | null
  resolue_at: string | null
}

export interface Indicateur {
  valeur: number
  precedent: number | null
  variation: number | null
}

export interface TableauDeBord {
  date: string
  chiffreAffaires: Indicateur
  nbVentes: Indicateur
  beneficeEstime: Indicateur
  depenses: Indicateur
  caisse: { ouverte: boolean; depuis: string | null; theorique: number; responsable: string | null }
  surveillance: {
    ruptures: number
    stockFaible: number
    expires: number
    peremptionProche: number
    valeurExpiree: number
    dettesFournisseurs: number
    creancesClients: number
  }
  activite: {
    at: string
    type: string
    libelle: string
    detail: string
    montant: number | null
    utilisateur: string | null
  }[]
  aucuneDonnee: boolean
}

export interface ResultatRecherche {
  categorie: 'produit' | 'vente' | 'client' | 'fournisseur' | 'achat'
  id: number
  titre: string
  sousTitre: string
  complement?: string
}

export interface Page<T> {
  lignes: T[]
  total: number
  page: number
  parPage: number
}
