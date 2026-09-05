/**
 * POLITIQUE DE CONFIDENTIALITÉ · atteignable SANS CONNEXION.
 *
 * C'est le premier des trois prérequis communs à tous les magasins
 * d'applications : chacun exige une adresse publique, ouverte, qui dise quelles
 * données sont traitées et où elles sont hébergées. Une politique derrière un
 * mot de passe n'est pas une politique publiée.
 *
 * TOUT CE QUI EST ÉCRIT ICI EST VÉRIFIABLE DANS LE DÉPÔT · l'hébergeur de la
 * base, la région du service, les durées, les traceurs. Une politique qui
 * décrirait un traitement que le logiciel ne fait pas serait pire qu'aucune
 * politique : elle serait fausse, et opposable.
 *
 * DEUX POINTS APPELLENT UNE DÉCISION DE VMG CONSULTING et sont dits comme tels
 * dans le texte plutôt que remplis d'office · l'adresse postale du responsable
 * de traitement, et l'adresse de contact pour l'exercice des droits. Inventer
 * un contact ferait passer un document juridique pour complet alors qu'il
 * dirigerait les demandes vers le vide.
 */

const DATE_DE_MISE_A_JOUR = '5 septembre 2026';

function Titre({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-bold mt-4 mb-1.5">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-relaxed mb-2">{children}</p>;
}

export function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-bg py-6 px-4">
      <div className="mx-auto max-w-[760px] bg-surface border border-border px-6 py-5">
        <h1 className="text-[14px] font-bold">Politique de confidentialité d’OmegaX</h1>
        <p className="text-[10px] text-text-dim mt-1 mb-3">
          Dernière mise à jour · {DATE_DE_MISE_A_JOUR}
        </p>

        <P>
          OmegaX est un logiciel de comptabilité destiné aux associations sans but lucratif, aux organisations non
          gouvernementales et aux entreprises de la République démocratique du Congo. Il est édité et exploité par le
          cabinet <strong>VMG Consulting</strong>, qui est le responsable du traitement des données décrites
          ci-dessous.
        </P>

        <Titre>1. Ce que le logiciel traite</Titre>
        <P>
          OmegaX traite deux catégories de données, et deux seulement.
        </P>
        <P>
          <strong>Les données de vos dossiers comptables</strong> · plan de comptes, journaux, écritures, tiers,
          immobilisations, budgets, états financiers et pièces que vous y saisissez. Elles vous appartiennent. Elles
          peuvent contenir des données personnelles si vous en saisissez (nom d’un fournisseur, d’un membre, d’un
          salarié) : dans ce cas, c’est votre entité qui en est responsable, et VMG Consulting n’agit que comme
          sous-traitant, pour votre compte et sur vos instructions.
        </P>
        <P>
          <strong>Les données de compte et de traçabilité</strong> · l’adresse de courriel et le rôle de chaque
          utilisateur, l’empreinte chiffrée de son mot de passe (jamais le mot de passe lui-même), et le journal
          d’audit qui enregistre qui a fait quoi et quand dans le dossier. Ce journal n’est pas une option : les
          textes comptables applicables (Acte uniforme relatif au droit comptable, art. 22) imposent que l’origine et
          l’imputation de chaque écriture puissent être restituées.
        </P>

        <Titre>2. Ce que le logiciel ne fait pas</Titre>
        <P>
          OmegaX ne dépose <strong>aucun traceur publicitaire</strong> et n’utilise aucun outil de mesure d’audience.
          Le seul témoin de connexion déposé est celui de votre session : il est strictement nécessaire au
          fonctionnement du logiciel, il n’est pas lisible par le code de la page, et il expire au bout de huit
          heures.
        </P>
        <P>
          Vos données comptables ne sont <strong>ni revendues, ni cédées, ni exploitées à d’autres fins</strong> que
          de vous rendre le service. Elles ne servent pas à entraîner de modèle statistique. Aucune décision
          automatisée n’est prise à votre sujet.
        </P>

        <Titre>3. Où vos données sont hébergées</Titre>
        <P>
          Trois hébergeurs interviennent, chacun pour une part précise :
        </P>
        <ul className="text-[11px] leading-relaxed mb-2 list-disc pl-5">
          <li>
            <strong>Neon</strong> héberge la base de données PostgreSQL qui contient vos dossiers comptables.
          </li>
          <li>
            <strong>Google Cloud Run</strong>, dans la région <strong>us-east1</strong> (Caroline du Sud, États-Unis
            d’Amérique), exécute le serveur d’application qui lit et écrit dans cette base.
          </li>
          <li>
            <strong>Firebase Hosting</strong> sert l’interface, c’est à dire les pages et les scripts que votre
            navigateur affiche. Aucune donnée comptable n’y est stockée.
          </li>
        </ul>
        <P>
          Vos données sont donc <strong>hébergées hors de la République démocratique du Congo</strong>. Ce point est
          énoncé ici parce qu’il vous appartient de le connaître et, le cas échéant, de vérifier qu’il est compatible
          avec les engagements pris envers vos propres bailleurs de fonds.
        </P>
        <P>
          Le Code du numérique congolais (ordonnance-loi n° 23/10 du 13 mars 2023) pose à son article 201 que les
          données personnelles sont stockées ou hébergées en République démocratique du Congo, et prévoit à son
          article 202 les cas où un transfert vers un État tiers reste possible. Le transfert opéré ici est
          <strong> nécessaire à l’exécution du contrat</strong> qui nous lie à vous, au sens du 2° de cet article :
          sans hébergement, il n’y a pas de service.
        </P>

        <Titre>4. Combien de temps elles sont conservées</Titre>
        <P>
          Vos dossiers comptables sont conservés pendant toute la durée de votre abonnement, puis pendant la durée
          légale de conservation des documents comptables. Ce n’est pas un choix commercial : les états financiers et
          les pièces qui les justifient doivent rester présentables après la clôture.
        </P>
        <P>
          Une <strong>sauvegarde chiffrée</strong> de la base est produite chaque nuit et conservée quatre-vingt-dix
          jours. Elle est chiffrée avant de quitter le serveur qui la produit, et VMG Consulting est seul à détenir la
          clé qui permet de la lire.
        </P>

        <Titre>5. Comment elles sont protégées</Titre>
        <P>
          Les échanges entre votre navigateur et le serveur sont chiffrés de bout en bout. Chaque dossier est cloisonné
          des autres au niveau de la base elle-même : une requête qui ne porte pas la borne de votre dossier est
          refusée par le logiciel, elle n’est pas corrigée en silence. Les mots de passe ne sont jamais stockés en
          clair. Les tentatives de connexion répétées sont ralenties, et une session est révoquée dès qu’un mot de
          passe change, qu’un accès est retiré ou qu’un rôle est modifié.
        </P>

        <Titre>6. Si vos données étaient exposées</Titre>
        <P>
          L’article 244 du Code du numérique nous oblige à notifier <strong>sans délai</strong>, à l’Autorité de
          protection des données et à vous-même, toute violation ayant affecté vos données. Nous nous y engageons, et
          nous vous dirons ce qui a été atteint, quand, et ce que nous avons fait, plutôt que de vous adresser une
          formule.
        </P>

        <Titre>7. Vos droits</Titre>
        <P>
          Vous pouvez demander à consulter, corriger, exporter ou supprimer les données qui vous concernent. L’export
          de vos dossiers est d’ailleurs prévu dans le logiciel : les états financiers, la liasse complète et les
          livres obligatoires s’exportent au format tableur sans avoir à nous le demander, et
          <strong> Fichier &gt; Restituer le dossier complet</strong> en produit une copie intégrale, table par table,
          en un seul fichier.
        </P>
        <P>
          Pour toute autre demande, écrivez au cabinet VMG Consulting. <em>L’adresse postale du cabinet et l’adresse
          de courriel dédiée à ces demandes doivent être arrêtées par VMG Consulting et portées ici avant toute
          publication de cette page sur un magasin d’applications.</em> Elles ne sont pas inscrites d’office : une
          adresse inventée dirigerait vos demandes vers le vide.
        </P>

        <Titre>8. Modifications</Titre>
        <P>
          Cette politique peut évoluer avec le logiciel. La date de dernière mise à jour figure en tête de page, et
          toute modification substantielle vous sera signalée dans l’application.
        </P>

        <div className="mt-5 pt-3 border-t border-border">
          <a href="#/connexion" className="text-[11px] text-sel underline">
            Retour à l’ouverture du fichier comptable
          </a>
        </div>
      </div>
    </div>
  );
}
