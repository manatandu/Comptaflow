import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { EtatSurSite } from '../lib/sur-site';

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

const DATE_DE_MISE_A_JOUR = '30 septembre 2026';

function Titre({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[12px] font-bold mt-4 mb-1.5">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] leading-relaxed mb-2">{children}</p>;
}

export function ConfidentialitePage() {
  // DEUX INSTALLATIONS, DEUX RÉPONSES (audit final F176) · sur le poste d'un
  // client, aucune donnée ne part chez Neon, Cloud Run ni Firebase, et la page
  // servie par ce poste le disait pourtant. `GET /sur-site/etat` est public ·
  // en ligne il répond `surSite: false`, et une panne laisse le texte en ligne.
  const [surSite, setSurSite] = useState(false);
  useEffect(() => {
    let vivant = true;
    api
      .get<EtatSurSite>('/sur-site/etat')
      .then((e) => vivant && setSurSite(e.surSite))
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg py-6 px-4">
      <div className="mx-auto max-w-[760px] bg-surface border border-border px-6 py-5">
        <h1 className="text-[13px] font-bold">Politique de confidentialité d’OmegaX</h1>
        <p className="text-[11px] text-text-dim mt-1 mb-3">
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
          utilisateur, l’empreinte chiffrée de son mot de passe (jamais le mot de passe lui-même) et, si la double
          authentification est activée, le secret de l’application d’authentification et l’empreinte des codes de
          secours. S’y ajoute le journal d’audit, qui enregistre qui a fait quoi et quand dans le dossier, chaque
          connexion réussie, et l’<strong>adresse réseau (adresse IP)</strong> d’où chaque acte a été fait. Ce
          journal n’est pas une option : les textes comptables applicables (Acte uniforme relatif au droit
          comptable, art. 22) imposent que l’origine et l’imputation de chaque écriture puissent être restituées, et
          le Code du numérique (article 219, 14°) veut que l’on puisse constater après coup qui a eu accès aux
          données personnelles, et quand.
        </P>

        <Titre>2. Ce que le logiciel ne fait pas</Titre>
        <P>
          OmegaX ne dépose <strong>aucun traceur publicitaire</strong> et n’utilise aucun outil de mesure d’audience.
          Le seul témoin de connexion déposé est celui de votre session : il est strictement nécessaire au
          fonctionnement du logiciel, et il n’est pas lisible par le code de la page. Sans l’option « Rester
          connecté sur cet appareil », il se ferme avec le navigateur, et la session prend fin au plus tard huit
          heures après la connexion. Avec cette option, la session dure trente jours au plus depuis la connexion,
          et se ferme après sept jours sans utilisation. La console de l’éditeur n’admet que la session fermée avec
          le navigateur.
        </P>
        <P>
          Vos données comptables ne sont <strong>ni revendues, ni cédées, ni exploitées à d’autres fins</strong> que
          de vous rendre le service. Elles ne servent pas à entraîner de modèle statistique. Aucune décision
          automatisée n’est prise à votre sujet.
        </P>

        <Titre>3. Où vos données sont hébergées</Titre>
        {surSite ? (
          <>
            <P>
              Cette installation d’OmegaX est <strong>installée sur un ordinateur de votre entité</strong>. La base de
              données, le serveur d’application et l’interface y tournent tous les trois : vos dossiers comptables
              restent sur cet ordinateur et ne sont confiés à aucun hébergeur. VMG Consulting n’y a pas accès.
            </P>
            <P>
              Un courriel ne part du logiciel (relance, avis d’accès) que si votre entité a configuré une messagerie
              sur ce poste · le prestataire qu’elle a choisi reçoit alors l’adresse du destinataire et le texte du
              courrier.
            </P>
          </>
        ) : (
          <>
            <P>
              Cinq prestataires interviennent, chacun pour une part précise :
            </P>
            <ul className="text-[11.5px] leading-relaxed mb-2 list-disc pl-5">
              <li>
                <strong>Neon</strong> héberge la base de données PostgreSQL qui contient vos dossiers comptables.
              </li>
              <li>
                <strong>Google Cloud Run</strong>, dans la région <strong>us-east1</strong> (Caroline du Sud, États-Unis
                d’Amérique), exécute le serveur d’application qui lit et écrit dans cette base.
              </li>
              <li>
                <strong>Firebase Hosting</strong> sert l’interface, c’est à dire les pages et les scripts que votre
                navigateur affiche, et relaie vos requêtes vers le serveur. Aucune donnée comptable n’y est stockée.
              </li>
              <li>
                <strong>GitHub</strong> (service GitHub Actions) produit chaque nuit la sauvegarde de la base et la
                conserve, chiffrée (section 4). Une copie de ce fichier chiffré est déposée chaque nuit dans{' '}
                <strong>Google Cloud Storage</strong>, dans la région <strong>europe-west1</strong> (Belgique).
              </li>
              <li>
                <strong>Le prestataire de messagerie</strong> (SMTP) retenu par VMG Consulting reçoit l’adresse du
                destinataire et le texte des courriers que le logiciel envoie à votre demande · relances, factures,
                licences, avis d’accès. <em>Son nom doit être arrêté par VMG Consulting et porté ici avant toute
                publication de cette page sur un magasin d’applications.</em>
              </li>
            </ul>
            <P>
              Vos données sont donc <strong>hébergées hors de la République démocratique du Congo</strong>. Ce point
              est énoncé ici parce qu’il vous appartient de le connaître et, le cas échéant, de vérifier qu’il est
              compatible avec les engagements pris envers vos propres bailleurs de fonds.
            </P>
            <P>
              Le Code du numérique congolais (ordonnance-loi n° 23/10 du 13 mars 2023) pose à son article 201 que les
              données personnelles sont stockées ou hébergées en République démocratique du Congo, et qu’un transfert
              vers un État tiers suppose l’autorisation préalable de l’Autorité de protection des données ; son
              article 202 énumère les cas où un tel transfert reste possible. <strong>La base juridique du transfert
              opéré ici est en cours de qualification.</strong> Pour les données personnelles de vos dossiers, dont
              votre entité est responsable, le transfert relève de ses instructions, VMG Consulting agissant pour son
              compte (article 229).
            </P>
          </>
        )}

        <Titre>4. Combien de temps elles sont conservées</Titre>
        {surSite ? (
          <P>
            Vos dossiers comptables restent sur cet ordinateur aussi longtemps que votre entité les y garde, et la
            durée légale de conservation des documents comptables s’impose à elle : les états financiers et les
            pièces qui les justifient doivent rester présentables après la clôture.
          </P>
        ) : (
          <P>
            Vos dossiers comptables sont conservés pendant toute la durée de votre abonnement, puis pendant la durée
            légale de conservation des documents comptables. Ce n’est pas un choix commercial : les états financiers
            et les pièces qui les justifient doivent rester présentables après la clôture.
          </P>
        )}
        <P>
          Les <strong>données de compte et le journal d’audit</strong> ne sont soumis à aucune purge. Un compte
          utilisateur se désactive, il ne se supprime pas ; le journal, dont chaque événement porte l’empreinte du
          précédent, garde le courriel et l’adresse IP de l’auteur de chaque acte tant que le dossier existe.
          {!surSite && (
            <em>
              {' '}
              Leur durée de conservation doit être arrêtée par VMG Consulting et portée ici avant toute publication
              de cette page sur un magasin d’applications.
            </em>
          )}
        </P>
        {surSite ? (
          <P>
            Une <strong>sauvegarde</strong> de la base est produite chaque jour sur cet ordinateur, et les trente plus
            récentes sont gardées, sauf réglage différent de votre installation. Une copie peut en être déposée hors
            du poste, <strong>chiffrée</strong> par une phrase secrète que choisit l’administrateur de l’installation ·
            sans elle, la copie ne se relit pas, et VMG Consulting ne la détient pas.
          </P>
        ) : (
          <P>
            Une <strong>sauvegarde chiffrée</strong> de la base est produite chaque nuit. Elle est chiffrée avant de
            quitter le serveur qui la produit, et VMG Consulting est seul à détenir la clé qui permet de la lire. Le
            fichier est conservé quatre-vingt-dix jours par GitHub ; sa copie déposée dans Google Cloud Storage
            (europe-west1) n’a pas de durée fixée par le logiciel.{' '}
            <em>
              La durée de conservation de cette copie doit être arrêtée par VMG Consulting et portée ici avant toute
              publication de cette page sur un magasin d’applications.
            </em>
          </P>
        )}

        <Titre>5. Comment elles sont protégées</Titre>
        {surSite ? (
          <P>
            Sur cette installation, les échanges entre les postes du bureau et l’ordinateur qui porte OmegaX passent
            en <strong>http, sur le réseau local</strong> de votre entité : OmegaX ne les chiffre pas. Le service
            n’est ouvert qu’aux réseaux privés et de domaine par la règle de pare-feu posée à l’installation.
          </P>
        ) : (
          <P>
            Les échanges entre votre navigateur et le service sont <strong>chiffrés en transit (HTTPS)</strong>{' '}
            jusqu’au relais Firebase Hosting, qui les transmet au serveur d’application. Ce n’est pas un chiffrement
            de bout en bout : le relais les déchiffre pour les acheminer.
          </P>
        )}
        <P>
          Chaque dossier est cloisonné
          des autres au niveau de chaque requête du serveur : une requête qui ne porte pas la borne de votre dossier
          est refusée par le logiciel, elle n’est pas corrigée en silence. Les mots de passe ne sont jamais stockés en
          clair. Les tentatives de connexion répétées sont ralenties, et une session est révoquée dès qu’un mot de
          passe change, qu’un accès est retiré ou qu’un rôle est modifié.
        </P>

        <Titre>6. Si vos données étaient exposées</Titre>
        {surSite ? (
          <P>
            Sur cette installation, VMG Consulting n’a accès à aucune donnée. L’article 244 du Code du numérique met
            la notification d’une violation, <strong>sans délai</strong>, à l’Autorité de protection des données et
            aux personnes concernées, à la charge du responsable du traitement · votre entité, pour les données
            qu’elle tient sur cet ordinateur.
          </P>
        ) : (
          <>
            <P>
              L’article 244 du Code du numérique distingue deux obligations. Pour les{' '}
              <strong>données de compte et de traçabilité</strong>, dont VMG Consulting est responsable, nous
              notifierons <strong>sans délai</strong>, à l’Autorité de protection des données et à vous-même, toute
              violation les ayant affectées (alinéa 1er).
            </P>
            <P>
              Pour les <strong>données personnelles de vos dossiers</strong>, dont votre entité est responsable, VMG
              Consulting, sous-traitant, vous avertira <strong>sans délai</strong> de toute atteinte à leur sécurité
              (alinéa 2) · il revient alors à votre entité de notifier l’Autorité et les personnes concernées
              (alinéa 1er). Dans les deux cas, nous vous dirons ce qui a été atteint, quand, et ce que nous avons
              fait, plutôt que de vous adresser une formule.
            </P>
          </>
        )}

        <Titre>7. Vos droits</Titre>
        <P>
          Vous pouvez demander à consulter, corriger, exporter ou supprimer les données qui vous concernent. L’export
          de vos dossiers est d’ailleurs prévu dans le logiciel : les états financiers, la liasse complète et les
          livres obligatoires s’exportent au format tableur sans avoir à nous le demander, et
          <strong> Fichier &gt; Restituer le dossier complet</strong> en produit une copie intégrale, table par table,
          en un seul fichier.
        </P>
        <P>
          L’effacement cède devant une obligation légale qui impose de conserver les données (article 216) ; son
          articulation avec la conservation des documents comptables et du journal d’audit est en cours de
          qualification. Vous pouvez aussi définir les modalités de la gestion de vos données personnelles après
          votre mort (article 208), et vous avez le droit d’introduire une réclamation auprès de l’autorité chargée
          de la protection des données à caractère personnel et de former un recours juridictionnel (articles 220
          et 239).
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
          <a href="#/connexion" className="text-[11.5px] text-sel underline">
            Retour à l’ouverture du fichier comptable
          </a>
        </div>
      </div>
    </div>
  );
}
