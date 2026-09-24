import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * P8 · LES BULLETINS ÉMIS, onglet de la fenêtre Personnel.
 *
 * Tout ce qui est chiffré vient du SERVEUR, figé à l'émission : la liste, les
 * totaux du mois et le détail d'un bulletin. Cet écran n'additionne rien et
 * ne recalcule rien · un bulletin remis au travailleur doit se relire tel
 * qu'il a été remis, même si le barème ou le registre ont changé depuis.
 *
 * Trois gestes, réservés à qui peut écrire : ANNULER (avec un motif, la ligne
 * reste), DÉCLARER LA REMISE (art. 103, une fois), et IMPRIMER, ouvert à tous.
 */

interface LigneBulletin {
  id: string;
  numero: number;
  moisDePaie: string;
  statut: 'EMIS' | 'ANNULE';
  nomComplet: string;
  matricule: string | null;
  totalVerseFc: number;
  irppFc: number;
  netAPayerFc: number;
  emisLe: string;
  remisLe: string | null;
  annuleLe: string | null;
}

interface ListeBulletins {
  bulletins: LigneBulletin[];
  total: number;
  tronque: boolean;
  totauxEmis: {
    nombre: number;
    totalVerseFc: number;
    cotisationsTravailleurFc: number;
    cotisationsEmployeurFc: number;
    irppFc: number;
    netAPayerFc: number;
  };
  textes: { numerotation: string; inalterabilite: string; article103: string };
}

interface ElementEntree {
  nature: string;
  libelle: string;
  montantFc: number;
}

interface LigneCotisation {
  cle: string;
  libelle: string;
  charge: 'EMPLOYEUR' | 'TRAVAILLEUR';
  tauxPourCent: number;
  assietteFc: number;
  montantFc: number;
}

interface Bulletin extends LigneBulletin {
  emploi: string | null;
  categorieProfessionnelle: string | null;
  numeroAffiliationCnss: string | null;
  assietteSocialeFc: number;
  cotisationsTravailleurFc: number;
  cotisationsEmployeurFc: number;
  motifAnnulation: string | null;
  entree: { elements: ElementEntree[]; personnesACharge?: number };
  calcul: { cotisations: { lignes: LigneCotisation[] } };
  reserves: string[];
}

const fc = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jour = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '·');
const moisCourant = () => new Date().toISOString().slice(0, 7);

export function OngletBulletins({ moisInitial, peutEcrire }: { moisInitial: string; peutEcrire: boolean }) {
  const [mois, setMois] = useState(/^\d{4}-\d{2}$/.test(moisInitial) ? moisInitial : moisCourant());
  const [liste, setListe] = useState<ListeBulletins | null>(null);
  const [ouvert, setOuvert] = useState<Bulletin | null>(null);
  const [erreur, setErreur] = useState('');
  const [motif, setMotif] = useState('');
  const [remisLe, setRemisLe] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    setErreur('');
    api.get<ListeBulletins>(`/personnel/bulletins?mois=${mois}`).then(setListe, (e: ApiError) => setErreur(e.message));
  }, [mois]);

  useEffect(() => {
    charger();
    setOuvert(null);
  }, [charger]);

  const ouvrir = (id: string) => {
    setErreur('');
    setMotif('');
    setRemisLe('');
    api.get<Bulletin>(`/personnel/bulletins/${id}`).then(setOuvert, (e: ApiError) => setErreur(e.message));
  };

  const agir = (chemin: string, corps: unknown) => {
    if (!ouvert) return;
    setEnCours(true);
    setErreur('');
    api.post<Bulletin>(`/personnel/bulletins/${ouvert.id}/${chemin}`, corps).then(
      (b) => {
        setOuvert(b);
        setEnCours(false);
        charger();
      },
      (e: ApiError) => {
        setErreur(e.message);
        setEnCours(false);
      },
    );
  };

  const t = liste?.totauxEmis;

  return (
    <div className="max-w-[1240px] text-[12px]">
      <div className="ecran-seul flex flex-wrap items-center gap-3 mb-2.5">
        <label className="flex items-center gap-2">
          Mois de paie
          <input
            type="month"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            className="border border-border px-2 py-1"
          />
        </label>
        {liste && (
          <span className="text-text-dim">
            {liste.total} bulletin(s) pour ce mois
            {liste.tronque ? ` · les ${liste.bulletins.length} derniers affichés` : ''}
          </span>
        )}
      </div>

      {erreur && <div className="ecran-seul border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">{erreur}</div>}

      {liste && (
        <div className="ecran-seul border border-border bg-surface mb-2.5 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-1.5">N°</th>
                <th className="px-3 py-1.5">Salarié</th>
                <th className="px-3 py-1.5 text-right">Total versé</th>
                <th className="px-3 py-1.5 text-right">IRPP retenu</th>
                <th className="px-3 py-1.5 text-right">Net à payer</th>
                <th className="px-3 py-1.5">Remis le</th>
                <th className="px-3 py-1.5">Statut</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {liste.bulletins.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-2 text-text-dim">
                    Aucun bulletin émis pour ce mois. On émet un bulletin depuis l’onglet Simulation,
                    salarié choisi.
                  </td>
                </tr>
              )}
              {liste.bulletins.map((b) => (
                <tr key={b.id} className={b.statut === 'ANNULE' ? 'text-text-dim' : undefined}>
                  <td className="px-3 py-1.5">{b.numero}</td>
                  <td className="px-3 py-1.5">
                    {b.nomComplet}
                    {b.matricule ? <span className="text-text-dim"> · {b.matricule}</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-right">{fc(b.totalVerseFc)}</td>
                  <td className="px-3 py-1.5 text-right">{fc(b.irppFc)}</td>
                  <td className="px-3 py-1.5 text-right">{fc(b.netAPayerFc)}</td>
                  <td className="px-3 py-1.5">{jour(b.remisLe)}</td>
                  <td className="px-3 py-1.5">{b.statut === 'EMIS' ? 'Émis' : 'Annulé'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={() => ouvrir(b.id)} className="text-sel hover:underline">
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {t && t.nombre > 0 && (
              <tfoot>
                <tr>
                  <td className="px-3 py-1.5" colSpan={2}>
                    Total des {t.nombre} bulletin(s) émis · les annulés n’y entrent pas
                  </td>
                  <td className="px-3 py-1.5 text-right">{fc(t.totalVerseFc)}</td>
                  <td className="px-3 py-1.5 text-right">{fc(t.irppFc)}</td>
                  <td className="px-3 py-1.5 text-right">{fc(t.netAPayerFc)}</td>
                  <td colSpan={3} className="px-3 py-1.5 text-text-dim">
                    Cotisations · ouvrières {fc(t.cotisationsTravailleurFc)}, patronales{' '}
                    {fc(t.cotisationsEmployeurFc)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {ouvert && (
        <div className="border border-border bg-surface px-5 py-4">
          {/* LE BULLETIN · c'est la partie qui s'imprime. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-[15px] font-semibold">
              Bulletin de paie n° {ouvert.numero} · {ouvert.moisDePaie}
            </h2>
            <span className="text-text-dim">Émis le {jour(ouvert.emisLe)}</span>
          </div>

          {ouvert.statut === 'ANNULE' && (
            <div className="border border-danger/30 bg-danger-soft px-3 py-2 mb-3">
              <strong>Annulé</strong> le {jour(ouvert.annuleLe)} · {ouvert.motifAnnulation}
            </div>
          )}

          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 mb-3">
            <div>
              <span className="text-text-dim">Travailleur · </span>
              <strong>{ouvert.nomComplet}</strong>
            </div>
            <div>
              <span className="text-text-dim">N° d’ordre · </span>
              {ouvert.matricule ?? 'non attribué'}
            </div>
            <div>
              <span className="text-text-dim">Emploi · </span>
              {ouvert.emploi ?? 'non renseigné'}
              {ouvert.categorieProfessionnelle ? ` · ${ouvert.categorieProfessionnelle}` : ''}
            </div>
            <div>
              <span className="text-text-dim">N° d’affiliation CNSS · </span>
              {ouvert.numeroAffiliationCnss ?? 'non renseigné'}
            </div>
          </div>

          <table className="w-full mb-3">
            <tbody>
              {ouvert.entree.elements.map((e, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1">{e.libelle}</td>
                  <td className="py-1 text-right">{fc(e.montantFc)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-1">Total versé</td>
                <td className="py-1 text-right">{fc(ouvert.totalVerseFc)}</td>
              </tr>
              {ouvert.calcul.cotisations.lignes
                .filter((c) => c.charge === 'TRAVAILLEUR')
                .map((c) => (
                  <tr key={c.cle} className="border-t border-border/60">
                    <td className="py-1">
                      Retenue {c.libelle} ({c.tauxPourCent} % de {fc(c.assietteFc)})
                    </td>
                    <td className="py-1 text-right">− {fc(c.montantFc)}</td>
                  </tr>
                ))}
              <tr className="border-t border-border/60">
                <td className="py-1">Retenue IRPP (art. 119)</td>
                <td className="py-1 text-right">− {fc(ouvert.irppFc)}</td>
              </tr>
              <tr className="border-t-2 border-border font-semibold text-[13px]">
                <td className="py-1.5">Net à payer</td>
                <td className="py-1.5 text-right">{fc(ouvert.netAPayerFc)}</td>
              </tr>
            </tbody>
          </table>

          <div className="text-text-dim mb-3">
            Assiette des cotisations sociales {fc(ouvert.assietteSocialeFc)} FC · cotisations
            patronales {fc(ouvert.cotisationsEmployeurFc)} FC, à la charge de l’employeur, hors du
            net. Remis au travailleur le {jour(ouvert.remisLe)}.
          </div>

          <ul className="text-[11px] text-text-dim list-disc pl-4 mb-3">
            {ouvert.reserves.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>

          <div className="ecran-seul flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <button type="button" onClick={() => window.print()} className="px-3 py-1.5 border border-border">
              Imprimer
            </button>
            {peutEcrire && ouvert.statut === 'EMIS' && !ouvert.remisLe && (
              <span className="flex items-center gap-2">
                <input
                  type="date"
                  value={remisLe}
                  onChange={(e) => setRemisLe(e.target.value)}
                  className="border border-border px-2 py-1"
                />
                <button
                  type="button"
                  disabled={enCours || !remisLe}
                  onClick={() => agir('remise', { remisLe })}
                  className="px-3 py-1.5 border border-border disabled:opacity-50"
                >
                  Déclarer la remise
                </button>
              </span>
            )}
            {peutEcrire && ouvert.statut === 'EMIS' && (
              <span className="flex items-center gap-2">
                <input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Motif de l’annulation"
                  className="border border-border px-2 py-1 w-[240px]"
                />
                <button
                  type="button"
                  disabled={enCours || motif.trim().length < 5}
                  onClick={() => agir('annulation', { motif })}
                  className="px-3 py-1.5 border border-danger/40 text-danger disabled:opacity-50"
                >
                  Annuler le bulletin
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {liste && (
        <ul className="ecran-seul text-[11px] text-text-dim list-disc pl-4 mt-2.5">
          <li>{liste.textes.numerotation}</li>
          <li>{liste.textes.inalterabilite}</li>
          <li>{liste.textes.article103}</li>
        </ul>
      )}
    </div>
  );
}
