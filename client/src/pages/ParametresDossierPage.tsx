import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import type { FormeJuridiqueEbnl, JeuEtatsFinanciersSycebnl, ParametresDossier, RegimeExigibiliteTva } from '../lib/types';

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

export function ParametresDossierPage() {
  const { estAdmin, rafraichir } = useAuth();
  const [params, setParams] = useState<ParametresDossier | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Identifiants légaux · saisis à part du reste, parce qu'ils sont les seuls
  // paramètres modifiables à tout moment (voir TenantService.modifierIdentite).
  const [numeroImpot, setNumeroImpot] = useState('');
  const [idNat, setIdNat] = useState('');
  const [rccm, setRccm] = useState('');

  const charger = async () => {
    try {
      const p = await api.get<ParametresDossier>('/dossier/parametres');
      setParams(p);
      setNumeroImpot(p.numeroImpot ?? '');
      setIdNat(p.idNat ?? '');
      setRccm(p.rccm ?? '');
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

  const enregistrerIdentite = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(await api.patch<ParametresDossier>('/dossier/identite', { numeroImpot, idNat, rccm }));
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
    <div className="p-2">
      <div className="mb-2.5">
        <div className="text-[10px] font-mono text-text-dim leading-none">STRUCTURE</div>
        <h1 className="text-[13px] font-bold leading-tight">Paramètres du dossier</h1>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[12px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5">
          {info}
        </div>
      )}

      {!params ? (
        <div className="text-[12px] text-text-dim">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-2.5 items-start">
          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
            <header className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center gap-1.5">
              <span className="text-[11.5px] font-bold">Jeu d'états financiers SYCEBNL</span>
              <Aide sujet="jeuEtats" />
            </header>
            <div className="p-3 flex flex-col gap-2">
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
                      <span className="block text-[13px] font-semibold flex items-center gap-1.5">
                        {c.titre}
                        {c.valeur === 'SYSTEME_MINIMAL_TRESORERIE' && <Aide sujet="smt" />}
                      </span>
                      <span className="block text-[11.5px] text-text-dim mt-1">{c.etats.join(' · ')}</span>
                    </span>
                  </label>
                );
              })}

              <p className="text-[11.5px] text-text-dim mt-1 leading-[1.55]">
                {verrouille
                  ? `Ce dossier porte ${params.nombreEcritures} écriture(s) : le jeu d'états financiers est désormais figé. Pour tenir une entité de l'autre type, créez un dossier distinct.`
                  : estAdmin
                    ? "Le choix reste modifiable tant qu'aucune écriture n'est saisie. Passé la première écriture, il sera figé."
                    : "Seul un administrateur peut modifier le jeu d'états financiers."}
              </p>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
            <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
              Identification
            </header>
            <dl className="p-3 text-[12px] flex flex-col gap-2">
              {(
                [
                  ['Raison sociale', params.nom],
                  ['Référentiel', params.referentiel],
                  ['Activité', params.activite],
                  ['Adresse', params.adresse],
                  ['Ville', params.ville],
                  ['Pays', params.pays],
                  ['Téléphone', params.telephone],
                  ['Monnaie de tenue', params.devise],
                  ['N° impôt', params.numeroImpot],
                  ['Identification nationale', params.idNat],
                  ['RCCM', params.rccm],
                  ['Longueur des comptes', `${params.longueurCompte} caractères`],
                  ['Écritures enregistrées', String(params.nombreEcritures)],
                ] as [string, string | null][]
              ).map(([cle, valeur]) => (
                <div key={cle} className="flex justify-between gap-3">
                  <dt className="text-text-dim">{cle}</dt>
                  <dd className="text-right font-medium">{valeur || '·'}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/*
            Forme juridique · loi n° 004/2001. Elle ne touche à aucun état
            financier ; elle décide des obligations annuelles que le planning
            de clôture propose (Fin d'exercice). Une ASBL dépose son compte
            annuel au Ministère de la Justice et n'est pas immatriculée au
            RCCM ; une ONG rend compte en plus au Ministère du Plan.
          */}
          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden lg:col-span-2">
            <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
              Forme juridique
            </header>
            <div className="p-3 flex flex-col gap-2">
              <p className="text-[11px] text-text-dim">
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
                        <span className="block text-[12.5px] font-semibold">{f.titre}</span>
                        <span className="block text-[11px] text-text-dim mt-0.5">{f.detail}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-[11.5px] mt-1">
                <input
                  type="checkbox"
                  checked={params.droitEtranger}
                  disabled={!estAdmin || envoi}
                  onChange={(e) => changerForme(params.formeJuridique, e.target.checked)}
                />
                Entité de droit étranger (art. 29 à 34 et art. 37 : accord-cadre avec le Ministère du Plan)
              </label>
            </div>
          </section>

          {/*
            RÉGIME FISCAL ET EFFECTIF · deux champs ajoutés après l'audit du
            29 août 2026, parce que leur absence faisait appliquer au dossier
            des règles qui ne sont pas les siennes.
          */}
          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
            <div className="bg-chrome-alt border-b border-border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-dim">
              Régime fiscal et effectif
            </div>
            <div className="p-4 space-y-3">
              <label className="flex items-start gap-2 text-[11.5px]">
                <input
                  type="checkbox"
                  className="mt-[3px]"
                  checked={params.assujettiTva}
                  disabled={!estAdmin || envoi}
                  onChange={(e) => changerRegime({ assujettiTva: e.target.checked })}
                />
                <span>
                  Entité assujettie à la TVA
                  <span className="block text-[10.5px] text-text-dim leading-[1.5] mt-0.5">
                    Une association ne l’est pas de plein droit. Le seuil est de 80 000 000 FC de chiffre d’affaires
                    annuel hors taxes (ordonnance-loi n° 10/001, art. 14) ; en deçà, l’option est possible et engage
                    deux ans. Les opérations conformes à l’objet sont par ailleurs exonérées (art. 15, 2° et 17, 8°).
                    Décochée, la TVA supportée n’est pas récupérable et se porte en charge.
                  </span>
                </span>
              </label>
              {/* RÉGIME D'EXIGIBILITÉ · n'a de sens qu'assujetti. Il ne change
                  pas le MONTANT de la taxe mais la PÉRIODE où elle est due,
                  ce qui est la première cause d'écart sur une déclaration. */}
              {params.assujettiTva && (
                <label className="block text-[11.5px]">
                  Exigibilité de la TVA
                  <select
                    value={params.regimeExigibiliteTva}
                    disabled={!estAdmin || envoi}
                    onChange={(e) => changerRegime({ regimeExigibiliteTva: e.target.value as RegimeExigibiliteTva })}
                    className="mt-1 block w-full max-w-[420px] border border-border rounded-[7px] bg-bg px-2 py-1 text-[12px] focus:outline-none focus:border-sel"
                  >
                    <option value="LIVRAISONS">Livraisons · taxe due à la livraison du bien (art. 25, 1°)</option>
                    <option value="ENCAISSEMENTS">Encaissements · taxe due au règlement (art. 25, 2°)</option>
                    <option value="DEBITS">Débits · sur autorisation du DGI (art. 26)</option>
                  </select>
                  <span className="block text-[10.5px] text-text-dim leading-[1.5] mt-1">
                    Pour les PRESTATIONS DE SERVICES et les travaux immobiliers, le régime de droit commun est celui
                    de l’<strong>encaissement</strong> : une facture émise en mars et réglée en juin se déclare en
                    juin. Laisser « Livraisons » sur un dossier de services fait verser chaque mois une taxe qui n’a
                    pas encore été encaissée. Le régime des débits ne s’ouvre que sur autorisation écrite du Directeur
                    Général des Impôts, et ne dispense pas de payer à l’encaissement s’il précède la facture.
                  </span>
                </label>
              )}
              <label className="block text-[11.5px]">
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
                  className="mt-1 w-32 border border-border rounded-[7px] bg-bg px-2 py-1 text-[12px] focus:outline-none focus:border-sel"
                />
                <span className="block text-[10.5px] text-text-dim leading-[1.5] mt-1">
                  Au-delà de vingt personnes, la désignation d’un auditeur devient obligatoire (SYCEBNL, art. 19,
                  troisième critère). Ce nombre commande aussi la tranche de cotisation INPP.
                </span>
              </label>
            </div>
          </section>

          {/*
            Identifiants légaux · le CPCC (« Notes de cours d'organisation
            comptable », § 7.4 règle 7-a) exige le n° d'identification fiscale
            en tête de CHAQUE page d'un état déposé, à côté de la dénomination,
            de la date de clôture et de la durée en mois. Sans ce champ,
            OmegaX ne pouvait pas l'imprimer. Voir
            docs/organisation-comptable-cpcc.md § 2.1.
            Modifiables à tout moment, contrairement au jeu d'états : une
            association obtient souvent ses numéros après avoir commencé à
            tenir ses comptes.
          */}
          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden lg:col-span-2">
            <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
              Identifiants légaux
            </header>
            <form onSubmit={enregistrerIdentite} className="p-3 flex flex-col gap-3">
              <p className="text-[11px] text-text-dim">
                Portés en tête de chaque page imprimée. Le numéro d’impôt y est exigé au même titre que la
                dénomination, la date de clôture et la durée de l’exercice.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    ['N° impôt (DGI)', numeroImpot, setNumeroImpot, 'A1234567B'],
                    ['Identification nationale', idNat, setIdNat, '01-93-K12345C'],
                    ['RCCM', rccm, setRccm, 'CD/KIN/RCCM/23-B-01234'],
                  ] as [string, string, (v: string) => void, string][]
                ).map(([label, valeur, set, exemple]) => (
                  <label key={label} className="flex flex-col gap-1 text-[11px]">
                    <span className="text-text-dim">{label}</span>
                    <input
                      value={valeur}
                      onChange={(e) => set(e.target.value)}
                      placeholder={exemple}
                      disabled={!estAdmin || envoi}
                      maxLength={40}
                      className="border border-border rounded-[6px] px-2 py-1.5 text-[12px] font-mono bg-bg disabled:opacity-60"
                    />
                  </label>
                ))}
              </div>
              {estAdmin && (
                <div>
                  <button
                    type="submit"
                    disabled={envoi}
                    className="border border-border rounded-[6px] bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt disabled:opacity-60"
                  >
                    Enregistrer
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
