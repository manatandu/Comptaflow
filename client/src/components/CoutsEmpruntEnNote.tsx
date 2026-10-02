import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { montant } from '../lib/montants';
import {
  etatEncadreCoutsEmprunt,
  justificationsPeriodeCourte,
  type CoutsEmpruntDeLExercice,
} from '../lib/couts-emprunt-en-note';
import { Aide } from './chrome/Aide';

/**
 * L'ENCADRÉ DES COÛTS D'EMPRUNT INCORPORÉS, à côté des rubriques libres de la
 * note « Informations obligatoires » (décision D1, `lib/couts-emprunt-en-note.ts`).
 *
 * LECTURE SEULE · aucun appel d'écriture, aucune valeur passée à la saisie
 * de la note · le cabinet rédige la mention, l'écran lui donne les chiffres
 * qu'il doit fournir (AUDCIF Titre VIII ch. 7, section 3) et les
 * justifications qu'il a écrites à l'incorporation (§ 1.2).
 */
export function CoutsEmpruntEnNote({
  exerciceId,
  referentiel,
}: {
  exerciceId: string | null;
  referentiel: 'SYCEBNL' | 'SYSCOHADA';
}) {
  const [lu, setLu] = useState<CoutsEmpruntDeLExercice | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setLu(null);
    setErreur(null);
    if (!exerciceId) return;
    let actif = true;
    api
      .get<CoutsEmpruntDeLExercice>(`/immobilisations/couts-emprunt-incorpores?exerciceId=${encodeURIComponent(exerciceId)}`)
      .then(
        (r) => actif && setLu(r),
        (e) => actif && setErreur(e instanceof ApiError ? e.message : 'Lecture impossible'),
      );
    return () => {
      actif = false;
    };
  }, [exerciceId]);

  const etat = etatEncadreCoutsEmprunt(lu, erreur);
  if (etat.type === 'absent' || etat.type === 'chargement') return null;
  if (etat.type === 'erreur') {
    return (
      <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-4 text-[11.5px]">
        Coûts d'emprunt incorporés · lecture impossible : {etat.motif}
      </div>
    );
  }
  const justifications = justificationsPeriodeCourte(etat.lu);
  return (
    <div className="border border-border bg-surface mb-4" data-encadre="couts-emprunt">
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-chrome text-[11.5px] font-bold">
        Coûts d'emprunt incorporés de l'exercice
        <Aide
          titre="Coûts d'emprunt incorporés"
          texte={
            "Les notes annexes doivent fournir le montant des coûts d'emprunt incorporés dans le coût d'actifs au " +
            "cours de l'exercice et le taux de capitalisation utilisé. Une période de préparation inférieure à douze " +
            "mois se justifie par une mention dans les notes annexes. Aucune rubrique officielle ne les porte · ces " +
            'chiffres sont montrés pour la rédaction des rubriques des règles et méthodes ou des informations ' +
            'complémentaires, et ne sont jamais écrits dans la note à la place du cabinet.' +
            // Chaque référentiel lit SA source · le renvoi du SYCEBNL ne se
            // montre pas à un dossier SYSCOHADA (CLAUDE.md § 6).
            (referentiel === 'SYCEBNL' ? " La fiche des comptes 20 à 29 du SYCEBNL renvoie à ce chapitre de l'AUDCIF." : '')
          }
          source={
            referentiel === 'SYCEBNL'
              ? 'SYCEBNL Partie 2 ch. 3, comptes 20 à 29 ; AUDCIF Titre VIII ch. 7, § 1.2 et section 3'
              : 'AUDCIF Titre VIII ch. 7, § 1.2 et section 3'
          }
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr>
              <th className="text-left px-4 py-1.5">Bien</th>
              <th className="text-left px-2 py-1.5">Emprunt</th>
              <th className="text-left px-2 py-1.5">Période</th>
              <th className="text-right px-2 py-1.5">Taux</th>
              <th className="text-right px-4 py-1.5">Montant incorporé</th>
            </tr>
          </thead>
          <tbody>
            {etat.lu.lignes.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-1">{l.immobilisation.designation}</td>
                <td className="px-2 py-1">{l.nature === 'GENERAL' ? 'Emprunts généraux' : 'Emprunt spécifique'}</td>
                <td className="px-2 py-1">
                  {new Date(l.dateDebut).toLocaleDateString('fr-FR')} au {new Date(l.dateFin).toLocaleDateString('fr-FR')}
                </td>
                {/* Un taux n'est pas un montant · il garde sa précision (§ 9 ter). */}
                <td className="px-2 py-1 text-right">{l.tauxPourcent.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %</td>
                <td className="px-4 py-1 text-right">{montant(l.montant)}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-bold">
              <td className="px-4 py-1" colSpan={4}>
                Total de l'exercice
              </td>
              <td className="px-4 py-1 text-right">{montant(etat.lu.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {etat.lu.tronque && (
        <div className="px-4 py-1.5 text-[11px] text-text-dim border-t border-border">
          Liste limitée aux 500 premières incorporations · le total porte sur toutes.
        </div>
      )}
      {justifications.length > 0 && (
        <div className="px-4 py-2 border-t border-border text-[11.5px]">
          <div className="font-semibold mb-1">Préparation de moins de douze mois · justification</div>
          <ul className="space-y-0.5">
            {justifications.map((j) => (
              <li key={`${j.designation}::${j.justification}`}>
                <span className="font-semibold">{j.designation}</span> · {j.justification}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
