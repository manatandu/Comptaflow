import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';
import { LIBELLE_SYSTEME } from '../../lib/systemes-syscohada';

/**
 * En-tête officiel des états imprimés · invisible à l'écran, présent sur
 * chaque impression.
 *
 * Un état déposé chez un bailleur, un auditeur ou au greffe doit dire de
 * lui-même de qui il émane, sur quel exercice il porte, selon quel
 * référentiel, et à quelle date il a été édité. Sans ces mentions, une
 * feuille de chiffres imprimée n'est pas un document comptable.
 *
 * Les mentions exigées sont celles du CPCC (SHEKOMBO SHUNGU John, « Notes de
 * cours d'organisation comptable », novembre 2020, § 7.4 règle 7-a) :
 *
 *   « Au niveau de l'en-tête : Dénomination sociale de l'entreprise ;
 *   N° d'identification fiscale ; Exercice clos le ; Durée (en mois). »
 *
 * D'où le numéro d'impôt et la durée en mois, absents jusqu'ici. Le numéro
 * n'est imprimé que si le dossier le porte (Structure > Paramètres du
 * dossier) : une association qui ne l'a pas encore obtenu doit pouvoir
 * imprimer ses états de travail. Voir docs/organisation-comptable-cpcc.md.
 *
 * UN DOSSIER SYSCOHADA EXIGE LES MÊMES MENTIONS, et le texte de l'AUDCIF les
 * répète mot pour mot : l'en-tête obligatoire des modèles du Titre IX (ch. 3
 * section 2 pour le bilan, ch. 4 section 2 pour le compte de résultat) et
 * celui du Titre X pour le Système minimal de trésorerie s'écrivent
 * « Désignation entité … / Numéro d'identification … / Exercice clos le
 * 31-12-… / Durée (en mois) … ». Les quatre sont ci-dessous, et la fiche R1
 * du ch. 2 les reprend à l'identique.
 *
 * S'y ajoute, pour les deux référentiels, l'unité monétaire : les états
 * financiers « doivent comporter obligatoirement » le nom de l'entité, la
 * date d'arrêté et la période couverte, et l'unité monétaire dans laquelle
 * ils sont exprimés, « dans chacune des pages des états financiers publiés »
 * (Titre IX ch. 1 § 2.4). D'où la ligne de monnaie, servie par /auth/me.
 *
 * Enfin, le référentiel ne suffit pas à nommer un état SYSCOHADA : la page de
 * garde du ch. 2 porte la mention « SYSTÈME NORMAL », et les deux systèmes de
 * l'art. 11 n'ont ni les mêmes états ni les mêmes maquettes (Titre IX contre
 * Titre X). Le système est donc imprimé à côté du référentiel, comme le jeu
 * d'états l'est pour un dossier SYCEBNL.
 */
export function EnteteImpression({ titre, sousTitre }: { titre: string; sousTitre?: string }) {
  const { utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const tenant = utilisateur?.tenant;

  // « Exercice clos le » et « Durée (en mois) », deux des quatre mentions
  // d'en-tête du § 7.4. La durée se compte en mois entamés bornes comprises :
  // un exercice du 01/01 au 31/12 fait douze mois, un premier exercice ouvert
  // au 01/09 en fait quatre, et c'est bien ce que demande l'imprimé.
  const clos = exerciceCourant ? new Date(exerciceCourant.dateFin) : null;
  const debut = exerciceCourant ? new Date(exerciceCourant.dateDebut) : null;
  const dureeMois =
    clos && debut
      ? (clos.getFullYear() - debut.getFullYear()) * 12 + (clos.getMonth() - debut.getMonth()) + 1
      : null;

  const JEUX: Record<string, string> = {
    PROJETS_DEVELOPPEMENT: 'Projets de développement et assimilés',
    SYSTEME_MINIMAL_TRESORERIE: 'Système Minimal de Trésorerie',
    ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'Associations et ordres professionnels',
  };
  const jeu = JEUX[tenant?.jeuEtatsFinanciersSycebnl ?? ''] ?? JEUX.ASSOCIATIONS_ORDRES_PROFESSIONNELS;
  // Système d'un dossier SYSCOHADA · non renseigné, rien n'est imprimé plutôt
  // que d'affirmer un système que le dossier n'a pas déclaré.
  const systeme = tenant?.systemeComptableSyscohada ? LIBELLE_SYSTEME[tenant.systemeComptableSyscohada] : null;

  return (
    <header className="impression-seul mb-4 pb-2 border-b-2 border-black">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[13px] font-bold uppercase">{tenant?.nom}</div>
          <div className="text-[10px]">
            Référentiel {tenant?.referentiel}
            {tenant?.referentiel === 'SYCEBNL' && ` · ${jeu}`}
            {tenant?.referentiel === 'SYSCOHADA' && systeme && ` · ${systeme}`}
          </div>
          {tenant?.numeroImpot && <div className="text-[10px]">N° d'identification fiscale {tenant.numeroImpot}</div>}
          {tenant?.devise && <div className="text-[10px]">Montants exprimés en {tenant.devise}</div>}
        </div>
        <div className="text-right">
          <div className="text-[13px] font-bold">{titre}</div>
          {sousTitre && <div className="text-[10.5px]">{sousTitre}</div>}
          {clos && debut && (
            <div className="text-[10px]">
              Exercice ouvert le {debut.toLocaleDateString('fr-FR')} · clos le {clos.toLocaleDateString('fr-FR')}
              {dureeMois !== null && ` · durée ${dureeMois} mois`}
            </div>
          )}
          <div className="text-[10px] text-neutral-600">
            Édité le {new Date().toLocaleDateString('fr-FR')} à{' '}
            {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Bouton d'impression · ouvre la boîte du navigateur, où « Enregistrer au
 * format PDF » produit le fichier à déposer. Pas de moteur de rendu
 * supplémentaire côté serveur : ce qui s'imprime est exactement ce qui est à
 * l'écran, sans risque de divergence entre les deux.
 */
export function BoutonImprimer({ libelle = 'Imprimer' }: { libelle?: string }) {
  return (
    <button
      onClick={() => window.print()}
      title="Ouvre la boîte d'impression · « Enregistrer au format PDF » y produit le fichier à déposer"
      className="ecran-seul flex items-center gap-1.5 border border-border rounded-[6px] bg-surface px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt"
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </svg>
      {libelle}
    </button>
  );
}

/**
 * Encadré de certification, imprimé au pied d'un état financier destiné à un
 * tiers. Le CPCC en fait une mention obligatoire (§ 7.4 règle 7-b) :
 *
 *   « Dans l'encadré "certifié sincère et conforme aux règles du Système
 *   Comptable OHADA" : Nom ; Qualité ; Signature et date. »
 *
 * La formule n'est pas recopiée telle quelle : un dossier tenu en SYCEBNL se
 * certifie conforme au SYCEBNL, pas au « Système comptable OHADA » des
 * entités commerciales. Les trois lignes restent VIDES à l'impression, avec
 * un filet à remplir : une signature se porte à la main, et un logiciel qui
 * préremplirait le nom du signataire ferait signer quelqu'un d'autre.
 */
export function BlocCertification() {
  const { utilisateur } = useAuth();
  const referentiel = utilisateur?.tenant.referentiel;
  const regles = referentiel === 'SYSCOHADA' ? 'du Système comptable OHADA' : 'du SYCEBNL';

  return (
    <section className="impression-seul mt-6 border border-black p-3 text-[10.5px]">
      <div className="font-bold uppercase mb-3">Certifié sincère et conforme aux règles {regles}</div>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <div className="text-[10px]">Nom</div>
          <div className="h-6 border-b border-black" />
        </div>
        <div>
          <div className="text-[10px]">Qualité</div>
          <div className="h-6 border-b border-black" />
        </div>
        <div>
          <div className="text-[10px]">Signature et date</div>
          <div className="h-6 border-b border-black" />
        </div>
      </div>
    </section>
  );
}
