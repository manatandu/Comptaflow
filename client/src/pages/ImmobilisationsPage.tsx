import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useActionsFenetre } from '../lib/actions-fenetre';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import type { Compte, FamilleImmobilisation, Immobilisation, Journal } from '../lib/types';

/**
 * Immobilisations (§3.3) : familles (gabarits, comptes + durée par défaut ·
 * voir famille-immobilisation-seed.ts pour les 6 familles seedées, ancrées
 * à l'arrêté RDC n° 013/2025), instances, dotation périodique (linéaire,
 * prorata temporis) et sortie (cession/mise hors service). Pas de gestion
 * de composants ni d'amortissement dégressif dans ce MVP (skill sycebnl :
 * la décomposition n'est de toute façon autorisée que pour des catégories
 * de biens limitées).
 */
export function ImmobilisationsPage() {
  const { estAdmin } = useAuth();
  const { exerciceCourant } = useExercice();
  const [familles, setFamilles] = useState<FamilleImmobilisation[] | null>(null);
  const [immobilisations, setImmobilisations] = useState<Immobilisation[] | null>(null);
  const [comptesClasse2, setComptesClasse2] = useState<Compte[]>([]);
  const [comptesFinancement, setComptesFinancement] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);

  const [afficherFormFamille, setAfficherFormFamille] = useState(false);
  const [afficherFormImmo, setAfficherFormImmo] = useState(false);

  useActionsFenetre({
    ajouter: { titre: 'Nouvelle immobilisation', executer: () => setAfficherFormImmo(true) },
  });
  const [sortieOuvertePour, setSortieOuvertePour] = useState<string | null>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // --- formulaire famille ---
  const [fCode, setFCode] = useState('');
  const [fIntitule, setFIntitule] = useState('');
  const [fCompteImmo, setFCompteImmo] = useState('');
  const [fCompteAmort, setFCompteAmort] = useState('');
  const [fCompteDotation, setFCompteDotation] = useState('');
  const [fDuree, setFDuree] = useState('5');

  // --- formulaire immobilisation ---
  const [iFamilleId, setIFamilleId] = useState('');
  const [iDesignation, setIDesignation] = useState('');
  const [iNumeroInventaire, setINumeroInventaire] = useState('');
  const [iDateAcquisition, setIDateAcquisition] = useState(() => new Date().toISOString().slice(0, 10));
  const [iDateMiseEnService, setIDateMiseEnService] = useState(() => new Date().toISOString().slice(0, 10));
  const [iValeurOrigine, setIValeurOrigine] = useState('');
  const [iValeurResiduelle, setIValeurResiduelle] = useState('0');
  const [iCompteContrepartie, setICompteContrepartie] = useState('');
  const [iJournalId, setIJournalId] = useState('');

  // --- formulaire sortie (par immobilisation) ---
  const [sDateSortie, setSDateSortie] = useState(() => new Date().toISOString().slice(0, 10));
  const [sType, setSType] = useState<'CESSION' | 'MISE_HORS_SERVICE'>('MISE_HORS_SERVICE');
  const [sPrixCession, setSPrixCession] = useState('');
  const [sCompteContrepartie, setSCompteContrepartie] = useState('');
  const [sJournalId, setSJournalId] = useState('');

  const charger = async () => {
    const [f, i, c2, ctrésorerie, jrn] = await Promise.all([
      api.get<FamilleImmobilisation[]>('/immobilisations/familles'),
      api.get<Immobilisation[]>('/immobilisations'),
      api.get<Compte[]>('/comptes?classe=CLASSE_2&typeCompte=DETAIL'),
      api.get<Compte[]>('/comptes?typeCompte=DETAIL'),
      api.get<Journal[]>('/journaux'),
    ]);
    setFamilles(f);
    setImmobilisations(i);
    setComptesClasse2(c2);
    setComptesFinancement(ctrésorerie);
    setJournaux(jrn);
    const od = jrn.find((j) => j.code === 'OD');
    if (od) {
      setIJournalId((v) => v || od.id);
      setSJournalId((v) => v || od.id);
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreerFamille = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/immobilisations/familles', {
        code: fCode,
        intitule: fIntitule,
        compteImmobilisationId: fCompteImmo,
        compteAmortissementId: fCompteAmort,
        compteDotationId: fCompteDotation,
        dureeAmortissementAns: Number(fDuree),
      });
      setFCode('');
      setFIntitule('');
      setFCompteImmo('');
      setFCompteAmort('');
      setFCompteDotation('');
      setFDuree('5');
      setAfficherFormFamille(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer cette famille');
    } finally {
      setEnvoi(false);
    }
  };

  const onCreerImmo = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/immobilisations', {
        familleId: iFamilleId,
        designation: iDesignation,
        numeroInventaire: iNumeroInventaire || undefined,
        dateAcquisition: iDateAcquisition,
        dateMiseEnService: iDateMiseEnService,
        valeurOrigine: Number(iValeurOrigine),
        valeurResiduelle: Number(iValeurResiduelle || 0),
        compteContrepartieId: iCompteContrepartie,
        exerciceId: exerciceCourant?.id,
        journalId: iJournalId,
      });
      setIDesignation('');
      setINumeroInventaire('');
      setIValeurOrigine('');
      setIValeurResiduelle('0');
      setAfficherFormImmo(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de créer cette immobilisation");
    } finally {
      setEnvoi(false);
    }
  };

  const passerDotation = async (immoId: string) => {
    if (!exerciceCourant) return;
    setErreur(null);
    setInfo(null);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      const resultat = await api.post<{ montant: number }>(`/immobilisations/${immoId}/dotation`, {
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
      });
      setInfo(`Dotation de ${resultat.montant.toLocaleString('fr-FR')} passée pour l'exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de passer la dotation');
    }
  };

  const onSortir = async (e: FormEvent, immoId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post(`/immobilisations/${immoId}/sortie`, {
        dateSortie: sDateSortie,
        type: sType,
        exerciceId: exerciceCourant.id,
        journalId: sJournalId,
        prixCession: sType === 'CESSION' ? Number(sPrixCession) : undefined,
        compteContrepartieId: sType === 'CESSION' ? sCompteContrepartie : undefined,
      });
      setSortieOuvertePour(null);
      setSPrixCession('');
      setInfo('Sortie enregistrée.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de sortir cette immobilisation');
    } finally {
      setEnvoi(false);
    }
  };

  const cumulAmorti = (immo: Immobilisation) => immo.dotations.reduce((s, d) => s + d.montant, 0);
  const vcn = (immo: Immobilisation) => immo.valeurOrigine - cumulAmorti(immo);
  const dejaDoteeCetExercice = (immo: Immobilisation) =>
    !!exerciceCourant && immo.dotations.some((d) => d.exerciceId === exerciceCourant.id);

  const LIBELLE_STATUT: Record<Immobilisation['statut'], string> = {
    EN_SERVICE: 'En service',
    CEDEE: 'Cédée',
    MISE_HORS_SERVICE: 'Hors service',
  };

  return (
    <div className="p-2">
      <div className="text-[10px] font-mono text-text-dim leading-none">STRUCTURE</div>
      <h1 className="text-[13px] font-bold leading-tight mb-1.5">Immobilisations</h1>

      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[1100px]">{erreur}</div>}
      {info && <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[1100px]">{info}</div>}

      {estAdmin && afficherFormFamille && (
        <form onSubmit={onCreerFamille} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
          <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">NOUVELLE FAMILLE</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim">
              Code
              <input required value={fCode} onChange={(e) => setFCode(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
              Intitulé
              <input required value={fIntitule} onChange={(e) => setFIntitule(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Compte d'immobilisation (classe 2)
              <select required value={fCompteImmo} onChange={(e) => setFCompteImmo(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
                <option value="" />
                {comptesClasse2.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Compte d'amortissement (classe 28)
              <select required value={fCompteAmort} onChange={(e) => setFCompteAmort(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
                <option value="" />
                {comptesFinancement.filter((c) => c.numero.startsWith('28')).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Compte de dotation (classe 68)
              <select required value={fCompteDotation} onChange={(e) => setFCompteDotation(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
                <option value="" />
                {comptesFinancement.filter((c) => c.numero.startsWith('68')).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Durée d'amortissement (années)
              <input required type="number" min={1} value={fDuree} onChange={(e) => setFDuree(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">{envoi ? 'Création…' : 'Ajouter'}</button>
            <button type="button" onClick={() => setAfficherFormFamille(false)} className="text-[12.5px] font-semibold text-text-dim px-4 py-1.5">Annuler</button>
          </div>
        </form>
      )}

      {afficherFormImmo && (
        <form onSubmit={onCreerImmo} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
          <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">NOUVELLE IMMOBILISATION</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
              Désignation
              <input required value={iDesignation} onChange={(e) => setIDesignation(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              N° inventaire
              <input value={iNumeroInventaire} onChange={(e) => setINumeroInventaire(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Famille
              <select required value={iFamilleId} onChange={(e) => setIFamilleId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
                <option value="" />
                {(familles ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.intitule} ({f.dureeAmortissementAns} ans)</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Date d'acquisition
              <input required type="date" value={iDateAcquisition} onChange={(e) => setIDateAcquisition(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Date de mise en service
              <input required type="date" value={iDateMiseEnService} onChange={(e) => setIDateMiseEnService(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Valeur d'origine
              <input required type="number" step="0.01" min={0} value={iValeurOrigine} onChange={(e) => setIValeurOrigine(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Valeur résiduelle
              <input type="number" step="0.01" min={0} value={iValeurResiduelle} onChange={(e) => setIValeurResiduelle(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Financement (contrepartie)
              <select required value={iCompteContrepartie} onChange={(e) => setICompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
                <option value="" />
                {comptesFinancement.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-text-dim mb-3">
            En dessous de l'équivalent de 500 USD (arrêté RDC n° 014/2025), le bien peut être passé
            directement en charge plutôt qu'immobilisé · à votre appréciation, non vérifié automatiquement ici.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi || !exerciceCourant} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">{envoi ? 'Création…' : 'Ajouter'}</button>
            <button type="button" onClick={() => setAfficherFormImmo(false)} className="text-[12.5px] font-semibold text-text-dim px-4 py-1.5">Annuler</button>
          </div>
        </form>
      )}

      {!immobilisations && <div className="text-[12px] text-text-dim">Chargement…</div>}

      {immobilisations && (
        <div className="border border-border bg-surface shadow-posee max-w-[1180px]">
          <div className="grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] gap-2.5 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            <span>DÉSIGNATION</span>
            <span>MISE EN SERVICE</span>
            <span className="text-right">V. ORIGINE</span>
            <span className="text-right">CUMUL AMORTI</span>
            <span className="text-right">V.N.C.</span>
            <span>DURÉE</span>
            <span>STATUT</span>
            <span />
          </div>
          {immobilisations.map((immo, i) => (
            <div key={immo.id}>
              <div
                className={`grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border text-[11.5px] ${
                  i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                <span className="truncate">{immo.designation}{immo.numeroInventaire ? ` (${immo.numeroInventaire})` : ''}</span>
                <span className="font-mono text-[10.5px] text-text-dim">{new Date(immo.dateMiseEnService).toLocaleDateString('fr-FR')}</span>
                <span className="font-mono text-right">{immo.valeurOrigine.toLocaleString('fr-FR')}</span>
                <span className="font-mono text-right">{cumulAmorti(immo).toLocaleString('fr-FR')}</span>
                <span className="font-mono text-right font-semibold">{vcn(immo).toLocaleString('fr-FR')}</span>
                <span className="font-mono text-[10.5px] text-text-dim">{immo.dureeAmortissementAns} ans</span>
                <span
                  className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${
                    immo.statut === 'EN_SERVICE' ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
                  }`}
                >
                  {LIBELLE_STATUT[immo.statut]}
                </span>
                <span className="flex gap-2">
                  {immo.statut === 'EN_SERVICE' && (
                    <>
                      <button
                        onClick={() => passerDotation(immo.id)}
                        disabled={dejaDoteeCetExercice(immo)}
                        title={dejaDoteeCetExercice(immo) ? 'Déjà dotée pour cet exercice' : 'Passer la dotation de cet exercice'}
                        className="text-[10.5px] text-sel hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        Doter
                      </button>
                      <button
                        onClick={() => setSortieOuvertePour(sortieOuvertePour === immo.id ? null : immo.id)}
                        className="text-[10.5px] text-sel hover:underline"
                      >
                        Sortir
                      </button>
                    </>
                  )}
                </span>
              </div>
              {sortieOuvertePour === immo.id && (
                <form onSubmit={(e) => onSortir(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <label className="text-[11px] font-semibold text-text-dim">
                      Type
                      <select value={sType} onChange={(e) => setSType(e.target.value as 'CESSION' | 'MISE_HORS_SERVICE')} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12.5px]">
                        <option value="MISE_HORS_SERVICE">Mise hors service</option>
                        <option value="CESSION">Cession</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-text-dim">
                      Date
                      <input required type="date" value={sDateSortie} onChange={(e) => setSDateSortie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12.5px] font-mono" />
                    </label>
                    {sType === 'CESSION' && (
                      <>
                        <label className="text-[11px] font-semibold text-text-dim">
                          Prix de cession
                          <input required type="number" step="0.01" min={0} value={sPrixCession} onChange={(e) => setSPrixCession(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12.5px] font-mono" />
                        </label>
                        <label className="text-[11px] font-semibold text-text-dim">
                          Encaissé sur
                          <select required value={sCompteContrepartie} onChange={(e) => setSCompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12.5px]">
                            <option value="" />
                            {comptesFinancement.map((c) => (
                              <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={envoi} className="bg-sel text-white text-[12px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Confirmer la sortie'}</button>
                    <button type="button" onClick={() => setSortieOuvertePour(null)} className="text-[12px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {immobilisations.length === 0 && <div className="p-3 text-[12px] text-text-dim">Aucune immobilisation pour l'instant.</div>}
        </div>
      )}
    </div>
  );
}
