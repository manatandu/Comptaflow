import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { Aide } from '../components/chrome/Aide';
import { PortailModale } from '../components/PortailModale';
import type { Compte, Journal } from '../lib/types';
import { useExercice } from '../lib/exercice';
import { useGardeFermeture } from '../lib/fenetres';
import { ecouterEchap } from '../lib/echap';
import { montant } from '../lib/montants';
import { montantSaisi } from '../lib/montant-saisi';
import {
  annonceRevue,
  bornesExercice,
  compte416Initial,
  compte491Initial,
  comptes491DeLaNature,
  ecartsRapprochement,
  etatRapprochement,
  libelleSoldesProvisoires,
  messageLettrage416,
  racine491,
  LIBELLE_NATURE,
  montantPourChamp,
  motifAnnulationValide,
  motifListe651Vide,
  mouvementAAnnulerParDefaut,
  piecesAEnvoyer,
  type ComptesRevue,
  type IssueLettrage416,
  type NatureCreance,
  type PieceSaisie,
  type RapprochementCreances,
} from '../lib/creances-douteuses';

/**
 * CRÉANCES DOUTEUSES OU LITIGIEUSES (ligne A7, relevé CPCC C3).
 *
 * Une ligne par créance, jamais un pourcentage par âge · la fiche du compte
 * 49 veut un élément « individualisé » et des motifs justifiés. Quatre gestes,
 * chacun annoncé avant le clic et REJOUÉ au serveur, qui porte tous les refus :
 * le reclassement au 416, la revue de la dépréciation à la clôture (seul
 * l'écart avec celle en place se passe), la perte (651) et le recouvrement.
 * Les écritures partent au brouillard ; retirées d'ici tant qu'elles y sont.
 *
 * LES BOUTONS SUIVENT LES DROITS DU SERVEUR (relecture « écran », 9) ·
 * reclasser, déclarer, recouvrer et retirer une créance sont ouverts à qui
 * écrit (`peutEcrire`) ; la revue, la perte, les annulations et le retrait
 * d'un mouvement (A7 ter, m7) sont réservés au comptable (`peutValider`,
 * `@ReserveAuComptable`). Le retrait d'une créance suit le verdict SERVI
 * (`retirable`, m6). Masquer n'est pas refuser · le serveur tient seul les
 * droits.
 */

interface CreanceCandidate {
  id: string;
  numero: string;
  intitule: string;
  tiers: string | null;
  solde: number;
  propose416: Record<NatureCreance, string | null>;
  /** m9 · servis · le refus que le geste opposera (cotisations à l'encaissement), ou l'avertissement. */
  refusCotisations?: string | null;
  avertissementCotisations?: string | null;
}
interface ComptesFormulaire {
  creances: CreanceCandidate[];
  tronque: boolean;
  plafond: number;
  filtreNumero: string | null;
  comptes416: { id: string; numero: string; intitule: string }[];
  comptes491: { id: string; numero: string; intitule: string }[];
  /** m5 · les listes de 416 et 491 bornées disent leur total. */
  listes416491?: { plafond: number; total416: number; tronque416: boolean; total491: number; tronque491: boolean };
}
interface CreanceDouteuse {
  id: string;
  nature: NatureCreance;
  compteCreance: { id: string; numero: string; intitule: string };
  tiers: string | null;
  compte416: { numero: string };
  compte491: { numero: string };
  dateReclassement: string;
  montant: number;
  motif: string;
  resteALaCloture: number;
  depreciationOuverture: number;
  depreciationALaCloture: number;
  comptePertePropose: string | null;
  revue: { id: string; depreciationNecessaire: number; ecart: number; motif: string } | null;
  revueAFaire: boolean;
  declareeOuverture: boolean;
  revuesAnnulees: { id: string; annuleeLe: string; motif: string | null }[];
  revues: { id: string; exerciceId: string }[];
  mouvements: Mouvement[];
  mouvementsAnnules: { id: string; type: 'PERTE' | 'RECOUVREMENT'; date: string; montant: number; annuleeLe: string; motif: string | null }[];
  /** M-c · mouvements de l'exercice sans revue · une information. */
  mouvementsSansRevue: number;
  /** m6 · la règle du retrait, servie par le serveur, jamais recalculée ici. */
  retirable: boolean;
}
interface Mouvement {
  id: string;
  type: 'PERTE' | 'RECOUVREMENT';
  date: string;
  montant: number;
  motif: string;
}
interface Liste {
  exercice: { id: string; dateDebut: string; dateFin: string; statut: string };
  systemeMinimal: boolean;
  total: number;
  tronque: boolean;
  creances: CreanceDouteuse[];
  /** M5 · les annulations de l'exercice, bornées · leur total le dit. */
  annulations?: { revues: { total: number; tronque: boolean }; mouvements: { total: number; tronque: boolean } };
  rapprochement: RapprochementCreances | null;
}
interface PropositionRevue {
  depreciationEnPlace: number;
  resteALaCloture: number;
  dateRevue: string;
  comptes: ComptesRevue;
}

type Geste = 'reclasser' | 'declarer' | 'revue' | 'perte' | 'recouvrement';
interface Formulaire {
  geste: Geste;
  creance: CreanceDouteuse | null;
  compteCreanceId: string;
  nature: NatureCreance;
  compte416Id: string;
  compte491Id: string;
  comptePerteId: string;
  journalId: string;
  date: string;
  montant: string;
  depreciationOuverture: string;
  source: string;
  motif: string;
  pieces: PieceSaisie[];
}

const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');
const messageDe = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));
const TITRES: Record<Geste, string> = {
  reclasser: 'Reclasser une créance au 416',
  declarer: 'Déclarer une créance reprise (déjà au 416)',
  revue: 'Revoir la dépréciation à la clôture',
  perte: 'Constater la perte (créance irrécouvrable)',
  recouvrement: 'Enregistrer un recouvrement',
};
/** Le premier champ d'une modale, qui reçoit le focus à l'ouverture (relecture « écran », 1). */
const premierChamp = (el: HTMLElement | null) =>
  el?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? null;

export function CreancesDouteusesPage() {
  const { peutEcrire, peutValider } = useAuth();
  const { exerciceCourant } = useExercice();
  const exerciceId = exerciceCourant?.id ?? '';
  const [liste, setListe] = useState<Liste | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // A7 ter · ce qu'un geste réussi a à dire (lettrage du 416, cotisations) · jamais tu.
  const [info, setInfo] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [journaux, setJournaux] = useState<Journal[] | null>(null);
  const [erreurJournaux, setErreurJournaux] = useState<string | null>(null);
  const [comptes, setComptes] = useState<ComptesFormulaire | null>(null);
  const [filtreNumero, setFiltreNumero] = useState('');
  const [comptes651, setComptes651] = useState<Compte[] | null>(null);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [proposition, setProposition] = useState<PropositionRevue | null>(null);
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  // L'annulation d'une revue ou d'un mouvement (AUDCIF art. 20, al. 2) · motif de 3 à 500 caractères.
  const [annulation, setAnnulation] = useState<{ creance: CreanceDouteuse; motif: string; mouvementId?: string; reclassement?: boolean } | null>(null);
  const [erreurAnnulation, setErreurAnnulation] = useState<string | null>(null);
  useGardeFermeture(form || annulation ? 'Un geste sur une créance douteuse est en cours de saisie · il serait perdu.' : null);

  // UNE RÉPONSE PÉRIMÉE NE REMPLIT JAMAIS UN FORMULAIRE (relecture « écran »,
  // 5) · chaque ouverture prend un jeton, et une lecture partie pour un autre
  // formulaire, ou pour un filtre remplacé depuis, est jetée à son retour.
  const jeton = useRef(0);
  const jetonComptes = useRef(0);
  const envoiEnCours = useRef(false);
  envoiEnCours.current = envoi;
  const refFormulaire = useRef<HTMLFormElement | null>(null);
  const refAnnulation = useRef<HTMLFormElement | null>(null);
  const idBase = useId();
  const id = (nom: string) => `${idBase}-${nom}`;
  const formOuvert = form !== null;
  const annulationOuverte = annulation !== null;

  // CHANGER D'EXERCICE VIDE LA LISTE (relecture « écran », 4) · l'ancienne ne
  // reste jamais affichée sous le nouvel exercice, et sa réponse, si elle
  // revient après, est jetée.
  useEffect(() => {
    setListe(null);
    setErreur(null);
    if (!exerciceId) return;
    let perimee = false;
    api.get<Liste>(`/creances-douteuses?exerciceId=${encodeURIComponent(exerciceId)}`).then(
      (l) => {
        if (!perimee) setListe(l);
      },
      (e) => {
        if (!perimee) setErreur(messageDe(e));
      },
    );
    return () => {
      perimee = true;
    };
  }, [exerciceId, version]);

  // Un geste préparé pour un exercice ne part jamais sous un autre.
  useEffect(() => {
    jeton.current++;
    setForm(null);
    setAnnulation(null);
    setInfo(null);
  }, [exerciceId]);

  // L'ÉCHEC DE LECTURE DES JOURNAUX SE DIT DANS LA MODALE (relecture
  // « écran », 7) · une liste de journaux vide n'y est jamais « aucun journal ».
  useEffect(() => {
    if (!peutEcrire) return;
    let perimee = false;
    api.get<Journal[]>('/journaux').then(
      (j) => {
        if (perimee) return;
        setJournaux(j);
        setErreurJournaux(null);
      },
      (e) => {
        if (!perimee) setErreurJournaux(messageDe(e));
      },
    );
    return () => {
      perimee = true;
    };
  }, [peutEcrire]);

  // ÉCHAP FERME LA MODALE, ET ELLE SEULE (audit final F177) · la touche est
  // consommée, la fenêtre dessous ne se ferme pas ; pendant l'envoi elle ne
  // ferme rien, la réponse du serveur reste à lire.
  useEffect(() => {
    if (!formOuvert && !annulationOuverte) return;
    return ecouterEchap(() => {
      if (envoiEnCours.current) return true;
      if (annulationOuverte) setAnnulation(null);
      else {
        jeton.current++;
        setForm(null);
      }
      return true;
    });
  }, [formOuvert, annulationOuverte]);

  useEffect(() => {
    if (formOuvert) premierChamp(refFormulaire.current)?.focus({ preventScroll: true });
  }, [formOuvert]);
  useEffect(() => {
    if (annulationOuverte) premierChamp(refAnnulation.current)?.focus({ preventScroll: true });
  }, [annulationOuverte]);

  function fermerFormulaire() {
    if (envoi) return;
    jeton.current++;
    setForm(null);
  }
  function fermerAnnulation() {
    if (envoi) return;
    setAnnulation(null);
  }

  function chargerComptes(numero: string) {
    const j = jeton.current;
    const k = ++jetonComptes.current;
    const filtre = numero.trim() ? `&numero=${encodeURIComponent(numero.trim())}` : '';
    api.get<ComptesFormulaire>(`/creances-douteuses/comptes?exerciceId=${encodeURIComponent(exerciceId)}${filtre}`).then(
      (c) => {
        if (jeton.current === j && jetonComptes.current === k) setComptes(c);
      },
      (e) => {
        if (jeton.current === j && jetonComptes.current === k) setErreurForm(messageDe(e));
      },
    );
  }

  function ouvrir(geste: Geste, creance: CreanceDouteuse | null) {
    const j = ++jeton.current;
    const courant = () => jeton.current === j;
    setErreurForm(null);
    setProposition(null);
    setComptes(null);
    setComptes651(null);
    setFiltreNumero('');
    const odUnique = (journaux ?? []).filter((x) => x.type === 'GENERAL');
    const bqUnique = (journaux ?? []).filter((x) => x.type === 'TRESORERIE' && x.compteTresorerieId);
    const choix = geste === 'recouvrement' ? bqUnique : odUnique;
    setForm({
      geste,
      creance,
      compteCreanceId: '',
      nature: 'DOUTEUSE',
      compte416Id: '',
      compte491Id: '',
      comptePerteId: '',
      journalId: choix.length === 1 ? choix[0].id : '',
      date: liste ? liste.exercice.dateFin.slice(0, 10) : '',
      montant: geste === 'perte' || geste === 'recouvrement' ? montantPourChamp(creance?.resteALaCloture) : '',
      depreciationOuverture: '',
      source: '',
      motif: '',
      pieces: [{ nature: '', reference: '', date: '' }],
    });
    if (geste === 'reclasser' || geste === 'declarer') chargerComptes('');
    if (geste === 'revue' && creance) {
      api.get<PropositionRevue>(`/creances-douteuses/${creance.id}/revue?exerciceId=${encodeURIComponent(exerciceId)}`).then(
        (p) => {
          if (courant()) setProposition(p);
        },
        (e) => {
          if (courant()) setErreurForm(messageDe(e));
        },
      );
    }
    if (geste === 'perte' && !creance?.comptePertePropose) {
      api.get<Compte[]>('/comptes?actifsSeuls=true&typeCompte=DETAIL&retenus=true').then(
        (l) => {
          if (courant()) setComptes651(l.filter((c) => c.numero.startsWith('651')));
        },
        (e) => {
          if (courant()) setErreurForm(messageDe(e));
        },
      );
    }
  }

  function champ<K extends keyof Formulaire>(cle: K, valeur: Formulaire[K]) {
    setForm((f) => (f ? { ...f, [cle]: valeur } : f));
  }

  function choisirCreance(compteId: string, nature: NatureCreance) {
    const c = comptes?.creances.find((x) => x.id === compteId);
    setForm((f) =>
      f
        ? {
            ...f,
            compteCreanceId: compteId,
            nature,
            compte416Id: compte416Initial(c?.propose416, nature, comptes?.comptes416 ?? []),
            compte491Id: compte491Initial(nature, comptes?.comptes491 ?? []),
            montant: c && f.compteCreanceId !== compteId ? montantPourChamp(c.solde) : f.montant,
          }
        : f,
    );
  }

  async function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form || envoi) return;
    const valeur = montantSaisi(form.montant);
    const necessaire = valeur;
    const commun = { exerciceId, journalId: form.journalId, motif: form.motif, pieces: piecesAEnvoyer(form.pieces) };
    setEnvoi(true);
    setErreurForm(null);
    try {
      if (valeur == null) throw new Error('Saisissez un montant · un champ vide n’est pas zéro.');
      if (form.geste === 'declarer') {
        const deprec = montantSaisi(form.depreciationOuverture);
        if (deprec == null) throw new Error('Saisissez la dépréciation existante · zéro se tape, vide n’est pas zéro.');
        await api.post('/creances-douteuses/declarations', {
          exerciceId,
          compteCreanceId: form.compteCreanceId,
          compte416Id: form.compte416Id,
          compte491Id: form.compte491Id || undefined,
          nature: form.nature,
          montant: valeur,
          depreciationOuverture: deprec,
          source: form.source,
          motif: form.motif || undefined,
          pieces: piecesAEnvoyer(form.pieces),
        });
      } else if (form.geste === 'reclasser') {
        const r = await api.post<{ avertissement?: string | null }>('/creances-douteuses', {
          ...commun,
          date: form.date,
          compteCreanceId: form.compteCreanceId,
          compte416Id: form.compte416Id || undefined,
          compte491Id: form.compte491Id || undefined,
          nature: form.nature,
          montant: valeur,
        });
        setInfo(r?.avertissement ?? null);
      } else if (form.geste === 'revue') {
        await api.post(`/creances-douteuses/${form.creance!.id}/revue`, { ...commun, depreciationNecessaire: necessaire });
      } else if (form.geste === 'perte') {
        // AU TTC ENTIER, D 651 / C 416 · aucune ligne de TVA (A7 scindée).
        const r = await api.post<{ lettrage416?: IssueLettrage416 }>(`/creances-douteuses/${form.creance!.id}/perte`, {
          ...commun,
          date: form.date,
          montant: valeur,
          comptePerteId: form.comptePerteId || undefined,
        });
        setInfo(messageLettrage416(r?.lettrage416));
      } else {
        const r = await api.post<{ lettrage416?: IssueLettrage416 }>(`/creances-douteuses/${form.creance!.id}/recouvrement`, {
          ...commun,
          date: form.date,
          montant: valeur,
        });
        setInfo(messageLettrage416(r?.lettrage416));
      }
      jeton.current++;
      setForm(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreurForm(messageDe(e));
    } finally {
      setEnvoi(false);
    }
  }

  async function annuler(ev: React.FormEvent) {
    ev.preventDefault();
    if (!annulation || envoi) return;
    const chemin = annulation.reclassement
      ? `/creances-douteuses/${annulation.creance.id}/annuler`
      : annulation.mouvementId
      ? `/creances-douteuses/${annulation.creance.id}/mouvements/${annulation.mouvementId}/annuler`
      : annulation.creance.revue
        ? `/creances-douteuses/${annulation.creance.id}/revues/${annulation.creance.revue.id}/annuler`
        : null;
    if (!chemin) return;
    setEnvoi(true);
    setErreurAnnulation(null);
    try {
      // B2b · le lettrage du module figé par une clôture reste en place, et le serveur le dit.
      const r = await api.post<{ information?: string }>(chemin, { motif: annulation.motif });
      setInfo(r?.information ?? null);
      setAnnulation(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreurAnnulation(messageDe(e));
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer(chemin: string, question: string) {
    if (envoi) return;
    if (!window.confirm(question)) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await api.delete(chemin);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(messageDe(e));
    } finally {
      setEnvoi(false);
    }
  }

  const r = liste?.rapprochement;
  const ecarts = r ? ecartsRapprochement(r) : null;
  const ecart416 = ecarts?.ecart416 ?? 0;
  const ecart491 = ecarts?.ecart491 ?? 0;
  const creanceChoisie = form ? comptes?.creances.find((c) => c.id === form.compteCreanceId) ?? null : null;
  const journauxDuGeste = (journaux ?? []).filter((j) =>
    form?.geste === 'recouvrement' ? j.type === 'TRESORERIE' && j.compteTresorerieId : j.type === 'GENERAL',
  );
  const bornes = bornesExercice(liste?.exercice);
  const annulationsTronquees = liste?.annulations && (liste.annulations.revues.tronque || liste.annulations.mouvements.tronque);
  const colonnes = peutEcrire ? 10 : 9;

  return (
    <div className="p-2">
      <EnteteImpression titre="Créances douteuses ou litigieuses" />
      <div className="ecran-seul mb-1.5 max-w-[1240px] flex items-center justify-end gap-2">
        {peutEcrire && (
          <button
            type="button"
            onClick={() => ouvrir('reclasser', null)}
            disabled={!liste || liste.exercice.statut !== 'OUVERT'}
            className="bg-sel text-white rounded-full px-3 py-[3px] text-[11.5px] font-semibold disabled:opacity-50"
          >
            + Reclasser une créance
          </button>
        )}
        {peutEcrire && (
          <button
            type="button"
            onClick={() => ouvrir('declarer', null)}
            disabled={!liste || liste.exercice.statut !== 'OUVERT'}
            className="border border-bord rounded-[3px] px-2 py-[2px] text-[11.5px] disabled:opacity-50"
          >
            Déclarer une créance reprise
          </button>
        )}
        <Aide
          titre="Dépréciation des créances"
          texte="La créance contestée ou dont le débiteur se dérobe se reclasse au 416. Sa dépréciation est décidée créance par créance, motivée et justifiée par pièces, revue à chaque clôture : seul l'écart avec la dépréciation en place se passe (659 ou 759). La créance irrécouvrable va au 651. Aucun pourcentage par âge."
          source="AUDCIF Titre VII et SYCEBNL, fiches des comptes 41, 49, 65 et 759 ; Guide SYSCOHADA, Partie 1 ch. 6 § 3.3 et § 3.4, Application 19"
        />
      </div>

      {erreur && <div className="mb-1.5 max-w-[1240px] border border-rouge/40 bg-rouge/5 text-rouge rounded-[3px] px-2 py-1 text-[11.5px]">{erreur}</div>}
      {info && (
        <div className="mb-1.5 max-w-[1240px] border border-bord rounded-[3px] px-2 py-1 text-[11.5px] flex items-start justify-between gap-2">
          <span>{info}</span>
          <button type="button" className="text-sel hover:underline" onClick={() => setInfo(null)}>
            Fermer
          </button>
        </div>
      )}
      {!exerciceId && <div className="text-[11.5px] text-text-dim">Aucun exercice choisi · choisissez-le, ou créez-le dans Exercices.</div>}
      {exerciceId && liste === null && !erreur && <div className="text-[11.5px] text-text-dim">Chargement…</div>}

      {liste && (
        <div className="max-w-[1240px] space-y-2">
          {liste.systemeMinimal && (
            <div className="border border-bord rounded-[3px] px-2 py-1 text-[11.5px] flex items-center gap-1.5">
              Système minimal de trésorerie · aucune dotation
              <Aide
                titre="Système minimal de trésorerie"
                texte="Le modèle d'états du Système minimal n'ouvre aucun poste de dépréciation : aucune dépréciation n'y est dotée. Le reclassement, la reprise d'une dépréciation existante et la perte restent ouverts."
                source="SYCEBNL, Partie 4 ch. 4 ; AUDCIF, Titre X ch. 2"
              />
            </div>
          )}
          {r?.provisoire && (
            <div className="text-[11.5px] text-text-dim flex items-center gap-1.5">
              {libelleSoldesProvisoires(r)}
              <Aide
                titre="Soldes provisoires"
                texte="Les soldes du 416 et du 491 sont lus sur l'exercice précédent, brouillard compris, tant que l'à-nouveau de cet exercice n'est pas passé. Un report à-nouveau provisoire, calculé sur les seules écritures validées, n'en tient pas lieu : relancez-le une fois le brouillard de l'exercice précédent validé, ou clôturez l'exercice précédent."
                source="Convention d'OmegaX"
              />
            </div>
          )}
          {r && ecarts && (Math.abs(ecart416) >= 0.01 || Math.abs(ecart491) >= 0.01) && (
            <div className="border border-rouge/40 bg-rouge/5 rounded-[3px] px-2 py-1 text-[11.5px] text-rouge">
              {Math.abs(ecart416) >= 0.01 && <div>Le solde du 416 ({montant(r.solde416)}) diffère des créances suivies ici ({montant(r.resteModule)}).</div>}
              {Math.abs(ecart491) >= 0.01 && (
                <div>
                  Le solde du 491 ({montant(r.solde491)}) diffère des dépréciations suivies ici ({montant(r.depreciationModule)})
                  {Math.abs(ecarts.horsModule491) >= 0.01 && <> · dont {montant(ecarts.horsModule491)} passés hors de ce module</>}
                  {Math.abs(ecarts.horsModule491) >= 0.01 && Math.abs(ecarts.reste491) >= 0.01 && (
                    <> · le reste ({montant(ecarts.reste491)}) vient de l'à-nouveau ou d'une écriture du module retouchée</>
                  )}
                  .
                </div>
              )}
            </div>
          )}
          {etatRapprochement(liste) === 'non-calcule-tronque' && (
            <div className="text-[11.5px] text-rouge">Rapprochement avec le 416 et le 491 non calculé · liste tronquée.</div>
          )}
          {liste.tronque && <div className="text-[11.5px] text-text-dim">{liste.creances.length} créances affichées sur {liste.total} · les plus récentes, les plus anciennes ne sont pas montrées.</div>}
          {annulationsTronquees && liste.annulations && (
            <div className="text-[11.5px] text-text-dim">
              Annulations de l'exercice montrées en partie · {liste.annulations.revues.total} revue(s) et {liste.annulations.mouvements.total} mouvement(s) annulés au total, les plus anciens ne sont pas montrés.
            </div>
          )}

          <div className="border border-bord rounded-[3px] overflow-x-auto">
            <table className="w-full text-[11.5px] whitespace-nowrap">
              <thead>
                <tr>
                  <th scope="col" className="text-left px-1.5 py-1">Créance</th>
                  <th scope="col" className="text-left px-1.5">Nature</th>
                  <th scope="col" className="text-left px-1.5">Reclassée le</th>
                  <th scope="col" className="text-right px-1.5">Reclassé</th>
                  <th scope="col" className="text-right px-1.5">Reste au 416</th>
                  <th scope="col" className="text-right px-1.5">Dépréciation à l'ouverture</th>
                  <th scope="col" className="text-right px-1.5">Dépréciation à la clôture</th>
                  <th scope="col" className="text-left px-1.5">Revue</th>
                  <th scope="col" className="text-left px-1.5">Motifs</th>
                  {peutEcrire && <th scope="col" className="text-left px-1.5">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {liste.creances.map((c) => {
                  const ouvert = liste.exercice.statut === 'OUVERT';
                  const deplie = detail === c.id;
                  const idDetail = id(`detail-${c.id}`);
                  return (
                    <Fragment key={c.id}>
                      <tr className="border-t border-bord/50 align-top">
                        <td className="px-1.5 py-[3px]">
                          {c.compteCreance.numero} · {c.tiers ?? c.compteCreance.intitule}
                          <div className="text-text-dim">{c.compte416.numero} / {c.compte491.numero}</div>
                        </td>
                        <td className="px-1.5">{c.nature === 'LITIGIEUSE' ? 'Litigieuse' : 'Douteuse'}</td>
                        <td className="px-1.5">{jour(c.dateReclassement)}</td>
                        <td className="px-1.5 text-right tabular-nums">{montant(c.montant)}</td>
                        <td className="px-1.5 text-right tabular-nums">{montant(c.resteALaCloture)}</td>
                        <td className="px-1.5 text-right tabular-nums">{montant(c.depreciationOuverture)}</td>
                        <td className="px-1.5 text-right tabular-nums font-semibold">{montant(c.depreciationALaCloture)}</td>
                        <td className="px-1.5">
                          {c.revue ? 'Faite' : c.revueAFaire ? 'À faire' : '·'}
                          {c.mouvementsSansRevue > 0 && <div className="text-text-dim">{c.mouvementsSansRevue} mouvement(s) sans revue</div>}
                          {c.mouvementsAnnules.length > 0 && <div className="text-text-dim">{c.mouvementsAnnules.length} mouvement(s) annulé(s)</div>}
                        </td>
                        <td className="px-1.5">
                          {/* LES MOTIFS SE LISENT AU CLAVIER (relecture « écran », 3) · une infobulle n'est atteinte ni au clavier ni au toucher. */}
                          <button type="button" className="text-sel hover:underline" aria-expanded={deplie} aria-controls={idDetail} onClick={() => setDetail(deplie ? null : c.id)}>
                            {deplie ? 'Masquer' : 'Voir'}
                          </button>
                        </td>
                        {peutEcrire && (
                          <td className="px-1.5 space-x-2">
                            {peutValider && ouvert && !c.revue && (
                              <button type="button" className="text-sel hover:underline" onClick={() => ouvrir('revue', c)}>
                                Revoir
                              </button>
                            )}
                            {ouvert && c.resteALaCloture > 0 && (
                              <button type="button" className="text-sel hover:underline" onClick={() => ouvrir('recouvrement', c)}>
                                Recouvrement
                              </button>
                            )}
                            {peutValider && ouvert && c.resteALaCloture > 0 && (
                              <button type="button" className="text-sel hover:underline" onClick={() => ouvrir('perte', c)}>
                                Perte
                              </button>
                            )}
                            {peutValider && ouvert && c.revue && (
                              <button
                                type="button"
                                className="text-rouge hover:underline"
                                onClick={() => {
                                  setErreurAnnulation(null);
                                  setAnnulation({ creance: c, motif: '' });
                                }}
                              >
                                Annuler la revue
                              </button>
                            )}
                            {peutValider && ouvert && c.mouvements.length > 0 && (
                              <button
                                type="button"
                                className="text-rouge hover:underline"
                                onClick={() => {
                                  setErreurAnnulation(null);
                                  setAnnulation({ creance: c, motif: '', mouvementId: mouvementAAnnulerParDefaut(c.mouvements) ?? undefined });
                                }}
                              >
                                Annuler un mouvement
                              </button>
                            )}
                            {peutValider && ouvert && !c.revue && c.revues.length === 0 && c.mouvements.length === 0 && (
                              <button
                                type="button"
                                className="text-rouge hover:underline"
                                onClick={() => {
                                  setErreurAnnulation(null);
                                  setAnnulation({ creance: c, motif: '', reclassement: true });
                                }}
                              >
                                Annuler le reclassement
                              </button>
                            )}
                            {peutValider && ouvert && c.mouvements.length > 0 && (
                              <button
                                type="button"
                                className="text-rouge hover:underline"
                                disabled={envoi}
                                onClick={() => {
                                  const dernier = c.mouvements[c.mouvements.length - 1];
                                  void retirer(`/creances-douteuses/${c.id}/mouvements/${dernier.id}`, 'Retirer le dernier mouvement et son écriture au brouillard ?');
                                }}
                              >
                                Retirer le dernier mouvement
                              </button>
                            )}
                            {ouvert && c.retirable && (
                              <button
                                type="button"
                                className="text-rouge hover:underline"
                                disabled={envoi}
                                onClick={() => retirer(`/creances-douteuses/${c.id}`, 'Retirer ce reclassement et son écriture au brouillard ?')}
                              >
                                Retirer
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {deplie && (
                        <tr id={idDetail} className="bg-fenetre">
                          <td colSpan={colonnes} className="px-1.5 py-1 whitespace-normal">
                            <dl className="grid grid-cols-[180px_1fr] gap-x-3 gap-y-0.5">
                              <dt className="text-text-dim">Motif du reclassement</dt>
                              <dd>{c.motif || '·'}</dd>
                              {c.revue && (
                                <>
                                  <dt className="text-text-dim">Motif de la revue</dt>
                                  <dd>{c.revue.motif}</dd>
                                </>
                              )}
                              {c.revuesAnnulees.map((a) => (
                                <Fragment key={a.id}>
                                  <dt className="text-text-dim">Revue annulée le {jour(a.annuleeLe)}</dt>
                                  <dd>{a.motif ?? '·'}</dd>
                                </Fragment>
                              ))}
                              {c.mouvementsAnnules.map((m) => (
                                <Fragment key={m.id}>
                                  <dt className="text-text-dim">
                                    {m.type === 'PERTE' ? 'Perte' : 'Recouvrement'} de {montant(m.montant)} annulé le {jour(m.annuleeLe)}
                                  </dt>
                                  <dd>{m.motif ?? '·'}</dd>
                                </Fragment>
                              ))}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {liste.creances.length === 0 && (
                  <tr>
                    <td colSpan={colonnes} className="px-1.5 py-2 text-text-dim">
                      Aucune créance reclassée au plus tard à la clôture de cet exercice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {peutEcrire && form && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form
              ref={refFormulaire}
              onSubmit={envoyer}
              role="dialog"
              aria-modal="true"
              aria-labelledby={id('titre-geste')}
              className="anim-modale w-full max-w-[600px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span id={id('titre-geste')}>{TITRES[form.geste]}</span>
                <button
                  type="button"
                  aria-label="Fermer"
                  disabled={envoi}
                  onClick={fermerFormulaire}
                  className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c] disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 text-[11.5px]">
                {erreurForm && <div className="mb-2 border border-rouge/40 bg-rouge/5 text-rouge rounded-[3px] px-2 py-1 whitespace-pre-wrap">{erreurForm}</div>}
                <div className="grid grid-cols-[170px_1fr] items-center gap-x-3 gap-y-2">
                  {form.creance && (
                    <>
                      <span className="text-right">Créance :</span>
                      <span>
                        {form.creance.compteCreance.numero} · {form.creance.tiers ?? form.creance.compteCreance.intitule} · reste {montant(form.creance.resteALaCloture)}
                      </span>
                    </>
                  )}
                  {(form.geste === 'reclasser' || form.geste === 'declarer') && (
                    <>
                      {comptes && (comptes.tronque || comptes.filtreNumero) && (
                        <>
                          <label htmlFor={id('filtre')} className="text-right">
                            Début du numéro :
                          </label>
                          <span className="flex items-center gap-1.5">
                            <input
                              id={id('filtre')}
                              inputMode="numeric"
                              value={filtreNumero}
                              onChange={(e) => setFiltreNumero(e.target.value)}
                              className="border border-border-dark px-2 py-1 w-[140px]"
                            />
                            <button type="button" className="border border-bord rounded-[3px] px-2 py-[2px]" onClick={() => chargerComptes(filtreNumero)}>
                              Restreindre
                            </button>
                          </span>
                          {comptes.tronque && (
                            <>
                              <span />
                              <span className="text-rouge">
                                Liste limitée aux {comptes.plafond} premiers comptes · tapez le début du numéro du compte du client pour la restreindre.
                              </span>
                            </>
                          )}
                        </>
                      )}
                      <label htmlFor={id('compte-client')} className="text-right">
                        Compte du client :
                      </label>
                      <select
                        id={id('compte-client')}
                        required
                        value={form.compteCreanceId}
                        onChange={(e) => choisirCreance(e.target.value, form.nature)}
                        className="border border-border-dark px-2 py-1"
                      >
                        <option value="">{comptes ? 'Choisir le compte du client' : 'Lecture…'}</option>
                        {(comptes?.creances ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.tiers ?? c.intitule} · {montant(c.solde)}
                          </option>
                        ))}
                      </select>
                      {comptes && comptes.creances.length === 0 && (
                        <>
                          <span />
                          <span className="text-text-dim">
                            {comptes.filtreNumero
                              ? `Aucun compte client débiteur dont le numéro commence par ${comptes.filtreNumero}.`
                              : "Aucun compte client débiteur dans cet exercice · la créance doit d'abord être inscrite."}
                          </span>
                        </>
                      )}
                      <label htmlFor={id('nature')} className="text-right">
                        Nature :
                      </label>
                      <select
                        id={id('nature')}
                        value={form.nature}
                        onChange={(e) => choisirCreance(form.compteCreanceId, e.target.value as NatureCreance)}
                        className="border border-border-dark px-2 py-1"
                      >
                        {(Object.keys(LIBELLE_NATURE) as NatureCreance[]).map((k) => (
                          <option key={k} value={k}>
                            {LIBELLE_NATURE[k]}
                          </option>
                        ))}
                      </select>
                      <label htmlFor={id('compte-416')} className="text-right">
                        Compte 416 :
                      </label>
                      <select id={id('compte-416')} required value={form.compte416Id} onChange={(e) => champ('compte416Id', e.target.value)} className="border border-border-dark px-2 py-1">
                        <option value="">Choisir</option>
                        {(comptes?.comptes416 ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.intitule}
                          </option>
                        ))}
                      </select>
                      {comptes && comptes.comptes416.length === 0 && (
                        <>
                          <span />
                          <span className="text-text-dim">Aucun compte 416 de détail au plan · ouvrez-le dans Plan comptable.</span>
                        </>
                      )}
                      {comptes?.listes416491?.tronque416 && (
                        <>
                          <span />
                          <span className="text-rouge">
                            Liste limitée aux {comptes.listes416491.plafond} premiers comptes 416 sur {comptes.listes416491.total416}.
                          </span>
                        </>
                      )}
                      <label htmlFor={id('compte-491')} className="text-right">
                        Compte 491 :
                      </label>
                      <select id={id('compte-491')} required value={form.compte491Id} onChange={(e) => champ('compte491Id', e.target.value)} className="border border-border-dark px-2 py-1">
                        <option value="">Choisir</option>
                        {comptes491DeLaNature(form.nature, comptes?.comptes491 ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.intitule}
                          </option>
                        ))}
                      </select>
                      {comptes && comptes491DeLaNature(form.nature, comptes.comptes491).length === 0 && (
                        <>
                          <span />
                          <span className="text-text-dim">Aucun compte {racine491(form.nature)} de détail au plan · ouvrez-le dans Plan comptable.</span>
                        </>
                      )}
                      {comptes?.listes416491?.tronque491 && (
                        <>
                          <span />
                          <span className="text-rouge">
                            Liste limitée aux {comptes.listes416491.plafond} premiers comptes 491 sur {comptes.listes416491.total491}.
                          </span>
                        </>
                      )}
                      {creanceChoisie?.refusCotisations && (
                        <>
                          <span />
                          <span className="text-rouge">{creanceChoisie.refusCotisations}</span>
                        </>
                      )}
                      {creanceChoisie?.avertissementCotisations && (
                        <>
                          <span />
                          <span className="text-warning">{creanceChoisie.avertissementCotisations}</span>
                        </>
                      )}
                      {form.geste === 'reclasser' && (
                        <>
                          <span />
                          <span className="flex items-center gap-1.5 text-text-dim">
                            Ne lettrez pas la facture avec le reclassement
                            <Aide
                              titre="Reclassement et lettrage"
                              texte="Le reclassement passe D 416 / C compte du client et ne lettre pas ce compte ; il n'exige aucun lettrage. Ne lettrez pas la facture avec la pièce du reclassement : le calcul de la TVA lirait ce lettrage comme un encaissement, et la TVA d'une prestation de services, exigible à l'encaissement du prix, deviendrait exigible sans qu'aucun prix ne soit perçu."
                              source="O.-L. n° 10/001, art. 25, 2° ; décret n° 011/42, art. 57"
                            />
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {form.geste === 'revue' && (
                    <>
                      <span className="text-right">En place / reste :</span>
                      <span>
                        {proposition
                          ? `${montant(proposition.depreciationEnPlace)} en place · ${montant(proposition.resteALaCloture)} au 416 au ${jour(proposition.dateRevue)}`
                          : 'Lecture…'}
                      </span>
                    </>
                  )}
                  {form.geste === 'declarer' && (
                    <>
                      <label htmlFor={id('depreciation-existante')} className="text-right">
                        Dépréciation existante :
                      </label>
                      <input
                        id={id('depreciation-existante')}
                        required
                        inputMode="decimal"
                        value={form.depreciationOuverture}
                        onChange={(e) => champ('depreciationOuverture', e.target.value)}
                        className="border border-border-dark px-2 py-1"
                      />
                      <label htmlFor={id('source')} className="text-right">
                        Source :
                      </label>
                      <input
                        id={id('source')}
                        required
                        maxLength={500}
                        placeholder="Balance de reprise, état de l'ancien cabinet…"
                        value={form.source}
                        onChange={(e) => champ('source', e.target.value)}
                        className="border border-border-dark px-2 py-1"
                      />
                    </>
                  )}
                  {form.geste === 'perte' && !form.creance?.comptePertePropose && (
                    <>
                      <label htmlFor={id('compte-651')} className="text-right">
                        Compte 651 :
                      </label>
                      <select id={id('compte-651')} required value={form.comptePerteId} onChange={(e) => champ('comptePerteId', e.target.value)} className="border border-border-dark px-2 py-1">
                        <option value="">{comptes651 ? 'Choisir' : 'Lecture…'}</option>
                        {(comptes651 ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.intitule}
                          </option>
                        ))}
                      </select>
                      {motifListe651Vide(comptes651) && (
                        <>
                          <span />
                          <span className="text-text-dim">{motifListe651Vide(comptes651)}</span>
                        </>
                      )}
                    </>
                  )}
                  {form.geste === 'perte' && (
                    <>
                      <span />
                      <span className="flex items-center gap-1.5 text-text-dim">
                        Perte au TTC entier · D 651 / C 416
                        <Aide
                          titre="TVA d'une créance irrécouvrable"
                          texte="La perte sort du 416 le montant TTC entier, en charge au 651 ; ce geste n'écrit aucune ligne de TVA. Quand la créance est réellement et définitivement irrécouvrable, la TVA acquittée sur la vente peut être récupérée par imputation sur la taxe due pour les opérations ultérieures : elle s'inscrit dans les déductions de la déclaration du ou des mois qui suivent la constatation du non-paiement, après l'envoi au client d'un duplicata de la facture surchargé de la mention « facture demeurée impayée », la preuve de l'irrécouvrabilité incombant à l'assujetti. Pour l'instant, le cabinet la déclare lui-même."
                          source="O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127"
                        />
                      </span>
                    </>
                  )}
                  {form.geste !== 'revue' && form.geste !== 'declarer' && (
                    <>
                      <label htmlFor={id('date')} className="text-right">
                        Date :
                      </label>
                      <input
                        id={id('date')}
                        type="date"
                        required
                        min={bornes.min}
                        max={bornes.max}
                        value={form.date}
                        onChange={(e) => champ('date', e.target.value)}
                        className="border border-border-dark px-2 py-1"
                      />
                    </>
                  )}
                  <label htmlFor={id('montant')} className="text-right">
                    {form.geste === 'revue' ? 'Dépréciation nécessaire :' : 'Montant :'}
                  </label>
                  <input id={id('montant')} required inputMode="decimal" value={form.montant} onChange={(e) => champ('montant', e.target.value)} className="border border-border-dark px-2 py-1" />
                  {form.geste === 'revue' && (
                    <>
                      <span />
                      <span className="flex items-center gap-1.5 text-text-dim">
                        Base de la dépréciation · le montant TTC inscrit au 416
                        <Aide
                          titre="Base de la dépréciation"
                          texte="La dépréciation se mesure sur la valeur comptable de la créance, celle inscrite au 41 puis au 416, taxe comprise. La TVA d'une créance irrécouvrable ne se reprend pas ici : elle se récupère par imputation, sur duplicata de la facture, et le cabinet la déclare lui-même."
                          source="AUDCIF Titre VII, fiches des comptes 41 et 49 ; décision de Manasse du 2026-10-03"
                        />
                      </span>
                    </>
                  )}
                  {form.geste === 'revue' && proposition && (
                    <>
                      <span />
                      <span className="text-text-dim">
                        {annonceRevue(proposition.depreciationEnPlace, montantSaisi(form.montant), proposition.comptes, proposition.dateRevue) ?? ' '}
                      </span>
                    </>
                  )}
                  {form.geste !== 'declarer' && (
                    <>
                      <label htmlFor={id('journal')} className="text-right">
                        Journal :
                      </label>
                      <select id={id('journal')} required value={form.journalId} onChange={(e) => champ('journalId', e.target.value)} className="border border-border-dark px-2 py-1">
                        <option value="">{journaux ? 'Choisir' : erreurJournaux ? 'Journaux illisibles' : 'Lecture…'}</option>
                        {journauxDuGeste.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.code} · {j.intitule}
                          </option>
                        ))}
                      </select>
                      {erreurJournaux && (
                        <>
                          <span />
                          <span className="text-rouge">Lecture des journaux impossible · {erreurJournaux}</span>
                        </>
                      )}
                      {journaux && journauxDuGeste.length === 0 && (
                        <>
                          <span />
                          <span className="text-text-dim">
                            {form.geste === 'recouvrement' ? 'Aucun journal de trésorerie avec son compte · créez-le dans Journaux.' : "Aucun journal d'opérations diverses · créez-le dans Journaux."}
                          </span>
                        </>
                      )}
                    </>
                  )}
                  <label htmlFor={id('motif')} className="text-right">
                    Motif :
                  </label>
                  <textarea
                    id={id('motif')}
                    required={form.geste !== 'declarer'}
                    rows={2}
                    maxLength={2000}
                    value={form.motif}
                    onChange={(e) => champ('motif', e.target.value)}
                    className="border border-border-dark px-2 py-1"
                  />
                  <span id={id('pieces')} className="text-right self-start pt-1">
                    Pièces :
                  </span>
                  <div className="space-y-1" role="group" aria-labelledby={id('pieces')}>
                    {form.pieces.map((p, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          aria-label={`Nature de la pièce ${i + 1}`}
                          placeholder="Nature (mise en demeure, jugement…)"
                          value={p.nature}
                          onChange={(e) => champ('pieces', form.pieces.map((x, k) => (k === i ? { ...x, nature: e.target.value } : x)))}
                          className="border border-border-dark px-2 py-1 flex-1 min-w-0"
                        />
                        <input
                          aria-label={`Référence de la pièce ${i + 1}`}
                          placeholder="Référence"
                          value={p.reference}
                          onChange={(e) => champ('pieces', form.pieces.map((x, k) => (k === i ? { ...x, reference: e.target.value } : x)))}
                          className="border border-border-dark px-2 py-1 w-[120px]"
                        />
                        <input
                          aria-label={`Date de la pièce ${i + 1}`}
                          type="date"
                          value={p.date}
                          onChange={(e) => champ('pieces', form.pieces.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)))}
                          className="border border-border-dark px-1 py-1 w-[130px]"
                        />
                      </div>
                    ))}
                    <button type="button" className="text-sel hover:underline" onClick={() => champ('pieces', [...form.pieces, { nature: '', reference: '', date: '' }])}>
                      + Pièce
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" disabled={envoi} onClick={fermerFormulaire} className="border border-bord rounded-[3px] px-3 py-[3px] disabled:opacity-50">
                    Annuler
                  </button>
                  <button type="submit" disabled={envoi} className="bg-sel text-white rounded-full px-3 py-[3px] font-semibold disabled:opacity-50">
                    {form.geste === 'declarer' ? 'Déclarer' : "Passer l'écriture"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </PortailModale>
      )}

      {peutValider && annulation && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form
              ref={refAnnulation}
              onSubmit={annuler}
              role="dialog"
              aria-modal="true"
              aria-labelledby={id('titre-annulation')}
              className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span id={id('titre-annulation')}>
                  {annulation.reclassement ? 'Annuler le reclassement' : annulation.mouvementId ? 'Annuler une perte ou un recouvrement' : 'Annuler la revue de la dépréciation'}
                </span>
                <button
                  type="button"
                  aria-label="Fermer"
                  disabled={envoi}
                  onClick={fermerAnnulation}
                  className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c] disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 text-[11.5px] space-y-2">
                {erreurAnnulation && <div className="border border-rouge/40 bg-rouge/5 text-rouge rounded-[3px] px-2 py-1 whitespace-pre-wrap">{erreurAnnulation}</div>}
                <div className="flex items-center gap-1.5">
                  {annulation.creance.compteCreance.numero} · {annulation.creance.tiers ?? annulation.creance.compteCreance.intitule}
                  <Aide
                    titre={annulation.reclassement ? "Annulation d'un reclassement" : annulation.mouvementId ? "Annulation d'un mouvement" : "Annulation d'une revue"}
                    texte={
                      annulation.reclassement
                        ? "Au brouillard, l'écriture du reclassement est supprimée ; validée, elle est inscrite en négatif. La créance reste au dossier, marquée annulée avec son motif, et sort de la liste. Une revue ou un mouvement qui porte sur elle s'annule d'abord."
                        : annulation.mouvementId
                        ? "Au brouillard, l'écriture est supprimée ; validée, elle est inscrite en négatif. Le mouvement reste au dossier, marqué annulé avec son motif, et sort du reste de la créance. Une revue qui l'a compté s'annule d'abord. Passez ensuite le bon montant."
                        : "Au brouillard, l'écriture de la revue est supprimée ; validée, elle est inscrite en négatif. La revue reste au dossier, marquée annulée avec son motif. Passez ensuite le mouvement, puis refaites la revue."
                    }
                    source="AUDCIF art. 20, al. 2"
                  />
                </div>
                {annulation.mouvementId && (
                  <>
                    <label htmlFor={id('mouvement')} className="block">
                      Mouvement :
                    </label>
                    <select
                      id={id('mouvement')}
                      value={annulation.mouvementId}
                      onChange={(e) => setAnnulation((a) => (a ? { ...a, mouvementId: e.target.value } : a))}
                      className="w-full border border-border-dark px-2 py-1"
                    >
                      {annulation.creance.mouvements.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.type === 'PERTE' ? 'Perte' : 'Recouvrement'} du {jour(m.date)} · {montant(m.montant)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label htmlFor={id('motif-annulation')} className="block">
                  Motif :
                </label>
                <textarea
                  id={id('motif-annulation')}
                  required
                  rows={3}
                  minLength={3}
                  maxLength={500}
                  value={annulation.motif}
                  onChange={(e) => setAnnulation((a) => (a ? { ...a, motif: e.target.value } : a))}
                  className="w-full border border-border-dark px-2 py-1"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={envoi} onClick={fermerAnnulation} className="border border-bord rounded-[3px] px-3 py-[3px] disabled:opacity-50">
                    Fermer
                  </button>
                  <button type="submit" disabled={envoi || !motifAnnulationValide(annulation.motif)} className="bg-sel text-white rounded-full px-3 py-[3px] font-semibold disabled:opacity-50">
                    {annulation.reclassement ? 'Annuler le reclassement' : annulation.mouvementId ? 'Annuler le mouvement' : 'Annuler la revue'}
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
