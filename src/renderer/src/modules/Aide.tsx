/**
 * Guide d'utilisation, tel qu'il est lu dans le logiciel et imprimé en PDF.
 *
 * Une seule source pour les deux : le document remis au pharmacien et l'écran
 * d'aide ne peuvent pas se contredire, et une correction se fait une fois.
 *
 * Il ne contient AUCUNE information technique. Un pharmacien n'a pas à savoir
 * comment ses données sont rangées, ni où. Il a besoin de savoir quoi faire,
 * dans quel ordre, et quoi regarder quand quelque chose ne va pas.
 */
import { useEffect, useState } from 'react'
import { EntetePage } from '../ui/Composants'

interface Section {
  cle: string
  titre: string
  contenu: React.ReactNode
}

const EDITEUR = {
  societe: 'GLOBALTECH BUSINESS TD',
  siege: 'Siège : Moursal, Avenue Goukouni Weddey — N’Djamena, Tchad'
}

const SECTIONS: Section[] = [
  {
    cle: 'debuter',
    titre: 'Commencer',
    contenu: (
      <>
        <p>
          À la première ouverture, le logiciel vous demande le nom de votre pharmacie et vous fait
          créer votre compte. Choisissez un mot de passe que vous n’oublierez pas : personne ne
          peut le retrouver à votre place.
        </p>
        <p>
          Ensuite, chaque matin, vous entrez votre identifiant et votre mot de passe. Cochez
          <strong> Se souvenir de moi</strong> pour ne plus retaper votre identifiant.
        </p>
        <p>
          Trois choses à faire avant de vendre, dans cet ordre : créer vos produits, enregistrer
          une réception pour remplir le stock, ouvrir la caisse.
        </p>
      </>
    )
  },
  {
    cle: 'ecran',
    titre: 'Se repérer dans l’écran',
    contenu: (
      <>
        <p>
          <strong>À gauche</strong>, la liste des modules. Chacun a sa couleur : au bout de
          quelques jours, vous visez la couleur avant de lire le mot.
        </p>
        <p>
          <strong>En haut</strong>, la recherche générale. Tapez le nom d’un produit, d’un client
          ou le numéro d’une vente. Le raccourci est <strong>Ctrl + K</strong>.
        </p>
        <p>
          <strong>En bas</strong>, les touches de fonction. Elles changent selon l’écran, et elles
          vont plus vite que la souris. <strong>F2</strong> lance toujours une nouvelle vente.
        </p>
        <p>
          Tout en bas, une ligne rappelle en permanence l’état de votre caisse et le total du
          jour.
        </p>
      </>
    )
  },
  {
    cle: 'journee',
    titre: 'Votre journée en trois gestes',
    contenu: (
      <>
        <p>
          <strong>Le matin</strong> — vous ouvrez la caisse en indiquant l’argent présent dans le
          tiroir.
        </p>
        <p>
          <strong>Dans la journée</strong> — vous vendez. Le logiciel suit le stock et l’argent
          tout seul.
        </p>
        <p>
          <strong>Le soir</strong> — vous comptez le tiroir et vous clôturez. Le logiciel vous dit
          s’il manque quelque chose.
        </p>
      </>
    )
  },
  {
    cle: 'vendre',
    titre: 'Vendre',
    contenu: (
      <>
        <p>
          Appuyez sur <strong>F2</strong>. Tapez les premières lettres du produit, ou passez la
          boîte devant le lecteur de codes-barres : elle s’ajoute au panier toute seule.
        </p>
        <p>
          Pour changer une quantité, cliquez dessus et tapez le nombre. Pour retirer une ligne,
          cliquez sur la croix au bout.
        </p>
        <p>
          Quand le panier est complet, appuyez sur <strong>Encaisser</strong>. Choisissez comment
          le client paie : espèces, mobile money, carte, ou plusieurs à la fois. Les boutons de
          monnaie courante vous évitent de taper le montant.
        </p>
        <p>
          Si le client ne paie pas tout, la différence devient un <strong>crédit</strong>. Il faut
          alors avoir choisi un client : c’est ce qui permet de savoir qui vous doit quoi.
        </p>
        <p>
          Le ticket s’imprime après la vente. Vous pouvez aussi choisir une facture A5 ou A4 depuis
          l’historique des ventes.
        </p>
        <p>
          Une vente enregistrée par erreur s’annule depuis l’historique. Le stock revient
          automatiquement, et l’annulation reste inscrite dans le journal.
        </p>
      </>
    )
  },
  {
    cle: 'produits',
    titre: 'Vos produits',
    contenu: (
      <>
        <p>
          Le logiciel connaît déjà des centaines de médicaments et d’articles courants. Dans
          <strong> Produits</strong>, cliquez sur <strong>Ajouter un produit</strong> et tapez
          trois lettres : choisissez la fiche proposée et tout se remplit — nom, principe actif,
          dosage, forme.
        </p>
        <p>
          Il ne vous reste que vos prix. Dès que vous saisissez le prix d’achat, le logiciel
          propose un prix de vente selon votre marge habituelle. Vous le modifiez librement.
        </p>
        <p>
          Le <strong>seuil minimum</strong> est important : en dessous, le produit apparaît dans
          les alertes. Mettez-y la quantité en dessous de laquelle vous devez recommander.
        </p>
        <p>
          Si un produit n’est pas dans la liste proposée, saisissez-le à la main : rien ne vous en
          empêche.
        </p>
        <p>
          Pour enregistrer un code-barres, ouvrez la fiche et passez simplement la boîte devant le
          lecteur : le code se range tout seul.
        </p>
      </>
    )
  },
  {
    cle: 'achats',
    titre: 'Recevoir une commande',
    contenu: (
      <>
        <p>
          Allez dans <strong>Achats</strong> et créez une réception. Choisissez le fournisseur,
          ajoutez les produits reçus avec leur quantité et leur prix d’achat.
        </p>
        <p>
          Pour chaque produit, indiquez le <strong>numéro de lot</strong> et la
          <strong> date de péremption</strong> figurant sur la boîte. C’est ce qui permet au
          logiciel de vous avertir avant qu’un produit ne périme, et de retrouver un lot en cas de
          rappel.
        </p>
        <p>
          Validez : le stock est mis à jour. Si vous n’avez pas tout payé, le reste apparaît comme
          dette fournisseur, et vous l’enregistrez plus tard depuis la fiche du fournisseur.
        </p>
      </>
    )
  },
  {
    cle: 'stock',
    titre: 'Votre stock',
    contenu: (
      <>
        <p>
          <strong>Stock</strong> montre ce que vous avez, produit par produit, avec la date de
          péremption la plus proche. Les filtres en haut isolent les ruptures et les stocks
          faibles.
        </p>
        <p>
          Quand vous vendez, le logiciel sort d’abord le lot qui périme le plus tôt. Vous n’avez
          rien à surveiller : c’est fait à chaque vente.
        </p>
        <p>
          <strong>Péremptions</strong> liste ce qui approche de la date limite. Écoulez ces
          produits en priorité, ou retirez-les du rayon.
        </p>
        <p>
          <strong>Inventaire</strong> sert à remettre les compteurs d’aplomb. Vous ouvrez une
          session, vous comptez les rayons, vous saisissez les quantités réelles, vous validez. Le
          logiciel corrige le stock et garde la trace des écarts.
        </p>
      </>
    )
  },
  {
    cle: 'clients',
    titre: 'Vos clients et leurs crédits',
    contenu: (
      <>
        <p>
          Créez une fiche client pour toute personne à qui vous faites crédit. Un client de
          passage qui paie comptant n’a pas besoin de fiche.
        </p>
        <p>
          Vous pouvez fixer un <strong>plafond de crédit</strong> : le logiciel vous avertit quand
          il est dépassé.
        </p>
        <p>
          La fiche d’un client montre ce qu’il doit et l’historique de ses achats. Le
          <strong> relevé de compte</strong> s’imprime et se remet au client : chaque ligne, chaque
          règlement, et le solde.
        </p>
        <p>
          Quand il vient payer, ouvrez sa fiche et enregistrez le règlement. Le solde se met à jour
          aussitôt.
        </p>
      </>
    )
  },
  {
    cle: 'caisse',
    titre: 'La caisse',
    contenu: (
      <>
        <p>
          Ouvrir la caisse, c’est déclarer l’argent présent dans le tiroir au début de la journée.
          Clôturer, c’est compter ce qui reste le soir.
        </p>
        <p>
          Entre les deux, le logiciel calcule ce qui <em>devrait</em> s’y trouver : l’argent du
          matin, plus les ventes en espèces, moins les sorties et les dépenses payées en liquide.
        </p>
        <p>
          À la clôture, vous saisissez le montant compté. S’il y a un écart, le logiciel vous
          demande de l’expliquer avant d’accepter. C’est ce qui permet de retrouver une erreur de
          monnaie ou une vente oubliée — et de savoir qui tenait le comptoir.
        </p>
        <p>
          Si vous sortez de l’argent du tiroir pour payer un livreur, enregistrez-le comme
          mouvement de caisse. Sinon, l’écart apparaîtra le soir sans explication.
        </p>
      </>
    )
  },
  {
    cle: 'finances',
    titre: 'Vos dépenses et vos résultats',
    contenu: (
      <>
        <p>
          <strong>Finances</strong> sert à enregistrer ce que vous payez : loyer, électricité,
          transport, salaires. Classez chaque dépense dans sa catégorie.
        </p>
        <p>
          <strong>Rapports</strong> vous donne l’activité sur la période de votre choix : ce que
          vous avez vendu, ce qui part le mieux, la valeur de votre stock. Chaque rapport
          s’imprime et s’exporte vers un tableur.
        </p>
      </>
    )
  },
  {
    cle: 'donnees',
    titre: 'Protéger vos données',
    contenu: (
      <>
        <p>
          Le logiciel enregistre une sauvegarde à chaque fermeture, et en conserve trente. Vos
          données sont verrouillées sur cet ordinateur : si quelqu’un copie le fichier et
          l’emporte, il ne pourra rien en lire.
        </p>
        <p>
          <strong>Cela ne suffit pas.</strong> Un vol, un incendie ou une panne emporte
          l’ordinateur <em>et</em> ses sauvegardes. Branchez une clé USB ou un disque externe, et
          indiquez-le une fois dans <strong>Paramètres → Licence et données → Copie hors de cette
          machine</strong>. Chaque sauvegarde y sera recopiée automatiquement.
        </p>
        <p>
          Le logiciel vous alerte si aucune copie n’a quitté l’ordinateur depuis plusieurs jours.
          Ne négligez pas cette alerte.
        </p>
        <p>
          Pour revenir en arrière, choisissez une sauvegarde et restaurez-la. Une copie de l’état
          actuel est prise avant, par sécurité. Une sauvegarde se restaure aussi sur un autre
          ordinateur : c’est ce qui vous sauve le jour où le premier ne démarre plus.
        </p>
      </>
    )
  },
  {
    cle: 'equipe',
    titre: 'Votre équipe',
    contenu: (
      <>
        <p>
          Créez un compte par personne. Ne partagez jamais un compte : c’est le nom de
          l’utilisateur qui apparaît sur chaque vente et dans le journal.
        </p>
        <p>
          Quatre rôles existent. Le <strong>caissier</strong> vend et tient la caisse. Le
          <strong> pharmacien</strong> gère en plus les produits, le stock et les achats. Le
          <strong> gestionnaire</strong> consulte et suit les finances. L’<strong>administrateur
          </strong> a tous les droits.
        </p>
        <p>
          Vous pouvez retirer un droit précis à une personne sans changer son rôle.
        </p>
        <p>
          <strong>Journal d’activité</strong> conserve la trace de ce qui a été fait, par qui et
          quand. Consultez-le quand quelque chose vous surprend.
        </p>
      </>
    )
  },
  {
    cle: 'reglages',
    titre: 'Régler le logiciel à votre main',
    contenu: (
      <>
        <p>
          Dans <strong>Paramètres → Règles</strong>, vous ajustez le comportement du logiciel :
          délai d’alerte avant péremption, remise maximale autorisée, marge proposée, format
          d’impression par défaut, écart de caisse toléré.
        </p>
        <p>
          Le bouton de votre nom, en haut à droite, permet de changer les couleurs et la densité de
          l’affichage. La disposition <strong>Tactile</strong> agrandit les boutons pour un écran
          tactile ; la <strong>Compacte</strong> affiche plus de lignes.
        </p>
        <p>
          Votre écran se verrouille tout seul après quelques minutes d’inactivité. Votre mot de
          passe le rouvre, sans rien perdre de ce qui était en cours.
        </p>
      </>
    )
  },
  {
    cle: 'licence',
    titre: 'Activer votre logiciel',
    contenu: (
      <>
        <p>
          Sans activation, le logiciel fonctionne en démonstration : dix ventes par jour, et les
          rapports ne sont pas accessibles. Tout le reste fonctionne, pour que vous puissiez le
          juger.
        </p>
        <p>
          Pour activer : <strong>Paramètres → Licence et données</strong>. Communiquez à
          {' ' + EDITEUR.societe} le <strong>code d’installation</strong> qui s’y affiche.
          Vous recevrez une clé à coller au même endroit.
        </p>
        <p>
          Aucune connexion Internet n’est nécessaire. Notez ce code quelque part : il vous sera
          redemandé si vous changez d’ordinateur.
        </p>
      </>
    )
  },
  {
    cle: 'majs',
    titre: 'Mettre à jour',
    contenu: (
      <>
        <p>
          Le logiciel vous signale qu’une nouvelle version existe. Rien ne s’installe sans votre
          accord et jamais au milieu d’une vente.
        </p>
        <p>
          Vous téléchargez quand votre connexion le permet, puis vous installez quand le comptoir
          est libre. Vos données ne sont pas touchées.
        </p>
        <p>Sans Internet, votre fournisseur vous remet la mise à jour sur une clé USB.</p>
      </>
    )
  },
  {
    cle: 'soucis',
    titre: 'En cas de souci',
    contenu: (
      <>
        <p>
          <strong>Le lecteur de codes-barres n’ajoute rien.</strong> Vérifiez que vous êtes bien
          sur l’écran de vente et qu’aucune fenêtre n’est ouverte par-dessus. Si le code est
          inconnu, enregistrez-le dans la fiche du produit.
        </p>
        <p>
          <strong>Le ticket ne sort pas.</strong> Vérifiez que l’imprimante est allumée et
          sélectionnée dans les paramètres d’impression.
        </p>
        <p>
          <strong>Il manque de l’argent à la clôture.</strong> Regardez si une sortie de caisse ou
          une dépense payée en liquide n’a pas été oubliée.
        </p>
        <p>
          <strong>Un produit ne se vend pas.</strong> Son stock est peut-être à zéro, son lot
          périmé, ou il a été retiré de la vente. La fiche du produit vous le dira.
        </p>
        <p>
          <strong>Le logiciel refuse d’ouvrir vos données.</strong> Cela arrive si le fichier vient
          d’un autre ordinateur. Restaurez une sauvegarde.
        </p>
        <p>
          <strong>Mot de passe oublié.</strong> Un administrateur peut le réinitialiser. Si c’est
          le seul administrateur, contactez {EDITEUR.societe}.
        </p>
      </>
    )
  }
]

export default function Aide() {
  const [ouverte, setOuverte] = useState<string | null>(SECTIONS[0]!.cle)

  // Les tickets et les factures font disparaître toute l'application quand on
  // imprime. Le guide, lui, EST l'écran : cette marque annule cette règle, et
  // seulement tant que le guide est ouvert.
  useEffect(() => {
    document.body.classList.add('guide-imprimable')
    return () => document.body.classList.remove('guide-imprimable')
  }, [])

  return (
    <>
      <EntetePage
        titre="Guide d’utilisation"
        actions={
          <button type="button" className="bouton" onClick={() => window.print()}>
            Imprimer le guide
          </button>
        }
      />

      <div className="guide">
        <div className="guide-entete">
          <h1>PHARMINA — Guide d’utilisation</h1>
          <p className="guide-editeur">{EDITEUR.societe}</p>
          <p className="guide-siege">{EDITEUR.siege}</p>
          <p className="guide-intro">
            Ce guide se lit en une demi-heure. Il explique chaque fonction du logiciel, dans
            l’ordre où vous les rencontrerez. Gardez-le à portée de main les premiers jours.
          </p>
        </div>

        {SECTIONS.map((section, index) => (
          <section key={section.cle} className="guide-section">
            <button
              type="button"
              className="guide-titre"
              onClick={() => setOuverte((c) => (c === section.cle ? null : section.cle))}
            >
              <span className="guide-numero">{index + 1}</span>
              <span>{section.titre}</span>
            </button>
            <div
              className={`guide-contenu${ouverte === section.cle ? ' ouverte' : ''}`}
              aria-hidden={ouverte !== section.cle}
            >
              {section.contenu}
            </div>
          </section>
        ))}

        <div className="guide-pied">
          <p>
            <strong>{EDITEUR.societe}</strong>
          </p>
          <p>{EDITEUR.siege}</p>
        </div>
      </div>
    </>
  )
}
