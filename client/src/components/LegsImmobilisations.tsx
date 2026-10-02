import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Compte, Journal } from '../lib/types';
import { Aide } from './chrome/Aide';
import { compteUnique, motifAucunCompteRetenu } from '../lib/comptes-proposes';
import { usePreselectionUnique } from '../lib/preselection-unique';

/**
 * LE LEGS D'IMMOBILISATIONS GREVÉ DE DETTES (lot 7, SYCEBNL seul) · une
 * saisie pour l'acte, une fiche et une pièce par bien côté serveur
 * (`ImmobilisationService.recevoirLegs`), D 2 / C 4861 / C 167. L'écran ne
 * répartit rien · le serveur répartit les dettes et rend chaque part.
 */
interface LigneBien {
  compteImmobilisationId: string;
  designation: string;
  valeurOrigine: string;
  dureeAmortissementAns: string;
  dateMiseEnService: string;
}
const ligneVide = (): LigneBien => ({ compteImmobilisationId: '', designation: '', valeurOrigine: '', dureeAmortissementAns: '', dateMiseEnService: '' });

export function LegsImmobilisations({
  exerciceId,
  journaux,
  comptesBien,
  onCree,
}: {
  exerciceId: string | undefined;
  journaux: Journal[];
  /** Comptes du bien retenus ou utilisés · null tant qu'ils ne sont pas lus. */
  comptesBien: { id: string; numero: string; intitule: string }[] | null;
  onCree: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const [dateActe, setDateActe] = useState('');
  const [reference, setReference] = useState('');
  const [fonds, setFonds] = useState('');
  const [dettes, setDettes] = useState('0');
  const [compteDettes, setCompteDettes] = useState('');
  const [biens, setBiens] = useState<LigneBien[]>([ligneVide()]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ dettes: number; fonds: number }[] | null>(null);
  const journalOd = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  /*
    LE 167 ET LE 4861 SONT PRESCRITS, TOUS LES DEUX · « les dettes reprises
    avec le legs vont au 4861, le reste au 167 » (SYCEBNL Partie 3 ch. 2
    § 1.2.2, Guide Application 5), et le serveur refuse tout autre compte
    (`legs-immobilisations.ts`). Le legs est souvent le PREMIER mouvement de
    l'un et de l'autre · la règle des comptes retenus viderait les deux listes
    dans un dossier qui n'a jamais reçu de legs, et l'écran n'aurait plus le
    compte que le texte impose. Les deux se lisent donc dans TOUT le plan,
    par la même lecture (critère écrit dans `listes-de-comptes.ts`) ; un
    compte unique se présélectionne.
  */
  const [planPrescrit, setPlanPrescrit] = useState<Compte[] | null>(null);
  useEffect(() => {
    if (!ouvert || planPrescrit) return;
    let vivant = true;
    api
      .get<Compte[]>('/comptes?typeCompte=DETAIL')
      .then((c) => vivant && setPlanPrescrit(c))
      .catch((err) => vivant && setErreur(`Plan de comptes illisible · ${err instanceof ApiError ? err.message : 'serveur injoignable'}`));
    return () => {
      vivant = false;
    };
  }, [ouvert, planPrescrit]);
  const comptesFonds = planPrescrit ? planPrescrit.filter((c) => c.numero.startsWith('167') && !c.numero.startsWith('1679')) : null;
  const comptes4861 = planPrescrit ? planPrescrit.filter((c) => c.numero.startsWith('4861')) : null;
  usePreselectionUnique(ouvert ? comptesFonds : null, fonds, setFonds);
  usePreselectionUnique(ouvert ? comptes4861 : null, compteDettes, setCompteDettes);

  /*
    UN SEUL COMPTE DU BIEN RETENU OU UTILISÉ · il se présélectionne sur chaque
    ligne encore vide (§ 9 ter), modifiable ; un choix fait n'est jamais
    remplacé.
  */
  const compteBienUnique = compteUnique(comptesBien);
  useEffect(() => {
    if (!compteBienUnique) return;
    setBiens((bs) =>
      bs.some((b) => !b.compteImmobilisationId)
        ? bs.map((b) => (b.compteImmobilisationId ? b : { ...b, compteImmobilisationId: compteBienUnique }))
        : bs,
    );
  }, [compteBienUnique, biens.length]);

  if (!peutEcrire) return null;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciceId || !journalOd) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ biens: { dettes: number; fonds: number }[] }>('/immobilisations/legs', {
        exerciceId,
        journalId: journalOd.id,
        dateActe,
        referenceActe: reference,
        compteFondsId: fonds,
        dettes: Number(dettes) || 0,
        ...(Number(dettes) > 0 ? { compteDettesId: compteDettes } : {}),
        biens: biens.map((b) => ({
          compteImmobilisationId: b.compteImmobilisationId,
          designation: b.designation,
          valeurOrigine: Number(b.valeurOrigine),
          ...(b.dureeAmortissementAns ? { dureeAmortissementAns: Number(b.dureeAmortissementAns) } : {}),
          ...(b.dateMiseEnService ? { dateMiseEnService: b.dateMiseEnService } : {}),
        })),
      });
      setResultat(r.biens);
      setBiens([ligneVide()]);
      onCree();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Legs refusé');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'border border-border px-1.5 py-0.5 text-[11.5px]';
  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3">
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Legs d'immobilisations
        <Aide
          titre="Legs d'immobilisations"
          texte="Les biens reçus entrent à leur valeur au débit de leurs comptes ; les dettes reprises avec le legs vont au 4861, le reste au 167. Une fiche et une pièce par bien, les dettes réparties au prorata des valeurs. Le 167 se reprend au 7923 pour la quote-part de la dotation qu'il finance (167 du bien ÷ sa valeur). Les dettes réglées ensuite soldent le 4861 par la trésorerie."
          source="SYCEBNL Partie 3 ch. 2 § 1.2.2 · Guide d'application, Application 5"
        />
        {!ouvert && (
          <button type="button" onClick={() => setOuvert(true)} className="ml-auto bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5">
            Recevoir un legs
          </button>
        )}
      </div>
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      {resultat && (
        <div className="px-3.5 py-1.5 text-[11.5px]">
          {resultat.length} bien(s) entré(s) · dettes {montant(resultat.reduce((t, b) => t + b.dettes, 0))}, fonds {montant(resultat.reduce((t, b) => t + b.fonds, 0))}
        </div>
      )}
      {ouvert && (
        <form onSubmit={(e) => void envoyer(e)} className="px-3.5 py-2 flex flex-col gap-2 text-[11.5px]">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              Date de l'acte
              <input required type="date" value={dateActe} onChange={(e) => setDateActe(e.target.value)} className={champ} />
            </label>
            <label className="flex flex-col">
              Acte
              <input required value={reference} onChange={(e) => setReference(e.target.value)} className={`${champ} w-40`} />
            </label>
            <label className="flex flex-col">
              Fonds
              <select required value={fonds} onChange={(e) => setFonds(e.target.value)} className={champ}>
                <option value="">·</option>
                {(comptesFonds ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} {c.intitule}</option>
                ))}
              </select>
              {comptesFonds && comptesFonds.length === 0 && (
                <span className="text-[11px] text-warning">Aucun compte 167 au plan du dossier · ouvrez-le dans Plan comptable.</span>
              )}
            </label>
            <label className="flex flex-col">
              Dettes reprises
              <input type="number" min="0" step="0.01" value={dettes} onChange={(e) => setDettes(e.target.value)} className={`${champ} w-32`} />
            </label>
            {Number(dettes) > 0 && (
              <label className="flex flex-col">
                Compte des dettes
                <select required value={compteDettes} onChange={(e) => setCompteDettes(e.target.value)} className={champ}>
                  <option value="">·</option>
                  {(comptes4861 ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.numero} {c.intitule}</option>
                  ))}
                </select>
                {comptes4861 && comptes4861.length === 0 && (
                  <span className="text-[11px] text-warning">Aucun compte 4861 au plan du dossier · ouvrez-le dans Plan comptable.</span>
                )}
              </label>
            )}
          </div>
          {biens.map((b, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col">
                Compte du bien
                <select
                  required
                  value={b.compteImmobilisationId}
                  onChange={(e) => setBiens(biens.map((x, j) => (j === i ? { ...x, compteImmobilisationId: e.target.value } : x)))}
                  className={champ}
                >
                  <option value="">·</option>
                  {(comptesBien ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                  ))}
                </select>
                {comptesBien && comptesBien.length === 0 && (
                  <span className="text-[11px] text-warning">{motifAucunCompteRetenu(comptesBien, "d'immobilisation")}</span>
                )}
              </label>
              <label className="flex flex-col">
                Désignation
                <input required value={b.designation} onChange={(e) => setBiens(biens.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)))} className={`${champ} w-48`} />
              </label>
              <label className="flex flex-col">
                Valeur
                <input required type="number" min="0.01" step="0.01" value={b.valeurOrigine} onChange={(e) => setBiens(biens.map((x, j) => (j === i ? { ...x, valeurOrigine: e.target.value } : x)))} className={`${champ} w-32`} />
              </label>
              <label className="flex flex-col">
                Durée (ans)
                <input type="number" min="1" max="100" value={b.dureeAmortissementAns} onChange={(e) => setBiens(biens.map((x, j) => (j === i ? { ...x, dureeAmortissementAns: e.target.value } : x)))} className={`${champ} w-20`} />
              </label>
              <label className="flex flex-col">
                Mise en service
                <input type="date" value={b.dateMiseEnService} onChange={(e) => setBiens(biens.map((x, j) => (j === i ? { ...x, dateMiseEnService: e.target.value } : x)))} className={champ} />
              </label>
              {biens.length > 1 && (
                <button type="button" onClick={() => setBiens(biens.filter((_, j) => j !== i))} className="text-[11px] text-text-dim px-1.5 py-0.5">
                  Retirer
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setBiens([...biens, ligneVide()])} className="text-[11px] font-semibold text-sel px-1.5 py-0.5">
              Ajouter un bien
            </button>
            <button type="submit" disabled={envoi || !journalOd || !exerciceId} className="bg-sel text-white text-[11px] font-semibold px-2.5 py-1 disabled:opacity-50">
              {envoi ? '…' : 'Enregistrer le legs'}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-[11px] font-semibold text-text-dim px-2.5 py-1">
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
