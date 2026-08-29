import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Bailleur, Compte } from '../lib/types';

/**
 * Bailleurs / sous-projets (comptabilité analytique par projet/bailleur,
 * docs/plan-de-construction.md item 14) — spécifique au jeu SYCEBNL
 * « projets de développement et assimilés ». Un bailleur regroupe les
 * sous-comptes 162-164 (Fonds affectés aux investissements) et 462-464
 * (Fonds d'administration) qui lui sont propres — voir Partie 3 ch. 3 du
 * texte officiel : le mécanisme de suivi par bailleur est déjà la
 * subdivision de ces comptes, cette page se contente de nommer un groupe
 * de sous-comptes et de les rattacher, pour que la NOTE 9 (onglet dédié
 * des États financiers) se calcule automatiquement.
 */
export function BailleursPage() {
  const { utilisateur, estAdmin } = useAuth();
  const jeuProjet = utilisateur?.tenant.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT';

  const [bailleurs, setBailleurs] = useState<Bailleur[] | null>(null);
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');

  const charger = async () => {
    const [b, c] = await Promise.all([api.get<Bailleur[]>('/bailleurs'), api.get<Compte[]>('/comptes')]);
    setBailleurs(b);
    setComptes(c);
  };

  useEffect(() => {
    charger();
  }, []);

  // Bouton masqué hors admin : le back refuse déjà (POST/PATCH /bailleurs sont
  // @Roles(ADMIN_CABINET)), l'UI ne doit pas proposer une action vouée au 403.
  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/bailleurs', { code, nom });
      setCode('');
      setNom('');
      setAfficherFormulaire(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce bailleur');
    } finally {
      setEnvoi(false);
    }
  };

  const basculerActif = async (b: Bailleur) => {
    setErreur(null);
    try {
      await api.patch(`/bailleurs/${b.id}`, { estActif: !b.estActif });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de modifier ce bailleur');
    }
  };

  const rattacher = async (compteId: string, bailleurId: string) => {
    setErreur(null);
    try {
      await api.patch(`/comptes/${compteId}`, { bailleurId: bailleurId || null });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de rattacher ce compte');
    }
  };

  // Comptes éligibles au rattachement — 162-164 (Fonds d'investissement) et
  // 462-464 (Fonds d'administration), les deux seules familles que la
  // NOTE 9 sait lire (voir EtatsFinanciersProjetService.noteBailleur). Un
  // tenant reste libre de rattacher un autre compte via l'API, mais cette
  // page ne propose que ce que la note sait effectivement exploiter.
  const PREFIXES = ['162', '163', '164', '462', '463', '464'];
  const comptesEligibles = (comptes ?? []).filter((c) => PREFIXES.some((p) => c.numero.startsWith(p)));

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <h1 className="text-[15px] font-bold">Bailleurs</h1>
      </div>

      {!jeuProjet && (
        <p className="text-[11px] text-text-dim mb-2.5">
          Ce dossier relève du jeu SYCEBNL « associations et ordres professionnels » — la NOTE 9 « Fonds du
          bailleur » n'existe que dans le jeu « projets de développement et assimilés ». Les bailleurs restent
          utilisables ici (rattachement de comptes), mais aucun état ne les exploite pour ce dossier.
        </p>
      )}

      {estAdmin && afficherFormulaire && (
        <form onSubmit={onCreer} className="bg-surface border border-border p-4 mb-4 max-w-[520px]">
          <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">NOUVEAU BAILLEUR</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim">
              Code
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono"
              />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Nom
              <input
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
              />
            </label>
          </div>
          {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3">{erreur}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
              {envoi ? 'Création…' : 'Ajouter'}
            </button>
            <button type="button" onClick={() => setAfficherFormulaire(false)} className="text-[12.5px] font-semibold text-text-dim px-4 py-1.5">
              Annuler
            </button>
          </div>
        </form>
      )}

      {erreur && !afficherFormulaire && (
        <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[900px]">{erreur}</div>
      )}

      {!bailleurs && <div className="text-[12px] text-text-dim">Chargement…</div>}

      {bailleurs && (
        <div className="border border-border bg-surface mb-4 max-w-[600px]">
          <div className="grid grid-cols-[90px_1fr_70px_90px] gap-3 px-4 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            <span>CODE</span>
            <span>NOM</span>
            <span>STATUT</span>
            <span />
          </div>
          {bailleurs.length === 0 && <div className="px-4 py-3 text-[12px] text-text-dim">Aucun bailleur créé.</div>}
          {bailleurs.map((b, i) => (
            <div
              key={b.id}
              className={`grid grid-cols-[90px_1fr_70px_90px] gap-3 items-center px-4 py-1.5 border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}
            >
              <span className="font-mono text-[12px]">{b.code}</span>
              <span className="text-[12.5px]">{b.nom}</span>
              <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${b.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'}`}>
                {b.estActif ? 'ACTIF' : 'INACTIF'}
              </span>
              {estAdmin && (
                <button onClick={() => basculerActif(b)} className="text-[10.5px] text-sel hover:underline text-left">
                  {b.estActif ? 'Désactiver' : 'Activer'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {comptes && bailleurs && bailleurs.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold mb-1.5">Comptes rattachés (162-164 / 462-464)</h2>
          <p className="text-[10.5px] text-text-dim mb-2">
            Seuls les sous-comptes 162-164 (Fonds affectés aux investissements) et 462-464 (Fonds
            d'administration) sont proposés ici — ce sont les seuls que la NOTE 9 sait lire.
          </p>
          <div className="border border-border bg-surface max-w-[720px]">
            <div className="grid grid-cols-[90px_1fr_200px] gap-3 px-4 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
              <span>N°</span>
              <span>LIBELLÉ</span>
              <span>BAILLEUR</span>
            </div>
            {comptesEligibles.length === 0 && (
              <div className="px-4 py-3 text-[12px] text-text-dim">
                Aucun sous-compte 162-164/462-464 dans ce dossier — créez-en depuis le Plan de comptes.
              </div>
            )}
            {comptesEligibles.map((c, i) => (
              <div
                key={c.id}
                className={`grid grid-cols-[90px_1fr_200px] gap-3 items-center px-4 py-1.5 border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}
              >
                <span className="font-mono text-[12px]">{c.numero}</span>
                <span className="text-[12.5px]">{c.intitule}</span>
                <select
                  value={c.bailleurId ?? ''}
                  onChange={(e) => rattacher(c.id, e.target.value)}
                  disabled={!estAdmin}
                  className="border border-border-dark px-2 py-1 text-[11.5px] disabled:opacity-60"
                >
                  <option value="">— non rattaché —</option>
                  {bailleurs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.nom}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
