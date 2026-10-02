import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Compte, TauxTva } from '../lib/types';
import { Aide } from '../components/chrome/Aide';
import { BoutonImprimer, EnteteImpression } from '../components/chrome/EnteteImpression';
import { EditionStructure } from '../components/EditionStructure';
import { editionTaux, perimetreEdition } from '../lib/editions-structures';
import { PortailModale } from '../components/PortailModale';
import { motifAucunCompteRetenu, RETENUS } from '../lib/comptes-proposes';

/**
 * TAUX DE TAXES · la fenêtre Structure → Taux de taxes de Sage 100 i7 :
 * liste dense (code · intitulé · taux · sens par comptes rattachés · état),
 * création en boîte de dialogue. Chaque taux porte son compte de TVA
 * collectée (443, ventes) et/ou déductible (445, achats) · c'est ce
 * rattachement qui permet le calcul automatique en saisie et la déclaration.
 */
export function TauxTvaPage() {
  const { estAdmin, utilisateur } = useAuth();
  const [liste, setListe] = useState<TauxTva[] | null>(null);
  // Liste de choix (comptes de classe 4 retenus ou utilisés) · null tant qu'elle n'est pas lue.
  const [comptesLus, setComptesLus] = useState<Compte[] | null>(null);
  const comptesClasse4 = comptesLus ?? [];
  const [erreurComptes, setErreurComptes] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);


  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [taux, setTaux] = useState('16');
  const [compteCollecteId, setCompteCollecteId] = useState('');
  const [compteDeductibleId, setCompteDeductibleId] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // MODIFIER UN TAUX (audit final F122) · les comptes et l'intitulé se
  // complètent toujours ; le pourcentage d'un taux déjà porté par des lignes
  // est refusé par le serveur (F121), qui dit pourquoi.
  const [edition, setEdition] = useState<TauxTva | null>(null);
  const [edIntitule, setEdIntitule] = useState('');
  const [edTaux, setEdTaux] = useState('');
  const [edCollecte, setEdCollecte] = useState('');
  const [edDeductible, setEdDeductible] = useState('');

  const charger = async () => {
    try {
      setListe(await api.get<TauxTva[]>('/taux-tva'));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les taux de TVA');
    }
  };

  useEffect(() => {
    if (!estAdmin) return;
    charger();
    // LISTE DE CHOIX · comptes retenus ou utilisés (`lib/comptes-proposes.ts`) ;
    // le compte d'un taux existant est utilisé, il y reste. Un échec se dit.
    api.get<Compte[]>(`/comptes?classe=CLASSE_4&actifsSeuls=true&typeCompte=DETAIL&${RETENUS}`).then(setComptesLus, (err) =>
      setErreurComptes(`Comptes de taxe illisibles · ${err instanceof ApiError ? err.message : 'serveur injoignable'}`),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estAdmin]);

  if (!estAdmin) {
    return (
      <div className="p-2">
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[11.5px] max-w-[480px]">
          Cette fenêtre est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/taux-tva', {
        code,
        intitule,
        taux: Number(taux),
        ...(compteCollecteId ? { compteCollecteId } : {}),
        ...(compteDeductibleId ? { compteDeductibleId } : {}),
      });
      setCode('');
      setIntitule('');
      setTaux('16');
      setCompteCollecteId('');
      setCompteDeductibleId('');
      setNouveauOuvert(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce taux de TVA');
    } finally {
      setEnvoi(false);
    }
  };

  // Suppression · le serveur refuse tout objet mouvementé ou utilisé, et
  // dit lequel (common/suppression/references.ts). La confirmation évite le
  // clic malheureux sur un objet libre, qui, lui, disparaît pour de bon.
  const supprimer = async (id: string, nom: string) => {
    if (!window.confirm(`Supprimer ${nom} ? Cette suppression est définitive.`)) return;
    setErreur(null);
    try {
      await api.delete(`/taux-tva/${id}`);
      
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Suppression impossible');
    }
  };

  const ouvrirEdition = (t: TauxTva) => {
    setEdition(t);
    setEdIntitule(t.intitule);
    setEdTaux(String(Number(t.taux)));
    setEdCollecte(t.compteCollecteId ?? '');
    setEdDeductible(t.compteDeductibleId ?? '');
  };

  const onModifier = async (e: FormEvent) => {
    e.preventDefault();
    if (!edition) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await api.patch(`/taux-tva/${edition.id}`, {
        intitule: edIntitule,
        // Le pourcentage n'est envoyé que s'il change · un taux mouvementé
        // garde le sien, et renvoyer la même valeur ne demande rien.
        ...(Number(edTaux) !== Number(edition.taux) ? { taux: Number(edTaux) } : {}),
        compteCollecteId: edCollecte || null,
        compteDeductibleId: edDeductible || null,
      });
      setEdition(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de modifier ce taux de TVA');
    } finally {
      setEnvoi(false);
    }
  };

  const basculerActif = async (t: TauxTva) => {
    try {
      await api.patch(`/taux-tva/${t.id}`, { estActif: !t.estActif });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  return (
    <div className="p-2 avec-edition">
      <EnteteImpression titre="Taux de taxes" />
      <EditionStructure edition={editionTaux(liste ?? [])} perimetre={perimetreEdition([], liste?.length ?? 0, 'taux', 'taux')} />
      <div className="flex items-center justify-end gap-2 mb-2">
        <BoutonImprimer libelle="Imprimer la liste" />
        <Aide
          titre="Taux de TVA"
          texte={`Taux normal 16 %, réduits 1 % et 5 % (billets d'avion), zéro (exportations). Une opération exonérée ${
            utilisateur?.tenant.referentiel === 'SYSCOHADA'
              ? "(ex. la vente d'un bien meuble d'occasion ayant servi à l'exploitation et n'ayant pas ouvert droit à déduction · art. 15, 1°)"
              : "(ex. activité normale d'une ASBL · art. 15, 2° et 17, 8°)"
          } n'utilise aucun taux : ce n'est pas un taux à 0 %.`}
          source="Ordonnance-Loi n° 10/001 du 20/08/2010, art. 35 (modifié par la Loi de Finances 2026)"
        />
        <button type="button" onClick={() => setNouveauOuvert(true)} className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
          Nouveau taux
        </button>
      </div>

      {erreurComptes && (
        <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">{erreurComptes}</div>
      )}
      {erreur && (
        <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">{erreur}</div>
      )}

      <div
        // `overflow-x-auto` ici, `min-w` sur les lignes · les 736 px de colonnes
        // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
        // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
        // qui emportait alors titre, onglets et boutons hors de l'écran.
        className="border border-border bg-surface shadow-posee overflow-x-auto"
      >
        <div className="entete-colonnes grid grid-cols-[80px_1fr_78px_210px_210px_80px_70px_70px] min-w-[1040px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[11px] font-bold text-text-dim">
          <span>Code</span>
          <span>Intitulé</span>
          <span className="text-right">Taux</span>
          <span>Collectée (443 · ventes)</span>
          <span>Déductible (445 · achats)</span>
          <span>État</span>
          <span />
          <span />
        </div>
        {!liste && <div className="px-3.5 py-3 text-[11.5px] text-text-dim">Chargement…</div>}
        {liste?.map((t) => (
          <div
            key={t.id}
            className={`grid grid-cols-[80px_1fr_78px_210px_210px_80px_70px_70px] min-w-[1040px] gap-2.5 items-center px-3.5 py-[4px] border-b border-border/50 last:border-b-0 text-[11.5px] hover:bg-sel-soft ${
              !t.estActif ? 'opacity-55' : ''
            }`}
          >
            <span className="font-mono font-semibold">{t.code}</span>
            <span className="truncate">{t.intitule}</span>
            <span className="font-mono text-right">{Number(t.taux).toLocaleString('fr-FR')} %</span>
            <span className="font-mono text-[11px] text-text-dim truncate">
              {t.compteCollecte ? `${t.compteCollecte.numero} ${t.compteCollecte.intitule}` : ''}
            </span>
            <span className="font-mono text-[11px] text-text-dim truncate">
              {t.compteDeductible ? `${t.compteDeductible.numero} ${t.compteDeductible.intitule}` : ''}
            </span>
            <button
              onClick={() => basculerActif(t)}
              className={`text-[11px] text-left ${t.estActif ? 'text-positive hover:underline' : 'text-warning hover:underline'}`}
            >
              {t.estActif ? 'Actif' : 'Inactif'}
            </button>
            <button onClick={() => ouvrirEdition(t)} className="text-[11px] text-left text-sel hover:underline">
              Modifier
            </button>
            <button onClick={() => supprimer(t.id, `le taux ${t.code}`)} className="text-[11px] text-left text-danger hover:underline">
              Supprimer
            </button>
          </div>
        ))}
      </div>

      {nouveauOuvert && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form onSubmit={onCreer} className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <div
                className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]"
              >
                <span>Nouveau taux de taxe</span>
                <button type="button" onClick={() => setNouveauOuvert(false)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                  ✕
                </button>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-[150px_1fr] items-center gap-x-3 gap-y-2.5">
                  <label className="text-[11.5px] text-right">Code :</label>
                  <input required autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TVA16…" className="border border-border-dark px-2.5 py-1.5 text-[12px] font-mono" />
                  <label className="text-[11.5px] text-right">Intitulé :</label>
                  <input required value={intitule} onChange={(e) => setIntitule(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                  <label className="text-[11.5px] text-right">Taux (%) :</label>
                  <input required type="number" min={0} max={100} step="0.01" value={taux} onChange={(e) => setTaux(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px] font-mono text-right" />
                  <label className="text-[11.5px] text-right">Collectée (443) :</label>
                  <select value={compteCollecteId} onChange={(e) => setCompteCollecteId(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11.5px]">
                    <option value="">Aucun</option>
                    {comptesClasse4.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                  <label className="text-[11.5px] text-right">Déductible (445) :</label>
                  <select value={compteDeductibleId} onChange={(e) => setCompteDeductibleId(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11.5px]">
                    <option value="">Aucun</option>
                    {comptesClasse4.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                  {comptesLus && comptesLus.length === 0 && (
                    <>
                      <span />
                      <span className="text-[11px] text-warning">{motifAucunCompteRetenu(comptesLus, 'de taxe (classe 4)')}</span>
                    </>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setNouveauOuvert(false)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11.5px]">
                    Annuler
                  </button>
                  <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[11.5px] font-semibold disabled:opacity-50">
                    {envoi ? 'Création…' : 'Créer le taux'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </PortailModale>
      )}

      {edition && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form onSubmit={onModifier} className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span>Modifier le taux {edition.code}</span>
                <button type="button" onClick={() => setEdition(null)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                  ✕
                </button>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-[150px_1fr] items-center gap-x-3 gap-y-2.5">
                  <label className="text-[11.5px] text-right">Intitulé :</label>
                  <input required value={edIntitule} onChange={(e) => setEdIntitule(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                  <label className="text-[11.5px] text-right">Taux (%) :</label>
                  <span className="flex items-center gap-1.5">
                    <input required type="number" min={0} max={100} step="0.01" value={edTaux} onChange={(e) => setEdTaux(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px] font-mono text-right w-[110px]" />
                    <Aide
                      titre="Pourcentage d'un taux utilisé"
                      texte="Le pourcentage d'un taux déjà porté par des écritures ou des factures ne change plus : il réécrirait les prorata et les pièces des périodes passées. Créez un nouveau taux et mettez celui-ci en sommeil."
                      source="Règle d'OmegaX · le prorata reconstitue la base au taux de la ligne (O.-L. n° 10/001, art. 43)"
                    />
                  </span>
                  <label className="text-[11.5px] text-right">Collectée (443) :</label>
                  <select value={edCollecte} onChange={(e) => setEdCollecte(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11.5px]">
                    <option value="">Aucun</option>
                    {comptesClasse4.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                  <label className="text-[11.5px] text-right">Déductible (445) :</label>
                  <select value={edDeductible} onChange={(e) => setEdDeductible(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11.5px]">
                    <option value="">Aucun</option>
                    {comptesClasse4.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setEdition(null)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11.5px]">
                    Annuler
                  </button>
                  <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[11.5px] font-semibold disabled:opacity-50">
                    {envoi ? 'Enregistrement…' : 'Enregistrer'}
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
