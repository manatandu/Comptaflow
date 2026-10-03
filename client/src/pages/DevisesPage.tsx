import { FormEvent, useEffect, useState } from 'react';
import { exercicesDeContrePassation } from '../lib/contre-passation';
import { api, ApiError } from '../lib/api';
import { montant } from '../lib/montants';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { Devise, Exercice, RapportReevaluation, Reevaluation } from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { sousFonctionServie } from '../lib/profil-dossier';
import { cotationBorneeAuCoursDuJour, DEVISE_COTEE_PAR_LA_PAIE, jourDeKinshasaIso } from '../lib/roles-cantonnes';
import { libelleExercice } from '../lib/libelle-exercice';
import { ProvisionChangeOuverture } from '../components/ProvisionChangeOuverture';
import { PortailModale } from '../components/PortailModale';
import { MOTIF_ANNULATION_MAX, motifRefusMotifAnnulation } from '../lib/motif-annulation';

/**
 * DEVISES ET RÉÉVALUATION · Structure → devises et Traitement → Réévaluation
 * des dettes et créances en devise chez Sage 100 i7, calés sur la RDC.
 *
 * L'écran affiche séparément ce que LES DEUX RÉFÉRENTIELS séparent, et qu'un
 * progiciel généraliste écrase : l'écart LATENT d'une créance ou d'une dette,
 * qui va au 478 ou au 479 et appelle une provision s'il est défavorable, et
 * l'écart RÉALISÉ d'une disponibilité en devise, qui va droit au résultat en
 * 676 ou 776. Les comptes portent les mêmes numéros dans les deux plans ; la
 * source, non · SYCEBNL Partie 3 d'un côté, AUDCIF art. 54 (« écarts de
 * conversion actif ou passif », « les gains latents n'interviennent pas dans
 * la formation du résultat ») et art. 57 (« les disponibilités en devises …
 * les écarts constatés sont inscrits directement dans les produits et charges
 * de l'exercice ») de l'autre. Cette distinction commande deux postes du bilan, BY et DY, que le
 * logiciel affichait jusqu'ici à zéro faute de mécanisme.
 */

/**
 * Un cours n'est pas un montant · il se garde à six décimales en base, et
 * l'écran le montre avec elles plutôt que de l'arrondir au centime comme un
 * solde (audit final F256).
 */
function cours(n: number | string): string {
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
}
/**
 * Une réévaluation sans position peut encore avoir à REPRENDRE la provision
 * d'une créance ou d'une dette dénouée (AUDCIF Titre VIII ch. 22 § 2.3) · le
 * bouton se montre alors aussi, comme le serveur l'admet.
 */
function aAjusterLaProvision(r: Pick<RapportReevaluation, 'ajustementsProvision'>): boolean {
  return r.ajustementsProvision.some((a) => a.dotation > 0.005 || a.reprise > 0.005);
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}


export function DevisesPage() {
  const { estAdmin, peutEcrire, peutValider, utilisateur } = useAuth();
  // Au SMT, la réévaluation se masque, les cours restent (audit final F178) ·
  // une réévaluation déjà passée reste lisible et contre-passable.
  const reevaluationServie = sousFonctionServie('reevaluation', utilisateur?.tenant);
  // Le gestionnaire de paie ne vient ici que coter le cours de l'USD du jour
  // (audit final F247) · le serveur lui ferme la réévaluation et borne la
  // cotation à ce cours, l'écran ne lui propose que ce geste.
  const coursDuJourSeul = cotationBorneeAuCoursDuJour(utilisateur?.role);
  const jourDuCours = jourDeKinshasaIso(new Date());
  const { exerciceCourant } = useExercice();
  // null tant que la liste n'est pas lue · « Aucune devise » ne se dit que
  // d'une liste LUE, jamais d'un échec de lecture.
  const [devises, setDevises] = useState<Devise[] | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [reevaluations, setReevaluations] = useState<Reevaluation[]>([]);
  const [rapport, setRapport] = useState<RapportReevaluation | null>(null);
  // Position globale de change · décochée par défaut. Voir le libellé de la
  // case : le texte la subordonne à une justification par l'entité, et elle
  // DIMINUE une provision.
  const [positionGlobale, setPositionGlobale] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [deviseCours, setDeviseCours] = useState('');
  const [dateCours, setDateCours] = useState('');
  const [valeurCours, setValeurCours] = useState('');
  const [dateReeval, setDateReeval] = useState('');


  const charger = async () => {
    try {
      // Les deux demandes sont indépendantes · en parallèle, un aller-retour
      // transatlantique de moins à l'ouverture de la fenêtre.
      const [devises, reevaluations] = await Promise.all([
        api.get<Devise[]>('/devises'),
        exerciceCourant && !coursDuJourSeul
          ? api.get<Reevaluation[]>(`/devises/reevaluation/liste?exerciceId=${exerciceCourant.id}`)
          : Promise.resolve(null),
      ]);
      setDevises(devises);
      if (reevaluations) setReevaluations(reevaluations);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    charger();
    // Les exercices ne servent qu'à la contre-passation d'une réévaluation.
    if (!coursDuJourSeul) api.get<Exercice[]>('/exercices').then(setExercices, () => setExercices([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id]);

  // LA RÉÉVALUATION SE FAIT À LA CLÔTURE (décision D1 · AUDCIF art. 54,
  // Titre VIII ch. 22 § 2.2) · la date est celle de fin de l'exercice, suivie
  // à chaque changement d'exercice, jamais saisie.
  useEffect(() => {
    if (exerciceCourant) {
      setDateReeval(exerciceCourant.dateFin.slice(0, 10));
      setDateCours((d) => d || exerciceCourant.dateFin.slice(0, 10));
    }
  }, [exerciceCourant]);

  const creerDevise = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/devises', { code, intitule });
      setCode('');
      setIntitule('');
      setInfo('Devise ajoutée.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const poserCours = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/devises/${deviseCours}/cours`, {
        date: coursDuJourSeul ? jourDuCours : dateCours,
        cours: Number(valeurCours),
        source: 'BCC',
      });
      setValeurCours('');
      setInfo('Cours enregistré.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Cotation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const calculer = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    try {
      setRapport(
        await api.post<RapportReevaluation>('/devises/reevaluation/calcul', {
          exerciceId: exerciceCourant.id,
          dateReevaluation: dateReeval,
          positionGlobale,
        }),
      );
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Calcul impossible');
      setRapport(null);
    }
  };

  const reevaluer = async () => {
    if (!exerciceCourant) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/devises/reevaluation', {
        exerciceId: exerciceCourant.id,
        dateReevaluation: dateReeval,
        positionGlobale,
      });
      setInfo('Réévaluation passée · ses écritures sont dans le brouillard.');
      setRapport(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Réévaluation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * ANNULER UNE RÉÉVALUATION (ligne A6, décision D6) · inscription en négatif
   * des écritures validées, suppression de celles au brouillard (AUDCIF
   * art. 20, al. 2) ; la réévaluation exacte suit. Motif obligatoire, réservé
   * à qui valide (`peutValider`) · le serveur refuse le reste.
   */
  // La réévaluation en cours d'annulation et son motif · une MODALE de
  // l'interface (`PortailModale`), jamais `window.prompt`.
  const [aAnnuler, setAAnnuler] = useState<{ reevaluation: Reevaluation; motif: string } | null>(null);
  const annulerReevaluation = async () => {
    if (!aAnnuler) return;
    // La règle du DTO (3 à 500 caractères), vérifiée avant l'envoi.
    const refus = motifRefusMotifAnnulation(aAnnuler.motif);
    if (refus) {
      setErreur(refus);
      return;
    }
    setErreur(null);
    try {
      await api.post(`/devises/reevaluations/${aAnnuler.reevaluation.id}/annuler`, { motif: aAnnuler.motif.trim() });
      setAAnnuler(null);
      setInfo('Réévaluation annulée · ses écritures validées sont inscrites en négatif. Réévaluez l’exercice.');
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Annulation impossible');
    }
  };

  const extourner = async (id: string, exerciceSuivantId: string) => {
    setErreur(null);
    try {
      await api.post(`/devises/reevaluation/${id}/extourne`, { exerciceSuivantId });
      setInfo("Écarts contre-passés à l'ouverture de l'exercice suivant.");
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Contre-passation impossible');
    }
  };

  /**
   * Renommer ou mettre en sommeil une devise (audit de l'interface du
   * 2026-09-27, I11) · la route existait sans geste, réservée à
   * l'administrateur comme la création. Le code ne se change pas, la route ne
   * le porte pas.
   */
  const modifierDevise = async (id: string, corps: { intitule?: string; estActive?: boolean }) => {
    setErreur(null);
    try {
      await api.patch(`/devises/${id}`, corps);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  const champ = 'mt-1 w-full border border-border rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-normal';
  // Ce que la cotation propose · pour le gestionnaire de paie, la seule
  // devise que la paie convertit.
  const devisesCotables =
    devises === null ? [] : coursDuJourSeul ? devises.filter((d) => d.code === DEVISE_COTEE_PAR_LA_PAIE) : devises;
  // Le cours du jour déjà coté ne se réécrit pas par le gestionnaire
  // (relecture adverse de F247) · le serveur ne lui ouvre que la CRÉATION,
  // et la clé unique (devise, date) refuse en 409 (`ajouterCours`). L'écran
  // le dit au lieu d'offrir un formulaire qui échouerait. Comparé à
  // l'instant, minuit UTC, comme la clé que la base tient.
  const coursDuJourDejaCote = coursDuJourSeul
    ? (devisesCotables.flatMap((d) => d.cours).find((c) => Date.parse(c.date) === Date.parse(jourDuCours)) ?? null)
    : null;

  return (
    <div className="p-2">
      <EnteteImpression titre="Devises et réévaluation" />
      <div className="mb-1.5 flex justify-end">
        <Aide sujet="devises" />
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11.5px] text-danger bg-danger-soft border border-danger/30 rounded-[3px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[11.5px] text-positive bg-positive-soft border border-positive/30 rounded-[3px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-2.5 items-start">
        <div className="flex flex-col gap-2.5">
          {estAdmin && (
            <form onSubmit={creerDevise} className="bg-surface border border-border rounded-[4px] shadow-posee overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                Ajouter une devise
              </div>
              <div className="p-3 grid grid-cols-[90px_1fr] gap-2">
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Code
                  <input
                    required
                    maxLength={3}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="USD"
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Intitulé
                  <input
                    required
                    value={intitule}
                    onChange={(e) => setIntitule(e.target.value)}
                    placeholder="Dollar américain"
                    className={champ}
                  />
                </label>
                <button
                  type="submit"
                  disabled={envoi}
                  className="col-span-2 bg-sel text-white text-[11.5px] font-bold py-1.5 rounded-[3px] hover:brightness-110 disabled:opacity-50"
                >
                  Ajouter
                </button>
              </div>
            </form>
          )}

          {coursDuJourSeul && devises !== null && devisesCotables.length === 0 && (
            <div className="text-[11.5px] text-warning bg-warning-soft border border-warning/30 rounded-[3px] px-2.5 py-1.5">
              Aucune devise {DEVISE_COTEE_PAR_LA_PAIE} au dossier · l'administrateur l'ajoute avant la première cotation.
            </div>
          )}

          {coursDuJourDejaCote && (
            <div className="text-[11.5px] text-text-dim bg-surface border border-border rounded-[3px] px-2.5 py-1.5">
              Cours de l'{DEVISE_COTEE_PAR_LA_PAIE} du jour coté : {cours(coursDuJourDejaCote.cours)} · une correction se
              demande au comptable.
            </div>
          )}

          {peutEcrire && devisesCotables.length > 0 && !coursDuJourDejaCote && (
            <form onSubmit={poserCours} className="bg-surface border border-border rounded-[4px] shadow-posee overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                Coter un cours
              </div>
              <div className="p-3 flex flex-col gap-2">
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Devise
                  <select required value={deviseCours} onChange={(e) => setDeviseCours(e.target.value)} className={champ}>
                    <option value="">Choisir…</option>
                    {devisesCotables.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.intitule}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Date
                    <input
                      type="date"
                      required
                      value={coursDuJourSeul ? jourDuCours : dateCours}
                      readOnly={coursDuJourSeul}
                      onChange={(e) => setDateCours(e.target.value)}
                      className={`${champ} font-mono`}
                    />
                  </label>
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    <span className="flex items-center gap-1">
                      Cours
                      <Aide
                        titre="Cours"
                        texte="Combien vaut UNE unité de la devise dans la monnaie de tenue du dossier. En RDC, le cours de référence est celui publié par la Banque Centrale du Congo."
                        source="Banque Centrale du Congo"
                      />
                    </span>
                    <input
                      required
                      value={valeurCours}
                      onChange={(e) => setValeurCours(e.target.value)}
                      placeholder="2800"
                      className={`${champ} font-mono`}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={envoi}
                  className="bg-sel text-white text-[11.5px] font-bold py-1.5 rounded-[3px] hover:brightness-110 disabled:opacity-50"
                >
                  Coter
                </button>
              </div>
            </form>
          )}

          <section className="bg-surface border border-border rounded-[4px] shadow-posee overflow-hidden">
            <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
              Devises du dossier
            </div>
            {(devises ?? []).map((d) => (
              <div key={d.id} className="px-3 py-2 border-b border-border/40">
                <div className="text-[11.5px] font-semibold flex items-baseline gap-2">
                  <span>
                    <span className="font-mono">{d.code}</span> {d.intitule}
                    {!d.estActive && <span className="text-text-dim font-normal"> · en sommeil</span>}
                  </span>
                  {estAdmin && (
                    <span className="ml-auto flex gap-2 font-normal text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const nouveau = window.prompt('Intitulé de la devise', d.intitule);
                          if (nouveau?.trim() && nouveau.trim() !== d.intitule) void modifierDevise(d.id, { intitule: nouveau.trim() });
                        }}
                        className="text-sel hover:underline"
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        onClick={() => void modifierDevise(d.id, { estActive: !d.estActive })}
                        className="hover:underline"
                      >
                        {d.estActive ? 'Mettre en sommeil' : 'Réactiver'}
                      </button>
                    </span>
                  )}
                </div>
                {d.cours.length > 0 ? (
                  <div className="text-[11.5px] text-text-dim mt-0.5 font-mono">
                    dernier cours {cours(d.cours[0].cours)} au {jour(d.cours[0].date)}
                  </div>
                ) : (
                  <div className="text-[11.5px] text-warning mt-0.5">aucun cours coté</div>
                )}
              </div>
            ))}
            {devises !== null && devises.length === 0 && (
              <div className="px-3 py-3 text-[11.5px] text-text-dim italic">
                Aucune devise.
              </div>
            )}
          </section>
        </div>

        {!coursDuJourSeul && (reevaluationServie || reevaluations.length > 0) && (
          <section
            // `overflow-x-auto` ici, `min-w` sur les lignes · les 830 px de colonnes
            // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
            // fenêtre à 360 px. Le panneau ROGNAIT (`overflow-hidden`) : la page ne
            // partait pas de côté, mais « ÉCART » était simplement invisible, sans
            // barre de défilement pour aller la chercher.
            className="bg-surface border border-border rounded-[4px] shadow-posee overflow-x-auto"
          >
            <div className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between">
              <span className="text-[11.5px] font-bold flex items-center gap-1.5">
                Réévaluation à la clôture
                <Aide
                  titre="Réévaluation à la clôture"
                  texte={`Le calcul reprend chaque position non lettrée portant une devise, la convertit au cours de la date retenue, et sépare ce que ${
                    utilisateur?.tenant.referentiel === 'SYSCOHADA'
                      ? "l'AUDCIF sépare (art. 54 et 57)"
                      : 'le SYCEBNL sépare'
                  } : l'écart d'une créance ou d'une dette est LATENT et va au 478 ou au 479, celui d'une disponibilité est RÉALISÉ et va droit au résultat en 676 ou 776.`}
                  source={utilisateur?.tenant.referentiel === 'SYSCOHADA' ? 'AUDCIF, art. 54 et 57' : 'SYCEBNL'}
                />
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateReeval}
                  readOnly
                  aria-label="Date de clôture de la réévaluation"
                  title="La réévaluation se fait à la date de clôture de l'exercice (AUDCIF art. 54)"
                  className="border border-border rounded-[3px] px-2 py-1 text-[11.5px] font-mono bg-surface-2"
                />
                <label
                  className="flex items-center gap-1.5 text-[11.5px]"
                  title="AUDCIF art. 58 · la dotation est limitée à l'excédent des pertes probables sur les gains latents, devise par devise. Le texte la subordonne à une justification par l'entité, et elle ne vaut qu'entre éléments dont l'échéance tombe dans le même exercice."
                >
                  <input
                    type="checkbox"
                    checked={positionGlobale}
                    onChange={(e) => {
                      setPositionGlobale(e.target.checked);
                      setRapport(null);
                    }}
                  />
                  Position globale de change
                </label>
                <button
                  onClick={calculer}
                  className="border border-border rounded-[3px] bg-surface px-3 py-1 text-[11.5px] font-semibold hover:bg-chrome"
                >
                  Calculer
                </button>
                {peutEcrire && rapport && rapport.provisionsOuvertureNonDeclarees.length > 0 && (
                  <span className="text-[11.5px] text-warning" data-testid="reserve-provision-ouverture">
                    Déclarez la provision d’ouverture ({rapport.provisionsOuvertureNonDeclarees.map((n) => n.compteProvision).join(', ')}) avant de passer les écritures
                  </span>
                )}
                {peutEcrire && rapport && rapport.provisionsOuvertureExcessives.length > 0 && (
                  <span className="text-[11.5px] text-warning" data-testid="provision-ouverture-excessive">
                    Mettez à jour la provision d’ouverture déclarée ({rapport.provisionsOuvertureExcessives.map((n) => n.compteProvision).join(', ')}) · elle ne concorde pas avec l’ouverture
                  </span>
                )}
                {peutEcrire &&
                  rapport &&
                  rapport.provisionsOuvertureNonDeclarees.length === 0 &&
                  rapport.provisionsOuvertureExcessives.length === 0 &&
                  (rapport.positions.length > 0 || aAjusterLaProvision(rapport)) && (
                  <button
                    onClick={reevaluer}
                    disabled={envoi}
                    className="bg-sel text-white text-[11.5px] font-bold px-3 py-1 rounded-[3px] hover:brightness-110 disabled:opacity-50"
                  >
                    Passer les écritures
                  </button>
                )}
              </span>
            </div>

            {rapport && (
              <>
                {rapport.avertissements.length > 0 && (
                  <div className="mx-3 mt-3 text-[11.5px] text-warning bg-warning-soft border border-warning/30 rounded-[3px] px-2.5 py-2 leading-[1.55]">
                    <strong title="AUDCIF art. 56 · Titre VIII ch. 22 § 2.3">À vérifier.</strong>
                    <ul className="mt-1 list-disc pl-4 flex flex-col gap-1">
                      {rapport.avertissements.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {rapport.positionGlobaleRetenue && rapport.provisionSansPositionGlobale > rapport.provision && (
                  <div className="mx-3 mt-3 text-[11.5px] text-text-dim bg-chrome-alt border border-border rounded-[3px] px-2.5 py-1.5 leading-[1.55]">
                    Position globale de change retenue (AUDCIF art. 58) · sans elle, la dotation serait de{' '}
                    {montant(rapport.provisionSansPositionGlobale)}.
                  </div>
                )}

                {rapport.positionsNonReevaluees.length > 0 && (
                  <div className="mx-3 mt-3 text-[11.5px] text-text-dim bg-chrome-alt border border-border rounded-[3px] px-2.5 py-1.5 leading-[1.55]">
                    <strong title="AUDCIF Titre VIII ch. 22 § 1.1 à 1.4">Positions maintenues au cours d'origine.</strong>
                    <ul className="mt-1 list-disc pl-4 flex flex-col gap-0.5">
                      {rapport.positionsNonReevaluees.map((p) => (
                        <li key={`${p.numero}-${p.deviseCode}`}>
                          {p.numero} {p.intitule} ({p.deviseCode} {montant(p.montantDevise)}) · {p.motif}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {rapport.coursManquants.length > 0 && (
                  <div className="mx-3 mt-3 text-[11.5px] text-warning bg-warning-soft border border-warning/30 rounded-[3px] px-2.5 py-1.5">
                    Aucun cours coté au {jour(rapport.dateReevaluation)} ou avant pour :{' '}
                    {rapport.coursManquants.join(', ')}. Ces positions ne sont pas réévaluées.
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 border-b border-border">
                  {[
                    ['Perte latente (478)', rapport.perteLatente, 'text-danger'],
                    ['Gain latent (479)', rapport.gainLatent, 'text-positive'],
                    ['Perte réalisée (676)', rapport.perteRealisee, 'text-danger'],
                    ['Gain réalisé (776)', rapport.gainRealise, 'text-positive'],
                    ['Provision requise', rapport.provision, 'text-warning'],
                    // Réserve ouverte · la part non déclarée manque, jamais un zéro nu (M2).
                    ['Provision en place', rapport.provisionEnPlaceIncomplete ? null : rapport.provisionEnPlace, 'text-text'],
                  ].map(([libelle, valeur, couleur]) => (
                    <div key={libelle as string}>
                      <div className="text-[11px] text-text-dim">{libelle}</div>
                      <div
                        className={`text-[13px] font-bold font-mono ${valeur ? (couleur as string) : 'text-text-dim'}`}
                        title={valeur === null ? 'Incomplète · provision d’ouverture non déclarée' : undefined}
                      >
                        {montant(valeur)}
                        {valeur === null && <span className="ml-1 text-[11px] font-sans text-warning">incomplète</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {rapport.ajustementsProvision.length > 0 && (
                  <div className="border-b border-border" data-testid="ajustement-provision">
                    <div className="px-3 py-1.5 bg-chrome text-[11px] font-bold text-text-dim flex items-center gap-1.5">
                      Ajustement de la provision pour pertes de change
                      <Aide
                        titre="Provision ajustée, jamais empilée"
                        texte="La provision en place est celle déclarée à l'ouverture, plus celle des réévaluations postérieures à sa date. Seul l'écart avec la provision requise se passe : dotation de la hausse, reprise de la baisse au compte de reprise de sa famille. Une provision dont la position a été dénouée est reprise, même sans aucune position à réévaluer."
                        source="AUDCIF Titre VIII ch. 22 § 2.3 · fiche du compte 19"
                      />
                    </div>
                    <div className="grid grid-cols-[110px_1fr_1fr_1fr_1fr] min-w-[640px] gap-2 px-3 py-1 text-[11px] font-bold text-text-dim border-b border-border/40">
                      <span>PROVISION</span>
                      <span className="text-right">Requise</span>
                      <span className="text-right">En place</span>
                      <span className="text-right">Dotation</span>
                      <span className="text-right">Reprise</span>
                    </div>
                    {rapport.ajustementsProvision.map((a) => (
                      <div
                        key={a.compteProvision}
                        className="grid grid-cols-[110px_1fr_1fr_1fr_1fr] min-w-[640px] gap-2 px-3 py-1 text-[11.5px] border-b border-border/40"
                      >
                        <span>{a.compteProvision}</span>
                        <span className="text-right font-mono">{montant(a.requise)}</span>
                        <span
                          className="text-right font-mono"
                          title={
                            a.enPlaceIncomplete
                              ? 'Incomplète · provision d’ouverture non déclarée'
                              : a.declaree == null
                                ? 'Aucune provision déclarée à l’ouverture'
                                : `Dont ${montant(a.declaree)} déclarés à l’ouverture`
                          }
                        >
                          {a.enPlaceIncomplete ? (
                            <>
                              {montant(null)} <span className="font-sans text-warning">incomplète</span>
                            </>
                          ) : (
                            montant(a.enPlace)
                          )}
                        </span>
                        {/* Calculées sur une provision incomplète · provisoires, dit par le serveur. */}
                        <span className="text-right font-mono" title={a.montantsProvisoires ? 'Provisoire · provision d’ouverture non déclarée' : undefined}>
                          {a.dotation > 0 ? `${montant(a.dotation)} (${a.compteDotation})` : montant(0)}
                          {a.montantsProvisoires && <span className="ml-1 font-sans text-warning">provisoire</span>}
                        </span>
                        <span className="text-right font-mono" title={a.montantsProvisoires ? 'Provisoire · provision d’ouverture non déclarée' : undefined}>
                          {a.reprise > 0 ? `${montant(a.reprise)} (${a.compteReprise})` : montant(0)}
                          {a.montantsProvisoires && <span className="ml-1 font-sans text-warning">provisoire</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-[110px_1fr_60px_110px_90px_130px_130px_120px] min-w-[980px] gap-2 px-3 py-1.5 bg-chrome-alt border-b border-border text-[11px] font-bold text-text-dim">
                  <span>COMPTE</span>
                  <span>Intitulé</span>
                  <span>Dev.</span>
                  <span className="text-right">En devise</span>
                  <span className="text-right">COURS</span>
                  <span className="text-right">Comptabilisé</span>
                  <span className="text-right">Réévalué</span>
                  <span className="text-right">Écart</span>
                </div>
                {rapport.positions.map((p) => (
                  <div
                    key={`${p.compteId}-${p.deviseId}`}
                    className="grid grid-cols-[110px_1fr_60px_110px_90px_130px_130px_120px] min-w-[980px] gap-2 px-3 py-1 text-[11.5px] border-b border-border/40"
                  >
                    <span className="font-mono">{p.numero}</span>
                    <span className="truncate">
                      {p.intitule}
                      <span className="ml-1.5 text-[11px] font-bold text-text-dim">
                        {p.estTresorerie ? 'RÉALISÉ' : 'LATENT'}
                      </span>
                    </span>
                    <span className="font-mono">{p.deviseCode}</span>
                    <span className="text-right font-mono">{montant(p.montantDevise)}</span>
                    <span className="text-right font-mono">{cours(p.coursCloture)}</span>
                    <span className="text-right font-mono">{montant(p.valeurComptable)}</span>
                    <span className="text-right font-mono">{montant(p.valeurReevaluee)}</span>
                    <span className={`text-right font-mono font-bold ${p.ecart < 0 ? 'text-danger' : 'text-positive'}`}>
                      {montant(p.ecart)}
                    </span>
                  </div>
                ))}
                {rapport.positions.length === 0 && (
                  <div className="px-3 py-4 text-[11.5px] text-text-dim italic">
                    Aucune position en devise à réévaluer à cette date.
                  </div>
                )}
              </>
            )}

            {exerciceCourant && (
              // Relue après chaque réévaluation · une version utilisée se fige.
              <ProvisionChangeOuverture key={`${exerciceCourant.id}-${reevaluations.length}`} exerciceId={exerciceCourant.id} />
            )}

            {reevaluations.length > 0 && (
              <div className="border-t border-border">
                <div className="px-3 py-1.5 bg-chrome text-[11px] font-bold text-text-dim flex items-center gap-1.5">
                  Réévaluations passées sur cet exercice
                  <Aide
                    titre="Contre-passation"
                    texte="Les écarts de conversion se contre-passent à l'OUVERTURE de l'exercice suivant : ils décrivent une situation à une date d'arrêté, pas une charge rattachée à une période. C'est l'inverse de la reprise d'une régularisation, qui se fait à la fin de l'exercice concerné."
                    source="Écarts de conversion · comptes 478 et 479"
                  />
                </div>
                {reevaluations.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[130px_1fr_200px] min-w-[520px] gap-2 px-3 py-1.5 text-[11.5px] items-center border-b border-border/40"
                  >
                    <span className="font-mono" title={r.horsCloture ?? undefined}>
                      {jour(r.dateReevaluation)}
                      {r.horsCloture && <span className="text-warning"> · hors clôture</span>}
                    </span>
                    <span className="text-text-dim">
                      {r.annuleeLe
                        ? `Annulée le ${jour(r.annuleeLe)} · ${r.motifAnnulation ?? ''}`
                        : r.ecritureEcarts
                          ? `Écarts pièce ${r.ecritureEcarts.numeroPiece ?? '·'}`
                          : 'Aucun écart'}
                      {!r.annuleeLe && r.ecritureProvision && ` · provision pièce ${r.ecritureProvision.numeroPiece ?? '·'}`}
                      {peutValider && !r.annuleeLe && (
                        <button
                          type="button"
                          onClick={() => setAAnnuler({ reevaluation: r, motif: '' })}
                          className="ml-2 text-danger hover:underline"
                          title="Inscription en négatif des écritures validées, suppression de celles au brouillard (AUDCIF art. 20, al. 2)"
                        >
                          Annuler la réévaluation
                        </button>
                      )}
                    </span>
                    <span>
                      {r.annuleeLe || !r.ecritureEcarts ? null : r.ecritureExtourne ? (
                        <span className="text-[11.5px] text-positive font-semibold">
                          Contre-passée le {jour(r.ecritureExtourne.date)}
                        </span>
                      ) : peutEcrire ? (
                        exercicesDeContrePassation(exercices, r.dateReevaluation).length === 0 ? (
                          <span className="text-[11.5px] text-warning">Ouvrez d'abord l'exercice suivant (Fin d'exercice…)</span>
                        ) : (
                          <select
                            value=""
                            onChange={(e) => {
                              // UNE ÉCRITURE NE PART PAS D'UN SIMPLE CHOIX DANS UNE
                              // LISTE (audit final F79, comme les régularisations).
                              const cible = exercices.find((ex) => ex.id === e.target.value);
                              if (cible && window.confirm(`Contre-passer les écarts du ${jour(r.dateReevaluation)} sur l'exercice ${libelleExercice(cible)} ?`)) {
                                void extourner(r.id, cible.id);
                              }
                            }}
                            className="w-full border border-border rounded-[4px] px-1 py-0.5 text-[11.5px]"
                          >
                            <option value="">Contre-passer sur…</option>
                            {exercicesDeContrePassation(exercices, r.dateReevaluation).map((ex) => (
                              <option key={ex.id} value={ex.id}>
                                Exercice {libelleExercice(ex)}
                              </option>
                            ))}
                          </select>
                        )
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      {aAnnuler && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void annulerReevaluation();
              }}
              className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span className="flex items-center gap-1.5">
                  Annuler la réévaluation du {jour(aAnnuler.reevaluation.dateReevaluation)}
                  <Aide
                    titre="Annulation"
                    texte="Les écritures validées de la réévaluation sont inscrites en négatif, celles restées au brouillard sont supprimées ; la réévaluation reste, marquée annulée avec son motif, et l'exercice se réévalue ensuite au cours exact. Refusée si une ligne est lettrée ou pointée, si l'exercice est clôturé ou si une réévaluation postérieure n'est pas annulée."
                    source="AUDCIF art. 20, al. 2 ; art. 22, 2° et 4°"
                  />
                </span>
                <button type="button" onClick={() => setAAnnuler(null)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                  ✕
                </button>
              </div>
              <div className="p-4">
                <label className="text-[11.5px] font-semibold text-text-dim block">
                  Motif
                  <textarea
                    required
                    value={aAnnuler.motif}
                    onChange={(e) => setAAnnuler({ ...aAnnuler, motif: e.target.value })}
                    maxLength={MOTIF_ANNULATION_MAX}
                    className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal min-h-[70px]"
                  />
                </label>
                <div className="flex gap-2 mt-3">
                  <button
                    type="submit"
                    disabled={motifRefusMotifAnnulation(aAnnuler.motif) !== null}
                    className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-40"
                  >
                    Annuler la réévaluation
                  </button>
                  <button type="button" onClick={() => setAAnnuler(null)} className="text-[11.5px] font-semibold text-text-dim px-4 py-1.5">
                    Fermer
                  </button>
                </div>
              </div>
            </form>
          </div>
        </PortailModale>
      )}
    </div>
  );
}
