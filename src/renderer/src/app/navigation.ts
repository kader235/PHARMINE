import { createContext, useContext } from 'react'
import type { NomIcone } from '../ui/Icone'

export type CleModule =
  | 'tableau-bord'
  | 'ventes'
  | 'caisse'
  | 'produits'
  | 'stock'
  | 'peremptions'
  | 'achats'
  | 'fournisseurs'
  | 'clients'
  | 'inventaire'
  | 'finances'
  | 'rapports'
  | 'alertes'
  | 'utilisateurs'
  | 'journal'
  | 'parametres'

export interface DefinitionModule {
  cle: CleModule
  libelle: string
  icone: NomIcone
  /** L'accès est accordé si l'utilisateur détient l'une de ces permissions. */
  permissions: string[]
  groupe: 'exploitation' | 'gestion' | 'administration'
  fil: string
  description: string
}

export const MODULES: DefinitionModule[] = [
  {
    cle: 'tableau-bord',
    libelle: 'Tableau de bord',
    icone: 'tableau-bord',
    permissions: ['tableau_bord.voir'],
    groupe: 'exploitation',
    fil: 'Accueil',
    description: "L'essentiel de votre pharmacie aujourd'hui."
  },
  {
    cle: 'ventes',
    libelle: 'Ventes',
    icone: 'vente',
    permissions: ['ventes.creer', 'ventes.historique'],
    groupe: 'exploitation',
    fil: 'Comptoir',
    description: 'Enregistrez une vente et consultez l’historique.'
  },
  {
    cle: 'caisse',
    libelle: 'Caisse',
    icone: 'caisse',
    permissions: ['caisse.ouvrir', 'caisse.cloturer', 'caisse.ecarts'],
    groupe: 'exploitation',
    fil: 'Comptoir',
    description: 'Ouverture, mouvements et clôture de la caisse.'
  },
  {
    cle: 'produits',
    libelle: 'Produits',
    icone: 'produit',
    permissions: ['produits.voir'],
    groupe: 'gestion',
    fil: 'Catalogue',
    description: 'Votre catalogue, vos prix et vos seuils.'
  },
  {
    cle: 'stock',
    libelle: 'Stock',
    icone: 'stock',
    permissions: ['stock.voir'],
    groupe: 'gestion',
    fil: 'Catalogue',
    description: 'État du stock, lots et mouvements.'
  },
  {
    cle: 'peremptions',
    libelle: 'Péremptions',
    icone: 'peremption',
    permissions: ['stock.voir'],
    groupe: 'gestion',
    fil: 'Catalogue',
    description: 'Les lots à surveiller avant qu’il ne soit trop tard.'
  },
  {
    cle: 'achats',
    libelle: 'Achats',
    icone: 'achat',
    permissions: ['achats.voir'],
    groupe: 'gestion',
    fil: 'Approvisionnement',
    description: 'Réceptions, coûts et paiements fournisseurs.'
  },
  {
    cle: 'fournisseurs',
    libelle: 'Fournisseurs',
    icone: 'fournisseur',
    permissions: ['fournisseurs.voir'],
    groupe: 'gestion',
    fil: 'Approvisionnement',
    description: 'Vos partenaires et leurs conditions.'
  },
  {
    cle: 'clients',
    libelle: 'Clients',
    icone: 'client',
    permissions: ['clients.voir'],
    groupe: 'gestion',
    fil: 'Relation',
    description: 'Historique d’achat et créances.'
  },
  {
    cle: 'inventaire',
    libelle: 'Inventaire',
    icone: 'inventaire',
    permissions: ['inventaire.voir'],
    groupe: 'gestion',
    fil: 'Contrôle',
    description: 'Comparez le stock théorique au comptage physique.'
  },
  {
    cle: 'finances',
    libelle: 'Finances',
    icone: 'finance',
    permissions: ['finances.voir', 'depenses.voir'],
    groupe: 'gestion',
    fil: 'Pilotage',
    description: 'Revenus, dépenses, marge et trésorerie.'
  },
  {
    cle: 'rapports',
    libelle: 'Rapports',
    icone: 'rapport',
    permissions: ['rapports.voir'],
    groupe: 'gestion',
    fil: 'Pilotage',
    description: 'Analysez vos ventes, vos produits et votre stock.'
  },
  {
    cle: 'alertes',
    libelle: 'Alertes',
    icone: 'alerte',
    permissions: ['alertes.voir'],
    groupe: 'gestion',
    fil: 'Pilotage',
    description: 'Ce qui demande une vérification ou une action.'
  },
  {
    cle: 'utilisateurs',
    libelle: 'Utilisateurs',
    icone: 'utilisateur',
    permissions: ['utilisateurs.voir'],
    groupe: 'administration',
    fil: 'Administration',
    description: 'Comptes, rôles et permissions.'
  },
  {
    cle: 'journal',
    libelle: 'Journal d’activité',
    icone: 'journal',
    permissions: ['journal.voir'],
    groupe: 'administration',
    fil: 'Administration',
    description: 'La trace de toutes les opérations importantes.'
  },
  {
    cle: 'parametres',
    libelle: 'Paramètres',
    icone: 'parametres',
    permissions: ['parametres.voir'],
    groupe: 'administration',
    fil: 'Administration',
    description: 'Configuration de la pharmacie et sauvegardes.'
  }
]

export const LIBELLES_GROUPE: Record<DefinitionModule['groupe'], string> = {
  exploitation: 'Exploitation',
  gestion: 'Gestion',
  administration: 'Administration'
}

/** Cible de navigation : un module, éventuellement avec un élément à ouvrir. */
export interface Destination {
  module: CleModule
  cible?: { type: 'produit' | 'vente' | 'client' | 'fournisseur' | 'achat' | 'lot'; id: number }
  filtre?: string
}

export const ContexteNavigation = createContext<(destination: Destination) => void>(() => {})

export function useNavigation(): (destination: Destination) => void {
  return useContext(ContexteNavigation)
}
