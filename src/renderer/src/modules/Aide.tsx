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
  /** Regroupement affiché en intertitre : vingt sections en file seraient illisibles. */
  partie: string
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
    partie: 'Prendre en main',
    cle: 'debuter',
    titre: 'Première ouverture et connexion',
    contenu: (
      <>
        <p>
          À la toute première ouverture, le logiciel vous demande le nom de votre pharmacie, sa
          ville, son téléphone, et la monnaie que vous utilisez. Ces informations apparaîtront sur
          vos tickets et vos factures. La monnaie ne peut plus être changée ensuite : tous vos
          montants en dépendent.
        </p>
        <p>
          Vous créez ensuite votre compte d’administrateur : votre nom, un identifiant court et un
          mot de passe d’au moins huit caractères. Choisissez-le avec soin — personne ne peut le
          retrouver à votre place.
        </p>
        <p>
          Chaque matin, vous entrez votre identifiant et votre mot de passe. Cochez
          <strong> Se souvenir de moi</strong> : le logiciel retiendra votre identifiant, jamais
          votre mot de passe.
        </p>
        <p>
          Après cinq essais infructueux, le compte se bloque quelques minutes. C’est voulu : cela
          empêche quelqu’un d’essayer des mots de passe au hasard.
        </p>
      </>
    )
  },
  {
    partie: 'Prendre en main',
    cle: 'ecran',
    titre: 'Se repérer dans l’écran',
    contenu: (
      <>
        <p>
          <strong>À gauche</strong>, la liste des modules, rangés en trois familles : Exploitation
          (ce que vous faites tous les jours), Gestion (votre catalogue et votre stock),
          Administration. Chaque module a sa couleur : au bout de quelques jours, vous visez la
          couleur avant de lire le mot.
        </p>
        <p>
          Le bouton en haut à gauche replie la barre latérale quand vous avez besoin de place.
        </p>
        <p>
          <strong>En haut</strong>, la recherche générale. Tapez le nom d’un produit, d’un client,
          d’un fournisseur ou le numéro d’une vente : le logiciel cherche partout à la fois. Le
          raccourci est <strong>Ctrl + K</strong>.
        </p>
        <p>
          À côté, la cloche indique les alertes en cours, et le bouton de votre nom donne accès à
          votre compte, à votre mot de passe et à l’apparence du logiciel.
        </p>
        <p>
          <strong>En bas</strong>, les touches de fonction. Elles changent selon l’écran où vous
          êtes, et vont beaucoup plus vite que la souris. <strong>F5</strong> rafraîchit toujours
          l’écran ; <strong>F2</strong> lance l’action principale.
        </p>
        <p>
          La dernière ligne rappelle en permanence l’état de votre caisse, le nombre de ventes et
          le total du jour.
        </p>
      </>
    )
  },
  {
    partie: 'Prendre en main',
    cle: 'securite-poste',
    titre: 'Verrouiller votre poste',
    contenu: (
      <>
        <p>
          Après quelques minutes sans activité, l’écran se verrouille tout seul. Un client qui
          passe derrière le comptoir ne voit rien, et ne peut rien faire.
        </p>
        <p>
          Votre mot de passe le rouvre. Rien n’est perdu : le panier en cours, l’écran où vous
          étiez, tout revient tel quel.
        </p>
        <p>
          Le délai se règle dans les paramètres. Mettez-le à zéro pour désactiver le verrouillage,
          mais ne le faites que si vous êtes seul dans l’officine.
        </p>
      </>
    )
  },
  {
    partie: 'Vendre au quotidien',
    cle: 'caisse',
    titre: 'La caisse : ouvrir, suivre, clôturer',
    contenu: (
      <>
        <p>
          <strong>Ouvrir</strong> — le matin, comptez l’argent présent dans le tiroir et saisissez
          le montant. C’est le point de départ de la journée. Une seule caisse peut être ouverte à
          la fois.
        </p>
        <p>
          <strong>Pendant la journée</strong> — le logiciel calcule en permanence ce qui devrait se
          trouver dans le tiroir : l’argent du matin, plus les ventes réglées en espèces, moins les
          sorties et les dépenses payées en liquide.
        </p>
        <p>
          <strong>Les mouvements de caisse</strong> (<strong>F3</strong>) servent à enregistrer un
          retrait ou un apport : vous sortez 10 000 FCFA pour payer un livreur, vous ajoutez de la
          monnaie. Sans cela, l’écart apparaîtra le soir sans explication.
        </p>
        <p>
          <strong>Clôturer</strong> — le soir, comptez le tiroir et saisissez le montant réel. Le
          logiciel affiche l’écart. S’il dépasse la tolérance que vous avez fixée, une
          justification est obligatoire avant de valider.
        </p>
        <p>
          L’onglet <strong>Historique</strong> (<strong>F7</strong>) conserve toutes les sessions
          passées, avec leur écart et leur justification. C’est là qu’on regarde quand un manque se
          répète.
        </p>
      </>
    )
  },
  {
    partie: 'Vendre au quotidien',
    cle: 'vendre',
    titre: 'Vendre au comptoir',
    contenu: (
      <>
        <p>
          Ouvrez <strong>Ventes</strong>, onglet <strong>Comptoir</strong>. Tapez les premières
          lettres du produit — nom commercial, nom générique ou principe actif — ou passez la boîte
          devant le lecteur de codes-barres : elle s’ajoute au panier toute seule.
        </p>
        <p>
          Les produits sans stock apparaissent grisés. Le logiciel sert toujours en priorité le lot
          qui périme le plus tôt : vous n’avez rien à choisir.
        </p>
        <p>
          Dans le panier, cliquez sur une quantité pour la modifier, sur la croix pour retirer la
          ligne. <strong>F8</strong> vide le panier entier.
        </p>
        <p>
          <strong>F6</strong> applique une remise, en pourcentage ou en montant. Le logiciel refuse
          au-delà du plafond fixé dans les paramètres, et seuls les utilisateurs autorisés peuvent
          en accorder.
        </p>
        <p>
          <strong>Le client</strong> — choisissez-en un si la vente doit être rattachée à son
          compte, notamment pour un crédit. Sinon, la vente est enregistrée au comptoir.
        </p>
        <p>
          <strong>F9 encaisse.</strong> Indiquez comment le client paie : espèces, mobile money,
          carte bancaire, virement, chèque — ou plusieurs à la fois. Les boutons de monnaie
          courante évitent de taper le montant, et la monnaie à rendre s’affiche.
        </p>
        <p>
          Si le règlement est incomplet, la différence devient un <strong>crédit</strong> : un
          client est alors obligatoire, et le logiciel vous avertit si son plafond est dépassé.
        </p>
        <p>
          Le ticket s’imprime après la vente, ou automatiquement si vous l’avez réglé ainsi.
          <strong> F12</strong> réimprime le dernier ticket.
        </p>
        <p>
          Le logiciel vous avertit avant de valider si un produit exige une ordonnance, si un lot
          approche de sa péremption, ou si la quantité vendue est inhabituelle. Ce sont des
          avertissements, pas des blocages — sauf pour un produit déjà périmé, que le logiciel
          refuse de vendre.
        </p>
      </>
    )
  },
  {
    partie: 'Vendre au quotidien',
    cle: 'historique-ventes',
    titre: 'Retrouver et annuler une vente',
    contenu: (
      <>
        <p>
          Onglet <strong>Historique</strong> : toutes vos ventes, filtrables sur 7 jours, 30 jours
          ou depuis le début. Cliquez sur une ligne pour voir le détail — les produits, les lots
          servis, les règlements.
        </p>
        <p>
          <strong>F12</strong> réimprime le ticket de la vente sélectionnée. <strong>F8</strong> la
          réimprime en facture A4, utile pour un client qui a besoin d’un justificatif.
        </p>
        <p>
          Pour <strong>annuler</strong> une vente, ouvrez-la et choisissez l’annulation. Le stock
          revient automatiquement dans les lots d’origine, et l’opération est inscrite au journal
          avec son motif. Une vente annulée reste visible : elle n’est jamais effacée.
        </p>
      </>
    )
  },
  {
    partie: 'Vendre au quotidien',
    cle: 'tableau',
    titre: 'Le tableau de bord',
    contenu: (
      <>
        <p>
          C’est l’écran d’accueil. Il tient en entier dans la fenêtre : rien à faire défiler.
        </p>
        <p>
          <strong>En haut</strong>, cinq chiffres du jour : chiffre d’affaires, nombre de ventes,
          bénéfice estimé, dépenses, et argent en caisse.
        </p>
        <p>
          <strong>Points d’attention</strong> — ce qui demande une action : ruptures, stock faible,
          péremptions proches, sauvegardes non protégées, dettes fournisseurs, créances clients.
          Cliquez sur une ligne pour aller directement à l’écran concerné.
        </p>
        <p>
          <strong>La journée</strong> — panier moyen, articles vendus, ventes à crédit, et la
          comparaison avec hier et avec la moyenne des sept derniers jours.
        </p>
        <p>
          <strong>Meilleures ventes</strong> sur sept jours, <strong>dernières opérations</strong>
          {' '}et <strong>règlements du jour</strong> par mode de paiement complètent l’écran.
        </p>
      </>
    )
  },
  {
    partie: 'Catalogue et stock',
    cle: 'produits',
    titre: 'Vos produits',
    contenu: (
      <>
        <p>
          <strong>F2</strong> crée un produit. Le logiciel connaît déjà des centaines de
          médicaments et d’articles courants : tapez trois lettres, choisissez la fiche proposée, et
          tout se remplit — nom, principe actif, dosage, forme, catégorie, unité de vente, et si le
          produit exige une ordonnance.
        </p>
        <p>
          Il ne vous reste que vos prix. Dès que vous saisissez le prix d’achat, un prix de vente
          est proposé selon votre marge habituelle. Vous le modifiez librement, et la marge
          obtenue s’affiche.
        </p>
        <p>
          <strong>Le seuil minimum</strong> déclenche les alertes : mettez-y la quantité en dessous
          de laquelle vous devez recommander. L’<strong>emplacement</strong> (« Rayon A-12 ») fait
          gagner du temps au comptoir.
        </p>
        <p>
          <strong>Les codes-barres</strong> — ouvrez la fiche et passez la boîte devant le lecteur :
          le code se range tout seul. Un produit peut en avoir plusieurs, s’il existe en
          conditionnements différents.
        </p>
        <p>
          Les <strong>options avancées</strong> permettent d’indiquer qu’un article ne se périme pas
          (matériel, accessoire), de le retirer temporairement de la vente, ou de fixer un stock
          maximum au-delà duquel il sera signalé en surstock.
        </p>
        <p>
          La liste se filtre par état : tous, disponibles, stock faible, ruptures.
          <strong> F7</strong> isole les ruptures. Cliquez sur un produit pour ouvrir sa fiche :
          <strong> Général</strong>, <strong>Lots</strong> (chaque lot avec sa date et sa quantité),
          <strong> Historique</strong> des mouvements, et <strong>Statistiques</strong> de vente.
        </p>
        <p>
          Un produit ne se supprime pas : il s’archive. Ses ventes passées restent intactes.
        </p>
      </>
    )
  },
  {
    partie: 'Catalogue et stock',
    cle: 'achats',
    titre: 'Recevoir une commande',
    contenu: (
      <>
        <p>
          <strong>F2</strong> enregistre une réception. Choisissez le fournisseur, puis ajoutez
          chaque produit reçu avec sa quantité et son prix d’achat.
        </p>
        <p>
          Pour chaque ligne, saisissez le <strong>numéro de lot</strong> et la
          <strong> date de péremption</strong> inscrits sur la boîte. C’est ce qui permet au
          logiciel de vous avertir avant qu’un produit ne périme, de servir les lots dans le bon
          ordre, et de retrouver un lot précis en cas de rappel.
        </p>
        <p>
          Indiquez ce que vous avez payé et comment. La validation met le stock à jour, crée les
          lots, et met à jour le prix d’achat moyen de chaque produit.
        </p>
        <p>
          Ce qui reste dû apparaît comme <strong>dette fournisseur</strong>. Vous l’enregistrez plus
          tard, à tout moment, depuis la réception ou la fiche du fournisseur.
          <strong> F7</strong> montre les réceptions non soldées.
        </p>
        <p>
          <strong>F8</strong> ouvre la liste des <strong>produits à commander</strong> : le logiciel
          propose ce qui est en rupture ou sous le seuil, avec une quantité conseillée d’après vos
          ventes récentes. C’est votre bon de commande tout prêt.
        </p>
      </>
    )
  },
  {
    partie: 'Catalogue et stock',
    cle: 'fournisseurs',
    titre: 'Vos fournisseurs',
    contenu: (
      <>
        <p>
          Créez une fiche par fournisseur : nom, téléphone, adresse, contact. Vous en aurez besoin
          dès la première réception.
        </p>
        <p>
          La fiche montre tout ce que vous lui avez acheté et ce que vous lui devez encore. Les
          règlements s’enregistrent depuis cette fiche, et le solde se met à jour aussitôt.
        </p>
      </>
    )
  },
  {
    partie: 'Catalogue et stock',
    cle: 'stock',
    titre: 'Suivre votre stock',
    contenu: (
      <>
        <p>
          Onglet <strong>Par produit</strong> : ce que vous avez, produit par produit, avec le seuil
          d’alerte, le nombre de lots, la prochaine date de péremption et la valeur immobilisée. Les
          filtres isolent les ruptures (<strong>F7</strong>), le stock faible (<strong>F8</strong>),
          les disponibles et les surstocks.
        </p>
        <p>
          Chaque ligne offre trois actions : <strong>Lots</strong> pour voir le détail,
          <strong> Entrée</strong> et <strong>Sortie</strong> pour corriger à la main.
        </p>
        <p>
          Une <strong>sortie</strong> demande toujours un motif : perte ou casse, retrait pour
          péremption, retour au fournisseur, autre. C’est ce qui permet, plus tard, de savoir où le
          stock est parti.
        </p>
        <p>
          Onglet <strong>Mouvements</strong> (<strong>F9</strong>) : l’historique complet de tout ce
          qui est entré et sorti, filtrable par type — entrées, ventes, ajustements, inventaires,
          pertes. Chaque ligne porte la date, l’utilisateur et le motif.
        </p>
      </>
    )
  },
  {
    partie: 'Catalogue et stock',
    cle: 'peremptions',
    titre: 'Surveiller les péremptions',
    contenu: (
      <>
        <p>
          Cet écran liste les lots à surveiller, classés par urgence : déjà périmés, moins de sept
          jours, moins de trente jours, moins de quatre-vingt-dix jours. Le seuil d’alerte se règle
          dans les paramètres.
        </p>
        <p>
          <strong>F7</strong> montre les lots périmés, <strong>F8</strong> ceux qui le seront dans
          le mois.
        </p>
        <p>
          Un lot périmé ne peut pas être vendu : le logiciel refuse. Retirez-le du rayon avec une
          sortie de stock au motif « retrait pour péremption », pour que vos comptes restent justes.
        </p>
        <p>
          Vous pouvez aussi <strong>bloquer un lot</strong> sans le sortir — en cas de doute ou de
          rappel du fabricant. Il reste en stock mais devient invendable.
        </p>
      </>
    )
  },
  {
    partie: 'Catalogue et stock',
    cle: 'inventaire',
    titre: 'Faire un inventaire',
    contenu: (
      <>
        <p>
          L’inventaire remet vos compteurs d’aplomb : il compare ce que le logiciel croit avoir avec
          ce qui est réellement dans les rayons.
        </p>
        <p>
          <strong>F2</strong> ouvre une session. Choisissez son étendue : tout le stock, une
          catégorie, ou un emplacement. Un inventaire par rayon se fait en quinze minutes, sans
          fermer l’officine.
        </p>
        <p>
          Comptez, puis saisissez les quantités réelles. Le logiciel affiche l’écart au fur et à
          mesure. Vous pouvez interrompre et reprendre plus tard : la session reste ouverte.
        </p>
        <p>
          À la validation, le stock est corrigé et chaque écart est enregistré comme mouvement, avec
          la date et votre nom. Rien ne disparaît en silence.
        </p>
      </>
    )
  },
  {
    partie: 'Clients et argent',
    cle: 'clients',
    titre: 'Vos clients et leurs crédits',
    contenu: (
      <>
        <p>
          <strong>F2</strong> crée un client : nom, téléphone, adresse. Créez une fiche pour toute
          personne à qui vous faites crédit. Un client de passage qui paie comptant n’en a pas
          besoin.
        </p>
        <p>
          Le <strong>plafond de crédit</strong> est facultatif mais utile : au-delà, le logiciel
          vous avertit au moment d’encaisser. Vous restez libre de passer outre.
        </p>
        <p>
          La fiche a trois onglets. <strong>Compte</strong> montre ce qu’il doit et l’historique de
          ses achats. <strong>Relevé</strong> présente chaque ligne dans l’ordre, avec le solde
          après chaque opération : c’est ce document qu’on imprime et qu’on remet au client.
          <strong> Coordonnées</strong> permet de corriger sa fiche.
        </p>
        <p>
          Quand il vient payer, enregistrez le règlement depuis sa fiche en indiquant le mode. Le
          solde se met à jour immédiatement, et l’argent entre en caisse s’il paie en espèces.
        </p>
        <p>
          <strong>F7</strong> ne montre que les clients qui doivent de l’argent. C’est la liste à
          consulter en fin de mois.
        </p>
      </>
    )
  },
  {
    partie: 'Clients et argent',
    cle: 'finances',
    titre: 'Vos dépenses',
    contenu: (
      <>
        <p>
          <strong>F2</strong> enregistre une dépense : loyer, électricité, eau, transport,
          salaires, maintenance, fournitures, taxes. Classez-la dans sa catégorie — c’est ce qui
          rendra vos totaux lisibles en fin de mois.
        </p>
        <p>
          Indiquez comment vous avez payé. Une dépense réglée <strong>en espèces sur la caisse</strong>
          {' '}est déduite du tiroir : elle apparaîtra dans le calcul de la clôture. Les autres modes
          (virement, chèque, mobile money) n’affectent pas la caisse.
        </p>
        <p>
          L’écran affiche vos totaux sur sept jours, sur le mois, ou sur une période de votre choix,
          avec la répartition par catégorie. <strong>F8</strong> exporte la liste vers un tableur.
        </p>
      </>
    )
  },
  {
    partie: 'Clients et argent',
    cle: 'rapports',
    titre: 'Vos rapports',
    contenu: (
      <>
        <p>
          Trois rapports, sur la période de votre choix : sept jours, ce mois, quatre-vingt-dix
          jours, ou des dates précises.
        </p>
        <p>
          <strong>Ventes</strong> — votre activité par jour, par semaine ou par mois : chiffre
          d’affaires, nombre de ventes, panier moyen, bénéfice estimé.
        </p>
        <p>
          <strong>Produits</strong> — ce qui part le mieux, et ce qui ne part pas. La liste des
          produits peu vendus est celle qu’on regarde avant de recommander : c’est là que dort
          votre argent.
        </p>
        <p>
          <strong>Stock</strong> — la valeur de ce que vous détenez, par catégorie, et les produits
          qui immobilisent le plus.
        </p>
        <p>
          <strong>F8</strong> exporte vers un tableur, <strong>F12</strong> imprime.
        </p>
      </>
    )
  },
  {
    partie: 'Surveiller et administrer',
    cle: 'alertes',
    titre: 'Les alertes',
    contenu: (
      <>
        <p>
          Le logiciel surveille pour vous et range ce qu’il trouve en trois niveaux :
          <strong> Urgent</strong>, <strong>Important</strong>, <strong>Information</strong>. Le
          compteur près de la cloche, en haut, indique ce qui reste à traiter.
        </p>
        <p>
          Il signale les ruptures, les stocks faibles, les lots périmés ou proches de l’être, une
          caisse restée ouverte, un inventaire abandonné, des dettes et des créances, et l’absence
          de sauvegarde hors de l’ordinateur.
        </p>
        <p>
          Chaque alerte porte un bouton qui mène directement là où l’on peut agir. Une alerte
          disparaît d’elle-même dès que la situation est résolue : vous n’avez rien à cocher.
        </p>
        <p>
          <strong>F5</strong> recalcule, <strong>F7</strong> n’affiche que l’urgent,
          <strong> F9</strong> marque tout comme lu.
        </p>
      </>
    )
  },
  {
    partie: 'Surveiller et administrer',
    cle: 'utilisateurs',
    titre: 'Votre équipe',
    contenu: (
      <>
        <p>
          Créez un compte par personne. Ne partagez jamais un compte : c’est le nom de
          l’utilisateur qui apparaît sur chaque vente, chaque clôture et chaque ligne du journal.
        </p>
        <p>
          Quatre rôles existent. Le <strong>caissier</strong> vend, tient la caisse et encaisse les
          règlements clients ; il ne peut ni modifier un prix, ni accorder de remise. Le
          <strong> pharmacien</strong> gère en plus les produits, le stock, les achats et
          l’inventaire. Le <strong>gestionnaire</strong> consulte et suit les finances, sans toucher
          à la caisse. L’<strong>administrateur</strong> a tous les droits.
        </p>
        <p>
          L’onglet <strong>Rôles</strong> montre les cinquante droits du logiciel et qui les
          possède. Vous pouvez retirer ou accorder un droit précis à une personne sans changer son
          rôle.
        </p>
        <p>
          Un utilisateur se désactive plutôt qu’il ne se supprime : son travail passé reste
          attribué à son nom. Le dernier administrateur ne peut pas être désactivé — sinon plus
          personne ne pourrait administrer le logiciel.
        </p>
      </>
    )
  },
  {
    partie: 'Surveiller et administrer',
    cle: 'journal',
    titre: 'Le journal d’activité',
    contenu: (
      <>
        <p>
          Tout ce qui compte est inscrit : ventes, annulations, réceptions, ajustements de stock,
          inventaires, règlements, changements de prix, créations d’utilisateurs, modifications de
          paramètres, et les tentatives d’accès refusées.
        </p>
        <p>
          Chaque ligne porte la date, l’heure, la personne et le détail de l’opération. Le journal
          ne se modifie pas et ne s’efface pas.
        </p>
        <p>
          Filtrez par type d’élément et par période. C’est le premier endroit où regarder quand
          quelque chose vous surprend : un stock qui ne correspond pas, un prix qui a changé, une
          caisse qui manque.
        </p>
      </>
    )
  },
  {
    partie: 'Les paramètres',
    cle: 'param-pharmacie',
    titre: 'Paramètres — La pharmacie',
    contenu: (
      <>
        <p>
          Le nom, la raison sociale, l’adresse, la ville, le pays, le téléphone et l’adresse
          électronique de votre officine. Ces informations figurent en tête de vos tickets, factures
          et relevés : tenez-les à jour.
        </p>
        <p>
          La monnaie et son symbole s’affichent ici mais ne se changent plus : les montants déjà
          enregistrés deviendraient incohérents.
        </p>
        <p>
          Le panneau <strong>Votre activité enregistrée</strong> récapitule ce que contient votre
          logiciel : nombre de produits, de lots, de ventes, de mouvements, et la date de votre
          première vente.
        </p>
      </>
    )
  },
  {
    partie: 'Les paramètres',
    cle: 'param-regles',
    titre: 'Paramètres — Règles',
    contenu: (
      <>
        <p>Chaque réglage se modifie et s’enregistre d’un bouton. Voici ce qu’ils font.</p>
        <p>
          <strong>Stock et péremptions.</strong> Le <em>seuil d’alerte de péremption</em> est le
          nombre de jours avant expiration à partir duquel un lot est signalé (90 par défaut).
          <em> Interdire la vente d’un produit expiré</em> empêche toute sortie d’un lot dépassé —
          laissez-le activé. <em>Avertir lors de la vente d’un lot proche de péremption</em> affiche
          un message sans bloquer. <em>Signaler une quantité inhabituelle</em> vous alerte si l’on
          vend beaucoup plus que d’habitude, souvent le signe d’une erreur de frappe.
        </p>
        <p>
          <strong>Ventes.</strong> La <em>remise maximale autorisée</em> plafonne les remises, en
          pourcentage. <em>Ajouter au panier dès la lecture du code-barres</em> : décochez si vous
          préférez que le code remplisse seulement la recherche. <em>Signaler un code-barres
          inconnu</em> vous avertit quand le code lu ne correspond à aucun produit.
        </p>
        <p>
          <strong>Caisse.</strong> <em>Exiger une caisse ouverte pour vendre</em> garantit que
          chaque vente est rattachée à une session — indispensable dès que vous avez un employé.
          L’<em>écart toléré sans justification</em> est le montant en dessous duquel une clôture
          passe sans explication.
        </p>
        <p>
          <strong>Catalogue et saisie.</strong> La <em>marge par défaut proposée</em> sert à
          calculer le prix de vente suggéré dès que vous saisissez un prix d’achat. Zéro désactive
          la proposition.
        </p>
        <p>
          <strong>Impression et documents.</strong> Le <em>format par défaut</em> (ticket 80 mm,
          ticket 57 mm, A5 ou A4) reste modifiable au moment d’imprimer. Le <em>nombre
          d’exemplaires par facture</em> sert quand le client et la pharmacie en gardent chacun un.
          Le <em>message de bas de ticket</em> apparaît sous chaque ticket. <em>Imprimer le ticket
          automatiquement</em> supprime la confirmation après chaque vente. <em>Imprimer sans boîte
          de dialogue</em> envoie directement à l’imprimante choisie — testez-le une fois avant de
          compter dessus.
        </p>
        <p>
          <strong>Sécurité et sauvegardes.</strong> <em>Sauvegardes automatiques</em> en crée une à
          chaque fermeture. Le <em>nombre conservé</em> (30 par défaut) limite la place occupée. La
          <em> copie hors de la machine</em> et le <em>délai d’alerte</em> sont expliqués plus loin.
          Les <em>tentatives de connexion avant verrouillage</em> et la <em>durée du
          verrouillage</em> protègent contre les essais de mots de passe. Le <em>verrouillage du
          poste</em> ferme l’écran après quelques minutes d’inactivité.
        </p>
        <p>
          <strong>Général.</strong> Le <em>thème par défaut</em> fixe l’apparence des nouveaux
          postes. Chaque utilisateur peut ensuite choisir la sienne.
        </p>
      </>
    )
  },
  {
    partie: 'Les paramètres',
    cle: 'param-apparence',
    titre: 'Régler l’apparence à votre main',
    contenu: (
      <>
        <p>
          Le bouton de votre nom, en haut à droite, ouvre les réglages d’affichage. Ils sont propres
          à cet ordinateur : le comptoir et le bureau peuvent être réglés différemment.
        </p>
        <p>
          <strong>Cinq thèmes</strong> — Clair, Océan, Cobalt, Ardoise, Brique. Ils ne changent que
          les couleurs.
        </p>
        <p>
          <strong>Trois dispositions</strong> — <em>Confort</em> convient à la plupart des écrans.
          <em> Compacte</em> réduit les caractères et affiche plus de lignes. <em>Tactile</em>
          agrandit les boutons et place les modules en onglets horizontaux, pour un écran tactile.
        </p>
        <p>C’est aussi ici que vous changez votre mot de passe.</p>
      </>
    )
  },
  {
    partie: 'Les paramètres',
    cle: 'param-reprise',
    titre: 'Paramètres — Reprise de données',
    contenu: (
      <>
        <p>
          Si vous veniez d’un autre logiciel ou d’un tableur, cet écran importe votre catalogue et
          vos clients à partir d’un fichier CSV.
        </p>
        <p>
          Le logiciel vous montre d’abord ce qu’il a compris — combien de lignes seront créées,
          combien seront ignorées et pourquoi — <strong>avant</strong> d’écrire quoi que ce soit.
          Rien n’est importé tant que vous n’avez pas confirmé.
        </p>
        <p>
          Reprenez d’abord les produits, puis les clients. Les stocks se remplissent ensuite par une
          réception ou un inventaire.
        </p>
      </>
    )
  },
  {
    partie: 'Au quotidien',
    cle: 'donnees',
    titre: 'Protéger vos données',
    contenu: (
      <>
        <p>
          Le logiciel enregistre une sauvegarde à chaque fermeture et en conserve trente. Vos
          données sont verrouillées sur cet ordinateur : si quelqu’un copie le fichier et
          l’emporte, il ne pourra rien en lire.
        </p>
        <p>
          <strong>Cela ne suffit pas.</strong> Un vol, un incendie ou une panne emporte
          l’ordinateur <em>et</em> ses sauvegardes. Branchez une clé USB ou un disque externe, puis
          allez dans <strong>Paramètres → Licence et données → Copie hors de cette machine</strong>
          {' '}et choisissez le dossier. Chaque sauvegarde y sera recopiée automatiquement.
        </p>
        <p>
          Le logiciel vous alerte si aucune copie n’a quitté l’ordinateur depuis plusieurs jours.
          Ne négligez jamais cette alerte : c’est la seule qui protège votre travail de plusieurs
          années.
        </p>
        <p>
          <strong>Restaurer</strong> — choisissez une sauvegarde dans la liste et restaurez-la. Une
          copie de l’état actuel est prise avant, par sécurité. Vous ne perdez donc rien, même si
          vous vous trompez de fichier.
        </p>
        <p>
          Une sauvegarde se restaure aussi sur un <strong>autre ordinateur</strong>. C’est ce qui
          vous sauve le jour où le premier ne démarre plus : installez PHARMINA sur une machine
          neuve, restaurez, et vous reprenez le travail. Vous n’avez aucun mot de passe
          supplémentaire à retenir.
        </p>
      </>
    )
  },
  {
    partie: 'Au quotidien',
    cle: 'impression',
    titre: 'Imprimer',
    contenu: (
      <>
        <p>
          Quatre formats. Le <strong>ticket 80 mm</strong> et le <strong>ticket 57 mm</strong> pour
          les imprimantes thermiques à rouleau, la <strong>facture A5</strong> et la
          <strong> facture A4</strong> pour le papier ordinaire.
        </p>
        <p>
          Vous choisissez le format au moment d’imprimer, ou vous en fixez un par défaut dans les
          paramètres.
        </p>
        <p>
          Vous pouvez désigner une imprimante différente pour chaque format : la thermique pour les
          tickets, celle du bureau pour les factures. Le réglage <em>Imprimer sans boîte de
          dialogue</em> envoie directement, sans confirmation — c’est ce qu’on veut au comptoir.
          Faites un essai avant de vous en remettre à lui.
        </p>
        <p>
          Le relevé de compte client et les rapports s’impriment de la même façon.
        </p>
      </>
    )
  },
  {
    partie: 'Au quotidien',
    cle: 'codes-barres',
    titre: 'Le lecteur de codes-barres',
    contenu: (
      <>
        <p>
          Tout lecteur qui se branche en USB fonctionne, sans installation ni réglage. Il se
          comporte comme un clavier : le logiciel reconnaît la vitesse de frappe et sait que c’est
          un lecteur.
        </p>
        <p>
          Au comptoir, passez la boîte devant le lecteur : le produit s’ajoute au panier. Dans la
          fiche d’un produit, le code lu se range dans le champ prévu.
        </p>
        <p>
          Si le code est inconnu, le logiciel vous le signale. Ouvrez la fiche du produit et
          scannez-le une fois : il sera reconnu ensuite.
        </p>
        <p>
          Le lecteur est volontairement inactif quand une fenêtre est ouverte par-dessus l’écran de
          vente, pour éviter qu’un code parte au mauvais endroit.
        </p>
      </>
    )
  },
  {
    partie: 'Au quotidien',
    cle: 'licence',
    titre: 'Activer votre logiciel',
    contenu: (
      <>
        <p>
          Sans activation, PHARMINA fonctionne en démonstration : dix ventes par jour, et les
          rapports et exports ne sont pas accessibles. Tout le reste fonctionne, pour que vous
          puissiez juger le logiciel avant de l’acheter.
        </p>
        <p>
          Pour activer, allez dans <strong>Paramètres → Licence et données</strong>. Communiquez le
          <strong> code d’installation</strong> qui s’y affiche — quatre groupes de quatre
          caractères — à {EDITEUR.societe}. Vous recevrez une clé à coller au même endroit.
        </p>
        <p>
          Aucune connexion Internet n’est nécessaire, ni pour la démonstration, ni pour
          l’activation.
        </p>
        <p>
          Notez ce code quelque part : il vous sera redemandé si vous changez d’ordinateur, car une
          licence est liée à la machine sur laquelle elle a été posée.
        </p>
      </>
    )
  },
  {
    partie: 'Au quotidien',
    cle: 'majs',
    titre: 'Mettre à jour',
    contenu: (
      <>
        <p>
          Dans <strong>Paramètres → Licence et données</strong>, le panneau
          <strong> Version du logiciel</strong> indique votre version et permet de vérifier s’il en
          existe une plus récente.
        </p>
        <p>
          Rien ne s’installe sans votre accord, et jamais au milieu d’une vente. Vous téléchargez
          quand votre connexion le permet, puis vous installez quand le comptoir est libre.
          L’installation ferme le logiciel quelques instants ; vos données ne sont pas touchées.
        </p>
        <p>
          Seules les parties modifiées sont téléchargées : une mise à jour pèse quelques
          mégaoctets, pas la totalité du logiciel.
        </p>
        <p>
          Sans Internet, votre fournisseur vous remet la mise à jour sur une clé USB. Il suffit de
          l’exécuter par-dessus l’installation existante.
        </p>
      </>
    )
  },
  {
    partie: 'Au quotidien',
    cle: 'soucis',
    titre: 'En cas de souci',
    contenu: (
      <>
        <p>
          <strong>Le lecteur de codes-barres n’ajoute rien.</strong> Vérifiez que vous êtes sur
          l’écran de vente et qu’aucune fenêtre n’est ouverte par-dessus. Si le code est inconnu,
          enregistrez-le dans la fiche du produit.
        </p>
        <p>
          <strong>Le ticket ne sort pas.</strong> Vérifiez que l’imprimante est allumée et
          sélectionnée dans les paramètres d’impression, puis faites un essai depuis ce même écran.
        </p>
        <p>
          <strong>Un produit ne se vend pas.</strong> Son stock est peut-être à zéro, son lot périmé
          ou bloqué, ou le produit retiré de la vente. Sa fiche vous le dira.
        </p>
        <p>
          <strong>Il manque de l’argent à la clôture.</strong> Cherchez une sortie de caisse ou une
          dépense payée en liquide qui n’aurait pas été enregistrée. Le journal d’activité montre
          tout ce qui s’est passé dans la journée.
        </p>
        <p>
          <strong>Le stock ne correspond pas au rayon.</strong> Faites un inventaire sur ce rayon :
          il corrigera l’écart et en gardera la trace.
        </p>
        <p>
          <strong>Mot de passe oublié.</strong> Un administrateur peut le réinitialiser depuis
          l’écran Utilisateurs. Si c’est le seul administrateur qui a oublié le sien, contactez
          {' ' + EDITEUR.societe}.
        </p>
        <p>
          <strong>Le logiciel refuse d’ouvrir vos données.</strong> Cela arrive quand le fichier
          provient d’un autre ordinateur. Restaurez une sauvegarde : elle se rattache toute seule à
          la machine.
        </p>
        <p>
          <strong>Vous avez supprimé quelque chose par erreur.</strong> Rien n’est vraiment
          supprimé : les produits et les clients sont archivés, les ventes annulées restent
          visibles. Regardez le journal d’activité, puis restaurez une sauvegarde si nécessaire.
        </p>
      </>
    )
  },
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
          <div key={section.cle}>
            {index === 0 || SECTIONS[index - 1]!.partie !== section.partie ? (
              <h2 className="guide-partie">{section.partie}</h2>
            ) : null}
            <section className="guide-section">
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
          </div>
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
