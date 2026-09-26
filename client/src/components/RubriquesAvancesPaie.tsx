import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Aide } from './chrome/Aide';

export interface RubriquePaie {
  id: string;
  code: string;
  libelle: string;
  nature: string;
  fondement: string;
  actif: boolean;
}

export interface AvanceSalaire {
  id: string;
  salarieId: string;
  salarie: string;
  type: 'AVANCE' | 'ACOMPTE' | 'PRET';
  categoriePret: string | null;
  littera: string;
  compte: { compte: string; intitule: string };
  dateOctroi: string;
  montantFc: number;
  retenueMensuelleFc: number | null;
  objet: string;
  pieceJustificative: string;
  retenues: { montantFc: number; numero: number; moisDePaie: string; bulletinAnnule: boolean }[];
  soldeFc: number;
}

/** Les libellés des natures qu'une rubrique peut prendre · la liste vient du serveur. */
const LIBELLE_NATURE: Record<string, string> = {
  SALAIRE_OU_TRAITEMENT: 'Salaire ou traitement',
  COMMISSION: 'Commission',
  INDEMNITE_DE_VIE_CHERE: 'Indemnité de vie chère',
  PRIME: 'Prime',
  GRATIFICATION_OU_MOIS_COMPLEMENTAIRE: 'Gratification ou mois complémentaire',
  PRESTATION_SUPPLEMENTAIRE: 'Prestation supplémentaire',
  AVANTAGE_EN_NATURE: 'Avantage en nature',
  ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE: 'Allocation ou indemnité de congé',
  INDEMNITE_INCAPACITE_OU_ACCOUCHEMENT: "Indemnité d'incapacité ou d'accouchement",
};

const TYPE: Record<AvanceSalaire['type'], string> = { AVANCE: 'Avance', ACOMPTE: 'Acompte', PRET: 'Prêt' };
const fc = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nombre = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
const champ = 'border border-border bg-transparent px-1.5 py-0.5';

type SalarieMin = { id: string; nom: string; postNom?: string | null; prenoms?: string | null; actif?: boolean };

/**
 * RUBRIQUES DU CABINET ET REGISTRE DES AVANCES · onglet de la fenêtre
 * Personnel. Une rubrique NOMME un élément (une prime conventionnelle) et en
 * prend la nature ; elle ne décide jamais des assiettes ni du compte. Une
 * avance s'inscrit ici, se rembourse par les retenues des bulletins émis, et
 * son solde se calcule.
 */
export function OngletRubriquesAvances({ salaries, peutEcrire }: { salaries: SalarieMin[]; peutEcrire: boolean }) {
  const [rubriques, setRubriques] = useState<RubriquePaie[]>([]);
  const [natures, setNatures] = useState<string[]>([]);
  const [avances, setAvances] = useState<AvanceSalaire[]>([]);
  const [erreur, setErreur] = useState('');
  const [rubrique, setRubrique] = useState({ code: '', libelle: '', nature: 'PRIME', fondement: '' });
  const [avance, setAvance] = useState({
    salarieId: '',
    type: 'AVANCE' as AvanceSalaire['type'],
    categoriePret: '',
    dateOctroi: new Date().toISOString().slice(0, 10),
    montantFc: '',
    retenueMensuelleFc: '',
    objet: '',
    pieceJustificative: '',
  });

  const charger = useCallback(() => {
    api.get<{ rubriques: RubriquePaie[]; naturesPermises: string[] }>('/personnel/rubriques').then(
      (r) => {
        setRubriques(r.rubriques);
        setNatures(r.naturesPermises);
      },
      (e: ApiError) => setErreur(e.message),
    );
    api.get<AvanceSalaire[]>('/personnel/avances').then(setAvances, (e: ApiError) => setErreur(e.message));
  }, []);
  useEffect(charger, [charger]);

  const envoyer = async (fn: () => Promise<unknown>) => {
    setErreur('');
    try {
      await fn();
      charger();
      return true;
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Opération refusée');
      return false;
    }
  };

  const creerRubrique = async (e: FormEvent) => {
    e.preventDefault();
    if (await envoyer(() => api.post('/personnel/rubriques', rubrique))) {
      setRubrique({ code: '', libelle: '', nature: 'PRIME', fondement: '' });
    }
  };

  const creerAvance = async (e: FormEvent) => {
    e.preventDefault();
    const corps = {
      type: avance.type,
      ...(avance.type === 'PRET' && avance.categoriePret ? { categoriePret: avance.categoriePret } : {}),
      dateOctroi: avance.dateOctroi,
      montantFc: nombre(avance.montantFc),
      ...(avance.retenueMensuelleFc.trim() ? { retenueMensuelleFc: nombre(avance.retenueMensuelleFc) } : {}),
      objet: avance.objet,
      pieceJustificative: avance.pieceJustificative,
    };
    if (await envoyer(() => api.post(`/personnel/salaries/${avance.salarieId}/avances`, corps))) {
      setAvance((a) => ({ ...a, montantFc: '', retenueMensuelleFc: '', objet: '', pieceJustificative: '' }));
    }
  };

  return (
    <div className="ecran-seul max-w-[1240px] text-[11.5px] space-y-4">
      {erreur && <div className="border border-danger/30 bg-danger-soft text-danger px-3 py-2">{erreur}</div>}

      <section>
        <div className="font-semibold mb-1 flex items-center gap-1.5">
          Rubriques du cabinet
          <Aide
            titre="Rubriques de paie du cabinet"
            texte="Une rubrique nomme une prime ou une indemnité propre à l'entreprise (prime conventionnelle, d'ancienneté, de rendement) et en prend la nature. C'est la nature qui décide des deux assiettes et du compte de charge : une prime est de la rémunération (Code du travail, art. 7, point 8) et elle est imposable (loi n° 23/053, art. 68). Les cinq exclusions de l'article 7 ne sont pas proposées · une indemnité de transport ou de logement se saisit avec la nature du catalogue, qui porte ses conditions. Le code et la nature ne changent plus après création."
            source="Code du travail, art. 7, point 8 · loi n° 23/053, art. 68 et 69 · règle d'OmegaX"
          />
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 w-[90px]">Code</th>
              <th className="text-left px-2 py-1">Libellé</th>
              <th className="text-left px-2 py-1">Nature</th>
              <th className="text-left px-2 py-1">Fondement</th>
              <th className="px-2 py-1 w-[100px]" />
            </tr>
          </thead>
          <tbody>
            {rubriques.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-1 text-text-dim">
                  Aucune rubrique.
                </td>
              </tr>
            )}
            {rubriques.map((r) => (
              <tr key={r.id} className={r.actif ? '' : 'text-text-dim'}>
                <td className="px-2 py-1">{r.code}</td>
                <td className="px-2 py-1">{r.libelle}</td>
                <td className="px-2 py-1">{LIBELLE_NATURE[r.nature] ?? r.nature}</td>
                <td className="px-2 py-1">{r.fondement}</td>
                <td className="px-2 py-1 text-right">
                  {peutEcrire && (
                    <button
                      type="button"
                      className="text-sel hover:underline"
                      onClick={() => envoyer(() => api.patch(`/personnel/rubriques/${r.id}`, { actif: !r.actif }))}
                    >
                      {r.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {peutEcrire && (
          <form onSubmit={creerRubrique} className="flex flex-wrap gap-1.5 mt-2 items-center">
            <input aria-label="Code de la rubrique" placeholder="Code" value={rubrique.code} onChange={(e) => setRubrique({ ...rubrique, code: e.target.value })} className={`${champ} w-[90px]`} />
            <input aria-label="Libellé de la rubrique" placeholder="Libellé" value={rubrique.libelle} onChange={(e) => setRubrique({ ...rubrique, libelle: e.target.value })} className={`${champ} w-[200px]`} />
            <select aria-label="Nature de la rubrique" value={rubrique.nature} onChange={(e) => setRubrique({ ...rubrique, nature: e.target.value })} className={champ}>
              {natures.map((n) => (
                <option key={n} value={n}>
                  {LIBELLE_NATURE[n] ?? n}
                </option>
              ))}
            </select>
            <input
              aria-label="Fondement de la rubrique"
              placeholder="Fondement (convention collective, contrat…)"
              value={rubrique.fondement}
              onChange={(e) => setRubrique({ ...rubrique, fondement: e.target.value })}
              className={`${champ} w-[280px]`}
            />
            <button type="submit" className="bg-sel text-white font-semibold px-3 py-1">
              Créer la rubrique
            </button>
          </form>
        )}
      </section>

      <section>
        <div className="font-semibold mb-1 flex items-center gap-1.5">
          Avances, acomptes et prêts au personnel
          <Aide
            titre="Avances et prêts au personnel"
            texte="Le registre tient ce qui a été consenti ; le versement lui-même s'enregistre au journal de trésorerie (D/4211 ou 4212 pour une avance ou un acompte, D/272 pour un prêt, les deux plans excluant les prêts du compte 42). Le remboursement se fait par les retenues des bulletins émis, qui créditent le même compte par le débit du 422. Le solde se calcule ; une retenue d'un bulletin annulé ne compte plus. Une avance ne se supprime que tant qu'aucun bulletin n'y a retenu."
            source="Code du travail, art. 112, c) et f) · fiche du compte 42 (AUDCIF, SYCEBNL) · Guide SYSCOHADA, Partie 1 ch. 3, § 4.3"
          />
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left px-2 py-1">Salarié</th>
              <th className="text-left px-2 py-1">Nature</th>
              <th className="text-left px-2 py-1">Objet et pièce</th>
              <th className="text-left px-2 py-1 w-[80px]">Compte</th>
              <th className="text-right px-2 py-1 w-[110px]">Consenti</th>
              <th className="text-right px-2 py-1 w-[110px]">Solde dû</th>
              <th className="px-2 py-1 w-[80px]" />
            </tr>
          </thead>
          <tbody>
            {avances.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-1 text-text-dim">
                  Aucune avance.
                </td>
              </tr>
            )}
            {avances.map((a) => (
              <tr key={a.id}>
                <td className="px-2 py-1">{a.salarie}</td>
                <td className="px-2 py-1">
                  {TYPE[a.type]} du {a.dateOctroi.slice(0, 10)} · art. 112, {a.littera})
                </td>
                <td className="px-2 py-1">
                  {a.objet} <span className="text-text-dim">· {a.pieceJustificative}</span>
                  {a.retenues.length > 0 && (
                    <div className="text-[11px] text-text-dim">
                      {a.retenues
                        .map((r) => `n° ${r.numero} (${r.moisDePaie}) ${fc(r.montantFc)}${r.bulletinAnnule ? ' annulé' : ''}`)
                        .join(' · ')}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1">{a.compte.compte}</td>
                <td className="px-2 py-1 text-right">{fc(a.montantFc)}</td>
                <td className="px-2 py-1 text-right font-semibold">{fc(a.soldeFc)}</td>
                <td className="px-2 py-1 text-right">
                  {peutEcrire && a.retenues.length === 0 && (
                    <button
                      type="button"
                      className="text-danger hover:underline"
                      onClick={() => window.confirm('Retirer cette avance du registre ?') && envoyer(() => api.delete(`/personnel/avances/${a.id}`))}
                    >
                      Retirer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {peutEcrire && (
          <form onSubmit={creerAvance} className="flex flex-wrap gap-1.5 mt-2 items-center">
            <select aria-label="Salarié" value={avance.salarieId} onChange={(e) => setAvance({ ...avance, salarieId: e.target.value })} className={champ} required>
              <option value="">Salarié…</option>
              {salaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {[s.nom, s.postNom, s.prenoms].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
            <select aria-label="Nature de l'avance" value={avance.type} onChange={(e) => setAvance({ ...avance, type: e.target.value as AvanceSalaire['type'] })} className={champ}>
              <option value="AVANCE">Avance</option>
              <option value="ACOMPTE">Acompte</option>
              <option value="PRET">Prêt</option>
            </select>
            {avance.type === 'PRET' && (
              <select aria-label="Catégorie du prêt" value={avance.categoriePret} onChange={(e) => setAvance({ ...avance, categoriePret: e.target.value })} className={champ}>
                <option value="">Catégorie…</option>
                <option value="IMMOBILIER">Immobilier (2721)</option>
                <option value="MOBILIER_ET_INSTALLATION">Mobilier et d’installation (2722)</option>
                <option value="AUTRE">Autre (2728)</option>
              </select>
            )}
            <input aria-label="Date d'octroi" type="date" value={avance.dateOctroi} onChange={(e) => setAvance({ ...avance, dateOctroi: e.target.value })} className={champ} />
            <input aria-label="Montant consenti" placeholder="Montant FC" value={avance.montantFc} onChange={(e) => setAvance({ ...avance, montantFc: e.target.value })} className={`${champ} w-[110px] text-right`} />
            <input aria-label="Retenue mensuelle proposée" placeholder="Retenue / mois" value={avance.retenueMensuelleFc} onChange={(e) => setAvance({ ...avance, retenueMensuelleFc: e.target.value })} className={`${champ} w-[110px] text-right`} />
            <input aria-label="Objet" placeholder="Objet" value={avance.objet} onChange={(e) => setAvance({ ...avance, objet: e.target.value })} className={`${champ} w-[160px]`} />
            <input
              aria-label="Pièce justificative"
              placeholder="Reconnaissance de dette, contrat de prêt"
              value={avance.pieceJustificative}
              onChange={(e) => setAvance({ ...avance, pieceJustificative: e.target.value })}
              className={`${champ} w-[240px]`}
            />
            <button type="submit" className="bg-sel text-white font-semibold px-3 py-1">
              Inscrire
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
