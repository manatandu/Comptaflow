import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Aide } from './chrome/Aide';

type NomBareme = 'CNSS' | 'INPP' | 'ONEM' | 'SMIG';
type Valeurs = Record<string, unknown>;
type Version = { aPartirDu: string | null; reference: string; valeurs: Valeurs };
type VersionDossier = Version & { id: string; bareme: NomBareme; saisiPar: string };

interface Reponse {
  baremes: NomBareme[];
  livrees: Record<NomBareme, Version[]>;
  dossier: VersionDossier[];
  reserve: string;
}

const pc = (x: unknown) => (typeof x === 'number' ? `${x.toLocaleString('fr-FR')} %` : '');
const nombre = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
const champ = 'border border-border bg-transparent px-1.5 py-0.5';

/** Les taux d'une version, en une ligne lisible. */
export function resumeValeurs(bareme: NomBareme, v: Valeurs): string {
  if (bareme === 'ONEM') return pc(v.tauxPourCent);
  if (bareme === 'SMIG') {
    const smig = v.smigJournalierFc as number;
    return `${smig.toLocaleString('fr-FR')} FC par jour (manœuvre) · ${(smig * 26).toLocaleString('fr-FR')} FC par mois`;
  }
  if (bareme === 'CNSS') {
    return `familles ${v.prestationsAuxFamilles === null ? 'non fixé (hors ex-Katanga)' : pc(v.prestationsAuxFamilles)} · pensions ${pc(v.pensionsEmployeur)} + ${pc(v.pensionsTravailleur)} · risques ${pc(v.risquesProfessionnels)}`;
  }
  const tranches = (v.priveParTranche as { jusqua: number | null; tauxPourCent: number }[]) ?? [];
  return `public ${pc(v.publicPourCent)} · privé ${tranches
    .map((t) => `${t.jusqua === null ? 'au-delà' : `≤ ${t.jusqua}`} ${pc(t.tauxPourCent)}`)
    .join(', ')}`;
}

const VIDE = {
  bareme: 'ONEM' as NomBareme,
  aPartirDu: '',
  reference: '',
  onem: '',
  smig: '',
  pf: '',
  pe: '',
  pt: '',
  rp: '',
  public: '',
  t1: '50',
  p1: '',
  t2: '300',
  p2: '',
  p3: '',
};

/**
 * BARÈMES DE PAIE DATÉS · onglet de la fenêtre Personnel. Les versions
 * livrées par OmegaX s'affichent sans pouvoir se modifier ; le cabinet ajoute
 * une version datée, avec le texte qui la fonde, quand un arrêté change un
 * taux. Le serveur refuse une version antérieure à la dernière connue.
 */
export function OngletBaremesPaie({ peutEcrire }: { peutEcrire: boolean }) {
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState('');
  const [avis, setAvis] = useState('');
  const [f, setF] = useState(VIDE);

  const charger = useCallback(() => {
    api.get<Reponse>('/personnel/baremes').then(setDonnees, (e: ApiError) => setErreur(e.message));
  }, []);
  useEffect(charger, [charger]);

  const valeurs = (): Valeurs => {
    if (f.bareme === 'ONEM') return { tauxPourCent: nombre(f.onem) };
    if (f.bareme === 'SMIG') return { smigJournalierFc: nombre(f.smig) };
    if (f.bareme === 'CNSS') {
      return {
        prestationsAuxFamilles: nombre(f.pf),
        pensionsEmployeur: nombre(f.pe),
        pensionsTravailleur: nombre(f.pt),
        risquesProfessionnels: nombre(f.rp),
      };
    }
    return {
      publicPourCent: nombre(f.public),
      priveParTranche: [
        { jusqua: nombre(f.t1), tauxPourCent: nombre(f.p1) },
        { jusqua: nombre(f.t2), tauxPourCent: nombre(f.p2) },
        { jusqua: null, tauxPourCent: nombre(f.p3) },
      ],
    };
  };

  const ajouter = async (e: FormEvent) => {
    e.preventDefault();
    setErreur('');
    setAvis('');
    try {
      const r = await api.post<{ bulletinsDejaEmis: { numero: number; moisDePaie: string }[] }>('/personnel/baremes', {
        bareme: f.bareme,
        aPartirDu: f.aPartirDu,
        reference: f.reference,
        valeurs: valeurs(),
      });
      if (r.bulletinsDejaEmis.length) {
        setAvis(
          `Version enregistrée. ${r.bulletinsDejaEmis.length} bulletin(s) déjà émis sur la période ont été calculés sans elle (` +
            r.bulletinsDejaEmis.map((b) => `n° ${b.numero}, ${b.moisDePaie}`).join(' · ') +
            ') · ils restent tels quels, à annuler et réémettre si le taux a changé pour eux.',
        );
      }
      setF({ ...VIDE, bareme: f.bareme });
      charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Opération refusée');
    }
  };

  const retirer = async (v: VersionDossier) => {
    if (!window.confirm(`Retirer la version ${v.bareme} du ${v.aPartirDu} ?`)) return;
    setErreur('');
    try {
      await api.delete(`/personnel/baremes/${v.id}`);
      charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Opération refusée');
    }
  };

  const saisie = (cle: keyof typeof VIDE, libelle: string, largeur = 'w-[70px]') => (
    <input
      aria-label={libelle}
      placeholder={libelle}
      value={f[cle] as string}
      onChange={(e) => setF({ ...f, [cle]: e.target.value })}
      className={`${champ} ${largeur} text-right`}
    />
  );

  return (
    <div className="ecran-seul max-w-[1240px] text-[11.5px] space-y-4">
      {erreur && <div className="border border-danger/30 bg-danger-soft text-danger px-3 py-2">{erreur}</div>}
      {avis && <div className="border border-warning/30 bg-warning-soft text-warning px-3 py-2">{avis}</div>}

      <section>
        <div className="font-semibold mb-1 flex items-center gap-1.5">
          Taux de cotisation et SMIG par date d’effet
          <Aide
            titre="Barèmes de paie datés"
            texte="Les taux CNSS, INPP et ONEM et le SMIG livrés par OmegaX viennent des textes lus et ne se modifient pas. Quand un texte change un taux, ou quand l'arrêté d'ajustement annuel du SMIG paraît (décret n° 25/21, art. 10 et 11), le cabinet ajoute une version datée avec le texte qui la fonde : elle s'applique aux paies à partir de son mois d'effet, et chaque calcul fait avec elle porte sa référence et la réserve qu'OmegaX n'a pas lu ce texte. Pour le SMIG, seul le taux journalier du manœuvre ordinaire se saisit · les dix-sept classes en sont tirées par la tension salariale du décret n° 25/22 (décret n° 25/21, art. 6). Une version vient toujours un mois après la dernière connue · en insérer une entre deux autres réécrirait le taux d'une période déjà payée. Le barème de l'IRPP reste celui de la loi lue. Une version ne se retire pas tant qu'un bulletin émis porte un mois qu'elle couvre."
            source="Règle d'OmegaX (Sage Paie tient ses barèmes en table) · décret n° 18/041, art. 10 et 11 · arrêtés INPP de 2006 et 2025 · arrêtés ONEM de 2018 et 2025 · décrets n° 25/21 et 25/22"
          />
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 w-[60px]">Barème</th>
              <th className="text-left px-2 py-1 w-[100px]">À partir du</th>
              <th className="text-left px-2 py-1">Taux</th>
              <th className="text-left px-2 py-1">Texte</th>
              <th className="text-left px-2 py-1 w-[90px]">Origine</th>
              <th className="px-2 py-1 w-[70px]" />
            </tr>
          </thead>
          <tbody>
            {donnees?.baremes.flatMap((b) => [
              ...donnees.livrees[b].map((v, i) => (
                <tr key={`${b}-l-${i}`}>
                  <td className="px-2 py-1">{b}</td>
                  <td className="px-2 py-1">{v.aPartirDu ?? 'non daté'}</td>
                  <td className="px-2 py-1">{resumeValeurs(b, v.valeurs)}</td>
                  <td className="px-2 py-1">{v.reference}</td>
                  <td className="px-2 py-1 text-text-dim">OmegaX</td>
                  <td />
                </tr>
              )),
              ...donnees.dossier
                .filter((v) => v.bareme === b)
                .map((v) => (
                  <tr key={v.id}>
                    <td className="px-2 py-1">{b}</td>
                    <td className="px-2 py-1">{v.aPartirDu}</td>
                    <td className="px-2 py-1">{resumeValeurs(b, v.valeurs)}</td>
                    <td className="px-2 py-1">{v.reference}</td>
                    <td className="px-2 py-1 font-semibold">Cabinet</td>
                    <td className="px-2 py-1 text-right">
                      {peutEcrire && (
                        <button type="button" className="text-danger hover:underline" onClick={() => retirer(v)}>
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
        {peutEcrire && (
          <form onSubmit={ajouter} className="flex flex-wrap gap-1.5 mt-2 items-center">
            <select aria-label="Barème" value={f.bareme} onChange={(e) => setF({ ...f, bareme: e.target.value as NomBareme })} className={champ}>
              <option value="ONEM">ONEM</option>
              <option value="INPP">INPP</option>
              <option value="CNSS">CNSS</option>
              <option value="SMIG">SMIG</option>
            </select>
            <input aria-label="Date d'effet" type="date" value={f.aPartirDu} onChange={(e) => setF({ ...f, aPartirDu: e.target.value })} className={champ} required />
            {f.bareme === 'ONEM' && saisie('onem', 'Taux %')}
            {f.bareme === 'SMIG' && saisie('smig', 'SMIG journalier FC', 'w-[140px]')}
            {f.bareme === 'CNSS' && (
              <>
                {saisie('pf', 'Familles %')}
                {saisie('pe', 'Pension empl. %', 'w-[100px]')}
                {saisie('pt', 'Pension trav. %', 'w-[100px]')}
                {saisie('rp', 'Risques %')}
              </>
            )}
            {f.bareme === 'INPP' && (
              <>
                {saisie('public', 'Public %')}
                <span>privé ≤</span>
                {saisie('t1', 'Effectif 1', 'w-[50px]')}
                {saisie('p1', 'Taux 1 %')}
                <span>≤</span>
                {saisie('t2', 'Effectif 2', 'w-[50px]')}
                {saisie('p2', 'Taux 2 %')}
                <span>au-delà</span>
                {saisie('p3', 'Taux 3 %')}
              </>
            )}
            <input
              aria-label="Texte qui fonde la version"
              placeholder="Texte (numéro, date, article)"
              value={f.reference}
              onChange={(e) => setF({ ...f, reference: e.target.value })}
              className={`${champ} w-[300px]`}
              required
            />
            <button type="submit" className="bg-sel text-white font-semibold px-3 py-1">
              Ajouter la version
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
