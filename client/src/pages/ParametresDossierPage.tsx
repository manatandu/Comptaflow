import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import { Ligne, OngletsVerticaux, SectionTitre, champSage } from '../components/FormulaireSage';
import { SYSTEMES_SYSCOHADA } from '../lib/systemes-syscohada';
import { FORMES_SYSCOHADA } from '../lib/formes-juridiques-syscohada';
import type {
  FormeJuridiqueEbnl,
  FormeJuridiqueSyscohada,
  JeuEtatsFinanciersSycebnl,
  ParametresDossier,
  RegimeExigibiliteTva,
  SystemeComptableSyscohada,
} from '../lib/types';

/**
 * PARAMÈTRES DU DOSSIER · Structure → Paramètres société chez Sage 100 i7.
 *
 * L'écran existe d'abord pour une raison : rendre visible et modifiable le
 * JEU D'ÉTATS FINANCIERS SYCEBNL. Il était jusqu'ici figé sur les
 * associations et ordres professionnels par simple valeur par défaut du
 * schéma, sans qu'aucun écran ne permette de le voir ni de le changer · un
 * projet de développement se serait donc vu servir un compte de résultat et
 * 35 notes annexes là où l'article 4 lui impose un compte d'exploitation, un
 * tableau emplois-ressources, un tableau d'exécution budgétaire, un tableau
 * de réconciliation de trésorerie et 24 notes.
 *
 * Le changement est refusé côté serveur dès qu'une écriture existe : les
 * rattachements de comptes aux notes annexes et les états déjà arrêtés
 * dépendent du jeu retenu.
 */

const CHOIX: {
  valeur: JeuEtatsFinanciersSycebnl;
  titre: string;
  etats: string[];
}[] = [
  {
    valeur: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
    titre: 'Associations, ordres professionnels et fondations',
    etats: ['Bilan', 'Compte de résultat', 'Tableau de flux de trésorerie', '35 notes annexes'],
  },
  {
    valeur: 'PROJETS_DEVELOPPEMENT',
    titre: 'Projets de développement et assimilés',
    etats: [
      'Bilan',
      "Compte d'exploitation",
      'Tableau emplois-ressources',
      "Tableau d'exécution budgétaire",
      'Tableau de réconciliation de trésorerie',
      '24 notes annexes',
    ],
  },
  {
    valeur: 'SYSTEME_MINIMAL_TRESORERIE',
    titre: 'Système minimal de trésorerie · petites entités (art. 5 et 6)',
    etats: [
      'Bilan (5 lignes d’actif, 4 de passif)',
      'Compte de résultat de trésorerie',
      'Journal unique de trésorerie',
      '5 notes annexes',
      'Réservé aux ressources annuelles sous 30 000 000 FCFA par catégorie',
    ],
  },
];

/**
 * Formes juridiques de la loi n° 004/2001 du 20 juillet 2001 · article 2 pour
 * les trois natures d'ASBL, Titre II pour l'établissement d'utilité publique.
 * L'unité de gestion de projet n'est pas une ASBL, mais le CPCC la vise parmi
 * les entités tenues au SYCEBNL.
 *
 * Ce choix ne change ni le plan de comptes ni la présentation des états : il
 * décide À QUI le dossier rend compte en fin d'exercice, donc des jalons du
 * planning de clôture. Voir docs/obligations-annuelles-ebnl-rdc.md.
 */
const FORMES: { valeur: FormeJuridiqueEbnl; titre: string; detail: string }[] = [
  {
    valeur: 'ASSOCIATION',
    titre: 'Association',
    detail: 'Caractère culturel, social, éducatif ou économique (art. 2, point 1)',
  },
  {
    valeur: 'ORGANISATION_NON_GOUVERNEMENTALE',
    titre: 'Organisation non gouvernementale',
    detail: 'Rend compte en outre au Ministère du Plan et au ministère du secteur (art. 44 et 45)',
  },
  {
    valeur: 'ASSOCIATION_CONFESSIONNELLE',
    titre: 'Association confessionnelle',
    detail: 'Art. 2, point 3, et art. 46 à 56',
  },
  {
    valeur: 'ETABLISSEMENT_UTILITE_PUBLIQUE',
    titre: 'Établissement d’utilité publique',
    detail: 'Titre II, art. 58 à 73',
  },
  {
    valeur: 'UNITE_GESTION_PROJET',
    titre: 'Unité de gestion de projet',
    detail: 'Projet financé par un bailleur · visée par le CPCC parmi les entités tenues au SYCEBNL',
  },
  { valeur: 'AUTRE', titre: 'Autre', detail: 'Aucune obligation propre déduite' },
];

/**
 * Les onglets de la fenêtre, dans l'ordre où Sage range les siens : ce qui
 * identifie l'entité d'abord, ce qui commande des règles ensuite.
 *
 * Deux onglets de Sage ne sont PAS transposés, et c'est délibéré :
 * « Fichiers liés » (OmegaX est hébergé · il n'existe aucun fichier sur
 * disque à rattacher, l'onglet serait vide) et « Contacts » (il demanderait
 * un modèle Contact côté serveur · c'est une fonctionnalité à construire,
 * pas un habillage à poser). « IFRS » devient « Référentiel » : même nature
 * de choix, une norme qui change ce que le logiciel présente, mais c'est le
 * jeu d'états SYCEBNL qui joue ce rôle ici.
 */
const ONGLETS = [
  { cle: 'identification', libelle: 'Identification' },
  { cle: 'forme', libelle: 'Forme juridique' },
  { cle: 'regime', libelle: 'Régime fiscal' },
  { cle: 'referentiel', libelle: 'Référentiel' },
] as const;

type CleOnglet = (typeof ONGLETS)[number]['cle'];

export function ParametresDossierPage() {
  const [onglet, setOnglet] = useState<CleOnglet>('identification');
  const { estAdmin, rafraichir } = useAuth();
  const [params, setParams] = useState<ParametresDossier | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Dénomination et coordonnées · modifiables depuis la correction du
  // 2026-09-01 (elles étaient figées à la création, voir
  // TenantService.modifierCoordonnees).
  const [nom, setNom] = useState('');
  const [activite, setActivite] = useState('');
  const [adresse, setAdresse] = useState('');
  const [ville, setVille] = useState('');
  const [pays, setPays] = useState('');
  const [telephone, setTelephone] = useState('');
  const [devise, setDevise] = useState('');

  // Identifiants légaux · saisis à part, ils obéissent à une autre règle :
  // modifiables à tout moment, sans verrou d'écriture (voir modifierIdentite).
  const [numeroImpot, setNumeroImpot] = useState('');
  const [idNat, setIdNat] = useState('');
  const [rccm, setRccm] = useState('');
  const [actePersonnalite, setActePersonnalite] = useState('');
  const [dateActe, setDateActe] = useState('');
  const [enregistrementSecteur, setEnregistrementSecteur] = useState('');
  const [certificatPlan, setCertificatPlan] = useState('');
  const [attestationIs, setAttestationIs] = useState('');

  const charger = async () => {
    try {
      const p = await api.get<ParametresDossier>('/dossier/parametres');
      setParams(p);
      setNom(p.nom ?? '');
      setActivite(p.activite ?? '');
      setAdresse(p.adresse ?? '');
      setVille(p.ville ?? '');
      setPays(p.pays ?? '');
      setTelephone(p.telephone ?? '');
      setDevise(p.devise ?? '');
      setNumeroImpot(p.numeroImpot ?? '');
      setIdNat(p.idNat ?? '');
      setRccm(p.rccm ?? '');
      setActePersonnalite(p.actePersonnaliteJuridique ?? '');
      setDateActe(p.dateActePersonnalite ? p.dateActePersonnalite.slice(0, 10) : '');
      setEnregistrementSecteur(p.numeroEnregistrementSecteur ?? '');
      setCertificatPlan(p.certificatEnregistrementPlan ?? '');
      setAttestationIs(p.attestationExemptionIs ?? '');
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const changerJeu = async (jeu: JeuEtatsFinanciersSycebnl) => {
    if (!params || params.jeuEtatsFinanciersSycebnl === jeu) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(await api.patch<ParametresDossier>('/dossier/jeu-etats-financiers', { jeuEtatsFinanciersSycebnl: jeu }));
      // Le jeu d'états est lu depuis /auth/me par les fenêtres d'états
      // financiers et de notes annexes : sans ce rafraîchissement elles
      // continueraient d'afficher l'ancien jeu jusqu'à la prochaine session.
      await rafraichir();
      setInfo("Jeu d'états financiers enregistré.");
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  /** Pendant SYSCOHADA de changerJeu · AUDCIF art. 11 et 13. */
  const changerSysteme = async (systeme: SystemeComptableSyscohada) => {
    if (!params || params.systemeComptableSyscohada === systeme) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(
        await api.patch<ParametresDossier>('/dossier/systeme-syscohada', { systemeComptableSyscohada: systeme }),
      );
      await rafraichir();
      setInfo('Système comptable enregistré.');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  /** Pendant SYSCOHADA de changerForme · droit OHADA des affaires. */
  const changerFormeSyscohada = async (forme: FormeJuridiqueSyscohada) => {
    if (!params || params.formeJuridiqueSyscohada === forme) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(await api.patch<ParametresDossier>('/dossier/forme-syscohada', { formeJuridiqueSyscohada: forme }));
      setInfo('Forme juridique enregistrée.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * Régime de TVA et effectif · deux données qui commandent des RÈGLES, pas
   * un affichage : sans l'assujettissement, le logiciel proposait la saisie
   * « avec TVA » à toute association ; sans l'effectif, il ne pouvait pas
   * mesurer le troisième critère de l'article 19 ni la tranche INPP.
   */
  const changerRegime = async (dto: {
    assujettiTva?: boolean;
    effectifPermanent?: number;
    regimeExigibiliteTva?: RegimeExigibiliteTva;
  }) => {
    setEnvoi(true);
    setErreur(null);
    try {
      setParams(await api.patch<ParametresDossier>('/dossier/regime', dto));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const changerForme = async (forme: FormeJuridiqueEbnl, droitEtranger?: boolean) => {
    if (!params) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(
        await api.patch<ParametresDossier>('/dossier/forme-juridique', {
          formeJuridique: forme,
          ...(droitEtranger === undefined ? {} : { droitEtranger }),
        }),
      );
      setInfo('Forme juridique enregistrée.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * QUELS IDENTIFIANTS POUR QUELLE ENTITÉ · voir
   * docs/identifiants-legaux-ebnl-rdc.md pour la démonstration textuelle.
   *
   * - Le RCCM n'existe que pour un dossier SYSCOHADA : l'AUDCG (art. 2)
   *   n'assujettit au registre que les commerçants et les sociétés
   *   commerciales. Une association, une ONG, un établissement d'utilité
   *   publique ou un projet de développement n'en a pas · le montrer, c'est
   *   inviter à inventer un numéro qui n'existe pas.
   * - L'acte de personnalité juridique le remplace : arrêté du ministre de la
   *   Justice (loi n° 004/2001, art. 5) pour une entité de droit congolais,
   *   décret présidentiel pour une entité de droit étranger (art. 30).
   * - L'enregistrement au ministère sectoriel ne concerne que les ONG
   *   (régime particulier des art. 35 et suivants).
   * - Le certificat du Ministère du Plan concerne les entités qui passent par
   *   la procédure d'enregistrement de la note circulaire n° 003/2013 (ONG,
   *   EUP, projets financés par un bailleur).
   */
  const estSycebnl = params?.referentiel === 'SYCEBNL';
  const champsOng = params?.formeJuridique === 'ORGANISATION_NON_GOUVERNEMENTALE';
  const champsPlan =
    champsOng ||
    params?.formeJuridique === 'ETABLISSEMENT_UTILITE_PUBLIQUE' ||
    params?.formeJuridique === 'UNITE_GESTION_PROJET';

  /**
   * Les champs affichés, dans l'ordre. Les intitulés tiennent sur UNE ligne :
   * la grammaire Sage aligne les étiquettes à droite d'une colonne fixe, et
   * une étiquette qui passe à la ligne casse l'alignement de toute la colonne.
   * Ce que l'intitulé ne dit pas (« accordant la personnalité juridique »), la
   * phrase de la section le dit une fois pour toutes.
   */
  type ChampIdentite = {
    label: string;
    valeur: string;
    set: (v: string) => void;
    exemple: string;
    date?: boolean;
  };
  const champsImmatriculation: ChampIdentite[] = !params
    ? []
    : [
        { label: 'N° impôt (NIF)', valeur: numeroImpot, set: setNumeroImpot, exemple: 'A1234567B' },
        { label: 'Identification nationale', valeur: idNat, set: setIdNat, exemple: '01-93-K12345C' },
        ...(estSycebnl
          ? []
          : [{ label: 'RCCM', valeur: rccm, set: setRccm, exemple: 'CD/KIN/RCCM/23-B-01234' }]),
        ...(estSycebnl
          ? [
              {
                label: params.droitEtranger ? 'Décret présidentiel' : 'Arrêté ministériel',
                valeur: actePersonnalite,
                set: setActePersonnalite,
                exemple: params.droitEtranger ? 'Décret n° 12/034' : 'Arrêté n° 087/CAB/MIN/J/2024',
              },
              { label: 'Date de l’acte', valeur: dateActe, set: setDateActe, exemple: '', date: true },
              ...(champsOng
                ? [
                    {
                      label: 'Enregistrement (tutelle)',
                      valeur: enregistrementSecteur,
                      set: setEnregistrementSecteur,
                      exemple: 'MINAS/ONG/2024/0123',
                    },
                  ]
                : []),
              ...(champsPlan
                ? [
                    {
                      label: 'Certificat (Plan)',
                      valeur: certificatPlan,
                      set: setCertificatPlan,
                      exemple: 'CE/PLAN/2024/0456',
                    },
                  ]
                : []),
              {
                label: 'Attestation d’exemption',
                valeur: attestationIs,
                set: setAttestationIs,
                exemple: 'DGI/AE/2026/0789',
              },
            ]
          : []),
      ];

  /**
   * Fait générateur des cotisations et du droit d'entrée · cadre conceptuel
   * SYCEBNL § 5.4.2.1. Aucune valeur par défaut n'est proposée : la réponse
   * se lit dans les STATUTS, et un choix préposé serait pris pour un
   * constat.
   */
  const changerMethodeCotisations = async (methodeCotisations: 'APPEL' | 'ENCAISSEMENT') => {
    setErreur(null);
    setEnvoi(true);
    try {
      setParams(await api.patch<ParametresDossier>('/dossier/methode-cotisations', { methodeCotisations }));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrerCoordonnees = async (e: FormEvent) => {
    e.preventDefault();
    // Contrôle posé ici plutôt que laissé au DTO : le refus de
    // class-validator arriverait sous la forme « nom must be longer than or
    // equal to 1 characters », que personne n'a à lire.
    if (nom.trim() === '') {
      setErreur('La dénomination ne peut pas être vide : elle figure en tête de chaque état financier.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(
        await api.patch<ParametresDossier>('/dossier/coordonnees', {
          nom,
          activite,
          adresse,
          ville,
          pays,
          telephone,
          // La monnaie n'est envoyée que si elle peut encore changer · sinon
          // le serveur refuserait tout l'enregistrement pour un champ que
          // l'écran affiche de toute façon en lecture seule.
          ...(params && params.nombreEcritures === 0 ? { devise } : {}),
        }),
      );
      setInfo('Coordonnées enregistrées.');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrerIdentite = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(
        await api.patch<ParametresDossier>('/dossier/identite', {
          numeroImpot,
          idNat,
          // Le RCCM n'est envoyé que depuis un dossier SYSCOHADA · le champ
          // n'est même pas affiché ailleurs, et l'omettre évite d'écraser en
          // aveugle une valeur héritée d'un changement de référentiel.
          ...(params?.referentiel === 'SYSCOHADA' ? { rccm } : {}),
          ...(params?.referentiel === 'SYCEBNL'
            ? {
                actePersonnaliteJuridique: actePersonnalite,
                dateActePersonnalite: dateActe,
                attestationExemptionIs: attestationIs,
                ...(champsOng ? { numeroEnregistrementSecteur: enregistrementSecteur } : {}),
                ...(champsPlan ? { certificatEnregistrementPlan: certificatPlan } : {}),
              }
            : {}),
        }),
      );
      // Le n° impôt part dans l'en-tête de chaque page imprimée, lu depuis
      // /auth/me : sans ce rafraîchissement, les états continueraient de
      // s'imprimer sans lui jusqu'à la prochaine session.
      await rafraichir();
      setInfo('Identifiants légaux enregistrés.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const verrouille = !!params && params.nombreEcritures > 0;

  return (
    <div className="p-2 h-full flex flex-col">
      <div className="mb-2">
        <div className="text-[10px] font-mono text-text-dim leading-none">STRUCTURE</div>
        {/* Le titre porte l'onglet actif · Sage écrit « Identification de
            votre société - IFRS » dans sa barre de titre : on sait où l'on
            se trouve sans relire la liste des onglets. */}
        <h1 className="text-[12px] font-bold leading-tight">
          Identification du dossier
          <span className="font-normal text-text-dim"> · {ONGLETS.find((o) => o.cle === onglet)?.libelle}</span>
        </h1>
      </div>

      {erreur && (
        <div className="mb-2 text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2 text-[11px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5">
          {info}
        </div>
      )}

      {!params ? (
        <div className="text-[11px] text-text-dim">Chargement…</div>
      ) : (
        <OngletsVerticaux onglets={ONGLETS} actif={onglet} onChanger={setOnglet}>
          {onglet === 'identification' && (
            <>
              <SectionTitre>Identification</SectionTitre>
              {/* Chaque valeur est POSÉE CONTRE son étiquette, et non
                  repoussée au bord opposé : sur une fenêtre large, une liste
                  étirée oblige l'œil à traverser tout l'écran pour relier un
                  intitulé à sa valeur. Sage colle les deux.

                  CES CHAMPS SONT MODIFIABLES, et ils ne l'étaient pas : le
                  dossier les figeait à sa création alors que l'assistant
                  annonçait le contraire. Or `adresse + ville + pays` compose
                  l'adresse imprimée en tête de chaque état financier · un
                  cabinet qui déménage ne peut pas rester à l'ancienne sur des
                  documents qu'il signe. */}
              <form onSubmit={enregistrerCoordonnees} className="flex flex-col gap-3">
                <div>
                  <Ligne label="Dénomination sociale" large>
                    <input
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      disabled={!estAdmin || envoi}
                      maxLength={200}
                      aria-label="Dénomination sociale"
                      className={champSage}
                    />
                  </Ligne>
                  <Ligne label="Activité" large>
                    <input
                      value={activite}
                      onChange={(e) => setActivite(e.target.value)}
                      disabled={!estAdmin || envoi}
                      maxLength={200}
                      aria-label="Activité"
                      className={champSage}
                    />
                  </Ligne>
                  <Ligne label="Adresse" large>
                    <input
                      value={adresse}
                      onChange={(e) => setAdresse(e.target.value)}
                      disabled={!estAdmin || envoi}
                      maxLength={200}
                      aria-label="Adresse"
                      className={champSage}
                    />
                  </Ligne>
                  <Ligne label="Ville" large>
                    <input
                      value={ville}
                      onChange={(e) => setVille(e.target.value)}
                      disabled={!estAdmin || envoi}
                      maxLength={100}
                      aria-label="Ville"
                      className={champSage}
                    />
                  </Ligne>
                  <Ligne label="Pays" large>
                    <input
                      value={pays}
                      onChange={(e) => setPays(e.target.value)}
                      disabled={!estAdmin || envoi}
                      maxLength={100}
                      aria-label="Pays"
                      className={champSage}
                    />
                  </Ligne>
                  <Ligne label="Téléphone" large>
                    <input
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      disabled={!estAdmin || envoi}
                      maxLength={50}
                      aria-label="Téléphone"
                      className={champSage}
                    />
                  </Ligne>
                  {/* La monnaie se verrouille à la première écriture : changer
                      l'étiquette ne convertit aucun montant déjà saisi. */}
                  <Ligne label="Monnaie de tenue" large>
                    <input
                      value={devise}
                      onChange={(e) => setDevise(e.target.value)}
                      disabled={!estAdmin || envoi || params.nombreEcritures > 0}
                      maxLength={10}
                      aria-label="Monnaie de tenue"
                      className={`${champSage} font-mono`}
                    />
                  </Ligne>
                </div>
                <p className="text-[10.5px] text-text-dim">
                  L’adresse, la ville et le pays composent l’adresse imprimée en tête de chaque état financier.
                  {params.nombreEcritures > 0
                    ? ' La monnaie est verrouillée : ce dossier porte déjà des écritures, et en changer l’étiquette ne convertirait aucun montant.'
                    : ''}
                </p>
                {estAdmin && (
                  <div>
                    <button
                      type="submit"
                      disabled={envoi}
                      className="border border-border rounded-[6px] bg-surface px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt disabled:opacity-60"
                    >
                      Enregistrer
                    </button>
                  </div>
                )}
              </form>
              {/* Ce qui NE SE CHANGE PAS, et pourquoi · le référentiel sème le
                  plan de comptes à la création, la longueur des comptes
                  structure chaque numéro déjà saisi. */}
              <div>
                {(
                  [
                    ['Référentiel', params.referentiel],
                    ['Longueur des comptes', `${params.longueurCompte} caractères`],
                    ['Écritures enregistrées', String(params.nombreEcritures)],
                  ] as [string, string | null][]
                ).map(([cle, valeur]) => (
                  <Ligne key={cle} label={cle} large>
                    <div className="text-[11px] leading-[26px] font-medium">{valeur || '·'}</div>
                  </Ligne>
                ))}
              </div>
              <SectionTitre>Immatriculation</SectionTitre>
              <form onSubmit={enregistrerIdentite} className="flex flex-col gap-3">
                <p className="text-[10.5px] text-text-dim">
                  Le numéro d’impôt est porté en tête de chaque page imprimée, au même titre que la dénomination, la
                  date de clôture et la durée de l’exercice.
                  {estSycebnl
                    ? ' L’acte de personnalité juridique est celui qui reconnaît l’entité (loi n° 004/2001) ; les autres identifiants servent aux dossiers déposés auprès des ministères et des bailleurs.'
                    : ''}
                </p>
                <div>
                  {champsImmatriculation.map(({ label, valeur, set, exemple, date }) => (
                    <Ligne key={label} label={label}>
                      <input
                        type={date ? 'date' : 'text'}
                        value={valeur}
                        onChange={(e) => set(e.target.value)}
                        placeholder={exemple}
                        disabled={!estAdmin || envoi}
                        {...(date ? {} : { maxLength: 120 })}
                        aria-label={label}
                        className={date ? champSage : `${champSage} font-mono`}
                      />
                    </Ligne>
                  ))}
                </div>
                {estSycebnl && (
                  <p className="text-[10.5px] text-text-dim">
                    <span className="font-bold">Important !</span> Une entité à but non lucratif n’est pas
                    immatriculée au registre du commerce : l’Acte uniforme sur le droit commercial général (art. 2)
                    n’y assujettit que les commerçants et les sociétés. Le champ RCCM n’est donc pas proposé ici.
                    L’identification nationale reste facultative, elle n’est requise que des agents économiques.
                  </p>
                )}
                {estAdmin && (
                  <div>
                    <button
                      type="submit"
                      disabled={envoi}
                      className="border border-border rounded-[6px] bg-surface px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt disabled:opacity-60"
                    >
                      Enregistrer
                    </button>
                  </div>
                )}
              </form>
            </>
          )}

          {/* DEUX LISTES SANS AUCUNE VALEUR COMMUNE · un dossier SYSCOHADA se
              voyait proposer « association confessionnelle » et « établissement
              d'utilité publique », qui sont des formes de la loi congolaise sur
              les ASBL. Une entité SYSCOHADA tient sa forme du droit OHADA des
              affaires, et le serveur refuse d'ailleurs le croisement. */}
          {onglet === 'forme' && params.referentiel === 'SYCEBNL' && (
            <>
              <SectionTitre>Forme juridique</SectionTitre>
              <div className="flex flex-col gap-2">
                <p className="text-[10.5px] text-text-dim">
                  Au sens de la loi n° 004/2001 du 20 juillet 2001. Ce choix ne change pas vos états financiers : il
                  détermine les obligations annuelles proposées par le planning de clôture.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FORMES.map((f) => {
                    const actif = params.formeJuridique === f.valeur;
                    return (
                      <label
                        key={f.valeur}
                        className={`flex items-start gap-2.5 rounded-[8px] border p-2.5 transition-colors ${
                          actif ? 'border-sel bg-sel-soft' : 'border-border hover:bg-surface-alt'
                        } ${estAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                      >
                        <input
                          type="radio"
                          name="formeJuridique"
                          className="mt-0.5"
                          checked={actif}
                          disabled={!estAdmin || envoi}
                          onChange={() => changerForme(f.valeur)}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold">{f.titre}</span>
                          <span className="block text-[10.5px] text-text-dim mt-0.5">{f.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-[10.5px] mt-1">
                  <input
                    type="checkbox"
                    checked={params.droitEtranger ?? false}
                    disabled={!estAdmin || envoi}
                    // Bloc rendu sous `params.referentiel === 'SYCEBNL'` · la forme
                    // juridique de la loi n° 004/2001 y est nécessairement servie.
                    onChange={(e) => params.formeJuridique && changerForme(params.formeJuridique, e.target.checked)}
                  />
                  Entité de droit étranger (art. 29 à 34 et art. 37 : accord-cadre avec le Ministère du Plan)
                </label>
              </div>
            </>
          )}

          {onglet === 'forme' && params.referentiel === 'SYSCOHADA' && (
            <>
              <SectionTitre>
                Forme juridique OHADA <Aide sujet="formeJuridiqueSyscohada" />
              </SectionTitre>
              <div className="flex flex-col gap-2">
                <p className="text-[10.5px] text-text-dim">
                  Au sens du droit OHADA des affaires · l’AUSCGIE pour les sociétés commerciales et le groupement
                  d’intérêt économique, l’AUSCOOP pour les coopératives, l’AUDCG pour le commerçant personne physique
                  et l’entreprenant. Ce choix ne change pas vos états financiers : il détermine les obligations
                  annuelles proposées par le planning de clôture, qui ne sont pas les mêmes selon que l’entité tient
                  une assemblée générale, dépose au registre du commerce, ou ni l’un ni l’autre.
                </p>
                {params.formeJuridiqueSyscohada === null && (
                  <p className="text-[10.5px] text-text-dim border border-border rounded-[7px] p-2.5 leading-[1.55]">
                    <strong>Aucune forme n’est encore renseignée.</strong> Le planning de clôture n’affiche donc, pour
                    l’instant, que les jalons communs à toutes les entités · ni l’assemblée générale, ni le dépôt au
                    registre du commerce, qui dépendent de la forme. Elle se lit dans vos statuts.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FORMES_SYSCOHADA.map((f) => {
                    const actif = params.formeJuridiqueSyscohada === f.valeur;
                    return (
                      <label
                        key={f.valeur}
                        className={`flex items-start gap-2.5 rounded-[8px] border p-2.5 transition-colors ${
                          actif ? 'border-sel bg-sel-soft' : 'border-border hover:bg-surface-alt'
                        } ${estAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                      >
                        <input
                          type="radio"
                          name="formeJuridiqueSyscohada"
                          className="mt-0.5"
                          checked={actif}
                          disabled={!estAdmin || envoi}
                          onChange={() => changerFormeSyscohada(f.valeur)}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold">{f.titre}</span>
                          <span className="block text-[10.5px] text-text-dim mt-0.5 leading-[1.5]">{f.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10.5px] text-text-dim mt-1 leading-[1.55]">
                  Les montants de capital sont ceux de l’Acte uniforme, exprimés en francs CFA. Celui de la SARL ne
                  s’applique PAS en RDC : l’article 311 réserve le cas de « dispositions nationales contraires », et
                  l’arrêté interministériel n° 002/CAB/MIN/JGS&amp;DH/014 et n° 243/CAB/MIN/FINANCES/2014 du 30
                  décembre 2014 laisse les associés fixer librement le capital compte tenu de l’objet social. Le même
                  arrêté rend le notaire facultatif pour les statuts. La transformation d’une société en une autre
                  forme est par ailleurs prévue par l’article 181 : ce choix se corrige à tout moment.
                </p>
              </div>
            </>
          )}

          {onglet === 'regime' && (
            <>
              <SectionTitre>Régime fiscal et effectif</SectionTitre>
              <div className="space-y-3">
                {/* IMPÔT SUR LES BÉNÉFICES · bloc d'information, pas un
                    réglage : le régime ne se stocke pas ici, il se déduit du
                    chiffre d'affaires de l'exercice dans la fenêtre Fiscalité,
                    et un régime figé au dossier se périmerait dès le
                    franchissement d'un seuil. Ce qui change ici entre les deux
                    référentiels n'est pas la présentation mais le fond · une
                    ASBL peut être EXEMPTÉE, une société ne l'est jamais. */}
                {params.referentiel === 'SYSCOHADA' && (
                  <div className="border border-border rounded-[7px] p-2.5">
                    <span className="block text-[11px] font-semibold">Impôt sur les bénéfices</span>
                    <span className="block text-[10px] text-text-dim leading-[1.55] mt-1">
                      Depuis le 1<sup>er</sup> janvier 2026, la loi n° 23/053 du 30 novembre 2023 a remplacé l’impôt
                      professionnel sur les bénéfices par deux impôts distincts, selon que l’entité est une personne
                      morale ou une personne physique. L’<strong>IPR et l’IBP n’existent plus</strong> : un logiciel ou
                      un conseil qui les mobilise encore raisonne sous un régime abrogé.
                    </span>
                    <ul className="block text-[10px] text-text-dim leading-[1.55] mt-1.5 list-disc pl-4 space-y-1">
                      <li>
                        <strong>Personnes morales</strong> · impôt sur les sociétés à 30 % du bénéfice net imposable
                        (art. 56), avec un impôt minimum de 1 % du chiffre d’affaires déclaré lorsque le résultat est
                        déficitaire, ou bénéficiaire mais donnant un impôt inférieur (art. 57).
                      </li>
                      <li>
                        <strong>Personnes physiques</strong> · entreprise individuelle et entreprenant relèvent de
                        l’impôt sur le revenu, dont le régime dépend du chiffre d’affaires annuel hors taxes :
                        micro-entreprise jusqu’à 25 000 000,00 FC, imposée à un forfait annuel (art. 107 et 128) ;
                        petite entreprise de 25 000 001,00 à 300 000 000,00 FC, imposée à 1 % du chiffre d’affaires
                        pour la vente et 2 % pour les prestations de services (art. 109 et 127) ; régime réel au-delà
                        (art. 112). Le déclassement suppose deux exercices consécutifs sous le seuil, le surclassement
                        est immédiat (art. 113).
                      </li>
                    </ul>
                    <span className="block text-[10px] text-text-dim leading-[1.55] mt-1.5">
                      Ces seuils et ce forfait sont réajustables par arrêté du Ministre des Finances · vérifiez-les
                      avant de les opposer à un client. La fenêtre <strong>Fiscalité</strong> monte le tableau de
                      passage du résultat comptable au résultat fiscal, liquide l’impôt et calcule les acomptes ·
                      l’imprimé officiel de déclaration, lui, reste à remplir à la main tant que le modèle n’est pas
                      en notre possession.
                    </span>
                  </div>
                )}
                <label className="flex items-start gap-2 text-[10.5px]">
                  <input
                    type="checkbox"
                    className="mt-[3px]"
                    checked={params.assujettiTva}
                    disabled={!estAdmin || envoi}
                    onChange={(e) => changerRegime({ assujettiTva: e.target.checked })}
                  />
                  <span>
                    Entité assujettie à la TVA
                    {params.referentiel === 'SYCEBNL' ? (
                      <span className="block text-[10px] text-text-dim leading-[1.5] mt-0.5">
                        Une association ne l’est pas de plein droit. Le seuil est de 80 000 000 FC de chiffre
                        d’affaires annuel hors taxes (ordonnance-loi n° 10/001, art. 14) ; en deçà, l’option est
                        possible et engage deux ans. Les opérations conformes à l’objet sont par ailleurs exonérées
                        (art. 15, 2° et 17, 8°). Décochée, la TVA supportée n’est pas récupérable et se porte en
                        charge.
                      </span>
                    ) : (
                      <span className="block text-[10px] text-text-dim leading-[1.5] mt-0.5">
                        L’assujettissement est de PLEIN DROIT dès 80 000 000 FC de chiffre d’affaires annuel hors
                        taxes (ordonnance-loi n° 10/001, art. 14) · à la différence d’une association, une entité
                        commerciale qui atteint ce seuil n’a rien à choisir. En deçà, l’option reste possible sur
                        demande expresse à l’administration, et elle est définitive pendant deux ans. Une fois
                        assujettie, l’entité conserve cette qualité pendant les deux années qui suivent le constat de
                        la baisse sous le seuil. Décochée, la TVA supportée n’est pas récupérable et se porte en
                        charge.
                      </span>
                    )}
                  </span>
                </label>
                {/* RÉGIME D'EXIGIBILITÉ · n'a de sens qu'assujetti. Il ne change
                    pas le MONTANT de la taxe mais la PÉRIODE où elle est due,
                    ce qui est la première cause d'écart sur une déclaration. */}
                {params.assujettiTva && (
                  <label className="block text-[10.5px]">
                    Exigibilité de la TVA
                    <select
                      value={params.regimeExigibiliteTva}
                      disabled={!estAdmin || envoi}
                      onChange={(e) => changerRegime({ regimeExigibiliteTva: e.target.value as RegimeExigibiliteTva })}
                      className="mt-1 block w-full max-w-[420px] border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] focus:outline-none focus:border-sel"
                    >
                      <option value="LIVRAISONS">Livraisons · taxe due à la livraison du bien (art. 25, 1°)</option>
                      <option value="ENCAISSEMENTS">Encaissements · taxe due au règlement (art. 25, 2°)</option>
                      <option value="DEBITS">Débits · sur autorisation du DGI (art. 26)</option>
                    </select>
                    <span className="block text-[10px] text-text-dim leading-[1.5] mt-1">
                      Pour les PRESTATIONS DE SERVICES et les travaux immobiliers, le régime de droit commun est celui
                      de l’<strong>encaissement</strong> : une facture émise en mars et réglée en juin se déclare en
                      juin. Laisser « Livraisons » sur un dossier de services fait verser chaque mois une taxe qui n’a
                      pas encore été encaissée. Le régime des débits ne s’ouvre que sur autorisation écrite du Directeur
                      Général des Impôts, et ne dispense pas de payer à l’encaissement s’il précède la facture.
                    </span>
                  </label>
                )}
                <label className="block text-[10.5px]">
                  Effectif permanent
                  <input
                    type="number"
                    min={0}
                    defaultValue={params.effectifPermanent}
                    disabled={!estAdmin || envoi}
                    onBlur={(e) => {
                      const valeur = Number(e.target.value);
                      if (Number.isFinite(valeur) && valeur !== params.effectifPermanent) {
                        changerRegime({ effectifPermanent: Math.max(0, Math.trunc(valeur)) });
                      }
                    }}
                    className="mt-1 w-32 border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] focus:outline-none focus:border-sel"
                  />
                  {params.referentiel === 'SYCEBNL' ? (
                    <span className="block text-[10px] text-text-dim leading-[1.5] mt-1">
                      Au-delà de vingt personnes, la désignation d’un auditeur devient obligatoire (SYCEBNL, art. 19,
                      troisième critère). Ce nombre commande aussi la tranche de cotisation INPP.
                    </span>
                  ) : (
                    <span className="block text-[10px] text-text-dim leading-[1.5] mt-1">
                      Au-delà de cinquante personnes, l’effectif devient l’un des trois critères de désignation
                      obligatoire d’un commissaire aux comptes dans une SARL (AUSCGIE, art. 376) et dans une SAS
                      (art. 853-13) · il en faut DEUX sur trois, les deux autres étant le total du bilan au-delà de
                      125 000 000 FCFA et le chiffre d’affaires annuel au-delà de 250 000 000 FCFA. Dans une société
                      anonyme, le commissaire aux comptes est obligatoire sans condition de taille (art. 702). Ce
                      nombre commande aussi la tranche de cotisation INPP.
                    </span>
                  )}
                </label>

                {/* COTISATIONS · propre au jeu associations et ordres
                    professionnels. Un projet de développement est financé par
                    un bailleur, il n'appelle pas de cotisation, et le serveur
                    refuse le réglage · le montrer serait une promesse fausse. */}
                {params.referentiel === 'SYCEBNL' &&
                  params.jeuEtatsFinanciersSycebnl === 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' && (
                    <label className="block text-[10.5px]">
                      Comptabilisation des cotisations et du droit d’entrée
                      <select
                        value={params.methodeCotisations ?? ''}
                        disabled={!estAdmin || envoi}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'APPEL' || v === 'ENCAISSEMENT') changerMethodeCotisations(v);
                        }}
                        className="mt-1 block w-full max-w-[420px] border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] focus:outline-none focus:border-sel"
                      >
                        <option value="" disabled>
                          À trancher · lire les statuts
                        </option>
                        <option value="APPEL">À l’appel · l’entité justifie d’un droit d’agir en recouvrement</option>
                        <option value="ENCAISSEMENT">À l’encaissement effectif · aucune voie de recouvrement</option>
                      </select>
                      <span className="block text-[10px] text-text-dim leading-[1.5] mt-1">
                        Cadre conceptuel § 5.4.2.1 : le fait générateur est l’<strong>appel</strong>, « toutefois, si
                        l’entité ne peut justifier d’un droit d’agir en recouvrement, les cotisations et le droit
                        d’entrée sont comptabilisés lors de leur encaissement effectif ». Ce n’est donc pas une
                        préférence de méthode mais un fait à vérifier dans les statuts. Le même paragraphe impose de
                        « préciser dans les notes annexes, la méthode retenue ». À l’encaissement, les modèles
                        d’appel de cotisation sont refusés : ils inscriraient au 411 des créances que l’entité n’a
                        aucun moyen de poursuivre.
                      </span>
                    </label>
                  )}
              </div>
            </>
          )}

          {/* DEUX CONTENUS pour un même onglet · un dossier SYSCOHADA se
              voyait proposer les trois jeux du SYCEBNL, qui ne le concernent
              pas et que le serveur refuse de toute façon. */}
          {onglet === 'referentiel' && params.referentiel === 'SYSCOHADA' && (
            <>
              <SectionTitre>Système comptable SYSCOHADA</SectionTitre>
              <div className="flex flex-col gap-2">
                {SYSTEMES_SYSCOHADA.map((c) => {
                  const actif = params.systemeComptableSyscohada === c.valeur;
                  const modifiable = estAdmin && !verrouille && !envoi;
                  return (
                    <label
                      key={c.valeur}
                      className={`flex items-start gap-2.5 rounded-[8px] border p-3 transition-colors ${
                        actif ? 'border-sel bg-sel-soft' : 'border-border'
                      } ${modifiable ? 'cursor-pointer hover:border-sel/50' : 'cursor-default'}`}
                    >
                      <input
                        type="radio"
                        name="systemeSyscohada"
                        className="mt-0.5"
                        checked={actif}
                        disabled={!modifiable}
                        onChange={() => changerSysteme(c.valeur)}
                      />
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold flex items-center gap-1.5">
                          {c.titre}
                          <Aide sujet="systemeSyscohada" />
                        </span>
                        <span className="block text-[10.5px] text-text-dim mt-1 leading-[1.5]">{c.description}</span>
                      </span>
                    </label>
                  );
                })}
                <p className="text-[10.5px] text-text-dim mt-1 leading-[1.55]">
                  {verrouille
                    ? `Ce dossier porte ${params.nombreEcritures} écriture(s) : le système comptable est désormais figé. Pour tenir une entité relevant de l'autre système, créez un dossier distinct.`
                    : estAdmin
                      ? "Le choix reste modifiable tant qu'aucune écriture n'est saisie. Passé la première écriture, il sera figé."
                      : 'Seul un administrateur peut modifier le système comptable.'}
                </p>
              </div>
            </>
          )}

          {onglet === 'referentiel' && params.referentiel === 'SYCEBNL' && (
            <>
              <SectionTitre>Jeu d'états financiers SYCEBNL</SectionTitre>
              <div className="flex flex-col gap-2">
                {CHOIX.map((c) => {
                  const actif = params.jeuEtatsFinanciersSycebnl === c.valeur;
                  const modifiable = estAdmin && !verrouille && !envoi;
                  return (
                    <label
                      key={c.valeur}
                      className={`flex items-start gap-2.5 rounded-[8px] border p-3 transition-colors ${
                        actif ? 'border-sel bg-sel-soft' : 'border-border'
                      } ${modifiable ? 'cursor-pointer hover:border-sel/50' : 'cursor-default'}`}
                    >
                      <input
                        type="radio"
                        name="jeuEtats"
                        className="mt-0.5"
                        checked={actif}
                        disabled={!modifiable}
                        onChange={() => changerJeu(c.valeur)}
                      />
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold flex items-center gap-1.5">
                          {c.titre}
                          {c.valeur === 'SYSTEME_MINIMAL_TRESORERIE' && <Aide sujet="smt" />}
                        </span>
                        <span className="block text-[10.5px] text-text-dim mt-1">{c.etats.join(' · ')}</span>
                      </span>
                    </label>
                  );
                })}

                <p className="text-[10.5px] text-text-dim mt-1 leading-[1.55]">
                  {verrouille
                    ? `Ce dossier porte ${params.nombreEcritures} écriture(s) : le jeu d'états financiers est désormais figé. Pour tenir une entité de l'autre type, créez un dossier distinct.`
                    : estAdmin
                      ? "Le choix reste modifiable tant qu'aucune écriture n'est saisie. Passé la première écriture, il sera figé."
                      : "Seul un administrateur peut modifier le jeu d'états financiers."}
                </p>
              </div>
            </>
          )}
        </OngletsVerticaux>
      )}
    </div>
  );
}
