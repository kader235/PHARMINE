import { useEffect, useState } from 'react'
import type { EtatCopieExterne, EtatRepertoire } from '@shared/types'
import type { Imprimante } from '@shared/types'
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
  Liste,
  Panneau,
  Segments
} from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import Reprise from './Reprise'
import { FORMATS } from '../ui/Impression'
import { THEMES } from '../app/themes'
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

/**
 * Réglages dont les valeurs sont énumérées : on propose une liste plutôt qu'un
 * champ libre, où une faute de frappe casserait silencieusement l'impression.
 */
const CHOIX: Record<string, { valeur: string; libelle: string }[]> = {
  'impression.format_defaut': FORMATS.map((f) => ({
    valeur: f.valeur,
    libelle: `${f.libelle} — ${f.description}`
  })),
  'interface.theme': THEMES.map((t) => ({ valeur: t.cle, libelle: t.nom }))
}

/** Reglages dont les valeurs sont les imprimantes reellement installees. */
const CLES_IMPRIMANTE = new Set([
  'impression.imprimante_ticket',
  'impression.imprimante_a5',
  'impression.imprimante_a4'
])

const CATEGORIES: Record<string, string> = {
  general: 'Général',
  stock: 'Stock et péremptions',
  ventes: 'Ventes',
  caisse: 'Caisse',
  impression: 'Impression et documents',
  produits: 'Catalogue et saisie',
  securite: 'Sécurité et sauvegardes'
}

export default function Parametres() {
  const session = useSession()
  const notifications = useNotifications()
  const [onglet, setOnglet] = useState<'officine' | 'regles' | 'sauvegardes' | 'reprise'>('officine')

  return (
    <>
      <EntetePage
        titre="Paramètres"
        actions={
          <Segments
            valeur={onglet}
            options={[
              { valeur: 'officine', libelle: 'La pharmacie' },
              { valeur: 'regles', libelle: 'Règles' },
              { valeur: 'sauvegardes', libelle: 'Sauvegardes' },
              ...(session.peut('parametres.modifier')
                ? [{ valeur: 'reprise' as const, libelle: 'Reprise' }]
                : [])
            ]}
            onChange={setOnglet}
          />
        }
      />

      {onglet === 'officine' ? <Officine /> : null}
      {onglet === 'regles' ? <Regles modifiable={session.peut('parametres.modifier')} /> : null}
      {onglet === 'sauvegardes' ? <Sauvegardes onMessage={notifications.succes} /> : null}
      {onglet === 'reprise' ? <Reprise /> : null}
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
  const imprimantes = useRequete<Imprimante[]>('impression.imprimantes')
  const [modifs, setModifs] = useState<Record<string, string>>({})

  // Choisir une imprimante dans la liste du systeme plutot que taper son nom :
  // une faute de frappe enverrait les tickets nulle part, sans message.
  const optionsImprimante = [
    { valeur: '', libelle: 'Imprimante par défaut de Windows' },
    ...(imprimantes.donnees ?? []).map((i) => ({
      valeur: i.nom,
      libelle: i.defaut ? `${i.description} (par défaut)` : i.description
    }))
  ]

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

      <PanneauRepertoire />

      {Object.entries(groupes).map(([categorie, liste]) => (
        <Panneau
          key={categorie}
          titre={CATEGORIES[categorie] ?? categorie}
          pied={
            categorie === 'impression' && modifiable ? (
              <TestImpression enregistre={!modifie} />
            ) : undefined
          }
        >
          <div className="pile" style={{ gap: 14 }}>
            {liste.map((p) =>
              // La destination de sauvegarde se choisit dans un selecteur de
              // dossier, onglet « Sauvegardes » : un chemin tape a la main est
              // une source d'erreur silencieuse.
              p.cle === 'sauvegarde.destination_externe' ? null : CLES_IMPRIMANTE.has(p.cle) ? (
                <Liste
                  key={p.cle}
                  libelle={p.libelle}
                  aide={p.description ?? undefined}
                  options={optionsImprimante}
                  value={valeur(p)}
                  disabled={!modifiable}
                  onChange={(e) => setModifs({ ...modifs, [p.cle]: e.target.value })}
                />
              ) : CHOIX[p.cle] ? (
                <Liste
                  key={p.cle}
                  libelle={p.libelle}
                  aide={p.description ?? undefined}
                  options={CHOIX[p.cle]!.map((c) => ({ valeur: c.valeur, libelle: c.libelle }))}
                  value={valeur(p)}
                  disabled={!modifiable}
                  onChange={(e) => setModifs({ ...modifs, [p.cle]: e.target.value })}
                />
              ) : p.type === 'booleen' ? (
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
        />
        <Indicateur
          libelle="Sauvegardes conservées"
          valeur={nombre(liste.donnees?.filter((s) => s.statut === 'ok').length ?? 0)}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <CopieExterne modifiable={session.peut('parametres.modifier')} onMessage={onMessage} />
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

/**
 * État du répertoire intégré.
 *
 * Le pharmacien doit pouvoir constater que le fichier livré avec le logiciel
 * est bien celui qui l'assiste : combien de fiches, quelle empreinte, quelle
 * date de compilation. Rien n'est modifiable ici — le répertoire est ouvert
 * en lecture seule, et c'est précisément ce que ce panneau atteste.
 */
function PanneauRepertoire() {
  const etat = useRequete<EtatRepertoire>('repertoire.etat')
  if (!etat.donnees) return null

  const r = etat.donnees

  return (
    <Panneau titre="Répertoire des produits" description="Aide à la saisie, livrée avec le logiciel.">
      {r.disponible ? (
        <dl className="liste-definitions">
          <dt>Fiches disponibles</dt>
          <dd>{nombre(r.produits)}</dd>
          <dt>Compilé le</dt>
          <dd>{r.compileLe ?? '—'}</dd>
          <dt>Empreinte</dt>
          <dd>{r.empreinte?.slice(0, 16) ?? '—'}</dd>
          <dt>Accès</dt>
          <dd>Lecture seule</dd>
        </dl>
      ) : (
        <Bandeau ton="attention">
          Le répertoire n’est pas disponible sur ce poste{r.motif ? ` : ${r.motif}` : ''}. La saisie
          des produits reste possible, sans suggestions.
        </Bandeau>
      )}
    </Panneau>
  )
}

/**
 * Protection réelle des données.
 *
 * Une sauvegarde qui dort sur le disque qu'elle sauvegarde ne protège que
 * d'une fausse manœuvre. Ce panneau répond à la seule question qui compte :
 * « si ce poste brûle ce soir, qu'est-ce que je perds ? »
 *
 * Il reste rouge tant qu'aucune copie n'est sortie de la machine. C'est
 * voulu : un avertissement qu'on peut ignorer sans conséquence visible finit
 * toujours par être ignoré.
 */
function CopieExterne({
  modifiable,
  onMessage
}: {
  modifiable: boolean
  onMessage: (titre: string, message?: string) => void
}) {
  const action = useAction()
  const etat = useRequete<EtatCopieExterne>('sauvegardes.etatExterne')
  const e = etat.donnees

  async function choisir(): Promise<void> {
    const r = await action.executer<{ choisi: boolean; destination?: string; motif?: string }>(
      'sauvegardes.choisirDestination'
    )
    if (!r) return
    if (r.choisi) {
      etat.recharger()
      onMessage('Destination enregistrée', r.destination)
    } else if (r.motif) {
      onMessage('Dossier inutilisable', r.motif)
    }
  }

  if (!e) return null

  const ton = e.enRetard || !e.accessible ? 'danger' : 'succes'

  return (
    <Panneau
      titre="Copie hors de cette machine"
      description="La seule protection contre un vol, un incendie ou un rançongiciel."
      pied={
        modifiable ? (
          <div className="rangee" style={{ justifyContent: 'flex-end' }}>
            <Bouton icone="sauvegarde" enCours={action.enCours} onClick={choisir}>
              {e.configuree ? 'Changer de dossier' : 'Choisir un dossier'}
            </Bouton>
          </div>
        ) : undefined
      }
    >
      {!e.configuree ? (
        <Bandeau ton="danger" titre="Aucune copie ne quitte cet ordinateur">
          Vos sauvegardes sont enregistrées sur le disque qu’elles sauvegardent. Choisissez une clé
          USB, un disque externe ou un dossier réseau : chaque sauvegarde y sera recopiée
          automatiquement.
        </Bandeau>
      ) : !e.accessible ? (
        <Bandeau ton="danger" titre="Destination injoignable">
          {e.destination} — {e.motif ?? 'dossier inaccessible'}. Si c’est une clé USB, rebranchez-la ;
          la copie repartira à la prochaine sauvegarde.
        </Bandeau>
      ) : e.enRetard ? (
        <Bandeau ton="attention" titre="Aucune copie récente">
          {e.derniereCopie
            ? `Dernière copie il y a ${e.joursDepuis} jour${(e.joursDepuis ?? 0) > 1 ? 's' : ''}.`
            : 'Aucune copie n’a encore été faite vers cette destination.'}
        </Bandeau>
      ) : (
        <Bandeau ton="succes" titre="Vos données sont copiées hors de ce poste">
          Dernière copie {depuis(e.derniereCopie!)}.
        </Bandeau>
      )}

      <dl className="liste-definitions" style={{ marginTop: 12 }}>
        <dt>Destination</dt>
        <dd>{e.destination ?? 'Non configurée'}</dd>
        <dt>Dernière copie</dt>
        <dd>{e.derniereCopie ? dateCourte(e.derniereCopie) : '—'}</dd>
        <dt>Seuil d’alerte</dt>
        <dd>{e.seuilJours > 0 ? `${e.seuilJours} jours` : 'Désactivé'}</dd>
        <dt>État</dt>
        <dd>
          <Etiquette ton={ton}>
            {!e.configuree
              ? 'Non protégé'
              : !e.accessible
                ? 'Injoignable'
                : e.enRetard
                  ? 'En retard'
                  : 'À jour'}
          </Etiquette>
        </dd>
      </dl>
    </Panneau>
  )
}

/**
 * Contrôle d'impression.
 *
 * Sur un comptoir à deux ou trois imprimantes, un réglage ne se vérifie pas en
 * lisant un nom dans une liste : il se vérifie en regardant sortir la feuille.
 */
function TestImpression({ enregistre }: { enregistre: boolean }) {
  const action = useAction()
  const notifications = useNotifications()

  async function tester(format: 'ticket' | 'a5' | 'a4'): Promise<void> {
    const r = await action.executer<{ imprime: boolean; imprimante: string | null; motif?: string }>(
      'impression.tester',
      { format }
    )
    if (!r) return
    if (r.imprime) notifications.succes('Page envoyée', r.imprimante ?? 'imprimante par défaut')
    else notifications.attention('Rien n’est parti', r.motif ?? 'Impression directe désactivée.')
  }

  return (
    <div className="rangee espace">
      <span style={{ fontSize: 12, color: 'var(--texte-attenue)' }}>
        {enregistre
          ? 'Envoie une page de contrôle pour vérifier le réglage.'
          : 'Enregistrez d’abord vos modifications : le test utilise les valeurs enregistrées.'}
      </span>
      <div className="rangee">
        <Bouton compact disabled={!enregistre} enCours={action.enCours} onClick={() => tester('ticket')}>
          Tester le ticket
        </Bouton>
        <Bouton compact disabled={!enregistre} enCours={action.enCours} onClick={() => tester('a4')}>
          Tester l’A4
        </Bouton>
      </div>
    </div>
  )
}
