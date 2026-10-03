import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { montant } from '../lib/montants';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';
import { montantSaisi } from '../lib/montant-saisi';
import { messageVersionHorsBornes } from '../lib/version-hors-bornes';
import { contestationPerimee, contestationPrecochee } from '../lib/contestation-precochee';
import type { ProvisionChangeOuvertureLigne, ProvisionsOuverture, StatutSoldeOuverture } from '../lib/types';

/**
 * PROVISION POUR PERTES DE CHANGE EXISTANT À L'OUVERTURE (ligne A5 du suivi,
 * décisions de Manasse du 2026-10-02).
 *
 * Un dossier repris porte déjà sa provision au 194, au 4991 ou au 4997, sans
 * qu'aucune réévaluation OmegaX ne l'ait passée · lue à zéro, la même perte
 * serait dotée une seconde fois. Le cabinet la DÉCLARE, compte par compte, au
 * début de l'exercice (fiche du compte 77, « existant au début de
 * l'exercice »), avec sa source. Le solde d'ouverture est PROPOSÉ, jamais
 * imposé · le 4991 et le 4997 portent aussi d'autres risques (un litige).
 * Non validé (bilan d'ouverture au brouillard, report reconstitué), il est dit
 * « provisoire, non validé ». Une version qu'une réévaluation a utilisée ne se
 * modifie plus (AUDCIF art. 22, 2°) · elle se corrige par une nouvelle version
 * au début d'un exercice postérieur, avec son motif.
 */

const NATURE_SOLDE: Record<StatutSoldeOuverture, string> = {
  VALIDE: '',
  IMPORTE: 'à-nouveau au brouillard (bilan d’ouverture importé), provisoire, non validé',
  CLOTURE_PRECEDENTE: 'provision à la clôture précédente, calculée par OmegaX · à-nouveau non validé',
  AUCUN: 'aucun à-nouveau',
};

export function ProvisionChangeOuverture({ exerciceId }: { exerciceId: string }) {
  const { peutEcrire } = useAuth();
  const [lecture, setLecture] = useState<ProvisionsOuverture | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisies, setSaisies] = useState<
    Record<string, { montant: string; source: string; motif: string; contestee: boolean; motifContestation: string }>
  >({});
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    try {
      const l = await api.get<ProvisionsOuverture>(`/devises/provision-ouverture?exerciceId=${exerciceId}`);
      setLecture(l);
      setSaisies(
        Object.fromEntries(
          l.comptes.map((x) => {
            const aCetteDate = x.versions.find((v) => v.dateReference === l.dateOuverture);
            return [
              x.compteProvision,
              {
                // Jamais un solde que la réserve dit incomplet, ni la provision
                // calculée par OmegaX · seul un solde comptable fiable et
                // expliqué se propose ; ailleurs le champ reste vide (quatrième passe).
                montant: aCetteDate
                  ? String(aCetteDate.montant)
                  : x.ouvertureFiable && !x.reserve
                    ? String(x.soldeOuverturePropose)
                    : '',
                source: aCetteDate?.source ?? '',
                motif: aCetteDate?.motif ?? '',
                // Précochée sur un figé ÉGAL au module du jour seulement (dixième relecture).
                contestee: contestationPrecochee(aCetteDate, x.provisionModuleOuverture),
                motifContestation: aCetteDate?.motifContestation ?? '',
              },
            ];
          }),
        ),
      );
      setErreur(null);
    } catch (e) {
      setLecture(null);
      setErreur(e instanceof ApiError ? e.message : 'Lecture des provisions d’ouverture impossible');
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceId]);

  const declarer = async (ligne: ProvisionChangeOuvertureLigne) => {
    if (!lecture) return;
    const s = saisies[ligne.compteProvision];
    const valeur = s ? montantSaisi(s.montant) : null;
    if (valeur === null) {
      setErreur(`Saisissez le montant déclaré au ${ligne.compteProvision} · zéro se tape, un champ vide n'est pas zéro.`);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/devises/provision-ouverture', {
        compteProvision: ligne.compteProvision,
        montant: valeur,
        dateReference: lecture.dateOuverture,
        source: s.source,
        ...(s.motif.trim() ? { motif: s.motif } : {}),
        // Déclaration EXPRESSE, distincte du motif de correction · seule elle
        // admet une version sous la provision du module (huitième relecture).
        ...(s.contestee ? { provisionModuleContestee: true, motifContestation: s.motifContestation } : {}),
      });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Déclaration impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (id: string, compteProvision: string) => {
    if (!window.confirm(`Retirer la provision d'ouverture déclarée au ${compteProvision} ?`)) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.delete(`/devises/provision-ouverture/${id}`);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Retrait impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const modifier = (compte: string, champ: 'montant' | 'source' | 'motif' | 'motifContestation', valeur: string) =>
    setSaisies((avant) => ({ ...avant, [compte]: { ...avant[compte], [champ]: valeur } }));
  const contester = (compte: string, contestee: boolean) =>
    setSaisies((avant) => ({ ...avant, [compte]: { ...avant[compte], contestee } }));

  return (
    <div className="border-t border-border" data-testid="provision-ouverture">
      <div className="px-3 py-1.5 bg-chrome text-[11px] font-bold text-text-dim flex items-center gap-1.5">
        Provision pour pertes de change à l’ouverture
        {lecture && <span className="font-normal">· au {lecture.dateOuverture}</span>}
        <Aide
          titre="Dossier repris"
          texte="La provision à ajuster est celle qui existe au début de l'exercice, pas seulement celle qu'OmegaX a passée. Déclarez, compte par compte, la part de la provision d'ouverture qui couvre des pertes de change, avec sa source. Le solde d'ouverture est proposé, jamais imposé : ces comptes portent aussi d'autres risques à court terme. Zéro est une réponse. Tant qu'un solde d'ouverture que les réévaluations d'OmegaX n'expliquent pas reste sans déclaration, la réévaluation se calcule mais ne se passe pas. Une déclaration qu'une réévaluation a utilisée ne se modifie plus : elle se corrige au début d'un exercice postérieur, avec son motif."
          source="AUDCIF Titre VII, fiches des comptes 19 et 77 ; art. 20 et 22"
        />
      </div>
      {erreur && <div className="mx-3 my-2 text-[11.5px] text-danger">{erreur}</div>}
      {lecture === null && !erreur && <div className="px-3 py-2 text-[11.5px] text-text-dim">Chargement…</div>}
      {lecture !== null && (
        <>
          <div className="grid grid-cols-[70px_150px_150px_120px_1fr_1fr_150px] min-w-[900px] gap-2 px-3 py-1 text-[11px] font-bold text-text-dim border-b border-border/40">
            <span>COMPTE</span>
            <span className="text-right">Solde d’ouverture</span>
            <span className="text-right">En vigueur</span>
            <span className="text-right">Montant déclaré</span>
            <span>Source</span>
            <span>Motif</span>
            <span />
          </div>
          {lecture.comptes.map((l) => {
            const s = saisies[l.compteProvision] ?? { montant: '', source: '', motif: '', contestee: false, motifContestation: '' };
            const aCetteDate = l.versions.find((v) => v.dateReference === lecture.dateOuverture);
            const anterieure = l.versions.some((v) => v.dateReference < lecture.dateOuverture);
            const nature = NATURE_SOLDE[l.statutSoldeOuverture];
            // Jugé par le serveur (version + réévaluations depuis son début), jamais recalculé ici.
            const depasse = l.depasseSoldeOuverture;
            return (
              <div key={l.compteProvision} data-compte={l.compteProvision} className="border-b border-border/40">
                <div className="grid grid-cols-[70px_150px_150px_120px_1fr_1fr_150px] min-w-[900px] gap-2 px-3 py-1 text-[11.5px] items-center">
                  <span>{l.compteProvision}</span>
                  <span className="text-right font-mono" title="À-nouveau de l'exercice · proposé, jamais imposé">
                    {montant(l.soldeOuverturePropose)}
                    {nature && <span className="block text-[10.5px] text-warning font-sans">{nature}</span>}
                  </span>
                  <span className="text-right">
                    {l.enVigueur ? (
                      <span className="font-mono">
                        {montant(l.enVigueur.montant)}
                        <span className="block text-[10.5px] text-text-dim font-sans">depuis le {l.enVigueur.dateReference}</span>
                        {l.enVigueur.provisionModuleContestee && (
                          <span className="block text-[10.5px] text-warning font-sans" title={l.enVigueur.motifContestation ?? ''}>
                            Provision OmegaX contestée ({montant(l.enVigueur.provisionModuleContesteeMontant)})
                          </span>
                        )}
                      </span>
                    ) : (
                      // En alerte là seulement où la réserve joue · ailleurs, rien n'est réclamé.
                      <span className={`text-[11px] ${l.reserve ? 'text-warning font-semibold' : 'text-text-dim'}`}>Non déclarée</span>
                    )}
                    {/* La provision du module à côté de la version (huitième relecture) · servie, jamais recalculée. */}
                    <span className="block text-[10.5px] text-text-dim" title="Provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente">
                      Module · {montant(l.provisionModuleOuverture)}
                    </span>
                  </span>
                  {peutEcrire && !aCetteDate?.utilisee ? (
                    <>
                      <input
                        aria-label={`Montant déclaré au ${l.compteProvision}`}
                        inputMode="decimal"
                        value={s.montant}
                        onChange={(e) => modifier(l.compteProvision, 'montant', e.target.value)}
                        className="border border-border rounded-[3px] px-1.5 py-0.5 text-right font-mono"
                      />
                      <input
                        aria-label={`Source de la provision au ${l.compteProvision}`}
                        placeholder="Pièce, liasse de l’exercice précédent…"
                        value={s.source}
                        onChange={(e) => modifier(l.compteProvision, 'source', e.target.value)}
                        className="border border-border rounded-[3px] px-1.5 py-0.5"
                      />
                      {/* Le motif de CORRECTION, là seulement où il est exigé · il n'ouvre jamais le
                          plancher, que seule la contestation expresse ouvre (huitième relecture). */}
                      {anterieure ? (
                        <input
                          aria-label={`Motif de la nouvelle version au ${l.compteProvision}`}
                          placeholder="Motif de la nouvelle version"
                          value={s.motif}
                          onChange={(e) => modifier(l.compteProvision, 'motif', e.target.value)}
                          className="border border-border rounded-[3px] px-1.5 py-0.5"
                        />
                      ) : (
                        <span />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-right font-mono">{aCetteDate ? montant(aCetteDate.montant) : '·'}</span>
                      <span className="truncate">{aCetteDate?.source ?? '·'}</span>
                      <span className="truncate">{aCetteDate?.motif ?? '·'}</span>
                    </>
                  )}
                  <span className="flex items-center gap-1.5 justify-end">
                    {aCetteDate?.utilisee && (
                      <span className="text-[11px] text-text-dim" title="Une réévaluation l'a utilisée · elle se corrige au début d'un exercice postérieur, avec son motif">
                        Utilisée
                      </span>
                    )}
                    {peutEcrire && !aCetteDate?.utilisee && (
                      <button
                        onClick={() => void declarer(l)}
                        disabled={envoi}
                        className="border border-border rounded-[3px] bg-surface px-2 py-0.5 text-[11px] font-semibold hover:bg-chrome disabled:opacity-50"
                      >
                        {aCetteDate ? 'Modifier' : 'Déclarer'}
                      </button>
                    )}
                    {peutEcrire && aCetteDate && !aCetteDate.utilisee && (
                      <button
                        onClick={() => void retirer(aCetteDate.id, l.compteProvision)}
                        disabled={envoi}
                        className="text-[11px] text-danger hover:underline disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    )}
                  </span>
                </div>
                {peutEcrire && !aCetteDate?.utilisee ? (
                  <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        aria-label={`La provision passée par OmegaX ne correspond pas à la provision de change réelle au ${l.compteProvision}`}
                        checked={s.contestee}
                        onChange={(e) => contester(l.compteProvision, e.target.checked)}
                      />
                      La provision passée par OmegaX ne correspond pas à la provision de change réelle
                    </label>
                    <Aide
                      titre="Contester la provision du module"
                      texte={`Cochez quand la provision que les réévaluations d'OmegaX ont passée jusqu'à la clôture précédente (${montant(l.provisionModuleOuverture)}) n'est pas la provision de change réelle : erreur du module, ou reprise ou dotation de change passée à la main hors du module. La version peut alors être déclarée sous ce montant, et la réévaluation ajuste à partir du seul montant déclaré ; si la provision du module était juste, la perte déjà provisionnée est dotée une seconde fois. La contestation vaut pour ce montant seulement : si une réévaluation le change ensuite, elle est à confirmer. Le motif de la contestation est exigé, et le motif de correction ne la remplace pas.`}
                      source="AUDCIF Titre VII, fiche du compte 19 ; Titre VIII ch. 22 § 2.3"
                    />
                    {contestationPerimee(aCetteDate, l.provisionModuleOuverture) && (
                      <span className="text-warning">
                        Contestée à {montant(aCetteDate!.provisionModuleContesteeMontant)}, provision OmegaX aujourd’hui{' '}
                        {montant(l.provisionModuleOuverture)} · à recocher pour confirmer
                      </span>
                    )}
                    {s.contestee && (
                      <input
                        aria-label={`Motif de la contestation au ${l.compteProvision}`}
                        placeholder="Motif de la contestation (exigé)"
                        value={s.motifContestation}
                        onChange={(e) => modifier(l.compteProvision, 'motifContestation', e.target.value)}
                        className="border border-border rounded-[3px] px-1.5 py-0.5 flex-1 min-w-[220px]"
                      />
                    )}
                  </div>
                ) : (
                  aCetteDate?.provisionModuleContestee && (
                    <div className="mx-3 mb-1 text-[11px] text-warning">
                      Provision passée par OmegaX contestée ({montant(aCetteDate.provisionModuleContesteeMontant)}) · {aCetteDate.motifContestation}
                    </div>
                  )
                )}
                {depasse && (
                  <div className="mx-3 mb-1 text-[11px] text-warning">
                    {messageVersionHorsBornes(l)}
                  </div>
                )}
                {l.versions.length > 1 && (
                  <ul className="mx-3 mb-1 text-[11px] text-text-dim list-disc pl-4">
                    {l.versions.map((v) => (
                      <li key={v.id}>
                        {v.dateReference} · {montant(v.montant)} · {v.source}
                        {v.motif ? ` · ${v.motif}` : ''}
                        {v.utilisee ? ' · utilisée' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
