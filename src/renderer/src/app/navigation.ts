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
  | 'aide'

export interface DefinitionModule {
  cle: CleModule
  libelle: string
  icone: NomIcone
  /**
   * Couleur de la pastille d'icône. Elle sert de repère : au bout de quelques
   * jours, l'utilisateur vise la couleur avant de lire le libellé.
   */
  couleur: string
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
    couleur: '#4f6bed',
    permissions: ['tableau_bord.voir'],
    groupe: 'exploitation',
    fil: 'Accueil',
    description: "L'essentiel de votre pharmacie aujourd'hui."
  },
  {
    cle: 'ventes',
    libelle: 'Ventes',
    icone: 'vente',
    couleur: '#1f9d63',
    permissions: ['ventes.creer', 'ventes.historique'],
    groupe: 'exploitation',
    fil: 'Comptoir',
    description: 'Enregistrez une vente et consultez l’historique.'
  },
  {
    cle: 'caisse',
    libelle: 'Caisse',
    icone: 'caisse',
    couleur: '#b8792a',
    permissions: ['caisse.ouvrir', 'caisse.cloturer', 'caisse.ecarts'],
    groupe: 'exploitation',
    fil: 'Comptoir',
    description: 'Ouverture, mouvements et clôture de la caisse.'
  },
  {
    cle: 'produits',
    libelle: 'Produits',
    icone: 'produit',
    couleur: '#2f7fd4',
    permissions: ['produits.voir'],
    groupe: 'gestion',
    fil: 'Catalogue',
    description: 'Votre catalogue, vos prix et vos seuils.'
  },
  {
    cle: 'stock',
    libelle: 'Stock',
    icone: 'stock',
    couleur: '#c78a1e',
    permissions: ['stock.voir'],
    groupe: 'gestion',
    fil: 'Catalogue',
    description: 'État du stock, lots et mouvements.'
  },
  {
    cle: 'peremptions',
    libelle: 'Péremptions',
    icone: 'peremption',
    couleur: '#c0562f',
    permissions: ['stock.voir'],
    groupe: 'gestion',
    fil: 'Catalogue',
    description: 'Les lots à surveiller avant qu’il ne soit trop tard.'
  },
  {
    cle: 'achats',
    libelle: 'Achats',
    icone: 'achat',
    couleur: '#d4762a',
    permissions: ['achats.voir'],
    groupe: 'gestion',
    fil: 'Approvisionnement',
    description: 'Réceptions, coûts et paiements fournisseurs.'
  },
  {
    cle: 'fournisseurs',
    libelle: 'Fournisseurs',
    icone: 'fournisseur',
    couleur: '#7a5cd6',
    permissions: ['fournisseurs.voir'],
    groupe: 'gestion',
    fil: 'Approvisionnement',
    description: 'Vos partenaires et leurs conditions.'
  },
  {
    cle: 'clients',
    libelle: 'Clients',
    icone: 'client',
    couleur: '#8a53c4',
    permissions: ['clients.voir'],
    groupe: 'gestion',
    fil: 'Relation',
    description: 'Historique d’achat et créances.'
  },
  {
    cle: 'inventaire',
    libelle: 'Inventaire',
    icone: 'inventaire',
    couleur: '#2b9aa8',
    permissions: ['inventaire.voir'],
    groupe: 'gestion',
    fil: 'Contrôle',
    description: 'Comparez le stock théorique au comptage physique.'
  },
  {
    cle: 'finances',
    libelle: 'Finances',
    icone: 'finance',
    couleur: '#1f9d63',
    permissions: ['finances.voir', 'depenses.voir'],
    groupe: 'gestion',
    fil: 'Pilotage',
    description: 'Revenus, dépenses, marge et trésorerie.'
  },
  {
    cle: 'rapports',
    libelle: 'Rapports',
    icone: 'rapport',
    couleur: '#4f6bed',
    permissions: ['rapports.voir'],
    groupe: 'gestion',
    fil: 'Pilotage',
    description: 'Analysez vos ventes, vos produits et votre stock.'
  },
  {
    cle: 'alertes',
    libelle: 'Alertes',
    icone: 'alerte',
    couleur: '#cf4a4a',
    permissions: ['alertes.voir'],
    groupe: 'gestion',
    fil: 'Pilotage',
    description: 'Ce qui demande une vérification ou une action.'
  },
  {
    cle: 'utilisateurs',
    libelle: 'Utilisateurs',
    icone: 'utilisateur',
    couleur: '#2b9aa8',
    permissions: ['utilisateurs.voir'],
    groupe: 'administration',
    fil: 'Administration',
    description: 'Comptes, rôles et permissions.'
  },
  {
    cle: 'journal',
    libelle: 'Journal d’activité',
    icone: 'journal',
    couleur: '#5f6b78',
    permissions: ['journal.voir'],
    groupe: 'administration',
    fil: 'Administration',
    description: 'La trace de toutes les opérations importantes.'
  },
  {
    cle: 'parametres',
    libelle: 'Paramètres',
    icone: 'parametres',
    couleur: '#5f6b78',
    permissions: ['parametres.voir'],
    groupe: 'administration',
    fil: 'Administration',
    description: 'Configuration de la pharmacie et sauvegardes.'
  },
  {
    cle: 'aide',
    libelle: 'Guide',
    icone: 'info',
    couleur: '#4f6bed',
    // Aucune permission : le guide doit rester lisible par tout le monde, y
    // compris par la personne qui vient d'etre embauchee au comptoir.
    permissions: [],
    groupe: 'administration',
    fil: 'Aide',
    description: 'Comment utiliser PHARMINA.'
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
