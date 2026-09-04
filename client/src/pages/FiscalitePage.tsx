import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { Aide } from '../components/chrome/Aide';
import { mentionCalendrierPaiement } from '../lib/calendrier-paiement-fiscal';
import type {
  CatalogueRetraitements,
  DefinitionRetraitementFiscal,
  NatureActiviteFiscale,
  ResultatFiscal,
  SensRetraitementFiscal,
} from '../lib/types';

/**
 * RÉSULTAT FISCAL ET IMPÔT SUR LES BÉNÉFICES · fenêtre SYSCOHADA.
 *
 * L'écran est un tableau de passage, dans l'ordre où le fisc le lit :
 * résultat comptable, réintégrations, déductions, déficits antérieurs,
 * résultat fiscal, impôt, acomptes, solde. Chaque ligne saisie vient d'un
 * catalogue qui cite son article ; une ligne libre exige son fondement.
 *
 * Ce que l'écran ne fait pas, et le dit : il ne produit pas le formulaire
 * officiel de déclaration, dont le modèle n'est pas en main. Il produit le
 * calcul et sa justification, qui se recopient dessus.
 */

const nombre = (n: number | null | undefined) =>
  n === null || n === undefined ? '·' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LIBELLE_REGIME: Record<ResultatFiscal['regime'], string> = {
  IMPOT_SOCIETES: 'Impôt sur les sociétés',
  IRPP_MICRO_ENTREPRISE: 'Impôt sur le revenu · micro-entreprise',
  IRPP_PETITE_ENTREPRISE: 'Impôt sur le revenu · petite entreprise',
  IRPP_REGIME_REEL: 'Impôt sur le revenu · régime réel',
};

export function FiscalitePage() {
  const { utilisateur } = useAuth();
  const { exerciceCourant, exercices } = useExercice();
  const [exerciceId, setExerciceId] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatFiscal | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueRetraitements | null>(null);
  /**
   * PROPOSITIONS · ce que les comptes qualifiés par le cabinet appellent
   * comme retraitement sur cet exercice. Le logiciel ne les inscrit PAS · il
   * rappelle ce que le comptable a décidé une fois, à lui de reprendre.
   */
  const [propositions, setPropositions] = useState<
    Array<{
      compteId: string;
      numero: string;
      intitule: string;
      code: string;
      sens: string;
      libelle: string;
      source: string;
      mouvement: number;
      plafondEnonce: string | null;
      montantAdmis: number | null;
      montant: number;
    }>
  >([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Saisie d'un retraitement
  const [code, setCode] = useState<string>('');
  const [sensLibre, setSensLibre] = useState<SensRetraitementFiscal>('REINTEGRATION');
  const [libelleLibre, setLibelleLibre] = useState('');
  const [montant, setMontant] = useState('');
  const [chargeEngagee, setChargeEngagee] = useState('');
  const [commentaire, setCommentaire] = useState('');

  const lectureSeule = utilisateur?.role === 'LECTURE_SEULE';
  const devise = resultat?.devise ?? 'CDF';

  useEffect(() => {
    if (!exerciceId && exerciceCourant) setExerciceId(exerciceCourant.id);
  }, [exerciceCourant, exerciceId]);

  useEffect(() => {
    api.get<CatalogueRetraitements>('/fiscalite/catalogue').then(setCatalogue, () => undefined);
  }, []);

  const charger = (id: string) => {
    setErreur(null);
    api
      .get<ResultatFiscal>(`/fiscalite/resultat-fiscal?exerciceId=${encodeURIComponent(id)}`)
      .then(setResultat, (e: Error) => setErreur(e.message));
    chargerPropositions(id);
  };

  useEffect(() => {
    if (exerciceId) charger(exerciceId);
  }, [exerciceId]);

  const definition: DefinitionRetraitementFiscal | undefined = catalogue?.retraitements.find((r) => r.code === code);
  const plafond = definition?.plafond && resultat ? resultat.plafonds.find((p) => p.code === code) : undefined;

  // Excédent à réintégrer, calculé depuis la charge engagée quand la loi
  // pose un plafond · le comptable saisit ce qu'il a dépensé, pas ce qu'il
  // doit réintégrer, et l'erreur de virgule (2 ‰ lu 2 %) disparaît.
  const excedentCalcule = (() => {
    if (!plafond || !chargeEngagee) return null;
    const charge = Number(chargeEngagee.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(charge) || charge <= 0) return null;
    const admis = plafond.assiette === 'CHARGE' ? plafond.part * charge : (plafond.montantAdmis ?? 0);
    return Math.max(0, Math.round((charge - admis) * 100) / 100);
  })();

  const ajouter = async () => {
    if (!exerciceId || !definition) return;
    const valeur = excedentCalcule ?? Number(montant.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant doit être un nombre positif.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(
        await api.post<ResultatFiscal>(`/fiscalite/exercices/${exerciceId}/retraitements`, {
          code,
          montant: valeur,
          ...(code === 'AUTRE' ? { sens: sensLibre, libelle: libelleLibre.trim() } : {}),
          commentaire: commentaire.trim() || undefined,
        }),
      );
      setMontant('');
      setChargeEngagee('');
      setCommentaire('');
      setLibelleLibre('');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const chargerPropositions = (id: string) => {
    api
      .get<{ propositions: typeof propositions }>(`/fiscalite/exercices/${encodeURIComponent(id)}/propositions-retraitements`)
      .then((r) => setPropositions(r.propositions), () => setPropositions([]));
  };

  /**
   * REPRENDRE une proposition · elle devient un retraitement ordinaire, avec
   * son compte d'origine en commentaire. Modifiable et supprimable comme
   * tous les autres · rien n'est verrouillé du fait de venir d'un compte.
   */
  const reprendre = async (p: (typeof propositions)[number]) => {
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(
        await api.post<ResultatFiscal>(`/fiscalite/exercices/${exerciceId}/retraitements`, {
          code: p.code,
          montant: p.montant,
          commentaire: `Compte ${p.numero} · ${p.intitule}`,
        }),
      );
      setPropositions((prev) => prev.filter((x) => x.compteId !== p.compteId));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Reprise impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    setEnvoi(true);
    try {
      setResultat(await api.delete<ResultatFiscal>(`/fiscalite/retraitements/${id}`));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Suppression impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const modifierDossier = async (dto: {
    acomptesVerses?: number;
    supplementsAdministration?: number;
    deficitAnterieurSaisi?: number | null;
    natureActivite?: NatureActiviteFiscale | null;
  }) => {
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(await api.patch<ResultatFiscal>(`/fiscalite/exercices/${exerciceId}/dossier`, dto));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const lireNombre = (v: string) => {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const jour = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  const physique = resultat?.regime !== 'IMPOT_SOCIETES';
  /**
   * Libellé et calendrier légal des versements, indexés sur le régime · voir
   * `client/src/lib/calendrier-paiement-fiscal.ts` pour les textes. Le repli
   * sur l'IS ne sert que le rendu d'avant chargement, quand `resultat` est
   * encore nul et qu'aucune ligne n'est affichée.
   */
  const calendrier = mentionCalendrierPaiement(resultat?.regime ?? 'IMPOT_SOCIETES');

  return (
    <div className="p-2">
      <EnteteImpression titre="Résultat fiscal et impôt sur les bénéfices" />
      <div className="ecran-seul mb-1.5 max-w-[1100px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">FISCALITÉ</div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            Résultat fiscal et impôt sur les bénéfices <Aide sujet="resultatFiscal" />
          </h1>
          <label className="text-[10.5px] flex items-center gap-2">
            Exercice
            <select
              value={exerciceId ?? ''}
              onChange={(e) => setExerciceId(e.target.value)}
              className="border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] focus:outline-none focus:border-sel"
            >
              {exercices.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {jour(ex.dateDebut)} au {jour(ex.dateFin)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="text-[10px] text-text-dim mt-0.5">
          Loi n° 23/053 du 30 novembre 2023, applicable depuis le 1<sup>er</sup> janvier 2026. Paramètres vérifiés le{' '}
          {resultat ? jour(resultat.derniereVerification) : '·'}. Cet écran produit le calcul et sa justification, pas
          le formulaire officiel de déclaration.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1100px]">
          {erreur}
        </div>
      )}

      {resultat && (
        <div className="max-w-[1100px] space-y-3">
          {/* RÉGIME ET OBSERVATIONS */}
          <section className="border border-border rounded-[8px] p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] font-mono text-text-dim leading-none">RÉGIME</div>
                <div className="text-[12px] font-bold">{LIBELLE_REGIME[resultat.regime]}</div>
              </div>
              {resultat.regime === 'IRPP_PETITE_ENTREPRISE' && !lectureSeule && (
                <label className="text-[10.5px] flex items-center gap-2">
                  Activité principale
                  <select
                    value={resultat.natureActivite ?? ''}
                    disabled={envoi}
                    onChange={(e) =>
                      modifierDossier({ natureActivite: (e.target.value || null) as NatureActiviteFiscale | null })
                    }
                    className="border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px]"
                  >
                    <option value="">À renseigner</option>
                    <option value="VENTE">Vente · 1 % du chiffre d’affaires</option>
                    <option value="PRESTATIONS">Prestations de services · 2 %</option>
                  </select>
                </label>
              )}
            </div>
            {resultat.observations.map((o, i) => (
              <p key={i} className="text-[10.5px] text-text-dim leading-[1.55] mt-1.5">
                {o}
              </p>
            ))}
          </section>

          {/* TABLEAU DE PASSAGE */}
          <section className="border border-border rounded-[8px] overflow-hidden">
            <table className="w-full text-[10.5px]">
              <tbody>
                <Ligne libelle="Résultat comptable de l’exercice" montant={resultat.resultatComptable} devise={devise}
                  note={resultat.sourceResultat === 'COMPTE_13' ? 'lu au compte 13, exercice clôturé' : 'lu dans les classes 6, 7 et 8'} />
                <Ligne libelle="Réintégrations" montant={resultat.totalReintegrations} devise={devise} signe="+" />
                <Ligne libelle="Déductions" montant={resultat.totalDeductions} devise={devise} signe="−" />
                <Ligne libelle="Résultat fiscal avant report" montant={resultat.resultatFiscalBrut} devise={devise} gras />
                <Ligne
                  libelle={`Déficits antérieurs imputés${resultat.deficitAnterieur.saisi ? ' (montant saisi)' : ''}`}
                  montant={resultat.deficitImpute}
                  devise={devise}
                  signe="−"
                  note={
                    resultat.deficitAnterieur.montant > resultat.deficitImpute
                      ? `reportable : ${nombre(resultat.deficitAnterieur.montant)} · le surplus attend un bénéfice, dans la limite de trois exercices (art. 51)`
                      : 'art. 51 · trois exercices'
                  }
                />
                <Ligne libelle="RÉSULTAT FISCAL" montant={resultat.resultatFiscal} devise={devise} gras total />
                <Ligne libelle="Chiffre d’affaires de l’exercice" montant={resultat.chiffreAffaires} devise={devise} note="comptes 701 à 707 · assiette des plafonds et de l’impôt minimum" />
              </tbody>
            </table>
          </section>

          {/* PROPOSITIONS · tirées des comptes que le cabinet a qualifiés
              lui-même. Le logiciel ne les inscrit pas : la qualification
              fiscale d'une charge ne se lit pas dans son numéro de compte, et
              un logiciel qui trancherait seul se tromperait en silence. Il
              rappelle ce que le comptable a décidé une fois. */}
          {propositions.length > 0 && (
            <section className="border border-warning/40 bg-warning-soft rounded-[8px] p-3">
              <div className="text-[10px] font-mono text-text-dim leading-none">PROPOSITIONS À REPRENDRE</div>
              <p className="text-[10.5px] text-text-dim mt-1 mb-2 leading-[1.5]">
                Ces comptes portent un traitement fiscal déclaré dans le plan comptable. Rien n'est inscrit tant que
                vous ne reprenez pas la ligne · vérifiez le montant avant.
              </p>
              <table className="w-full text-[10.5px]">
                <tbody>
                  {propositions.map((p) => (
                    <tr key={p.compteId} className="border-t border-border/60">
                      <td className="py-1 font-mono whitespace-nowrap pr-2">{p.numero}</td>
                      <td className="py-1 pr-2">
                        {p.libelle}
                        <span className="text-text-dim"> · {p.source}</span>
                        {p.plafondEnonce && (
                          <span className="block text-[10px] text-text-dim">
                            Mouvement {p.mouvement.toLocaleString('fr-FR')} · admis{' '}
                            {(p.montantAdmis ?? 0).toLocaleString('fr-FR')} ({p.plafondEnonce})
                          </span>
                        )}
                      </td>
                      <td className="py-1 font-mono text-right whitespace-nowrap pr-2">
                        {p.montant.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => reprendre(p)}
                          disabled={envoi}
                          className="border border-border-dark bg-chrome hover:bg-chrome-alt px-2 py-0.5 text-[10px] disabled:opacity-40"
                        >
                          Reprendre
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* RETRAITEMENTS */}
          <section className="border border-border rounded-[8px] p-3">
            <div className="text-[10px] font-mono text-text-dim leading-none">RETRAITEMENTS</div>
            {resultat.retraitements.length === 0 ? (
              <p className="text-[10.5px] text-text-dim mt-1.5">
                Aucun retraitement saisi. Un résultat fiscal égal au résultat comptable est rare : passez le catalogue
                en revue, ligne par ligne.
              </p>
            ) : (
              <table className="w-full text-[10.5px] mt-1.5">
                <thead>
                  <tr className="text-left text-text-dim">
                    <th className="font-medium py-1">Sens</th>
                    <th className="font-medium py-1">Libellé</th>
                    <th className="font-medium py-1 text-right">Montant</th>
                    <th className="font-medium py-1 hidden sm:table-cell">Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {resultat.retraitements.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="py-1 pr-2 font-mono">{r.sens === 'REINTEGRATION' ? '+' : '−'}</td>
                      <td className="py-1 pr-2">
                        {r.libelle}
                        {r.commentaire && <div className="text-text-dim mt-0.5">{r.commentaire}</div>}
                      </td>
                      <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">{nombre(r.montant)}</td>
                      <td className="py-1 pr-2 text-text-dim hidden sm:table-cell">{r.source ?? '·'}</td>
                      <td className="py-1 text-right">
                        {!lectureSeule && (
                          <button
                            type="button"
                            disabled={envoi}
                            onClick={() => supprimer(r.id)}
                            className="text-danger hover:underline"
                          >
                            Retirer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!lectureSeule && catalogue && (
              <div className="mt-3 border-t border-border pt-3 space-y-2">
                <label className="block text-[10.5px]">
                  Ajouter un retraitement
                  <select
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setMontant('');
                      setChargeEngagee('');
                    }}
                    className="mt-1 block w-full border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] focus:outline-none focus:border-sel"
                  >
                    <option value="">Choisir dans le catalogue</option>
                    <optgroup label="Réintégrations">
                      {catalogue.retraitements
                        .filter((r) => r.sens === 'REINTEGRATION' && r.code !== 'AUTRE')
                        .map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.libelle}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Déductions">
                      {catalogue.retraitements
                        .filter((r) => r.sens === 'DEDUCTION')
                        .map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.libelle}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Ligne libre">
                      <option value="AUTRE">Autre retraitement</option>
                    </optgroup>
                  </select>
                </label>

                {definition && (
                  <div className="text-[10px] text-text-dim leading-[1.55] border border-border rounded-[7px] p-2.5">
                    <div>{definition.aide}</div>
                    <div className="mt-1 font-medium">{definition.source}</div>
                  </div>
                )}

                {code === 'AUTRE' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block text-[10.5px]">
                      Sens
                      <select
                        value={sensLibre}
                        onChange={(e) => setSensLibre(e.target.value as SensRetraitementFiscal)}
                        className="mt-1 block w-full border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px]"
                      >
                        <option value="REINTEGRATION">Réintégration (+)</option>
                        <option value="DEDUCTION">Déduction (−)</option>
                      </select>
                    </label>
                    <label className="block text-[10.5px]">
                      Libellé
                      <input
                        value={libelleLibre}
                        onChange={(e) => setLibelleLibre(e.target.value)}
                        maxLength={200}
                        className="mt-1 block w-full border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px]"
                      />
                    </label>
                  </div>
                )}

                {definition && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {plafond ? (
                      <label className="block text-[10.5px]">
                        Charge engagée sur l’exercice
                        <input
                          value={chargeEngagee}
                          onChange={(e) => setChargeEngagee(e.target.value)}
                          inputMode="decimal"
                          className="mt-1 block w-full border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] font-mono"
                        />
                        <span className="block text-[10px] text-text-dim mt-1 leading-[1.5]">
                          Plafond : {plafond.enonce}
                          {plafond.montantAdmis !== null ? ` · soit ${nombre(plafond.montantAdmis)} ${devise} admis` : ''}.
                          {excedentCalcule !== null
                            ? ` Excédent à réintégrer : ${nombre(excedentCalcule)} ${devise}.`
                            : ''}
                        </span>
                      </label>
                    ) : (
                      <label className="block text-[10.5px]">
                        Montant
                        <input
                          value={montant}
                          onChange={(e) => setMontant(e.target.value)}
                          inputMode="decimal"
                          className="mt-1 block w-full border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] font-mono"
                        />
                      </label>
                    )}
                    <label className="block text-[10.5px]">
                      Justification{code === 'AUTRE' ? ' (obligatoire)' : ''}
                      <input
                        value={commentaire}
                        onChange={(e) => setCommentaire(e.target.value)}
                        maxLength={1000}
                        placeholder="Ce qui sera opposé au vérificateur"
                        className="mt-1 block w-full border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px]"
                      />
                    </label>
                  </div>
                )}

                {definition && (
                  <button
                    type="button"
                    onClick={ajouter}
                    disabled={envoi || (plafond ? excedentCalcule === null || excedentCalcule === 0 : !montant)}
                    className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    Enregistrer le retraitement
                  </button>
                )}
              </div>
            )}
          </section>

          {/* DÉFICIT ANTÉRIEUR SAISI */}
          {!lectureSeule && (
            <section className="border border-border rounded-[8px] p-3">
              <div className="text-[10px] font-mono text-text-dim leading-none">DÉFICITS ANTÉRIEURS</div>
              <p className="text-[10.5px] text-text-dim mt-1.5 leading-[1.55]">
                OmegaX calcule les déficits reportables depuis les trois exercices précédents tenus ici
                {resultat.deficitAnterieur.detail.length > 0
                  ? ` (${resultat.deficitAnterieur.detail.map((d) => `${nombre(d.montant)} au ${jour(d.dateFin)}`).join(', ')})`
                  : ''}
                . Un dossier repris à un confrère porte un report que cette comptabilité ne connaît pas : saisissez-le
                ici, il prime sur le calcul. Videz le champ pour revenir au calcul.
              </p>
              <input
                key={`deficit-${resultat.exerciceId}-${resultat.deficitAnterieur.saisi}`}
                defaultValue={resultat.deficitAnterieur.saisi ? String(resultat.deficitAnterieur.montant) : ''}
                inputMode="decimal"
                disabled={envoi}
                placeholder="Calculé automatiquement"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v === '' && resultat.deficitAnterieur.saisi) modifierDossier({ deficitAnterieurSaisi: null });
                  else if (v !== '') {
                    const n = lireNombre(v);
                    if (n !== null && n >= 0 && (!resultat.deficitAnterieur.saisi || n !== resultat.deficitAnterieur.montant))
                      modifierDossier({ deficitAnterieurSaisi: n });
                  }
                }}
                className="mt-1.5 w-56 border border-border rounded-[7px] bg-bg px-2 py-1 text-[11px] font-mono"
              />
            </section>
          )}

          {/* IMPÔT */}
          <section className="border border-border rounded-[8px] overflow-hidden">
            <div className="px-3 pt-3">
              <div className="text-[10px] font-mono text-text-dim leading-none">IMPÔT</div>
              <div className="text-[10.5px] mt-1">{resultat.baseImpot}</div>
              <p className="text-[10.5px] text-text-dim mt-1 leading-[1.55]">{resultat.explication}</p>
            </div>
            <table className="w-full text-[10.5px] mt-2">
              <tbody>
                {resultat.impotTheorique !== null && (
                  <Ligne libelle={physique ? 'Impôt sur le chiffre d’affaires' : 'Impôt sur le bénéfice (30 %)'} montant={resultat.impotTheorique} devise={devise} />
                )}
                {resultat.impotMinimum !== null && (
                  <Ligne libelle="Impôt minimum (1 % du chiffre d’affaires)" montant={resultat.impotMinimum} devise={devise}
                    note={resultat.minimumApplique ? 'retenu · supérieur à l’impôt sur le bénéfice' : undefined} />
                )}
                <Ligne libelle="IMPÔT DÛ" montant={resultat.impotDu} devise={devise} gras total />
                {/* LE CALENDRIER SUIT LE RÉGIME · l'art. 57 bis ne vise que
                    l'alinéa 2 de l'art. 57, donc l'IS et l'IRPP au régime réel.
                    Cette mention était écrite en dur ici, hors de toute
                    condition, et annonçait trois acomptes de juillet, septembre
                    et novembre à une petite entreprise qui n'en doit aucun :
                    elle paie en deux quotités (art. 57, al. 3 et 57 quater),
                    servies ci-dessous. Le libellé et l'article viennent
                    désormais de `mentionCalendrierPaiement`, qui est testée
                    régime par régime. */}
                <tr className="border-t border-border">
                  <td className="px-3 py-1.5">
                    {calendrier.libelleVersements}
                    {calendrier.calendrier && (
                      <span className="block text-[10px] text-text-dim">{calendrier.calendrier}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">
                    {lectureSeule ? (
                      nombre(resultat.acomptesVerses)
                    ) : (
                      <input
                        key={`acomptes-${resultat.exerciceId}-${resultat.acomptesVerses}`}
                        defaultValue={String(resultat.acomptesVerses)}
                        inputMode="decimal"
                        disabled={envoi}
                        onBlur={(e) => {
                          const n = lireNombre(e.target.value);
                          if (n !== null && n >= 0 && n !== resultat.acomptesVerses) modifierDossier({ acomptesVerses: n });
                        }}
                        className="w-40 text-right border border-border rounded-[7px] bg-bg px-2 py-0.5 text-[11px] font-mono"
                      />
                    )}
                  </td>
                </tr>
                <Ligne libelle="SOLDE À PAYER" montant={resultat.soldeAPayer} devise={devise} gras total
                  note={resultat.soldeAPayer !== null && resultat.soldeAPayer < 0 ? 'excédent de versement · crédit d’impôt' : undefined} />
              </tbody>
            </table>
            {resultat.acomptesProchainExercice.length > 0 && (
              <div className="px-3 pb-3 pt-2 text-[10px] text-text-dim leading-[1.55]">
                {/* La base des acomptes n'est PAS le seul impôt déclaré · art. 57 bis
                    LPF, tel que modifié par la loi de finances n° 25/060, y ajoute les
                    suppléments établis par l'Administration, contestés ou non. Ils
                    naissent d'un avis de redressement et ne se lisent dans aucun
                    compte : d'où cette saisie, sans laquelle les trois acomptes
                    proposés seraient insuffisants pour tout dossier redressé. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span>Suppléments établis par l’Administration, à ajouter à la base des acomptes :</span>
                  {lectureSeule ? (
                    <span className="font-mono">{nombre(resultat.supplementsAdministration)}</span>
                  ) : (
                    <input
                      key={`supplements-${resultat.exerciceId}-${resultat.supplementsAdministration}`}
                      defaultValue={String(resultat.supplementsAdministration)}
                      inputMode="decimal"
                      disabled={envoi}
                      onBlur={(e) => {
                        const n = lireNombre(e.target.value);
                        if (n !== null && n >= 0 && n !== resultat.supplementsAdministration)
                          modifierDossier({ supplementsAdministration: n });
                      }}
                      className="w-32 text-right border border-border rounded-[7px] bg-bg px-2 py-0.5 text-[10.5px] font-mono"
                    />
                  )}
                  <span className="font-mono">{devise}</span>
                </div>
                <div className="mt-1">
                  Acomptes du prochain exercice, assis sur une base de {nombre(resultat.baseAcomptes)} {devise} :{' '}
                  {resultat.acomptesProchainExercice
                    .map((a) => `${nombre(a.montant)} ${devise} au plus tard le ${a.echeance}`)
                    .join(' · ')}
                  .
                </div>
              </div>
            )}
            {/* LES DEUX QUOTITÉS DE LA PETITE ENTREPRISE · art. 57, al. 3 et
                57 quater LPF. Ce n'est PAS un acompte sur l'exercice suivant :
                c'est le paiement de l'impôt de CET exercice, fractionné en
                60 % puis 40 %. Le serveur les calculait déjà ; elles
                n'apparaissaient nulle part. La réserve du second versement est
                celle du texte lui-même et s'affiche avec lui. */}
            {resultat.quotitesPetiteEntreprise.length > 0 && (
              <div className="px-3 pb-3 pt-2 text-[10px] text-text-dim leading-[1.55] border-t border-border">
                <div className="font-semibold text-text">
                  Paiement de l’impôt de cet exercice en deux quotités
                </div>
                {resultat.quotitesPetiteEntreprise.map((q) => (
                  <div key={q.rang} className="mt-1">
                    <span className="font-mono text-text">
                      {Math.round(q.quotite * 100)} % · {nombre(q.montant)} {devise}
                    </span>{' '}
                    au plus tard le {q.echeance} <span className="text-text-dim">({q.source})</span>
                    {q.reserve && <div className="text-warning mt-0.5">{q.reserve}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Ligne({
  libelle,
  montant,
  devise,
  signe,
  note,
  gras,
  total,
}: {
  libelle: string;
  montant: number | null;
  devise: string;
  signe?: string;
  note?: string;
  gras?: boolean;
  total?: boolean;
}) {
  return (
    <tr className={`border-t border-border ${total ? 'bg-surface-alt' : ''}`}>
      <td className={`px-3 py-1.5 ${gras ? 'font-bold' : ''}`}>
        {libelle}
        {note && <span className="block text-[10px] text-text-dim font-normal">{note}</span>}
      </td>
      <td className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${gras ? 'font-bold' : ''}`}>
        {signe && montant !== null ? `${signe} ` : ''}
        {nombre(montant)} {montant !== null ? devise : ''}
      </td>
    </tr>
  );
}
