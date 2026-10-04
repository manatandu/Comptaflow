import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Journal } from '../lib/types';
import { Aide } from './chrome/Aide';

interface IncorporationsLues {
  lignes: {
    id: string;
    immobilisation: { id: string; designation: string };
    nature: 'SPECIFIQUE' | 'GENERAL';
    dateDebut: string;
    dateFin: string;
    mois: number;
    montant: number;
  }[];
  total: number;
  tronque: boolean;
}

/**
 * INCORPORER DES COÛTS D'EMPRUNT AU COÛT D'UN ACTIF QUALIFIÉ (lot 13) · AUDCIF
 * Titre VIII ch. 7. Le serveur tient tous les refus (`incorporerCoutsEmprunt` ·
 * actif qualifié, période, plafond des coûts supportés, voie générale refusée
 * au SYCEBNL) et rejoue le montant · l'écran ne fait que poser la question et
 * montrer le calcul attendu.
 */
export function CoutsEmpruntIncorpores({
  bien,
  exerciceId,
  referentiel,
  journaux,
  onFait,
  onFermer,
}: {
  bien: { id: string; designation: string; dateAcquisition?: string | null };
  exerciceId: string | null;
  referentiel: 'SYCEBNL' | 'SYSCOHADA';
  journaux: Journal[];
  onFait: (message: string) => void;
  onFermer: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [nature, setNature] = useState<'SPECIFIQUE' | 'GENERAL'>('SPECIFIQUE');
  const [debutPreparation, setDebutPreparation] = useState('');
  const [finPreparation, setFinPreparation] = useState('');
  const [justification, setJustification] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [base, setBase] = useState('');
  const [taux, setTaux] = useState('');
  const [placements, setPlacements] = useState('');
  const [journalId, setJournalId] = useState(() => journaux.find((j) => j.code === 'OD')?.id ?? journaux[0]?.id ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // null tant que la liste n'est pas lue · « aucune » ne se dit que sur une liste lue.
  const [deLExercice, setDeLExercice] = useState<IncorporationsLues | null>(null);
  const [erreurListe, setErreurListe] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceId) return;
    api
      .get<IncorporationsLues>(`/immobilisations/couts-emprunt-incorpores?exerciceId=${encodeURIComponent(exerciceId)}`)
      .then(setDeLExercice)
      .catch((err) => setErreurListe(err instanceof ApiError ? err.message : 'Liste illisible'));
  }, [exerciceId]);

  if (!peutEcrire) return null;
  const duBien = deLExercice?.lignes.filter((l) => l.immobilisation.id === bien.id) ?? null;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciceId) {
      setErreur('Choisissez d’abord un exercice.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ montant: number }>(`/immobilisations/${bien.id}/couts-emprunt`, {
        exerciceId,
        journalId,
        nature,
        debutPreparation,
        finPreparation,
        ...(justification.trim() ? { justificationPeriodeCourte: justification.trim() } : {}),
        dateDebut,
        dateFin,
        base: Number(base),
        tauxPourcent: Number(taux),
        ...(nature === 'SPECIFIQUE' && placements ? { produitsPlacement: Number(placements) } : {}),
      });
      onFait(`${montant(r.montant)} de coûts d'emprunt incorporés au coût de « ${bien.designation} ».`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Incorporation refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]';
  const libelle = 'text-[11.5px] font-semibold text-text-dim';
  return (
    <form onSubmit={(e) => void envoyer(e)} className="bg-chrome border-b border-border px-4 py-3" data-couts-emprunt>
      {erreur && <div className="mb-2 text-[11.5px] text-danger">{erreur}</div>}
      <div className="grid grid-cols-4 gap-3 items-end">
        <label className={libelle}>
          <span className="flex items-center gap-1">
            Emprunt
            <Aide
              titre="Coûts d'emprunt incorporés"
              texte={
                "Un actif qualifié exige une longue période de préparation avant d'être utilisé (en principe une année ou plus ; moins, si l'entité la juge significative et le justifie aux Notes annexes). " +
                "Emprunt spécifique : intérêts de la période, diminués des produits du placement temporaire des fonds. Emprunts généraux : taux de capitalisation appliqué aux dépenses relatives à l'actif. " +
                "L'incorporation court pendant la préparation et cesse à la mise en service ; elle ne dépasse jamais les coûts d'emprunt supportés dans l'exercice. " +
                (referentiel === 'SYCEBNL'
                  ? 'Au SYCEBNL, seuls les emprunts exclusivement affectés à la fabrication se capitalisent, par le crédit du 787.'
                  : 'Au SYSCOHADA, le transfert se fait par le crédit du compte 72.')
              }
              source={
                // Ligne A22 · chaque plan dans son texte · le 787 vient des
                // fiches 67 et 72 du SYCEBNL, le 72 de celles de l'AUDCIF.
                referentiel === 'SYCEBNL'
                  ? 'AUDCIF Titre VIII ch. 7 ; SYCEBNL, fiches des comptes 67 et 72'
                  : 'AUDCIF Titre VIII ch. 7 ; AUDCIF Titre VII, fiches des comptes 67, 72 et 78'
              }
            />
          </span>
          <select value={nature} onChange={(e) => setNature(e.target.value as typeof nature)} className={champ}>
            <option value="SPECIFIQUE">Emprunt spécifique</option>
            {referentiel === 'SYSCOHADA' && <option value="GENERAL">Emprunts généraux</option>}
          </select>
        </label>
        <label className={libelle}>
          Début de la préparation
          <input required type="date" value={debutPreparation} onChange={(e) => setDebutPreparation(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          Fin de la préparation
          <input required type="date" value={finPreparation} onChange={(e) => setFinPreparation(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          Journal
          <select required value={journalId} onChange={(e) => setJournalId(e.target.value)} className={champ}>
            {journaux.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.intitule}
              </option>
            ))}
          </select>
        </label>
        <label className={libelle}>
          Incorporation du
          <input required type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          au
          <input required type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          {nature === 'SPECIFIQUE' ? 'Capital emprunté' : 'Dépenses relatives à l’actif'}
          <input required type="number" min={0} step="0.01" value={base} onChange={(e) => setBase(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          {nature === 'SPECIFIQUE' ? 'Taux de l’emprunt (%)' : 'Taux de capitalisation (%)'}
          <input required type="number" min={0} max={100} step="0.0001" value={taux} onChange={(e) => setTaux(e.target.value)} className={`${champ} font-mono`} />
        </label>
        {nature === 'SPECIFIQUE' && (
          <label className={libelle}>
            Produits du placement temporaire
            <input type="number" min={0} step="0.01" value={placements} onChange={(e) => setPlacements(e.target.value)} className={`${champ} font-mono`} />
          </label>
        )}
        <label className={`${libelle} ${nature === 'SPECIFIQUE' ? 'col-span-3' : 'col-span-4'}`}>
          Justification d’une préparation de moins de douze mois
          <input value={justification} onChange={(e) => setJustification(e.target.value)} className={champ} />
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
          {envoi ? '…' : 'Incorporer'}
        </button>
        <button type="button" onClick={onFermer} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">
          Annuler
        </button>
      </div>
      <div className="mt-3 text-[11.5px]">
        <div className="font-semibold text-text-dim mb-1">Incorporations de l'exercice pour ce bien</div>
        {erreurListe ? (
          <div className="text-danger">{erreurListe}</div>
        ) : !exerciceId ? (
          <div className="text-text-dim">Aucun exercice choisi.</div>
        ) : duBien === null ? (
          <div className="text-text-dim">…</div>
        ) : duBien.length === 0 ? (
          <div className="text-text-dim">Aucune incorporation.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Période</th>
                <th className="text-left">Emprunt</th>
                <th className="text-right">Mois</th>
                <th className="text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {duBien.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono">
                    {new Date(l.dateDebut).toLocaleDateString('fr-FR')} au {new Date(l.dateFin).toLocaleDateString('fr-FR')}
                  </td>
                  <td>{l.nature === 'SPECIFIQUE' ? 'Spécifique' : 'Généraux'}</td>
                  <td className="text-right font-mono">{l.mois}</td>
                  <td className="text-right font-mono">{montant(l.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {deLExercice && (
          <div className="mt-1 text-text-dim">
            Total incorporé dans l'exercice, tous biens : {montant(deLExercice.total)}
            {deLExercice.tronque ? ' (liste limitée aux 500 premières)' : ''}
          </div>
        )}
      </div>
    </form>
  );
}
