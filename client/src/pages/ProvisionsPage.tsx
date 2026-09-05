import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { Exercice, TableauVariationProvisions } from '../lib/types';

/**
 * REGISTRE DES PROVISIONS POUR RISQUES ET CHARGES.
 *
 * L'écran est bâti autour de trois choses que personne ne tient à la main :
 *
 *  - LE TABLEAU DES MOUVEMENTS, dans l'ordre exact du ch. 18 § 5.3, celui que
 *    le CPCC demande à l'auditeur d'obtenir. Les utilisations et les reprises
 *    y restent SÉPARÉES : une provision utilisée était justifiée, une
 *    provision reprise ne l'était pas, et les additionner effacerait la seule
 *    information que la ligne portait sur la qualité de l'estimation ;
 *  - LE RAPPROCHEMENT avec le solde du compte. Un registre qui ne se compare
 *    à rien est une feuille de calcul de plus ;
 *  - LES PASSIFS ÉVENTUELS, listés à part et avec la condition qui manque.
 *    Ce sont les risques que le bilan ne porte pas et que l'annexe doit dire.
 *
 * La saisie n'est pas ici : elle se fait ligne par ligne, et le serveur porte
 * les trois refus (nature interdite, condition manquante, remboursement
 * compensé). L'écran les rend LISIBLES · il ne les redouble pas, un contrôle
 * recopié côté client finit toujours par diverger de celui qui compte.
 */

const LIBELLE_STATUT: Record<string, string> = {
  EN_EXAMEN: 'En examen',
  COMPTABILISEE: 'Comptabilisée',
  PASSIF_EVENTUEL: 'Passif éventuel',
  ECARTEE: 'Écartée',
  SOLDEE: 'Soldée',
};

const LIBELLE_NATURE: Record<string, string> = {
  LITIGE: 'Litiges',
  GARANTIE_CLIENTS: 'Garanties données aux clients',
  PERTES_MARCHES_ACHEVEMENT_FUTUR: 'Pertes sur marchés à achèvement futur',
  CHARGES_DONATIONS_LEGS: 'Charges sur donations et legs',
  PERTES_DE_CHANGE: 'Pertes de change',
  IMPOTS: 'Impôts',
  PENSIONS_ET_OBLIGATIONS_SIMILAIRES: 'Pensions et obligations similaires',
  RESTRUCTURATION: 'Restructurations',
  AMENDES_ET_PENALITES: 'Amendes et pénalités',
  DEMANTELEMENT_ET_REMISE_EN_ETAT: 'Démantèlement et remise en état',
  PROPRE_ASSUREUR: 'Propre assureur',
  DROITS_A_REDUCTION: 'Droits à réduction ou avantage en nature',
  CONTRAT_DEFICITAIRE: 'Contrat déficitaire',
  DEMENAGEMENT: 'Déménagement',
  DIVERS_RISQUES_ET_CHARGES: 'Divers risques et charges',
  PERTES_OPERATIONNELLES_FUTURES: 'Pertes opérationnelles futures (interdite)',
  GROSSES_REPARATIONS: 'Grosses réparations (interdite)',
};

const montant = (v: number) => Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function ProvisionsPage() {
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [exerciceId, setExerciceId] = useState('');
  const [tableau, setTableau] = useState<TableauVariationProvisions | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api.get<Exercice[]>('/exercices').then((liste) => {
      setExercices(liste);
      if (liste.length > 0) setExerciceId(liste[0].id);
    }, (e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    if (!exerciceId) return;
    setErreur(null);
    api
      .get<TableauVariationProvisions>(`/provisions/variation/${exerciceId}`)
      .then(setTableau, (e: Error) => setErreur(e instanceof ApiError ? e.message : e.message));
  }, [exerciceId]);

  const t = tableau;
  const ecartsSignales = (t?.rapprochement ?? []).filter((r) => Math.abs(r.ecart) >= 0.01);

  return (
    <div className="p-2">
      <EnteteImpression titre="Registre des provisions pour risques et charges" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">
          AUDCIF TITRE VIII CH. 18 · PROVISIONS, PASSIFS ET ACTIFS ÉVENTUELS
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[12px] font-bold leading-tight">Provisions pour risques et charges</h1>
          <select
            value={exerciceId}
            onChange={(e) => setExerciceId(e.target.value)}
            className="border border-bord rounded-[6px] px-2 py-[2px] text-[10.5px]"
          >
            {exercices.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {new Date(ex.dateDebut).toLocaleDateString('fr-FR')} au{' '}
                {new Date(ex.dateFin).toLocaleDateString('fr-FR')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erreur && (
        <div className="mb-1.5 max-w-[1240px] border border-rouge/40 bg-rouge/5 text-rouge rounded-[6px] px-2 py-1 text-[10.5px]">
          {erreur}
        </div>
      )}

      {t && (
        <div className="max-w-[1240px] space-y-2">
          {/*
            LE RAPPROCHEMENT PASSE EN PREMIER, et en rouge. C'est le seul
            chiffre de cet écran qui dit qu'une écriture manque : un écart
            entre le registre et le solde du compte ne déséquilibre rien, ne
            fait tomber aucun contrôle, et ne se voit nulle part ailleurs.
          */}
          {ecartsSignales.length > 0 && (
            <div className="border border-rouge/40 bg-rouge/5 rounded-[6px] px-2 py-1.5">
              <div className="text-[10.5px] font-semibold text-rouge mb-1">
                {ecartsSignales.length} compte(s) où le registre et la balance ne disent pas la même chose
              </div>
              <table className="w-full text-[10.5px]">
                <thead className="text-text-dim">
                  <tr>
                    <th className="text-left font-normal">Compte</th>
                    <th className="text-right font-normal">Registre</th>
                    <th className="text-right font-normal">Solde comptable</th>
                    <th className="text-right font-normal">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {ecartsSignales.map((r) => (
                    <tr key={r.numero}>
                      <td className="font-mono">{r.numero}</td>
                      <td className="text-right tabular-nums">{montant(r.montantRegistre)}</td>
                      <td className="text-right tabular-nums">{montant(r.soldeComptable)}</td>
                      <td className="text-right tabular-nums font-semibold text-rouge">{montant(r.ecart)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[9.5px] text-text-dim mt-1 leading-snug">
                Une dotation passée sans être documentée, ou documentée sans être passée. Ni l'une ni l'autre ne
                déséquilibre la balance.
              </div>
            </div>
          )}

          <div className="border border-bord rounded-[6px] overflow-x-auto">
            <table className="w-full text-[10.5px] whitespace-nowrap">
              <thead className="bg-fond-2 text-text-dim">
                <tr>
                  <th className="text-left font-normal px-1.5 py-1">Objet</th>
                  <th className="text-left font-normal px-1.5">Nature</th>
                  <th className="text-left font-normal px-1.5">Compte</th>
                  <th className="text-left font-normal px-1.5">Statut</th>
                  <th className="text-right font-normal px-1.5">Ouverture</th>
                  <th className="text-right font-normal px-1.5">Dotations</th>
                  <th className="text-right font-normal px-1.5">Utilisations</th>
                  <th className="text-right font-normal px-1.5">Reprises</th>
                  <th className="text-right font-normal px-1.5">Actualisation</th>
                  <th className="text-right font-normal px-1.5">Clôture</th>
                  <th className="text-left font-normal px-1.5">Échéance</th>
                </tr>
              </thead>
              <tbody>
                {t.detail.map((l) => (
                  <tr key={l.id} className="border-t border-bord/50">
                    <td className="px-1.5 py-[3px] max-w-[240px] truncate" title={l.objet}>
                      {l.objet}
                    </td>
                    <td className="px-1.5">{LIBELLE_NATURE[l.nature] ?? l.nature}</td>
                    <td className="px-1.5 font-mono">{l.compte?.numero ?? '·'}</td>
                    <td className="px-1.5">{LIBELLE_STATUT[l.statut] ?? l.statut}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.montantOuverture)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.dotationsExercice)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.montantsUtilises)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.reprisesNonUtilisees)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.effetActualisation)}</td>
                    <td className="px-1.5 text-right tabular-nums font-semibold">{montant(l.montantCloture)}</td>
                    <td className="px-1.5">{jour(l.echeanceAttendue)}</td>
                  </tr>
                ))}
                {t.detail.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-1.5 py-2 text-text-dim">
                      Aucune provision inscrite au registre pour cet exercice.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-fond-2 font-semibold">
                <tr>
                  <td className="px-1.5 py-1" colSpan={4}>
                    Total
                  </td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.montantOuverture)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.dotationsExercice)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.montantsUtilises)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.reprisesNonUtilisees)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.effetActualisation)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.montantCloture)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/*
            LES PASSIFS ÉVENTUELS SONT LISTÉS À PART, avec la condition qui
            manque. Ils ne sont dans aucun compte et n'apparaissent sur aucun
            total : sans cette liste, un risque examiné puis écarté ne se
            verrait nulle part, et l'annexe resterait muette · le texte veut
            exactement l'inverse.
          */}
          {t.passifsEventuels.length > 0 && (
            <div className="border border-bord rounded-[6px] px-2 py-1.5">
              <div className="text-[10.5px] font-semibold mb-1">
                Passifs éventuels · à mentionner aux Notes annexes, rien au bilan
              </div>
              <ul className="text-[10.5px] space-y-[3px]">
                {t.passifsEventuels.map((l) => (
                  <li key={l.id}>
                    <span className="font-medium">{l.objet}</span>
                    <span className="text-text-dim"> · condition non réunie : {l.conditionsManquantes.join(' ; ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-bord rounded-[6px] px-2 py-1.5">
            <div className="text-[10.5px] font-semibold mb-1">
              Natures admises dans le plan de ce dossier
            </div>
            <div className="text-[9.5px] text-text-dim mb-1 leading-snug">
              Les deux référentiels emploient les mêmes numéros pour des natures différentes · au 192, le SYSCOHADA
              loge les garanties données aux clients, le SYCEBNL les charges sur donations et legs.
            </div>
            <ul className="text-[10.5px] grid grid-cols-2 gap-x-4">
              {t.natures.map((n) => (
                <li key={n.nature}>
                  <span className="font-mono">{n.compte}</span> · {n.intitule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
