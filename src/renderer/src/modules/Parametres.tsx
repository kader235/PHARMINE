import { useEffect, useState } from 'react'
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
  Indicateur,
  Panneau,
  Segments
} from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import { dateCourte, depuis, nombre } from '../lib/format'

interface Parametre {
  cle: string
  valeur: string | null
  type: string
  categorie: string
  libelle: string
  description: string | null
}

interface Sauvegarde {
  id: number
  fichier: string
  taille: number | null
  at: string
  declencheur: string
  statut: string
  message: string | null
}

const CATEGORIES: Record<string, string> = {
  general: 'Général',
  stock: 'Stock et péremptions',
  ventes: 'Ventes',
  caisse: 'Caisse',
  securite: 'Sécurité et sauvegardes'
}

export default function Parametres() {
  const session = useSession()
  const notifications = useNotifications()
  const [onglet, setOnglet] = useState<'officine' | 'regles' | 'sauvegardes'>('officine')

  return (
    <>
      <EntetePage
        titre="Paramètres"
        description="Configuration de la pharmacie, règles de fonctionnement et sauvegardes."
        actions={
          <Segments
            valeur={onglet}
            options={[
              { valeur: 'officine', libelle: 'La pharmacie' },
              { valeur: 'regles', libelle: 'Règles' },
              { valeur: 'sauvegardes', libelle: 'Sauvegardes' }
            ]}
            onChange={setOnglet}
          />
        }
      />

      {onglet === 'officine' ? <Officine /> : null}
      {onglet === 'regles' ? <Regles modifiable={session.peut('parametres.modifier')} /> : null}
      {onglet === 'sauvegardes' ? <Sauvegardes onMessage={notifications.succes} /> : null}
    </>
  )
}

function Officine() {
  const session = useSession()
  const notifications = useNotifications()
  const action = useAction()

  const [d, setD] = useState({
    nom: session.pharmacie.nom,
    raison_sociale: session.pharmacie.raison_sociale ?? '',
    adresse: session.pharmacie.adresse ?? '',
    ville: session.pharmacie.ville ?? '',
    pays: session.pharmacie.pays ?? '',
    telephone: session.pharmacie.telephone ?? '',
    email: session.pharmacie.email ?? ''
  })

  const stats = useRequete<{
    produits: number
    ventes: number
    lots: number
    mouvements: number
    depuis: string | null
    version: number
  }>('parametres.statistiquesBase', undefined, session.peut('parametres.voir'))

  async function enregistrer(): Promise<void> {
    const r = await action.executer('parametres.pharmacie', d)
    if (r !== null) {
      notifications.succes('Paramètres enregistrés', 'Le nouveau nom apparaîtra à la prochaine ouverture.')
    }
  }

  return (
    <div className="deux-colonnes">
      <Panneau
        titre="Identité de la pharmacie"
        description="Ces informations figurent sur vos documents et tickets."
        pied={
          session.peut('parametres.modifier') ? (
            <div className="rangee" style={{ justifyContent: 'flex-end' }}>
              <Bouton variante="principal" enCours={action.enCours} onClick={enregistrer}>
                Enregistrer
              </Bouton>
            </div>
          ) : undefined
        }
      >
        <div className="pile">
          {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
          <Champ
            libelle="Nom"
            obligatoire
            value={d.nom}
            disabled={!session.peut('parametres.modifier')}
            onChange={(e) => setD({ ...d, nom: e.target.value })}
          />
          <Champ
            libelle="Raison sociale"
            value={d.raison_sociale}
            disabled={!session.peut('parametres.modifier')}
            onChange={(e) => setD({ ...d, raison_sociale: e.target.value })}
          />
          <div className="grille deux">
            <Champ
              libelle="Ville"
              value={d.ville}
              disabled={!session.peut('parametres.modifier')}
              onChange={(e) => setD({ ...d, ville: e.target.value })}
            />
            <Champ
              libelle="Pays"
              value={d.pays}
              disabled={!session.peut('parametres.modifier')}
              onChange={(e) => setD({ ...d, pays: e.target.value })}
            />
            <Champ
              libelle="Téléphone"
              value={d.telephone}
              disabled={!session.peut('parametres.modifier')}
              onChange={(e) => setD({ ...d, telephone: e.target.value })}
            />
            <Champ
              libelle="Adresse électronique"
              type="email"
              value={d.email}
              disabled={!session.peut('parametres.modifier')}
              onChange={(e) => setD({ ...d, email: e.target.value })}
            />
          </div>
          <Champ
            libelle="Adresse"
            value={d.adresse}
            disabled={!session.peut('parametres.modifier')}
            onChange={(e) => setD({ ...d, adresse: e.target.value })}
          />
        </div>
      </Panneau>

      <div className="pile">
        <Panneau titre="Devise">
          <dl className="liste-definitions">
            <dt>Code</dt>
            <dd>{session.pharmacie.devise}</dd>
            <dt>Symbole</dt>
            <dd>{session.pharmacie.devise_symbole}</dd>
            <dt>Décimales</dt>
            <dd>{session.pharmacie.devise_decimales}</dd>
          </dl>
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--texte-faible)' }}>
            La devise est fixée à la configuration initiale : la changer rendrait incohérents les
            montants déjà enregistrés.
          </p>
        </Panneau>

        <Panneau titre="Votre base de données">
          {stats.chargement ? (
            <Chargement />
          ) : (
            <dl className="liste-definitions">
              <dt>Produits</dt>
              <dd>{nombre(stats.donnees?.produits ?? 0)}</dd>
              <dt>Lots</dt>
              <dd>{nombre(stats.donnees?.lots ?? 0)}</dd>
              <dt>Ventes</dt>
              <dd>{nombre(stats.donnees?.ventes ?? 0)}</dd>
              <dt>Mouvements de stock</dt>
              <dd>{nombre(stats.donnees?.mouvements ?? 0)}</dd>
              <dt>Première vente</dt>
              <dd>{stats.donnees?.depuis ? dateCourte(stats.donnees.depuis) : '—'}</dd>
              <dt>Version du schéma</dt>
              <dd>{stats.donnees?.version ?? '—'}</dd>
            </dl>
          )}
        </Panneau>
      </div>
    </div>
  )
}

function Regles({ modifiable }: { modifiable: boolean }) {
  const notifications = useNotifications()
  const action = useAction()
  const parametres = useRequete<Parametre[]>('parametres.lister')
  const [modifs, setModifs] = useState<Record<string, string>>({})

  useEffect(() => setModifs({}), [parametres.donnees])

  const groupes: Record<string, Parametre[]> = {}
  for (const p of parametres.donnees ?? []) (groupes[p.categorie] ??= []).push(p)

  const valeur = (p: Parametre) => modifs[p.cle] ?? p.valeur ?? ''
  const modifie = Object.keys(modifs).length > 0

  async function enregistrer(): Promise<void> {
    const r = await action.executer('parametres.definir', { valeurs: modifs })
    if (r !== null) {
      parametres.recharger()
      notifications.succes('Paramètres enregistrés')
    }
  }

  if (parametres.chargement && !parametres.donnees) return <Chargement />

  return (
    <div className="pile">
      {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

      {Object.entries(groupes).map(([categorie, liste]) => (
        <Panneau key={categorie} titre={CATEGORIES[categorie] ?? categorie}>
          <div className="pile" style={{ gap: 14 }}>
            {liste.map((p) =>
              p.type === 'booleen' ? (
                <Case
                  key={p.cle}
                  libelle={p.libelle}
                  description={p.description ?? undefined}
                  checked={valeur(p) === '1'}
                  disabled={!modifiable}
                  onChange={(e) => setModifs({ ...modifs, [p.cle]: e.target.checked ? '1' : '0' })}
                />
              ) : (
                <Champ
                  key={p.cle}
                  libelle={p.libelle}
                  aide={p.description ?? undefined}
                  type={p.type === 'entier' ? 'number' : 'text'}
                  min={0}
                  value={valeur(p)}
                  disabled={!modifiable}
                  onChange={(e) => setModifs({ ...modifs, [p.cle]: e.target.value })}
                />
              )
            )}
          </div>
        </Panneau>
      ))}

      {modifiable ? (
        <div className="rangee" style={{ justifyContent: 'flex-end' }}>
          <Bouton onClick={() => setModifs({})} disabled={!modifie}>
            Annuler les modifications
          </Bouton>
          <Bouton variante="principal" disabled={!modifie} enCours={action.enCours} onClick={enregistrer}>
            Enregistrer {modifie ? `(${Object.keys(modifs).length})` : ''}
          </Bouton>
        </div>
      ) : (
        <Bandeau ton="info">
          Vous pouvez consulter ces règles mais pas les modifier. Contactez un administrateur.
        </Bandeau>
      )}
    </div>
  )
}

function Sauvegardes({ onMessage }: { onMessage: (titre: string, message?: string) => void }) {
  const session = useSession()
  const action = useAction()
  const liste = useRequete<Sauvegarde[]>('sauvegardes.lister')

  async function sauvegarder(): Promise<void> {
    const r = await action.executer<{ fichier: string; taille: number }>('sauvegardes.creer')
    if (r) {
      liste.recharger()
      onMessage('Sauvegarde créée', `${Math.round(r.taille / 1024)} Ko enregistrés.`)
    }
  }

  const derniere = liste.donnees?.find((s) => s.statut === 'ok')

  return (
    <>
      <div className="indicateurs">
        <Indicateur
          libelle="Dernière sauvegarde"
          valeur={derniere ? depuis(derniere.at) : 'Aucune'}
          ton={derniere ? undefined : 'danger'}
          detail={<span>{derniere ? `${Math.round((derniere.taille ?? 0) / 1024)} Ko` : 'Sauvegardez dès maintenant'}</span>}
        />
        <Indicateur
          libelle="Sauvegardes conservées"
          valeur={nombre(liste.donnees?.filter((s) => s.statut === 'ok').length ?? 0)}
          detail={<span>Les plus anciennes sont supprimées automatiquement</span>}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <Bandeau ton="info" titre="Vos données restent sur cet ordinateur">
          Une sauvegarde est créée automatiquement à chaque fermeture du logiciel. Copiez
          régulièrement le dossier de sauvegardes sur une clé USB ou un disque externe : c’est votre
          seule protection en cas de panne matérielle.
        </Bandeau>
      </div>

      <Tableau
        colonnes={[
          {
            cle: 'at',
            entete: 'Date',
            largeur: '190px',
            rendu: (s: Sauvegarde) => <CellulePrincipale titre={depuis(s.at)} sous={dateCourte(s.at)} />,
            triSur: (s: Sauvegarde) => s.at
          },
          {
            cle: 'fichier',
            entete: 'Fichier',
            rendu: (s: Sauvegarde) => (
              <span style={{ color: 'var(--texte-attenue)', fontSize: 12 }}>{s.fichier}</span>
            )
          },
          {
            cle: 'taille',
            entete: 'Taille',
            nombre: true,
            rendu: (s: Sauvegarde) => (s.taille ? `${Math.round(s.taille / 1024)} Ko` : '—'),
            triSur: (s: Sauvegarde) => s.taille ?? 0
          },
          {
            cle: 'declencheur',
            entete: 'Origine',
            largeur: '140px',
            rendu: (s: Sauvegarde) => (
              <Etiquette ton="neutre" sansPoint>
                {s.declencheur === 'automatique' ? 'Automatique' : 'Manuelle'}
              </Etiquette>
            )
          },
          {
            cle: 'statut',
            entete: 'Statut',
            largeur: '110px',
            rendu: (s: Sauvegarde) =>
              s.statut === 'ok' ? <Etiquette ton="succes">Réussie</Etiquette> : <Etiquette ton="danger">Échec</Etiquette>
          }
        ]}
        lignes={liste.donnees}
        cle={(s) => s.id}
        chargement={liste.chargement}
        erreur={liste.erreur}
        onReessayer={liste.recharger}
        parPage={20}
        resume={(n) => `${n} sauvegarde${n > 1 ? 's' : ''}`}
        outils={
          session.peut('sauvegardes.creer') ? (
            <Bouton variante="principal" icone="sauvegarde" enCours={action.enCours} onClick={sauvegarder}>
              Sauvegarder maintenant
            </Bouton>
          ) : undefined
        }
        vide={
          <EtatVide
            icone="sauvegarde"
            titre="Aucune sauvegarde"
            action={
              session.peut('sauvegardes.creer') ? (
                <Bouton variante="principal" icone="sauvegarde" enCours={action.enCours} onClick={sauvegarder}>
                  Créer une première sauvegarde
                </Bouton>
              ) : undefined
            }
          >
            Une sauvegarde est une copie complète et vérifiable de votre base.
          </EtatVide>
        }
      />

      {action.erreur ? (
        <div style={{ marginTop: 12 }}>
          <Bandeau ton="danger">{action.erreur.message}</Bandeau>
        </div>
      ) : null}
    </>
  )
}
