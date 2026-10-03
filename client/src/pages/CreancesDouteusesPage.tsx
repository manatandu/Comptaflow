import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { Aide } from '../components/chrome/Aide';
import { PortailModale } from '../components/PortailModale';
import type { Compte, Journal } from '../lib/types';
import { useExercice } from '../lib/exercice';
import { useGardeFermeture } from '../lib/fenetres';
import { montant } from '../lib/montants';
import { montantSaisi } from '../lib/montant-saisi';
import {
  annonceRevue,
  compte416Initial,
  LIBELLE_NATURE,
  motifAnnulationValide,
  motifListe651Vide,
  piecesAEnvoyer,
  type NatureCreance,
  type PieceSaisie,
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
 */

interface CreanceCandidate {
  id: string;
  numero: string;
  intitule: string;
  tiers: string | null;
  solde: number;
  propose416: Record<NatureCreance, string | null>;
}
interface ComptesFormulaire {
  creances: CreanceCandidate[];
  tronque: boolean;
  comptes416: { id: string; numero: string; intitule: string }[];
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
  mouvements: { id: string; type: 'PERTE' | 'RECOUVREMENT'; date: string; montant: number; motif: string }[];
}
interface Liste {
  exercice: { id: string; dateDebut: string; dateFin: string; statut: string };
  systemeMinimal: boolean;
  total: number;
  tronque: boolean;
  creances: CreanceDouteuse[];
  rapprochement: { provisoire: boolean; solde416: number; resteModule: number; solde491: number; depreciationModule: number } | null;
}
interface TvaOrigine {
  assujetti: boolean;
  comptes443: { id: string; numero: string; intitule: string }[];
  proposition: { compteTvaId: string; numero: string; tvaFactureeCreance: number } | null;
  raison: string | null;
}
interface PropositionRevue {
  depreciationEnPlace: number;
  resteALaCloture: number;
  dateRevue: string;
}

type Geste = 'reclasser' | 'declarer' | 'revue' | 'perte' | 'recouvrement';
interface Formulaire {
  geste: Geste;
  creance: CreanceDouteuse | null;
  compteCreanceId: string;
  nature: NatureCreance;
  compte416Id: string;
  comptePerteId: string;
  journalId: string;
  date: string;
  montant: string;
  depreciationOuverture: string;
  source: string;
  // E2 · la récupération de la TVA d'une créance irrécouvrable, sur demande.
  recupererTva: boolean;
  compteTvaId: string;
  tvaFacturee: string;
  tvaRecuperee: string;
  duplicataReference: string;
  duplicataDate: string;
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

export function CreancesDouteusesPage() {
  const { peutValider } = useAuth();
  const { exerciceCourant } = useExercice();
  const exerciceId = exerciceCourant?.id ?? '';
  const [liste, setListe] = useState<Liste | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [journaux, setJournaux] = useState<Journal[] | null>(null);
  const [comptes, setComptes] = useState<ComptesFormulaire | null>(null);
  const [comptes651, setComptes651] = useState<Compte[] | null>(null);
  const [tvaOrigine, setTvaOrigine] = useState<TvaOrigine | null>(null);
  const [form, setForm] = useState<Formulaire | null>(null);
  const [proposition, setProposition] = useState<PropositionRevue | null>(null);
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // L'annulation d'une revue (AUDCIF art. 20, al. 2) · motif de 3 à 500 caractères.
  const [annulation, setAnnulation] = useState<{ creance: CreanceDouteuse; motif: string } | null>(null);
  const [erreurAnnulation, setErreurAnnulation] = useState<string | null>(null);
  useGardeFermeture(form || annulation ? 'Un geste sur une créance douteuse est en cours de saisie · il serait perdu.' : null);

  useEffect(() => {
    if (!exerciceId) return;
    setErreur(null);
    api.get<Liste>(`/creances-douteuses?exerciceId=${encodeURIComponent(exerciceId)}`).then(setListe, (e) => {
      setListe(null);
      setErreur(messageDe(e));
    });
  }, [exerciceId, version]);

  useEffect(() => {
    if (!peutValider) return;
    api.get<Journal[]>('/journaux').then(setJournaux, (e) => setErreur(messageDe(e)));
  }, [peutValider]);

  function ouvrir(geste: Geste, creance: CreanceDouteuse | null) {
    setErreurForm(null);
    setProposition(null);
    const odUnique = (journaux ?? []).filter((j) => j.type === 'GENERAL');
    const bqUnique = (journaux ?? []).filter((j) => j.type === 'TRESORERIE' && j.compteTresorerieId);
    const choix = geste === 'recouvrement' ? bqUnique : odUnique;
    setForm({
      geste,
      creance,
      compteCreanceId: '',
      nature: 'DOUTEUSE',
      compte416Id: '',
      comptePerteId: '',
      journalId: choix.length === 1 ? choix[0].id : '',
      date: liste ? liste.exercice.dateFin.slice(0, 10) : '',
      montant: geste === 'perte' || geste === 'recouvrement' ? String(creance?.resteALaCloture ?? '') : '',
      depreciationOuverture: '',
      source: '',
      recupererTva: false,
      compteTvaId: '',
      tvaFacturee: '',
      tvaRecuperee: '',
      duplicataReference: '',
      duplicataDate: '',
      motif: '',
      pieces: [{ nature: '', reference: '', date: '' }],
    });
    if (geste === 'reclasser' || geste === 'declarer') {
      setComptes(null);
      api.get<ComptesFormulaire>(`/creances-douteuses/comptes?exerciceId=${encodeURIComponent(exerciceId)}`).then(setComptes, (e) => setErreurForm(messageDe(e)));
    }
    if (geste === 'revue' && creance) {
      api.get<PropositionRevue>(`/creances-douteuses/${creance.id}/revue?exerciceId=${encodeURIComponent(exerciceId)}`).then(setProposition, (e) => setErreurForm(messageDe(e)));
    }
    if (geste === 'perte' && creance) {
      setTvaOrigine(null);
      api.get<TvaOrigine>(`/creances-douteuses/${creance.id}/tva-origine`).then(
        (t) => {
          setTvaOrigine(t);
          // La proposition lue par le lettrage préremplit, jamais elle ne coche.
          setForm((f) =>
            f && t.proposition
              ? { ...f, compteTvaId: t.proposition.compteTvaId, tvaFacturee: String(t.proposition.tvaFactureeCreance) }
              : f && t.comptes443.length === 1
                ? { ...f, compteTvaId: t.comptes443[0].id }
                : f,
          );
        },
        (e) => setErreurForm(messageDe(e)),
      );
    }
    if (geste === 'perte' && !creance?.comptePertePropose) {
      api.get<Compte[]>('/comptes?actifsSeuls=true&typeCompte=DETAIL&retenus=true').then(
        (l) => setComptes651(l.filter((c) => c.numero.startsWith('651'))),
        (e) => setErreurForm(messageDe(e)),
      );
    }
  }

  function champ<K extends keyof Formulaire>(cle: K, valeur: Formulaire[K]) {
    setForm((f) => (f ? { ...f, [cle]: valeur } : f));
  }

  function choisirCreance(id: string, nature: NatureCreance) {
    const c = comptes?.creances.find((x) => x.id === id);
    setForm((f) =>
      f
        ? {
            ...f,
            compteCreanceId: id,
            nature,
            compte416Id: compte416Initial(c?.propose416, nature, comptes?.comptes416 ?? []),
            montant: c && f.compteCreanceId !== id ? String(c.solde) : f.montant,
          }
        : f,
    );
  }

  async function envoyer(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form) return;
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
          nature: form.nature,
          montant: valeur,
          depreciationOuverture: deprec,
          source: form.source,
          motif: form.motif || undefined,
          pieces: piecesAEnvoyer(form.pieces),
        });
      } else if (form.geste === 'reclasser') {
        await api.post('/creances-douteuses', {
          ...commun,
          date: form.date,
          compteCreanceId: form.compteCreanceId,
          compte416Id: form.compte416Id || undefined,
          nature: form.nature,
          montant: valeur,
        });
      } else if (form.geste === 'revue') {
        await api.post(`/creances-douteuses/${form.creance!.id}/revue`, { ...commun, depreciationNecessaire: necessaire });
      } else if (form.geste === 'perte') {
        const tva = form.recupererTva ? montantSaisi(form.tvaRecuperee) : null;
        const facturee = form.recupererTva ? montantSaisi(form.tvaFacturee) : null;
        if (form.recupererTva && (tva == null || facturee == null)) {
          throw new Error('Saisissez la TVA facturée et la TVA récupérée · un champ vide n’est pas zéro.');
        }
        await api.post(`/creances-douteuses/${form.creance!.id}/perte`, {
          ...commun,
          date: form.date,
          montant: valeur,
          comptePerteId: form.comptePerteId || undefined,
          recuperationTva: form.recupererTva
            ? {
                compteTvaId: form.compteTvaId,
                tvaRecuperee: tva,
                tvaFactureeCreance: facturee,
                duplicataReference: form.duplicataReference,
                duplicataDateEnvoi: form.duplicataDate,
              }
            : undefined,
        });
      } else {
        await api.post(`/creances-douteuses/${form.creance!.id}/recouvrement`, { ...commun, date: form.date, montant: valeur });
      }
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
    if (!annulation?.creance.revue) return;
    setEnvoi(true);
    setErreurAnnulation(null);
    try {
      await api.post(`/creances-douteuses/${annulation.creance.id}/revues/${annulation.creance.revue.id}/annuler`, { motif: annulation.motif });
      setAnnulation(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreurAnnulation(messageDe(e));
    } finally {
      setEnvoi(false);
    }
  }

  async function retirer(chemin: string, question: string) {
    if (!window.confirm(question)) return;
    setErreur(null);
    try {
      await api.delete(chemin);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(messageDe(e));
    }
  }

  const r = liste?.rapprochement;
  const ecart416 = r ? Math.round((r.solde416 - r.resteModule) * 100) / 100 : 0;
  const ecart491 = r ? Math.round((r.solde491 - r.depreciationModule) * 100) / 100 : 0;
  const journauxDuGeste = (journaux ?? []).filter((j) =>
    form?.geste === 'recouvrement' ? j.type === 'TRESORERIE' && j.compteTresorerieId : j.type === 'GENERAL',
  );

  return (
    <div className="p-2">
      <EnteteImpression titre="Créances douteuses ou litigieuses" />
      <div className="ecran-seul mb-1.5 max-w-[1240px] flex items-center justify-end gap-2">
        {peutValider && (
          <button
            type="button"
            onClick={() => ouvrir('reclasser', null)}
            disabled={!liste || liste.exercice.statut !== 'OUVERT'}
            className="bg-sel text-white rounded-full px-3 py-[3px] text-[11.5px] font-semibold disabled:opacity-50"
          >
            + Reclasser une créance
          </button>
        )}
        {peutValider && (
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
      {liste === null && !erreur && <div className="text-[11.5px] text-text-dim">Chargement…</div>}

      {liste && (
        <div className="max-w-[1240px] space-y-2">
          {liste.systemeMinimal && (
            <div className="border border-bord rounded-[3px] px-2 py-1 text-[11.5px]">
              Système minimal de trésorerie · aucune dépréciation n'y est dotée ; le reclassement, la reprise d'une dépréciation existante et la perte restent ouverts.
            </div>
          )}
          {r?.provisoire && (
            <div className="text-[11.5px] text-text-dim">
              Soldes du 416 et du 491 lus sur le report reconstitué de l'exercice précédent · l'à-nouveau de cet exercice n'est pas encore passé.
            </div>
          )}
          {r && (Math.abs(ecart416) >= 0.01 || Math.abs(ecart491) >= 0.01) && (
            <div className="border border-rouge/40 bg-rouge/5 rounded-[3px] px-2 py-1 text-[11.5px] text-rouge">
              {Math.abs(ecart416) >= 0.01 && <div>Le solde du 416 ({montant(r.solde416)}) diffère des créances suivies ici ({montant(r.resteModule)}).</div>}
              {Math.abs(ecart491) >= 0.01 && <div>Le solde du 491 ({montant(r.solde491)}) diffère des dépréciations suivies ici ({montant(r.depreciationModule)}).</div>}
            </div>
          )}
          {liste.tronque && <div className="text-[11.5px] text-text-dim">{liste.creances.length} créances affichées sur {liste.total}.</div>}

          <div className="border border-bord rounded-[3px] overflow-x-auto">
            <table className="w-full text-[11.5px] whitespace-nowrap">
              <thead>
                <tr>
                  <th className="text-left px-1.5 py-1">Créance</th>
                  <th className="text-left px-1.5">Nature</th>
                  <th className="text-left px-1.5">Reclassée le</th>
                  <th className="text-right px-1.5">Reclassé</th>
                  <th className="text-right px-1.5">Reste au 416</th>
                  <th className="text-right px-1.5">Dépréciation à l'ouverture</th>
                  <th className="text-right px-1.5">Dépréciation à la clôture</th>
                  <th className="text-left px-1.5">Revue</th>
                  {peutValider && <th className="text-left px-1.5">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {liste.creances.map((c) => {
                  const ouvert = liste.exercice.statut === 'OUVERT';
                  return (
                    <tr key={c.id} className="border-t border-bord/50 align-top">
                      <td className="px-1.5 py-[3px]" title={c.motif}>
                        {c.compteCreance.numero} · {c.tiers ?? c.compteCreance.intitule}
                        <div className="text-text-dim">{c.compte416.numero} / {c.compte491.numero}</div>
                      </td>
                      <td className="px-1.5">{c.nature === 'LITIGIEUSE' ? 'Litigieuse' : 'Douteuse'}</td>
                      <td className="px-1.5">{jour(c.dateReclassement)}</td>
                      <td className="px-1.5 text-right tabular-nums">{montant(c.montant)}</td>
                      <td className="px-1.5 text-right tabular-nums">{montant(c.resteALaCloture)}</td>
                      <td className="px-1.5 text-right tabular-nums">{montant(c.depreciationOuverture)}</td>
                      <td className="px-1.5 text-right tabular-nums font-semibold">{montant(c.depreciationALaCloture)}</td>
                      <td className="px-1.5" title={c.revue?.motif ?? c.revuesAnnulees.map((a) => `Annulée le ${jour(a.annuleeLe)} · ${a.motif ?? ''}`).join(' ; ')}>
                        {c.revue ? 'Faite' : c.revueAFaire ? 'À faire' : '·'}
                      </td>
                      {peutValider && (
                        <td className="px-1.5 space-x-2">
                          {ouvert && !c.revue && (
                            <button type="button" className="text-sel hover:underline" onClick={() => ouvrir('revue', c)}>
                              Revoir
                            </button>
                          )}
                          {ouvert && c.resteALaCloture > 0 && (
                            <>
                              <button type="button" className="text-sel hover:underline" onClick={() => ouvrir('recouvrement', c)}>
                                Recouvrement
                              </button>
                              <button type="button" className="text-sel hover:underline" onClick={() => ouvrir('perte', c)}>
                                Perte
                              </button>
                            </>
                          )}
                          {ouvert && c.revue && (
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
                          {c.mouvements.length > 0 && (
                            <button
                              type="button"
                              className="text-rouge hover:underline"
                              onClick={() => {
                                const dernier = c.mouvements[c.mouvements.length - 1];
                                void retirer(`/creances-douteuses/${c.id}/mouvements/${dernier.id}`, 'Retirer le dernier mouvement et son écriture au brouillard ?');
                              }}
                            >
                              Retirer le dernier mouvement
                            </button>
                          )}
                          {c.revues.length === 0 && c.revuesAnnulees.length === 0 && c.mouvements.length === 0 && (
                            <button
                              type="button"
                              className="text-rouge hover:underline"
                              onClick={() => retirer(`/creances-douteuses/${c.id}`, 'Retirer ce reclassement et son écriture au brouillard ?')}
                            >
                              Retirer
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {liste.creances.length === 0 && (
                  <tr>
                    <td colSpan={peutValider ? 9 : 8} className="px-1.5 py-2 text-text-dim">
                      Aucune créance reclassée au plus tard à la clôture de cet exercice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {peutValider && form && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form onSubmit={envoyer} className="anim-modale w-full max-w-[600px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span>{TITRES[form.geste]}</span>
                <button type="button" onClick={() => setForm(null)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
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
                      <label className="text-right">Créance :</label>
                      <select required value={form.compteCreanceId} onChange={(e) => choisirCreance(e.target.value, form.nature)} className="border border-border-dark px-2 py-1">
                        <option value="">Choisir le compte du client</option>
                        {(comptes?.creances ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.tiers ?? c.intitule} · {montant(c.solde)}
                          </option>
                        ))}
                      </select>
                      {comptes && comptes.creances.length === 0 && (
                        <>
                          <span />
                          <span className="text-text-dim">Aucun compte client débiteur dans cet exercice · la créance doit d'abord être inscrite.</span>
                        </>
                      )}
                      <label className="text-right">Nature :</label>
                      <select value={form.nature} onChange={(e) => choisirCreance(form.compteCreanceId, e.target.value as NatureCreance)} className="border border-border-dark px-2 py-1">
                        {(Object.keys(LIBELLE_NATURE) as NatureCreance[]).map((k) => (
                          <option key={k} value={k}>
                            {LIBELLE_NATURE[k]}
                          </option>
                        ))}
                      </select>
                      <label className="text-right">Compte 416 :</label>
                      <select required value={form.compte416Id} onChange={(e) => champ('compte416Id', e.target.value)} className="border border-border-dark px-2 py-1">
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
                      <label className="text-right">Dépréciation existante :</label>
                      <input required inputMode="decimal" value={form.depreciationOuverture} onChange={(e) => champ('depreciationOuverture', e.target.value)} className="border border-border-dark px-2 py-1" />
                      <label className="text-right">Source :</label>
                      <input required maxLength={500} placeholder="Balance de reprise, état de l'ancien cabinet…" value={form.source} onChange={(e) => champ('source', e.target.value)} className="border border-border-dark px-2 py-1" />
                    </>
                  )}
                  {form.geste === 'perte' && !form.creance?.comptePertePropose && (
                    <>
                      <label className="text-right">Compte 651 :</label>
                      <select required value={form.comptePerteId} onChange={(e) => champ('comptePerteId', e.target.value)} className="border border-border-dark px-2 py-1">
                        <option value="">Choisir</option>
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
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={form.recupererTva} onChange={(e) => champ('recupererTva', e.target.checked)} />
                        Récupérer la TVA de la créance
                        <Aide
                          titre="TVA d'une créance irrécouvrable"
                          texte="Si le dossier est assujetti et la créance définitivement irrécouvrable, la TVA se récupère après l'envoi au client d'un duplicata surchargé de la mention « facture demeurée impayée ». La perte passe alors D 651 hors taxe, D 443 TVA, C 416 TTC. La récupération s'inscrit dans la déclaration du mois SUIVANT la constatation."
                          source="O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127"
                        />
                      </label>
                      {form.recupererTva && (
                        <>
                          {tvaOrigine && !tvaOrigine.assujetti && (
                            <>
                              <span />
                              <span className="text-rouge">Le dossier n'est pas déclaré assujetti à la TVA · la récupération sera refusée.</span>
                            </>
                          )}
                          {tvaOrigine?.raison && (
                            <>
                              <span />
                              <span className="text-text-dim">{tvaOrigine.raison}</span>
                            </>
                          )}
                          <label className="text-right">Compte 443 :</label>
                          <select required value={form.compteTvaId} onChange={(e) => champ('compteTvaId', e.target.value)} className="border border-border-dark px-2 py-1">
                            <option value="">Choisir</option>
                            {(tvaOrigine?.comptes443 ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.numero} · {c.intitule}
                              </option>
                            ))}
                          </select>
                          {tvaOrigine && tvaOrigine.comptes443.length === 0 && (
                            <>
                              <span />
                              <span className="text-text-dim">Aucun compte 443 de détail au plan · ouvrez-le dans Plan comptable.</span>
                            </>
                          )}
                          <label className="text-right">TVA facturée (créance) :</label>
                          <input required inputMode="decimal" value={form.tvaFacturee} onChange={(e) => champ('tvaFacturee', e.target.value)} className="border border-border-dark px-2 py-1" />
                          <label className="text-right">TVA récupérée :</label>
                          <input required inputMode="decimal" value={form.tvaRecuperee} onChange={(e) => champ('tvaRecuperee', e.target.value)} className="border border-border-dark px-2 py-1" />
                          <label className="text-right">Duplicata, référence :</label>
                          <input required maxLength={200} value={form.duplicataReference} onChange={(e) => champ('duplicataReference', e.target.value)} className="border border-border-dark px-2 py-1" />
                          <label className="text-right">Duplicata, envoyé le :</label>
                          <input type="date" required value={form.duplicataDate} onChange={(e) => champ('duplicataDate', e.target.value)} className="border border-border-dark px-2 py-1" />
                        </>
                      )}
                    </>
                  )}
                  {form.geste !== 'revue' && form.geste !== 'declarer' && (
                    <>
                      <label className="text-right">Date :</label>
                      <input type="date" required value={form.date} onChange={(e) => champ('date', e.target.value)} className="border border-border-dark px-2 py-1" />
                    </>
                  )}
                  <label className="text-right">{form.geste === 'revue' ? 'Dépréciation nécessaire :' : 'Montant :'}</label>
                  <input required inputMode="decimal" value={form.montant} onChange={(e) => champ('montant', e.target.value)} className="border border-border-dark px-2 py-1" />
                  {form.geste === 'revue' && (
                    <>
                      <span />
                      <span className="flex items-center gap-1.5 text-text-dim">
                        Base de la dépréciation · le montant TTC inscrit au 416
                        <Aide
                          titre="Base de la dépréciation"
                          texte="La dépréciation se mesure sur la valeur comptable de la créance, celle inscrite au 41 puis au 416, taxe comprise. La TVA d'une créance irrécouvrable ne se reprend pas ici : elle se récupère au geste de perte, sur duplicata de la facture."
                          source="AUDCIF Titre VII, fiches des comptes 41 et 49 ; décision de Manasse du 2026-10-03"
                        />
                      </span>
                    </>
                  )}
                  {form.geste === 'revue' && proposition && (
                    <>
                      <span />
                      <span className="text-text-dim">{annonceRevue(proposition.depreciationEnPlace, montantSaisi(form.montant)) ?? ' '}</span>
                    </>
                  )}
                  {form.geste !== 'declarer' && <label className="text-right">Journal :</label>}
                  {form.geste !== 'declarer' && (
                  <select required value={form.journalId} onChange={(e) => champ('journalId', e.target.value)} className="border border-border-dark px-2 py-1">
                    <option value="">Choisir</option>
                    {journauxDuGeste.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.code} · {j.intitule}
                      </option>
                    ))}
                  </select>
                  )}
                  {form.geste !== 'declarer' && journaux && journauxDuGeste.length === 0 && (
                    <>
                      <span />
                      <span className="text-text-dim">
                        {form.geste === 'recouvrement' ? 'Aucun journal de trésorerie avec son compte · créez-le dans Journaux.' : "Aucun journal d'opérations diverses · créez-le dans Journaux."}
                      </span>
                    </>
                  )}
                  <label className="text-right">Motif :</label>
                  <textarea required={form.geste !== 'declarer'} rows={2} maxLength={2000} value={form.motif} onChange={(e) => champ('motif', e.target.value)} className="border border-border-dark px-2 py-1" />
                  <span className="text-right self-start pt-1">Pièces :</span>
                  <div className="space-y-1">
                    {form.pieces.map((p, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          placeholder="Nature (mise en demeure, jugement…)"
                          value={p.nature}
                          onChange={(e) => champ('pieces', form.pieces.map((x, k) => (k === i ? { ...x, nature: e.target.value } : x)))}
                          className="border border-border-dark px-2 py-1 flex-1 min-w-0"
                        />
                        <input
                          placeholder="Référence"
                          value={p.reference}
                          onChange={(e) => champ('pieces', form.pieces.map((x, k) => (k === i ? { ...x, reference: e.target.value } : x)))}
                          className="border border-border-dark px-2 py-1 w-[120px]"
                        />
                        <input
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
                  <button type="button" onClick={() => setForm(null)} className="border border-bord rounded-[3px] px-3 py-[3px]">
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
            <form onSubmit={annuler} className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span>Annuler la revue de la dépréciation</span>
                <button type="button" onClick={() => setAnnulation(null)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                  ✕
                </button>
              </div>
              <div className="p-4 text-[11.5px] space-y-2">
                {erreurAnnulation && <div className="border border-rouge/40 bg-rouge/5 text-rouge rounded-[3px] px-2 py-1 whitespace-pre-wrap">{erreurAnnulation}</div>}
                <div className="flex items-center gap-1.5">
                  {annulation.creance.compteCreance.numero} · {annulation.creance.tiers ?? annulation.creance.compteCreance.intitule}
                  <Aide
                    titre="Annulation d'une revue"
                    texte="Au brouillard, l'écriture de la revue est supprimée ; validée, elle est inscrite en négatif. La revue reste au dossier, marquée annulée avec son motif. Passez ensuite le mouvement, puis refaites la revue."
                    source="AUDCIF art. 20, al. 2"
                  />
                </div>
                <label className="block">Motif :</label>
                <textarea
                  required
                  rows={3}
                  minLength={3}
                  maxLength={500}
                  value={annulation.motif}
                  onChange={(e) => setAnnulation((a) => (a ? { ...a, motif: e.target.value } : a))}
                  className="w-full border border-border-dark px-2 py-1"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAnnulation(null)} className="border border-bord rounded-[3px] px-3 py-[3px]">
                    Fermer
                  </button>
                  <button type="submit" disabled={envoi || !motifAnnulationValide(annulation.motif)} className="bg-sel text-white rounded-full px-3 py-[3px] font-semibold disabled:opacity-50">
                    Annuler la revue
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
