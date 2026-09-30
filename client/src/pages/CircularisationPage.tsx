import { Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { CampagneCircularisation, DemandeConfirmation, EchantillonCircularisation, Exercice } from '../lib/types';
import { montant } from '../lib/montants';

/**
 * CIRCULARISATION · l'inventaire DOCUMENTAIRE du CPCC.
 *
 * L'écran met en avant les deux chiffres que le CPCC réclame et que personne
 * ne calcule à la main : le TAUX DE RÉPONSE, qui compte les lettres, et le
 * TAUX DE COUVERTURE, qui pèse les montants. Vingt réponses sur cent lettres
 * peuvent couvrir 80 % du solde ou 4 % · c'est le second qui dit si la
 * procédure a établi quelque chose.
 *
 * Et il montre en rouge la seule chose qui rend une campagne sans valeur : une
 * non-réponse sans procédure alternative. ISA 505 § 12 · « in the case of each
 * non-response, the auditor shall perform alternative audit procedures ».
 */

const LIBELLE_CYCLE: Record<string, string> = {
  BANQUES: 'Banques',
  FOURNISSEURS: 'Fournisseurs',
  CLIENTS_ADHERENTS: 'Clients et adhérents',
  AUTRES_TIERS: 'Autres tiers',
  AUTRES: 'Autres',
};

const LIBELLE_STATUT_DEMANDE: Record<string, string> = {
  A_ENVOYER: 'À envoyer',
  ENVOYEE: 'Envoyée',
  RELANCEE: 'Relancée',
  REPONSE_RECUE: 'Réponse reçue',
  SANS_REPONSE: 'Sans réponse',
  NON_DISTRIBUEE: 'Non distribuée',
};

/**
 * L'ÉTAT DE LA CAMPAGNE, dit à l'écran (audit final F210). Le serveur la fait
 * passer seul à « dépouillée » quand chaque lettre partie est classée, et
 * c'est cet état qui ouvre la clôture · sans lui à l'écran, le comptable ne
 * voyait ni qu'il restait des lettres à classer, ni que la campagne était
 * prête à clore. Les clés sont celles de `StatutCampagneCircularisation`, et
 * le type de l'écran les exige toutes · un état ajouté au schéma sans libellé
 * ne compile plus.
 */
const LIBELLE_STATUT_CAMPAGNE: Record<CampagneCircularisation['statut'], string> = {
  PREPARATION: 'En préparation',
  ENVOYEE: 'Envoyée',
  RELANCEE: 'Relancée',
  DEPOUILLEE: 'Dépouillée',
  CLOTUREE: 'Close',
};

const LIBELLE_NATURE: Record<string, string> = {
  DELAI: 'Délai',
  MESURE: 'Mesure',
  ERREUR_MATERIELLE: 'Erreur matérielle',
  ANOMALIE_POTENTIELLE: 'Anomalie potentielle',
};

/**
 * Les trois issues qu'un dépouillement peut donner à une lettre partie. Les
 * clés sont celles de `StatutDemandeConfirmation` côté serveur : une réponse
 * reçue, et les deux formes de non-réponse que l'ISA 505 § 6 d) distingue
 * (absence de réponse, lettre revenue non distribuée). « Envoyée » et
 * « relancée » ne se choisissent pas ici · ce sont les états que le classement
 * existe pour faire sortir, faute de quoi la campagne ne se clôt jamais.
 */
const ISSUES_CLASSEMENT: { statut: 'REPONSE_RECUE' | 'SANS_REPONSE' | 'NON_DISTRIBUEE'; libelle: string }[] = [
  { statut: 'REPONSE_RECUE', libelle: 'Réponse reçue' },
  { statut: 'SANS_REPONSE', libelle: 'Sans réponse' },
  { statut: 'NON_DISTRIBUEE', libelle: 'Non distribuée' },
];

interface ClassementEnCours {
  demandeId: string;
  soldeAConfirmer: number;
  statut: 'REPONSE_RECUE' | 'SANS_REPONSE' | 'NON_DISTRIBUEE';
  date: string;
  solde: string;
  nature: string;
  investigation: string;
  indirecte: boolean;
  doute: string;
}

/**
 * Lecture d'un montant saisi à la française. Une case VIDE rend null et non
 * zéro : le serveur exige un solde confirmé sur une réponse reçue, et « zéro »
 * y est une réponse (« je ne vous dois rien ») quand l'absence n'en est pas
 * une. Confondre les deux ferait confirmer à zéro un solde que personne n'a lu.
 */
const lireMontant = (v: string): number | null => {
  const t = v.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function CircularisationPage() {
  // Toutes les écritures de la campagne sont réservées à ADMIN_CABINET et
  // COMPTABLE côté serveur · la lecture seule consulte taux et réponses.
  const { peutEcrire } = useAuth();
  const [campagnes, setCampagnes] = useState<CampagneCircularisation[] | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampagneCircularisation | null>(null);
  const [echantillon, setEchantillon] = useState<EchantillonCircularisation | null>(null);
  const [creation, setCreation] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [dateArrete, setDateArrete] = useState('');
  const [exerciceId, setExerciceId] = useState('');
  const [cycle, setCycle] = useState('FOURNISSEURS');
  const [erreur, setErreur] = useState<string | null>(null);
  const [classement, setClassement] = useState<ClassementEnCours | null>(null);
  const [procedures, setProcedures] = useState<Record<string, string>>({});
  const [refusDirection, setRefusDirection] = useState('');

  const charger = () =>
    api.get<CampagneCircularisation[]>('/circularisation').then(setCampagnes, (e: Error) => setErreur(e.message));

  useEffect(() => {
    charger();
    api.get<Exercice[]>('/exercices').then(setExercices, () => undefined);
  }, []);

  useEffect(() => {
    if (!selectionId) {
      setDetail(null);
      setEchantillon(null);
      return;
    }
    api.get<CampagneCircularisation>(`/circularisation/${selectionId}`).then(setDetail, (e: Error) => setErreur(e.message));
    api
      .get<EchantillonCircularisation>(`/circularisation/${selectionId}/echantillon`)
      .then(setEchantillon, () => setEchantillon(null));
  }, [selectionId]);

  const rafraichir = () => {
    charger();
    if (selectionId) {
      api.get<CampagneCircularisation>(`/circularisation/${selectionId}`).then(setDetail, () => undefined);
      api.get<EchantillonCircularisation>(`/circularisation/${selectionId}/echantillon`).then(setEchantillon, () => undefined);
    }
  };

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await action();
      rafraichir();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Opération impossible');
    }
  };

  const creer = () =>
    agir(async () => {
      await api.post('/circularisation', { exerciceId, libelle: libelle.trim(), dateArrete, cycle });
      setCreation(false);
      setLibelle('');
      setDateArrete('');
    });

  const ouvrirClassement = (d: DemandeConfirmation) =>
    setClassement({
      demandeId: d.id,
      soldeAConfirmer: Number(d.soldeAConfirmer),
      statut: d.statut === 'SANS_REPONSE' || d.statut === 'NON_DISTRIBUEE' ? d.statut : 'REPONSE_RECUE',
      date: '',
      solde: d.soldeConfirme === null ? '' : String(Number(d.soldeConfirme)),
      nature: d.natureEcart ?? '',
      investigation: d.investigation ?? '',
      indirecte: d.reponseIndirecte,
      doute: d.doutefiabilite ?? '',
    });

  // L'écart affiché avant l'envoi est celui que le serveur recalculera (solde
  // confirmé moins solde de la lettre). Il ne sert qu'à ouvrir la nature et
  // l'investigation · c'est le serveur qui tranche, et son refus s'affiche tel
  // quel (ISA 505 § 14 : un écart se qualifie, il ne se solde pas).
  const soldeClasse = classement ? lireMontant(classement.solde) : null;
  const ecartClasse =
    classement && classement.statut === 'REPONSE_RECUE' && soldeClasse !== null
      ? Number((soldeClasse - classement.soldeAConfirmer).toFixed(2))
      : null;
  const ecartAQualifier = ecartClasse !== null && Math.abs(ecartClasse) > 0.005;

  const classer = () =>
    agir(async () => {
      if (!classement) return;
      const recue = classement.statut === 'REPONSE_RECUE';
      if (recue && soldeClasse === null) {
        throw new ApiError(400, 'Une réponse reçue porte un solde confirmé · zéro est une réponse, une case vide n’en est pas une.');
      }
      // Les clés sont celles de `DepouillerDto`, et d'elles seules : le serveur
      // refuse tout champ en trop. Les valeurs `undefined` ne partent pas.
      await api.patch(`/circularisation/demandes/${classement.demandeId}`, {
        statut: classement.statut,
        date: classement.date || undefined,
        soldeConfirme: recue ? (soldeClasse ?? undefined) : undefined,
        natureEcart: recue && ecartAQualifier && classement.nature ? classement.nature : undefined,
        investigation: recue && ecartAQualifier && classement.investigation.trim() ? classement.investigation.trim() : undefined,
        reponseIndirecte: recue ? classement.indirecte : undefined,
        doutefiabilite: recue && classement.indirecte && classement.doute.trim() ? classement.doute.trim() : undefined,
      });
      setClassement(null);
    });

  // ISA 505 § 12 · ce que le cabinet a fait À LA PLACE de la réponse. Texte
  // libre, parce que le § A18 n'en donne que des exemples.
  const consignerProcedures = (demandeId: string) =>
    agir(async () => {
      await api.patch(`/circularisation/demandes/${demandeId}/procedures-alternatives`, {
        proceduresAlternatives: (procedures[demandeId] ?? '').trim(),
      });
      setProcedures((p) => {
        const suite = { ...p };
        delete suite[demandeId];
        return suite;
      });
    });

  // ISA 505 § 8 · le refus de la direction se consigne à la clôture, s'il y en
  // a eu un. Vide, rien ne part et le serveur ne touche pas au champ.
  const clore = (campagneId: string) =>
    agir(async () => {
      await api.post(`/circularisation/${campagneId}/clore`, {
        refusDirectionMotif: refusDirection.trim() || undefined,
      });
      setRefusDirection('');
    });

  const s = detail?.synthese;

  return (
    <div className="p-2">
      <EnteteImpression titre="Circularisation" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="flex items-center justify-end gap-2">
          {peutEcrire && (
            <button
              type="button"
              onClick={() => setCreation(true)}
              className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold hover:opacity-90"
            >
              Nouvelle campagne
            </button>
          )}
          <Aide
            titre="Circularisation"
            texte="Confirmation de soldes auprès des tiers · méthode de l’ISA 505. Le logiciel n’envoie aucune lettre : la norme veut la réponse revenue directement au demandeur, ce qu’un envoi depuis la boîte du dossier ne garantit pas. Le CPCC ouvre chaque cycle de l’inventaire documentaire par la même question : a-t-on circularisé ? Travaux de révision et de contrôle interne préparatoires · ce n’est pas un audit et aucune opinion sur les états financiers n’en sort : la loi la réserve à l’expert-comptable inscrit au tableau de l’Ordre."
            source="ISA 505 · inventaire documentaire du CPCC · loi n° 15/002, art. 3, 1°, et art. 43, 5°"
          />
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[11.5px] max-w-[1240px]">
          {erreur}
        </div>
      )}

      {peutEcrire && creation && (
        <div className="border border-border bg-surface px-3.5 py-2.5 mb-2.5 max-w-[1240px]">
          <div className="text-[11.5px] font-semibold mb-1.5 flex items-center gap-1.5">
            Ouvrir une campagne
            <Aide
              titre="Forme de la demande"
              texte="La forme NÉGATIVE (le tiers ne répond que s’il est en désaccord) n’est pas proposée ici : l’ISA 505 § 15 la réserve à quatre conditions cumulatives, à déclarer une à une. Elle est moins probante que la positive."
              source="ISA 505 § 15"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-[11px] text-text-dim">
              Exercice
              <select
                value={exerciceId}
                onChange={(e) => setExerciceId(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[11.5px] min-w-[180px]"
              >
                <option value="">Choisir…</option>
                {exercices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {jour(x.dateDebut)} au {jour(x.dateFin)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-text-dim">
              Cycle
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[11.5px]"
              >
                {Object.entries(LIBELLE_CYCLE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-text-dim">
              Date d’arrêté
              <input
                type="date"
                value={dateArrete}
                onChange={(e) => setDateArrete(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[11.5px]"
              />
            </label>
            <label className="text-[11px] text-text-dim flex-1 min-w-[200px]">
              Libellé
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Fournisseurs au 31/12/2026"
                className="block w-full border border-border bg-surface px-2 py-[3px] text-[11.5px]"
              />
            </label>
            <button
              type="button"
              onClick={creer}
              disabled={!exerciceId || !dateArrete || !libelle.trim()}
              className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold disabled:opacity-40"
            >
              Ouvrir
            </button>
            <button
              type="button"
              onClick={() => setCreation(false)}
              className="border border-border rounded-[3px] px-3 py-[3px] text-[11.5px]"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1400px] items-start">
        <div className="border border-border bg-surface min-w-[240px] max-w-[280px]">
          <div className="px-2.5 py-1.5 border-b border-border text-[11px] font-mono text-text-dim">Campagnes</div>
          {campagnes?.length === 0 && (
            <div className="px-2.5 py-3 text-[11.5px] text-text-dim">
              Aucune campagne.
            </div>
          )}
          {campagnes?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectionId(c.id)}
              className={`block w-full text-left px-2.5 py-1.5 border-b border-border/60 ${
                c.id === selectionId ? 'bg-sel-soft' : 'hover:bg-chrome'
              }`}
            >
              <div className="text-[11.5px] font-semibold leading-tight">{c.libelle}</div>
              <div className="text-[10.5px] text-text-dim mt-0.5">
                {LIBELLE_CYCLE[c.cycle]} · {jour(c.dateArrete)} · {LIBELLE_STATUT_CAMPAGNE[c.statut]}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {!detail && (
            <div className="border border-border bg-surface px-3.5 py-3 text-[11.5px] text-text-dim">
              Choisir une campagne pour en voir l’échantillon et les réponses.
            </div>
          )}

          {detail && (
            <>
              <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[11.5px] font-bold">{detail.libelle}</div>
                    <div className="text-[11px] text-text-dim">
                      {LIBELLE_CYCLE[detail.cycle]} au {jour(detail.dateArrete)} ·{' '}
                      {detail.forme === 'NEGATIVE' ? 'demande négative' : 'demande positive'} ·{' '}
                      <span className="font-semibold text-text">{LIBELLE_STATUT_CAMPAGNE[detail.statut]}</span>
                      <Aide
                        titre="État de la campagne"
                        texte="En préparation, l’échantillon se compose et les lettres ne sont pas parties. Envoyée puis relancée, des lettres attendent leur réponse. Dépouillée, chaque lettre partie est classée (réponse reçue, sans réponse, non distribuée) et la campagne peut être close, pourvu que chaque non-réponse ait sa procédure alternative. Close, la clôture a été acceptée."
                        source="ISA 505 § 12"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5 items-center flex-wrap">
                    {peutEcrire && detail.statut !== 'CLOTUREE' && (
                      <>
                        {/* L'envoi n'est admis qu'en préparation, la relance
                            qu'une fois envoyée (`CircularisationService.envoyer`) ·
                            proposé à une campagne relancée ou dépouillée, le
                            bouton menait à un refus (audit final F210). */}
                        {(detail.statut === 'PREPARATION' || detail.statut === 'ENVOYEE') && (
                          <button
                            type="button"
                            onClick={() => agir(() => api.post(`/circularisation/${detail.id}/envoyer`, {}))}
                            className="border border-border rounded-[3px] px-2.5 py-[3px] text-[11.5px]"
                          >
                            {detail.statut === 'PREPARATION' ? 'Marquer envoyées' : 'Relancer'}
                          </button>
                        )}
                        <input
                          value={refusDirection}
                          onChange={(e) => setRefusDirection(e.target.value)}
                          placeholder="Refus de la direction (facultatif)"
                          aria-label="Refus de la direction"
                          className="border border-border bg-surface px-2 py-[3px] text-[11.5px] min-w-[220px]"
                        />
                        <Aide
                          titre="Refus de la direction"
                          texte="Si la direction a refusé qu’une demande soit envoyée, son motif se consigne ici à la clôture : l’ISA 505 § 8 demande d’en recueillir le motif, d’en apprécier les implications et de conduire des procédures alternatives."
                          source="ISA 505 § 8"
                        />
                        <button
                          type="button"
                          onClick={() => clore(detail.id)}
                          className="bg-sel text-white rounded-[3px] px-2.5 py-[3px] text-[11.5px] font-semibold"
                        >
                          Clore
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {s && s.envoyees > 0 && (
                <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11.5px]">
                    <span>
                      <span className="text-text-dim">Taux de réponse </span>
                      <span className="font-semibold tabular-nums">{s.tauxReponse} %</span>
                      <span className="text-text-dim">
                        {' '}
                        ({s.reponses}/{s.envoyees} lettres)
                      </span>
                    </span>
                    <span>
                      <span className="text-text-dim">Taux de couverture </span>
                      <span className="font-semibold tabular-nums">{s.tauxCouverture} %</span>
                      <span className="text-text-dim"> ({montant(s.soldeConfirme)} sur {montant(s.totalCycle)}, total du cycle)</span>{' '}
                      <Aide
                        titre="Taux de réponse et taux de couverture"
                        texte="Les deux taux ne disent pas la même chose : le premier compte les lettres, le second pèse les montants. C’est le second qui dit si la procédure a établi quelque chose."
                        source="ISA 505"
                      />
                    </span>
                    <span>
                      <span className="text-text-dim">Écarts </span>
                      <span className="font-semibold tabular-nums">{s.ecarts}</span>
                      {s.anomaliesPotentielles > 0 && (
                        <span className="text-danger"> dont {s.anomaliesPotentielles} anomalie(s) potentielle(s)</span>
                      )}
                    </span>
                    {s.reponsesIndirectes > 0 && (
                      <span className="text-warning">
                        {s.reponsesIndirectes} réponse(s) parvenue(s) par l’entité, fiabilité à corroborer
                      </span>
                    )}
                  </div>
                </div>
              )}

              {s && s.nonReponsesSansProcedure > 0 && (
                <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2 text-[11.5px] flex items-center gap-1.5">
                  <span className="font-semibold">
                    {s.nonReponsesSansProcedure} non-réponse{s.nonReponsesSansProcedure > 1 ? 's' : ''} sans procédure
                    alternative · la campagne ne se clôt pas.
                  </span>
                  <Aide
                    titre="Non-réponse sans procédure alternative"
                    texte="Une non-réponse n’est pas une confirmation. ISA 505 § 12 : « in the case of each non-response, the auditor shall perform alternative audit procedures ». Sans elles, le solde n’est pas établi et la campagne ne se clôt pas."
                    source="ISA 505 § 12"
                  />
                </div>
              )}

              <div className="border border-border bg-surface mb-2">
                <div className="px-2.5 py-1.5 border-b border-border text-[11px] font-mono text-text-dim">
                  DEMANDES · {detail.demandes?.length ?? 0}
                </div>
                {(detail.demandes?.length ?? 0) === 0 && (
                  <div className="px-2.5 py-3 text-[11.5px] text-text-dim">
                    Aucune demande.
                  </div>
                )}
                {(detail.demandes?.length ?? 0) > 0 && (
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Destinataire</th>
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Solde envoyé</th>
                        <th className="text-right px-2.5 py-1 font-normal">Confirmé</th>
                        <th className="text-right px-2.5 py-1 font-normal">Écart</th>
                        <th className="text-left px-2.5 py-1 font-normal">État</th>
                        {peutEcrire && detail.statut !== 'CLOTUREE' && <th className="px-2.5 py-1" />}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.demandes?.map((d) => {
                        const nonReponse = d.statut === 'SANS_REPONSE' || d.statut === 'NON_DISTRIBUEE';
                        const modifiable = peutEcrire && detail.statut !== 'CLOTUREE';
                        const enClassement = classement?.demandeId === d.id;
                        return (
                          <Fragment key={d.id}>
                          <tr className="border-b border-border/40">
                            <td className="px-2.5 py-1">
                              {d.destinataire}
                              {d.reponseIndirecte && (
                                <span className="text-[10px] text-warning"> · réponse indirecte</span>
                              )}
                            </td>
                            <td className="px-2.5 py-1 font-mono text-text-dim">{d.compte.numero}</td>
                            <td className="px-2.5 py-1 text-right tabular-nums">{montant(d.soldeAConfirmer)}</td>
                            <td className="px-2.5 py-1 text-right tabular-nums">
                              {d.soldeConfirme === null ? <span className="text-text-dim">·</span> : montant(d.soldeConfirme)}
                            </td>
                            <td className="px-2.5 py-1 text-right tabular-nums">
                              {d.ecart === null || Number(d.ecart) === 0 ? (
                                <span className="text-text-dim">·</span>
                              ) : (
                                <span
                                  className={
                                    d.natureEcart === 'ANOMALIE_POTENTIELLE' ? 'text-danger font-semibold' : 'text-warning'
                                  }
                                >
                                  {montant(d.ecart)}
                                  {d.natureEcart && (
                                    <span className="text-[10px] text-text-dim"> · {LIBELLE_NATURE[d.natureEcart]}</span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1">
                              {LIBELLE_STATUT_DEMANDE[d.statut]}
                              {nonReponse && !d.proceduresAlternatives && (
                                <span className="text-danger text-[10px]"> · sans procédure alternative</span>
                              )}
                              {nonReponse && d.proceduresAlternatives && (
                                <div className="text-[10.5px] text-text-dim">{d.proceduresAlternatives}</div>
                              )}
                            </td>
                            {modifiable && (
                              <td className="px-2.5 py-1 text-right whitespace-nowrap">
                                {d.statut !== 'A_ENVOYER' && !enClassement && (
                                  <button
                                    type="button"
                                    onClick={() => ouvrirClassement(d)}
                                    className="border border-border rounded-[3px] px-2 py-[1px] text-[10.5px]"
                                  >
                                    Classer la réponse
                                  </button>
                                )}
                                {/* Une lettre qui n'est pas partie se retire (audit final F71). */}
                                {d.statut === 'A_ENVOYER' && (
                                  <button
                                    type="button"
                                    onClick={() => agir(() => api.delete(`/circularisation/demandes/${d.id}`))}
                                    className="border border-border rounded-[3px] px-2 py-[1px] text-[10.5px]"
                                  >
                                    Retirer
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                          {modifiable && nonReponse && !enClassement && (
                            <tr className="border-b border-border/40">
                              <td colSpan={7} className="px-2.5 py-1">
                                <div className="flex items-start gap-1.5">
                                  <label className="text-[11px] text-text-dim flex-1">
                                    Procédures alternatives
                                    <textarea
                                      value={procedures[d.id] ?? d.proceduresAlternatives ?? ''}
                                      onChange={(e) => setProcedures((p) => ({ ...p, [d.id]: e.target.value }))}
                                      rows={2}
                                      className="block w-full border border-border bg-surface px-2 py-[3px] text-[11.5px]"
                                    />
                                  </label>
                                  <Aide
                                    titre="Procédures alternatives"
                                    texte="Une non-réponse n’est pas une confirmation. ISA 505 § 12 : « in the case of each non-response, the auditor shall perform alternative audit procedures ». Le § A18 en donne des exemples : encaissements ou décaissements postérieurs, documents d’expédition, correspondance du tiers, bons de réception."
                                    source="ISA 505 § 12 et § A18"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => consignerProcedures(d.id)}
                                    disabled={!(procedures[d.id] ?? '').trim()}
                                    className="border border-border rounded-[3px] px-2 py-[2px] text-[10.5px] mt-3.5 disabled:opacity-40"
                                  >
                                    Enregistrer
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {modifiable && enClassement && classement && (
                            <tr className="border-b border-border/40 bg-chrome/40">
                              <td colSpan={7} className="px-2.5 py-1.5">
                                <div className="flex flex-wrap gap-2 items-end">
                                  <label className="text-[11px] text-text-dim">
                                    Issue
                                    <select
                                      value={classement.statut}
                                      onChange={(e) =>
                                        setClassement({ ...classement, statut: e.target.value as ClassementEnCours['statut'] })
                                      }
                                      className="block border border-border bg-surface px-2 py-[3px] text-[11.5px]"
                                    >
                                      {ISSUES_CLASSEMENT.map((i) => (
                                        <option key={i.statut} value={i.statut}>
                                          {i.libelle}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  {classement.statut === 'REPONSE_RECUE' && (
                                    <>
                                      <label className="text-[11px] text-text-dim">
                                        Reçue le
                                        <input
                                          type="date"
                                          value={classement.date}
                                          onChange={(e) => setClassement({ ...classement, date: e.target.value })}
                                          className="block border border-border bg-surface px-2 py-[3px] text-[11.5px]"
                                        />
                                      </label>
                                      <label className="text-[11px] text-text-dim">
                                        Solde confirmé
                                        <input
                                          value={classement.solde}
                                          onChange={(e) => setClassement({ ...classement, solde: e.target.value })}
                                          inputMode="decimal"
                                          className="block border border-border bg-surface px-2 py-[3px] text-[11.5px] text-right w-[140px]"
                                        />
                                      </label>
                                      {ecartClasse !== null && (
                                        <span className="text-[11px] pb-1">
                                          <span className="text-text-dim">Écart </span>
                                          <span className={ecartAQualifier ? 'text-warning font-semibold' : 'text-text-dim'}>
                                            {montant(ecartClasse)}
                                          </span>
                                        </span>
                                      )}
                                      {ecartAQualifier && (
                                        <>
                                          <label className="text-[11px] text-text-dim">
                                            Nature de l’écart
                                            <select
                                              value={classement.nature}
                                              onChange={(e) => setClassement({ ...classement, nature: e.target.value })}
                                              className="block border border-border bg-surface px-2 py-[3px] text-[11.5px]"
                                            >
                                              <option value="">Choisir…</option>
                                              {Object.entries(LIBELLE_NATURE).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                  {v}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          <label className="text-[11px] text-text-dim flex-1 min-w-[220px]">
                                            Investigation
                                            <input
                                              value={classement.investigation}
                                              onChange={(e) => setClassement({ ...classement, investigation: e.target.value })}
                                              className="block w-full border border-border bg-surface px-2 py-[3px] text-[11.5px]"
                                            />
                                          </label>
                                          <Aide
                                            titre="Écart de confirmation"
                                            texte="Un écart se qualifie, il ne se solde pas. ISA 505 § 14 : « the auditor shall investigate exceptions to determine whether or not they are indicative of misstatements ». Le § A22 rappelle qu’un écart peut tenir à un délai, à une mesure ou à une erreur matérielle."
                                            source="ISA 505 § 14 et § A22"
                                          />
                                        </>
                                      )}
                                      <label className="text-[11px] text-text-dim flex items-center gap-1 pb-1">
                                        <input
                                          type="checkbox"
                                          checked={classement.indirecte}
                                          onChange={(e) => setClassement({ ...classement, indirecte: e.target.checked })}
                                        />
                                        Parvenue par l’entité
                                        <Aide
                                          titre="Réponse indirecte"
                                          texte="L’ISA 505 § 7 c) veut la réponse revenue directement au demandeur. Une réponse relayée par l’entité, ou renvoyée depuis une adresse qu’elle a fournie, est marquée au dossier et sa fiabilité est à corroborer (§ 10) · elle n’est pas rejetée."
                                          source="ISA 505 § 7 c) et § 10"
                                        />
                                      </label>
                                      {classement.indirecte && (
                                        <label className="text-[11px] text-text-dim flex-1 min-w-[220px]">
                                          Doute sur la fiabilité
                                          <input
                                            value={classement.doute}
                                            onChange={(e) => setClassement({ ...classement, doute: e.target.value })}
                                            className="block w-full border border-border bg-surface px-2 py-[3px] text-[11.5px]"
                                          />
                                        </label>
                                      )}
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={classer}
                                    className="bg-sel text-white rounded-[3px] px-2.5 py-[3px] text-[11.5px] font-semibold"
                                  >
                                    Enregistrer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setClassement(null)}
                                    className="border border-border rounded-[3px] px-2.5 py-[3px] text-[11.5px]"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {echantillon && echantillon.candidats.length > 0 && detail.statut !== 'CLOTUREE' && (
                <div className="border border-border bg-surface">
                  <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between">
                    <span className="text-[11px] font-mono text-text-dim flex items-center gap-1.5">
                      ÉCHANTILLON PROPOSÉ · racines {echantillon.racines.join(', ')}
                      <Aide
                        titre="Échantillon proposé"
                        texte="L’échantillon classe les soldes du cycle, du plus gros au plus petit · la sélection reste au cabinet, aucune norme n’en impose la méthode."
                        source="ISA 505"
                      />
                    </span>
                    <span className="text-[10.5px] text-text-dim">
                      total du cycle {montant(echantillon.totalCycle)}
                    </span>
                  </div>
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Solde</th>
                        <th className="text-right px-2.5 py-1 font-normal">Poids</th>
                        <th className="px-2.5 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {echantillon.candidats.slice(0, 25).map((c) => (
                        <tr key={c.compteId} className="border-b border-border/40">
                          <td className="px-2.5 py-1">
                            <span className="font-mono">{c.numero}</span>{' '}
                            <span className="text-text-dim">{c.intitule}</span>
                          </td>
                          <td className="px-2.5 py-1 text-right tabular-nums">{montant(c.solde)}</td>
                          <td className="px-2.5 py-1 text-right tabular-nums text-text-dim">{c.poids} %</td>
                          <td className="px-2.5 py-1 text-right">
                            {c.dejaRetenu ? (
                              <span className="text-[10.5px] text-text-dim">retenu</span>
                            ) : peutEcrire && detail.statut === 'PREPARATION' ? (
                              <button
                                type="button"
                                onClick={() =>
                                  agir(() =>
                                    api.post(`/circularisation/${detail.id}/demandes`, {
                                      compteId: c.compteId,
                                      destinataire: c.intitule,
                                    }),
                                  )
                                }
                                className="border border-border rounded-[3px] px-2 py-[1px] text-[10.5px]"
                              >
                                Retenir
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {echantillon.candidats.length > 25 && (
                    <div className="px-2.5 py-1 border-t border-border text-[10.5px] text-text-dim">
                      {echantillon.candidats.length - 25} compte(s) de plus, au-delà des vingt-cinq premiers soldes.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
