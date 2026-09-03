import type { ApercuCompte, LigneReleve, Pharmacie, VenteDetail } from '@shared/types'
import { dateCourte, heure, modePaiement, montant, nombre } from '../lib/format'
import { barresEan13 } from '../lib/ean13'

/**
 * Documents imprimés.
 *
 * Ils sont volontairement sobres et sans aplat de couleur : une imprimante
 * thermique ne restitue que du noir, et une facture doit rester lisible
 * photocopiée.
 */

function EnteteOfficine({ pharmacie, compact }: { pharmacie: Pharmacie; compact?: boolean }) {
  return (
    <header className={compact ? 'doc-entete compact' : 'doc-entete'}>
      <strong className="doc-nom">{pharmacie.nom}</strong>
      {pharmacie.raison_sociale && !compact ? <div>{pharmacie.raison_sociale}</div> : null}
      <div>{[pharmacie.adresse, pharmacie.ville, pharmacie.pays].filter(Boolean).join(' · ')}</div>
      {pharmacie.telephone ? <div>Tél. {pharmacie.telephone}</div> : null}
      {pharmacie.registre_commerce && !compact ? <div>RC {pharmacie.registre_commerce}</div> : null}
    </header>
  )
}

// ---------------------------------------------------------------------------
// Ticket de caisse (rouleau 80 mm)
// ---------------------------------------------------------------------------

export function TicketDeCaisse({
  vente,
  pharmacie,
  clientNom,
  pied,
  copie
}: {
  vente: VenteDetail
  pharmacie: Pharmacie
  clientNom?: string | null
  /** Message de bas de ticket, réglable dans les paramètres. */
  pied?: string
  copie?: string
}) {
  const regles = vente.paiements.filter((p) => p.mode !== 'credit')
  const credit = vente.paiements.find((p) => p.mode === 'credit')

  return (
    <div className="doc-ticket">
      <EnteteOfficine pharmacie={pharmacie} compact />

      <div className="doc-separateur" />

      <div className="doc-meta">
        <div>
          <span>Ticket</span>
          <strong>{vente.reference}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>
            {dateCourte(vente.at)} {heure(vente.at)}
          </strong>
        </div>
        <div>
          <span>Servi par</span>
          <strong>{vente.utilisateur ?? '—'}</strong>
        </div>
        {clientNom ? (
          <div>
            <span>Client</span>
            <strong>{clientNom}</strong>
          </div>
        ) : null}
      </div>

      <div className="doc-separateur" />

      <table className="doc-lignes">
        <tbody>
          {vente.lignes.map((l) => (
            <tr key={l.id}>
              <td className="doc-designation">
                {l.designation}
                <span className="doc-detail">
                  {nombre(l.quantite)} × {montant(l.prix_unitaire, false)}
                  {l.numero_lot ? ` · lot ${l.numero_lot}` : ''}
                </span>
              </td>
              <td className="doc-montant">{montant(l.montant, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-separateur" />

      <table className="doc-totaux">
        <tbody>
          {vente.remise > 0 ? (
            <>
              <tr>
                <td>Sous-total</td>
                <td>{montant(vente.sous_total, false)}</td>
              </tr>
              <tr>
                <td>Remise</td>
                <td>− {montant(vente.remise, false)}</td>
              </tr>
            </>
          ) : null}
          <tr className="doc-total">
            <td>TOTAL</td>
            <td>{montant(vente.total)}</td>
          </tr>
          {regles.map((p, i) => (
            <tr key={i}>
              <td>{modePaiement(p.mode)}</td>
              <td>{montant(p.montant, false)}</td>
            </tr>
          ))}
          {vente.monnaie_rendue > 0 ? (
            <tr>
              <td>Rendu</td>
              <td>{montant(vente.monnaie_rendue, false)}</td>
            </tr>
          ) : null}
          {credit ? (
            <tr className="doc-souligne">
              <td>Reste dû (crédit)</td>
              <td>{montant(credit.montant, false)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {vente.taxe > 0 ? (
        <div className="doc-mention">Dont TVA {montant(vente.taxe, false)} — prix TTC</div>
      ) : null}

      <div className="doc-separateur" />

      <div className="doc-pied">
        {credit ? <div className="doc-avis">Somme portée au compte client.</div> : null}
        <div>Les médicaments ne sont ni repris ni échangés.</div>
        <div>Conservez ce ticket.</div>
        <div className="doc-marque">{pied || 'Merci de votre visite'}</div>
        {copie ? <div className="doc-avis">{copie}</div> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Facture (A4 ou A5)
// ---------------------------------------------------------------------------

/**
 * Facture d'une vente.
 *
 * Même document en A4 et en A5 : seule la feuille de style resserre la
 * typographie. Une facture tronquée sur un demi-format n'aurait aucune valeur,
 * donc rien n'est retiré du contenu.
 */
export function FactureVente({
  vente,
  pharmacie,
  clientNom,
  clientTelephone,
  clientAdresse,
  duplicata
}: {
  vente: VenteDetail
  pharmacie: Pharmacie
  clientNom?: string | null
  clientTelephone?: string | null
  clientAdresse?: string | null
  duplicata?: boolean
}) {
  const regles = vente.paiements.filter((p) => p.mode !== 'credit')
  const credit = vente.paiements.find((p) => p.mode === 'credit')

  return (
    <div className="doc-page">
      <div className="doc-page-entete">
        <EnteteOfficine pharmacie={pharmacie} />
        <div className="doc-page-titre">
          <h1>{duplicata ? 'Facture (duplicata)' : 'Facture'}</h1>
          <div>
            N° <strong>{vente.reference}</strong>
          </div>
          <div>
            {dateCourte(vente.at)} à {heure(vente.at)}
          </div>
          <div>Servi par {vente.utilisateur ?? '—'}</div>
        </div>
      </div>

      <section className="doc-encadre">
        <div>
          <span>Client</span>
          <strong>{clientNom ?? 'Client de passage'}</strong>
        </div>
        <div>
          <span>Téléphone</span>
          <strong>{clientTelephone ?? '—'}</strong>
        </div>
        <div>
          <span>Adresse</span>
          <strong>{clientAdresse ?? '—'}</strong>
        </div>
        <div>
          <span>Règlement</span>
          <strong>
            {regles.length ? regles.map((p) => modePaiement(p.mode)).join(' + ') : 'Crédit'}
          </strong>
        </div>
      </section>

      <table className="doc-tableau">
        <thead>
          <tr>
            <th>Désignation</th>
            <th>Lot</th>
            <th className="droite">Qté</th>
            <th className="droite">P.U.</th>
            <th className="droite">Remise</th>
            <th className="droite">Montant</th>
          </tr>
        </thead>
        <tbody>
          {vente.lignes.map((l) => (
            <tr key={l.id}>
              <td>{l.designation}</td>
              <td>{l.numero_lot ?? '—'}</td>
              <td className="droite">{nombre(l.quantite)}</td>
              <td className="droite">{montant(l.prix_unitaire, false)}</td>
              <td className="droite">{l.remise > 0 ? montant(l.remise, false) : '—'}</td>
              <td className="droite">{montant(l.montant, false)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Total à payer</td>
            <td className="droite">{montant(vente.total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="doc-recapitulatif">
        <div className="doc-mentions">
          {vente.taxe > 0 ? <div>Prix TTC. Dont TVA : {montant(vente.taxe)}.</div> : null}
          <div>Les médicaments ne sont ni repris ni échangés.</div>
          {credit ? (
            <div className="doc-avis">
              Somme de {montant(credit.montant)} portée au compte du client.
            </div>
          ) : null}
        </div>

        <table className="doc-totaux-page">
          <tbody>
            <tr>
              <td>Sous-total</td>
              <td>{montant(vente.sous_total, false)}</td>
            </tr>
            {vente.remise > 0 ? (
              <tr>
                <td>Remise</td>
                <td>− {montant(vente.remise, false)}</td>
              </tr>
            ) : null}
            <tr className="doc-total-page">
              <td>Total</td>
              <td>{montant(vente.total)}</td>
            </tr>
            {regles.map((p, i) => (
              <tr key={i}>
                <td>{modePaiement(p.mode)}</td>
                <td>{montant(p.montant, false)}</td>
              </tr>
            ))}
            {vente.monnaie_rendue > 0 ? (
              <tr>
                <td>Monnaie rendue</td>
                <td>{montant(vente.monnaie_rendue, false)}</td>
              </tr>
            ) : null}
            {credit ? (
              <tr className="doc-total-page">
                <td>Reste dû</td>
                <td>{montant(credit.montant, false)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="doc-signature">
        <div>
          <span>Le client</span>
          <div className="doc-trait" />
        </div>
        <div>
          <span>Pour la pharmacie</span>
          <div className="doc-trait" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Relevé de compte client (A4)
// ---------------------------------------------------------------------------

export function ReleveDeCompte({
  compte,
  lignes,
  pharmacie,
  periode
}: {
  compte: ApercuCompte
  lignes: LigneReleve[]
  pharmacie: Pharmacie
  periode?: string
}) {
  const solde = lignes.length ? lignes[lignes.length - 1]!.solde : 0

  return (
    <div className="doc-page">
      <div className="doc-page-entete">
        <EnteteOfficine pharmacie={pharmacie} />
        <div className="doc-page-titre">
          <h1>Relevé de compte</h1>
          <div>Édité le {dateCourte(new Date().toISOString())}</div>
          {periode ? <div>{periode}</div> : null}
        </div>
      </div>

      <section className="doc-encadre">
        <div>
          <span>Client</span>
          <strong>{compte.nom}</strong>
        </div>
        {compte.telephone ? (
          <div>
            <span>Téléphone</span>
            <strong>{compte.telephone}</strong>
          </div>
        ) : null}
        <div>
          <span>Plafond de crédit</span>
          <strong>{compte.plafond > 0 ? montant(compte.plafond) : 'Aucun'}</strong>
        </div>
        <div>
          <span>Solde dû</span>
          <strong>{montant(solde)}</strong>
        </div>
      </section>

      <table className="doc-tableau">
        <thead>
          <tr>
            <th>Date</th>
            <th>Référence</th>
            <th>Libellé</th>
            <th className="droite">Débit</th>
            <th className="droite">Crédit</th>
            <th className="droite">Solde</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 ? (
            <tr>
              <td colSpan={6} className="doc-vide">
                Aucun mouvement sur ce compte.
              </td>
            </tr>
          ) : (
            lignes.map((l, i) => (
              <tr key={i}>
                <td>{dateCourte(l.at)}</td>
                <td>{l.reference}</td>
                <td>{l.libelle}</td>
                <td className="droite">{l.debit > 0 ? montant(l.debit, false) : ''}</td>
                <td className="droite">{l.credit > 0 ? montant(l.credit, false) : ''}</td>
                <td className="droite">{montant(l.solde, false)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Solde restant dû</td>
            <td className="droite">{montant(solde)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="doc-signature">
        <div>
          <span>Le client</span>
          <div className="doc-trait" />
        </div>
        <div>
          <span>Pour la pharmacie</span>
          <div className="doc-trait" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Document générique : un tableau imprimé (rapports, listes)
// ---------------------------------------------------------------------------

export function DocumentTableau({
  titre,
  sousTitre,
  pharmacie,
  colonnes,
  lignes,
  totaux
}: {
  titre: string
  sousTitre?: string
  pharmacie: Pharmacie
  colonnes: { entete: string; droite?: boolean }[]
  lignes: (string | number)[][]
  totaux?: (string | number)[]
}) {
  return (
    <div className="doc-page">
      <div className="doc-page-entete">
        <EnteteOfficine pharmacie={pharmacie} />
        <div className="doc-page-titre">
          <h1>{titre}</h1>
          {sousTitre ? <div>{sousTitre}</div> : null}
          <div>Édité le {dateCourte(new Date().toISOString())}</div>
        </div>
      </div>

      <table className="doc-tableau">
        <thead>
          <tr>
            {colonnes.map((c, i) => (
              <th key={i} className={c.droite ? 'droite' : undefined}>
                {c.entete}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 ? (
            <tr>
              <td colSpan={colonnes.length} className="doc-vide">
                Aucune donnée sur cette période.
              </td>
            </tr>
          ) : (
            lignes.map((ligne, i) => (
              <tr key={i}>
                {ligne.map((cellule, j) => (
                  <td key={j} className={colonnes[j]?.droite ? 'droite' : undefined}>
                    {cellule}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {totaux ? (
          <tfoot>
            <tr>
              {totaux.map((cellule, i) => (
                <td key={i} className={colonnes[i]?.droite ? 'droite' : undefined}>
                  {cellule}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Planche d'étiquettes code-barres (A4)
// ---------------------------------------------------------------------------

/**
 * Dix étiquettes par feuille A4 : deux colonnes, cinq rangées.
 *
 * POURQUOI CE DÉCOUPAGE
 *
 * Une A4 fait 210 mm de large. Deux colonnes laissent 95 mm par étiquette,
 * de quoi imprimer un EAN-13 à sa taille nominale — 37,3 mm — avec de la
 * marge. Cinq rangées donnent 55 mm de hauteur : le nom du produit tient sur
 * deux lignes sans rogner les barres.
 *
 * On pourrait en mettre vingt-quatre, comme les planches d'étiquettes
 * autocollantes du commerce. Ce serait une fausse économie : à cette taille
 * les barres passent sous le seuil de lecture d'une douchette d'entrée de
 * gamme, et une étiquette qu'on doit scanner trois fois ne fait gagner de
 * papier à personne.
 *
 * LE TRAIT DE COUPE
 *
 * Chaque étiquette porte un cadre gris clair. Il ne s'imprime pas pour faire
 * joli : sans repère, découper droit dix étiquettes aux ciseaux est
 * impossible, et une étiquette de travers se colle de travers.
 */
export function PlancheEtiquettes({
  etiquettes,
  pharmacie
}: {
  etiquettes: {
    code: string
    nom: string
    dosage?: string | null
    prixVente?: number | null
    emplacement?: string | null
  }[]
  pharmacie?: Pharmacie | null
}) {
  // Dix par feuille : on découpe en pages pour que chaque saut soit net.
  const PAR_FEUILLE = 10
  const feuilles: (typeof etiquettes)[] = []
  for (let i = 0; i < etiquettes.length; i += PAR_FEUILLE) {
    feuilles.push(etiquettes.slice(i, i + PAR_FEUILLE))
  }

  return (
    <div className="planche">
      {feuilles.map((feuille, indexFeuille) => (
        <section className="planche-feuille" key={indexFeuille}>
          {feuille.map((e, index) => (
            <article className="etiquette-code" key={`${e.code}-${index}`}>
              <div className="etiquette-nom">
                <strong>{e.nom}</strong>
                {e.dosage ? <span> {e.dosage}</span> : null}
              </div>

              <CodeBarres code={e.code} />

              <div className="etiquette-pied">
                {e.prixVente != null ? <strong>{montant(e.prixVente)}</strong> : <span />}
                {e.emplacement ? <span>{e.emplacement}</span> : null}
              </div>
              {pharmacie?.nom ? <div className="etiquette-officine">{pharmacie.nom}</div> : null}
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * Un EAN-13 dessiné en SVG.
 *
 * Les proportions suivent la norme : module de 0,33 mm, barres de 22,85 mm,
 * gardes descendant de 5 modules sous les chiffres. À cette taille, une
 * douchette lit du premier coup — c'est le seul critère qui compte.
 */
export function CodeBarres({ code, hauteur = 62 }: { code: string; hauteur?: number }) {
  const barres = barresEan13(code)

  if (!barres.length) {
    // Un code incohérent ne doit jamais produire un code-barres d'apparence
    // valide : une douchette y lirait un autre produit.
    return <div className="code-barres-invalide">Code-barres illisible : {code}</div>
  }

  const MODULE = 2
  const largeur = 95 * MODULE
  const basChiffres = 11
  const hauteurBarre = hauteur - basChiffres

  // Les chiffres se lisent en trois groupes, comme sur une boîte : le premier
  // hors du symbole, puis six et six de part et d'autre de la barre du milieu.
  return (
    <svg
      className="code-barres"
      viewBox={`-16 0 ${largeur + 24} ${hauteur}`}
      role="img"
      aria-label={`Code-barres ${code}`}
    >
      {barres.map((b, i) => (
        <rect
          key={i}
          x={b.x * MODULE}
          y={0}
          width={b.largeur * MODULE}
          height={b.garde ? hauteur - 3 : hauteurBarre}
          fill="#000"
        />
      ))}
      <text className="cb-chiffre" x={-13} y={hauteur - 1}>
        {code[0]}
      </text>
      <text className="cb-chiffre" x={24 * MODULE} y={hauteur - 1} textAnchor="middle">
        {code.slice(1, 7)}
      </text>
      <text className="cb-chiffre" x={71 * MODULE} y={hauteur - 1} textAnchor="middle">
        {code.slice(7)}
      </text>
    </svg>
  )
}
