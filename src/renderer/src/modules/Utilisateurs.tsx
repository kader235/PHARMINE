import { useMemo, useState } from 'react'
import type { Utilisateur } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useNotifications } from '../ui/Notifications'
import {
  Bandeau,
  Bouton,
  Case,
  Champ,
  Chargement,
  EntetePage,
  Etiquette,
  EtatVide,
  Liste,
  Modale,
  Panneau,
  Segments
} from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import { depuis, initiales } from '../lib/format'

interface Role {
  id: number
  code: string
  nom: string
  description: string | null
  nb: number
}

interface Permission {
  code: string
  module: string
  libelle: string
  description: string | null
}

export default function Utilisateurs() {
  const session = useSession()
  const notifications = useNotifications()
  const [onglet, setOnglet] = useState<'comptes' | 'roles'>('comptes')
  const [creation, setCreation] = useState(false)
  const [droits, setDroits] = useState<Utilisateur | null>(null)

  const utilisateurs = useRequete<Utilisateur[]>('utilisateurs.lister')
  const roles = useRequete<Role[]>('utilisateurs.roles')
  const permissions = useRequete<Permission[]>('utilisateurs.permissions')

  const action = useAction()

  async function basculerActif(u: Utilisateur): Promise<void> {
    const r = await action.executer('utilisateurs.modifier', {
      id: u.id,
      champs: { actif: !u.actif }
    })
    if (r !== null) {
      utilisateurs.recharger()
      notifications.succes(u.actif ? 'Compte désactivé' : 'Compte réactivé')
    } else if (action.erreur) {
      notifications.erreur('Opération refusée', action.erreur.message)
    }
  }

  return (
    <>
      <EntetePage
        titre="Utilisateurs"
        description="Comptes, rôles et permissions. Chaque opération est enregistrée au nom de son auteur."
        actions={
          <>
            <Segments
              valeur={onglet}
              options={[
                { valeur: 'comptes', libelle: 'Comptes' },
                { valeur: 'roles', libelle: 'Rôles' }
              ]}
              onChange={setOnglet}
            />
            {onglet === 'comptes' && session.peut('utilisateurs.gerer') ? (
              <Bouton variante="principal" icone="plus" onClick={() => setCreation(true)}>
                Ajouter un utilisateur
              </Bouton>
            ) : null}
          </>
        }
      />

      {onglet === 'comptes' ? (
        <Tableau
          colonnes={[
            {
              cle: 'nom',
              entete: 'Utilisateur',
              rendu: (u: Utilisateur) => (
                <div className="rangee">
                  <span className="nav-avatar" style={{ background: 'var(--accent-clair)', color: 'var(--accent-fonce)' }}>
                    {initiales(u.nom_complet)}
                  </span>
                  <CellulePrincipale titre={u.nom_complet} sous={u.identifiant} />
                </div>
              ),
              triSur: (u: Utilisateur) => u.nom_complet
            },
            {
              cle: 'role',
              entete: 'Rôle',
              largeur: '160px',
              rendu: (u: Utilisateur) => <Etiquette ton="info">{u.role}</Etiquette>,
              triSur: (u: Utilisateur) => u.role
            },
            { cle: 'telephone', entete: 'Téléphone', rendu: (u: Utilisateur) => u.telephone ?? '—' },
            {
              cle: 'connexion',
              entete: 'Dernière connexion',
              rendu: (u: Utilisateur) =>
                u.derniere_connexion_at ? depuis(u.derniere_connexion_at) : <span style={{ color: 'var(--texte-faible)' }}>Jamais</span>,
              triSur: (u: Utilisateur) => u.derniere_connexion_at ?? ''
            },
            {
              cle: 'statut',
              entete: 'Statut',
              largeur: '110px',
              rendu: (u: Utilisateur) =>
                u.actif ? <Etiquette ton="succes">Actif</Etiquette> : <Etiquette ton="neutre">Désactivé</Etiquette>
            },
            {
              cle: 'actions',
              entete: '',
              actions: true,
              largeur: '190px',
              rendu: (u: Utilisateur) => (
                <div className="rangee" style={{ justifyContent: 'flex-end', gap: 4 }}>
                  {session.peut('utilisateurs.permissions') ? (
                    <Bouton compact variante="discret" onClick={() => setDroits(u)}>
                      Permissions
                    </Bouton>
                  ) : null}
                  {session.peut('utilisateurs.gerer') && u.id !== session.utilisateur.id ? (
                    <Bouton compact variante="discret" onClick={() => basculerActif(u)}>
                      {u.actif ? 'Désactiver' : 'Réactiver'}
                    </Bouton>
                  ) : null}
                </div>
              )
            }
          ]}
          lignes={utilisateurs.donnees}
          cle={(u) => u.id}
          chargement={utilisateurs.chargement}
          erreur={utilisateurs.erreur}
          onReessayer={utilisateurs.recharger}
          parPage={25}
          resume={(n) => `${n} utilisateur${n > 1 ? 's' : ''}`}
          vide={<EtatVide icone="utilisateur" titre="Aucun utilisateur" />}
        />
      ) : (
        <div className="pile">
          {roles.chargement ? (
            <Chargement />
          ) : (
            (roles.donnees ?? []).map((r) => (
              <Panneau
                key={r.id}
                titre={r.nom}
                description={r.description ?? undefined}
                actions={<Etiquette ton="neutre">{r.nb} permissions</Etiquette>}
              >
                <div className="rangee" style={{ flexWrap: 'wrap', gap: 5 }}>
                  {(permissions.donnees ?? [])
                    .reduce<string[]>((modules, p) => {
                      if (!modules.includes(p.module)) modules.push(p.module)
                      return modules
                    }, [])
                    .map((m) => (
                      <Etiquette key={m} ton="neutre" sansPoint>
                        {m}
                      </Etiquette>
                    ))}
                </div>
                <p style={{ marginTop: 10, fontSize: 12, color: 'var(--texte-faible)' }}>
                  Les rôles sont fixes. Pour un besoin particulier, ajustez les permissions
                  individuelles d’un utilisateur depuis l’onglet Comptes.
                </p>
              </Panneau>
            ))
          )}
        </div>
      )}

      {creation ? (
        <FormulaireUtilisateur
          roles={roles.donnees ?? []}
          onFermer={() => setCreation(false)}
          onCree={() => {
            setCreation(false)
            utilisateurs.recharger()
            notifications.succes('Utilisateur créé')
          }}
        />
      ) : null}

      {droits ? (
        <GestionPermissions
          utilisateur={droits}
          permissions={permissions.donnees ?? []}
          onFermer={() => setDroits(null)}
        />
      ) : null}
    </>
  )
}

function FormulaireUtilisateur({
  roles,
  onFermer,
  onCree
}: {
  roles: Role[]
  onFermer: () => void
  onCree: () => void
}) {
  const action = useAction()
  const [d, setD] = useState({
    nomComplet: '',
    identifiant: '',
    motDePasse: '',
    confirmation: '',
    roleId: 3,
    telephone: '',
    email: '',
    doitChangerMdp: true
  })

  const motDePasseValide =
    d.motDePasse.length >= 8 && /[A-Za-z]/.test(d.motDePasse) && /[0-9]/.test(d.motDePasse)
  const valide =
    d.nomComplet.trim().length >= 3 &&
    d.identifiant.trim().length >= 3 &&
    motDePasseValide &&
    d.motDePasse === d.confirmation

  async function creer(): Promise<void> {
    const r = await action.executer('utilisateurs.creer', {
      nomComplet: d.nomComplet.trim(),
      identifiant: d.identifiant.trim().toLowerCase(),
      motDePasse: d.motDePasse,
      roleId: d.roleId,
      telephone: d.telephone.trim() || null,
      email: d.email.trim() || null,
      doitChangerMdp: d.doitChangerMdp
    })
    if (r !== null) onCree()
  }

  const role = roles.find((r) => r.id === d.roleId)

  return (
    <Modale
      titre="Nouvel utilisateur"
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" disabled={!valide} enCours={action.enCours} onClick={creer}>
            Créer le compte
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

        <Champ
          libelle="Nom complet"
          obligatoire
          value={d.nomComplet}
          onChange={(e) => setD({ ...d, nomComplet: e.target.value })}
          autoFocus
        />
        <div className="grille deux">
          <Champ
            libelle="Identifiant"
            obligatoire
            value={d.identifiant}
            onChange={(e) => setD({ ...d, identifiant: e.target.value })}
            aide="Court, en minuscules."
          />
          <Liste
            libelle="Rôle"
            obligatoire
            options={roles.map((r) => ({ valeur: r.id, libelle: r.nom }))}
            value={d.roleId}
            onChange={(e) => setD({ ...d, roleId: Number(e.target.value) })}
          />
        </div>

        {role?.description ? <Bandeau ton="info">{role.description}</Bandeau> : null}

        <div className="grille deux">
          <Champ
            libelle="Mot de passe"
            obligatoire
            type="password"
            value={d.motDePasse}
            onChange={(e) => setD({ ...d, motDePasse: e.target.value })}
            aide="8 caractères minimum, avec au moins une lettre et un chiffre."
            erreur={d.motDePasse && !motDePasseValide ? 'Mot de passe trop simple.' : undefined}
          />
          <Champ
            libelle="Confirmation"
            obligatoire
            type="password"
            value={d.confirmation}
            onChange={(e) => setD({ ...d, confirmation: e.target.value })}
            erreur={
              d.confirmation && d.motDePasse !== d.confirmation ? 'Les deux mots de passe diffèrent.' : undefined
            }
          />
          <Champ libelle="Téléphone" value={d.telephone} onChange={(e) => setD({ ...d, telephone: e.target.value })} />
          <Champ
            libelle="Adresse électronique"
            type="email"
            value={d.email}
            onChange={(e) => setD({ ...d, email: e.target.value })}
          />
        </div>

        <Case
          libelle="Demander un changement de mot de passe à la première connexion"
          description="Recommandé : vous n’avez alors pas à connaître son mot de passe définitif."
          checked={d.doitChangerMdp}
          onChange={(e) => setD({ ...d, doitChangerMdp: e.target.checked })}
        />
      </div>
    </Modale>
  )
}

function GestionPermissions({
  utilisateur,
  permissions,
  onFermer
}: {
  utilisateur: Utilisateur
  permissions: Permission[]
  onFermer: () => void
}) {
  const notifications = useNotifications()
  const action = useAction()
  const effectives = useRequete<string[]>('utilisateurs.permissionsDe', { id: utilisateur.id })

  const parModule = useMemo(() => {
    const groupes: Record<string, Permission[]> = {}
    for (const p of permissions) (groupes[p.module] ??= []).push(p)
    return groupes
  }, [permissions])

  const accordees = new Set(effectives.donnees ?? [])

  async function basculer(code: string, etat: boolean): Promise<void> {
    const r = await action.executer('utilisateurs.definirPermission', {
      utilisateurId: utilisateur.id,
      code,
      etat
    })
    if (r !== null) {
      effectives.recharger()
      notifications.succes(etat ? 'Permission accordée' : 'Permission retirée')
    }
  }

  return (
    <Modale
      titre={`Permissions de ${utilisateur.nom_complet}`}
      description={`Rôle ${utilisateur.role} · ${accordees.size} permission(s) effective(s)`}
      large
      onFermer={onFermer}
      pied={
        <Bouton variante="principal" onClick={onFermer}>
          Fermer
        </Bouton>
      }
    >
      <div style={{ padding: '12px 14px 0' }}>
        <Bandeau ton="info">
          Les permissions cochées sont celles dont dispose réellement cet utilisateur. Une
          modification ici s’applique à lui seul, indépendamment de son rôle, et prend effet à sa
          prochaine connexion.
        </Bandeau>
      </div>

      {effectives.chargement ? (
        <Chargement />
      ) : (
        <div style={{ maxHeight: 460, overflowY: 'auto' }}>
          {Object.entries(parModule).map(([module, liste]) => (
            <div key={module} className="formulaire-section">
              <div className="formulaire-titre">{module}</div>
              <div className="pile" style={{ gap: 8 }}>
                {liste.map((p) => (
                  <Case
                    key={p.code}
                    libelle={p.libelle}
                    description={p.description ?? undefined}
                    checked={accordees.has(p.code)}
                    disabled={action.enCours}
                    onChange={(e) => basculer(p.code, e.target.checked)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {action.erreur ? (
        <div style={{ padding: '0 14px 14px' }}>
          <Bandeau ton="danger">{action.erreur.message}</Bandeau>
        </div>
      ) : null}
    </Modale>
  )
}
