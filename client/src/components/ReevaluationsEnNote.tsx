import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { montant } from '../lib/montants';
import { etatEncadreReevaluations, natureDeLaReevaluation, type NoteReevaluations } from '../lib/reevaluation-suites';
import { Aide } from './chrome/Aide';

/**
 * L'ENCADRÉ DES RÉÉVALUATIONS, à côté des rubriques libres de la NOTE 3E
 * (SYSCOHADA) ou 5H (associations SYCEBNL) · ligne A15.
 *
 * LECTURE SEULE · aucun appel d'écriture, aucune valeur passée à la saisie de
 * la note · le cabinet rédige ses rubriques, l'écran lui donne ce que les
 * textes demandent (AUDCIF Titre VIII ch. 28 § 8 ; loi n° 23/053, art. 135),
 * servi des réévaluations passées par le module.
 */
export function ReevaluationsEnNote({ exerciceId, referentiel }: { exerciceId: string | null; referentiel: 'SYCEBNL' | 'SYSCOHADA' }) {
  const [lu, setLu] = useState<NoteReevaluations | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setLu(null);
    setErreur(null);
    if (!exerciceId) return;
    let actif = true;
    api.get<NoteReevaluations>(`/immobilisations/reevaluation-bilan/note?exerciceId=${encodeURIComponent(exerciceId)}`).then(
      (r) => actif && setLu(r),
      (e) => actif && setErreur(e instanceof ApiError ? e.message : 'Lecture impossible'),
    );
    return () => {
      actif = false;
    };
  }, [exerciceId]);

  const etat = etatEncadreReevaluations(lu, erreur);
  if (etat.type === 'absent' || etat.type === 'chargement') return null;
  if (etat.type === 'erreur') {
    return (
      <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-4 text-[11.5px]">
        Réévaluations · lecture impossible : {etat.motif}
      </div>
    );
  }
  if (etat.type === 'sansObjet') return null;
  const n = etat.lu;
  const sycebnl = referentiel === 'SYCEBNL';
  return (
    <div className="border border-border bg-surface mb-4" data-encadre="reevaluations">
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-chrome text-[11.5px] font-bold">
        Réévaluations des immobilisations
        <Aide
          titre="Réévaluations en note"
          texte={
            'Les notes annexes donnent la nature et la date des réévaluations, les montants en coûts historiques des ' +
            'éléments réévalués par poste du bilan, les amortissements supplémentaires qui en résultent, le traitement ' +
            'fiscal de l’écart et la méthode utilisée. Les amortissements pratiqués après la réévaluation et les reprises ' +
            'de l’exercice opérées sur l’écart y figurent aussi. Ces chiffres viennent des réévaluations passées par ' +
            'OmegaX · ils sont montrés pour la rédaction des rubriques et ne sont jamais écrits à la place du cabinet. ' +
            'Le montant de l’écart incorporé ' +
            (sycebnl ? 'à la dotation' : 'au capital') +
            ' n’est pas tenu par le module · sa rubrique reste à saisir.'
          }
          source={
            sycebnl
              ? 'SYCEBNL Partie 4 ch. 2, NOTE 5H · AUDCIF Titre VIII ch. 28 § 8'
              : 'AUDCIF Titre VIII ch. 28 § 8 · Titre IX ch. 6, NOTE 3E · loi n° 23/053, art. 135'
          }
        />
      </div>
      <div className="px-4 py-2 text-[11.5px] space-y-1 border-b border-border">
        {n.reevaluations.map((r) => (
          <div key={r.id}>
            <span className="font-semibold">{natureDeLaReevaluation(r)}</span> au {new Date(r.dateReevaluation).toLocaleDateString('fr-FR')} · {r.methodeEvaluation}
            <span className="text-text-dim"> · traitement fiscal : {r.traitementFiscal}</span>
          </div>
        ))}
      </div>
      {n.postes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr>
                <th className="text-left px-4 py-1.5">Poste du bilan</th>
                <th className="text-right px-2 py-1.5">Coûts historiques</th>
                <th className="text-right px-2 py-1.5">Montants réévalués</th>
                <th className="text-right px-2 py-1.5">Écarts de réévaluation</th>
                <th className="text-right px-2 py-1.5">Provision spéciale</th>
                <th className="text-right px-2 py-1.5">Amortissements supplémentaires</th>
                <th className="text-right px-4 py-1.5">Reprise de l’exercice</th>
              </tr>
            </thead>
            <tbody>
              {n.postes.map((p) => (
                <tr key={p.poste} className="border-t border-border">
                  <td className="px-4 py-1">{p.poste}</td>
                  <td className="px-2 py-1 text-right">{montant(p.coutHistorique)}</td>
                  <td className="px-2 py-1 text-right">{montant(p.valeurReevaluee)}</td>
                  <td className="px-2 py-1 text-right">{montant(p.ecart106)}</td>
                  <td className="px-2 py-1 text-right">{montant(p.provision154)}</td>
                  <td className="px-2 py-1 text-right">{montant(p.amortissementsSupplementaires)}</td>
                  <td className="px-4 py-1 text-right">{montant(p.repriseExercice)}</td>
                </tr>
              ))}
              {n.total && (
                <tr className="border-t border-border font-bold">
                  <td className="px-4 py-1">Total</td>
                  <td className="px-2 py-1 text-right">{montant(n.total.coutHistorique)}</td>
                  <td className="px-2 py-1 text-right">{montant(n.total.valeurReevaluee)}</td>
                  <td className="px-2 py-1 text-right">{montant(n.total.ecart106)}</td>
                  <td className="px-2 py-1 text-right">{montant(n.total.provision154)}</td>
                  <td className="px-2 py-1 text-right">{montant(n.total.amortissementsSupplementaires)}</td>
                  <td className="px-4 py-1 text-right">{montant(n.total.repriseExercice)}</td>
                </tr>
              )}
              {/* Seconde relecture A15 · les totaux par poste comprennent les biens sortis dans l'exercice
                  (cadre de la note, ch. 28 § 8) · la ligne le dit, le détail est sous le tableau. */}
              {n.sortis.length > 0 && (
                <tr className="border-t border-border text-text-dim">
                  <td className="px-4 py-1" colSpan={7}>
                    dont biens sortis dans l’exercice · {n.sortis.length}, compris dans les totaux par poste
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {n.sortis.length > 0 && (
        <div className="px-4 py-2 border-t border-border text-[11.5px]">
          <div className="font-semibold mb-1">Biens réévalués sortis dans l’exercice</div>
          <ul className="space-y-0.5">
            {n.sortis.map((s) => (
              <li key={s.immobilisationId}>
                <span className="font-semibold">{s.designation}</span> · sorti le {new Date(s.dateSortie).toLocaleDateString('fr-FR')} · écart transféré en réserve{' '}
                {montant(s.transfereReserve)} · provision reprise {montant(s.reprise861)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {n.tronque && (
        <div className="px-4 py-1.5 text-[11px] text-text-dim border-t border-border">Liste limitée aux 500 premières lignes de réévaluation · les totaux ne portent que sur elles.</div>
      )}
    </div>
  );
}
