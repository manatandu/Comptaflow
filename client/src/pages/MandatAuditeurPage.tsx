import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * MANDAT DU CONTRÔLEUR DES COMPTES · auditeur au SYCEBNL, commissaire aux
 * comptes à l'AUSCGIE.
 *
 * L'écran existe parce que le contrôle 6 réclamait déjà de « vérifier que le
 * mandat est en cours » sans qu'aucune table ne le détienne. Il enregistre un
 * acte qui a eu lieu devant une assemblée · il ne désigne personne.
 *
 * LA DURÉE EST PROPOSÉE AVANT LA SAISIE, par la même fonction que le serveur
 * oppose au refus. Deux calculs auraient divergé, et le cabinet aurait
 * découvert le refus après le clic · c'est ce que la longueur de compte a déjà
 * appris.
 */
type Mandat = {
  id: string;
  nom: string;
  inscriptionOrdre: string;
  organeDesignation: string;
  dateDesignation: string;
  premierExercice: number;
  nombreExercices: number;
  dernierExerciceCouvert: number;
  rang: number;
  refusDeProrogation: boolean;
  finAnticipeeLe: string | null;
  motifFin: string | null;
};

type Duree = {
  exercices: number | null;
  mandatsMaximum: number | null;
  source: string;
  ramenee: boolean;
  exercicesDeLEntite: number;
};

const ORGANES: { valeur: string; libelle: string }[] = [
  { valeur: 'ASSEMBLEE_GENERALE_ORDINAIRE', libelle: 'Assemblée générale ordinaire' },
  { valeur: 'STATUTS_OU_AG_CONSTITUTIVE', libelle: 'Statuts ou assemblée générale constitutive' },
  { valeur: 'ASSOCIES', libelle: 'Associés (SARL)' },
  { valeur: 'BAILLEUR_OU_ETAT', libelle: 'Bailleur de fonds ou État bénéficiaire' },
  { valeur: 'JURIDICTION', libelle: 'Juridiction compétente' },
];

export function MandatAuditeurPage() {
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [duree, setDuree] = useState<Duree | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [organe, setOrgane] = useState(ORGANES[0].valeur);
  const [nom, setNom] = useState('');
  const [inscription, setInscription] = useState('');
  const [dateDesignation, setDateDesignation] = useState('');
  const [premierExercice, setPremierExercice] = useState(new Date().getFullYear());
  const [nombreExercices, setNombreExercices] = useState(3);

  const recharger = () =>
    api.get<{ mandats: Mandat[] }>('/mandat-auditeur').then((r) => setMandats(r.mandats));

  useEffect(() => {
    void recharger();
  }, []);

  useEffect(() => {
    api
      .get<Duree>(`/mandat-auditeur/duree?organe=${organe}`)
      .then((d) => {
        setDuree(d);
        // La durée du texte est PROPOSÉE, pas imposée à l'écran · pour les
        // formes qu'aucun article ne chiffre, elle vaut null et la saisie reste
        // la seule source.
        if (d.exercices !== null) setNombreExercices(d.exercices);
      })
      .catch(() => setDuree(null));
  }, [organe]);

  async function enregistrer() {
    setErreur(null);
    try {
      await api.post('/mandat-auditeur', {
        nom,
        inscriptionOrdre: inscription,
        organeDesignation: organe,
        dateDesignation,
        premierExercice: Number(premierExercice),
        nombreExercices: Number(nombreExercices),
        rang: mandats.filter((m) => m.nom.trim() === nom.trim()).length + 1,
      });
      setNom('');
      setInscription('');
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'enregistrement n'a pas abouti.");
    }
  }

  return (
    <div className="p-2 max-w-[980px]">
      <p className="text-[10.5px] text-text-dim mb-2.5 leading-[1.6]">
        Le mandat du contrôleur des comptes · <strong>auditeur</strong> au SYCEBNL (art. 19 à 22),
        <strong> commissaire aux comptes</strong> à l'AUSCGIE (art. 379, 703 à 705). OmegaX
        enregistre un acte qui a eu lieu devant une assemblée : il ne désigne personne et ne
        proroge rien de lui-même.
      </p>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Enregistrer un mandat</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[10.5px]">
            Contrôleur ou cabinet
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            Inscription au tableau de l'ordre
            <input
              className="w-full border border-border px-1.5 py-1 text-[10.5px]"
              value={inscription}
              onChange={(e) => setInscription(e.target.value)}
              placeholder="ONEC/EC/…"
            />
          </label>
          <label className="text-[10.5px]">
            Organe qui a désigné
            <select className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={organe} onChange={(e) => setOrgane(e.target.value)}>
              {ORGANES.map((o) => (
                <option key={o.valeur} value={o.valeur}>
                  {o.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10.5px]">
            Date de désignation
            <input type="date" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={dateDesignation} onChange={(e) => setDateDesignation(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            Premier exercice couvert
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={premierExercice} onChange={(e) => setPremierExercice(Number(e.target.value))} />
          </label>
          <label className="text-[10.5px]">
            Nombre d'exercices
            <input
              type="number"
              className="w-full border border-border px-1.5 py-1 text-[10.5px]"
              value={nombreExercices}
              onChange={(e) => setNombreExercices(Number(e.target.value))}
              disabled={duree?.exercices !== null && duree?.exercices !== undefined}
            />
          </label>
        </div>

        {duree && (
          <p className="text-[10px] text-text-dim mt-2 leading-[1.6]">
            {duree.exercices === null ? (
              <>Aucune durée n'est chiffrée pour cette forme · {duree.source} Elle se saisit.</>
            ) : (
              <>
                Durée : <strong>{duree.exercices} exercice(s)</strong> · {duree.source}.
                {duree.ramenee && (
                  <>
                    {' '}Ramenée à la durée d'existence de l'entité ({duree.exercicesDeLEntite} exercice(s) au
                    dossier) · SYCEBNL art. 21, seconde phrase.
                  </>
                )}
                {duree.mandatsMaximum !== null && (
                  <> Renouvelable {duree.mandatsMaximum - 1} fois, pas davantage.</>
                )}
              </>
            )}
          </p>
        )}

        <p className="text-[10px] text-text-dim mt-1.5 leading-[1.6]">
          La référence d'inscription est <strong>exigée et jamais vérifiée</strong> · le SYCEBNL
          art. 20 veut un expert-comptable inscrit au tableau de l'ordre, mais OmegaX ne consulte
          aucun tableau. Il conserve la référence, parce que c'est elle qu'un réviseur demandera.
        </p>

        {erreur && <p className="text-[10.5px] text-danger mt-2">{erreur}</p>}
        <button className="mt-2 border border-border px-2.5 py-1 text-[10.5px]" onClick={() => void enregistrer()}>
          Enregistrer
        </button>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Mandats enregistrés</h2>
        {mandats.length === 0 ? (
          <p className="text-[10.5px] text-text-dim">Aucun mandat enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Contrôleur</th>
                  <th className="py-1 pr-2">Inscription</th>
                  <th className="py-1 pr-2">Désigné le</th>
                  <th className="py-1 pr-2">Exercices couverts</th>
                  <th className="py-1 pr-2">Rang</th>
                  <th className="py-1">État</th>
                </tr>
              </thead>
              <tbody>
                {mandats.map((m) => (
                  <tr key={m.id} className="border-b border-border/60">
                    <td className="py-1 pr-2">{m.nom}</td>
                    <td className="py-1 pr-2">{m.inscriptionOrdre}</td>
                    <td className="py-1 pr-2">{m.dateDesignation.slice(0, 10)}</td>
                    <td className="py-1 pr-2">
                      {m.premierExercice} à {m.dernierExerciceCouvert}
                    </td>
                    <td className="py-1 pr-2">{m.rang}</td>
                    <td className="py-1">
                      {m.finAnticipeeLe
                        ? `Clos le ${m.finAnticipeeLe.slice(0, 10)} · ${m.motifFin ?? ''}`
                        : m.refusDeProrogation
                          ? 'Prorogation refusée'
                          : 'En cours'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-text-dim mt-2 leading-[1.6]">
          Un mandat dont le dernier exercice est passé <strong>n'est pas un trou</strong> · le
          SYCEBNL art. 22 proroge la mission de plein droit « sauf refus exprès » du contrôleur,
          jusqu'à la prochaine assemblée statuant sur les comptes. Seul ce refus laisse l'entité
          sans contrôleur, et c'est lui que la colonne « État » enregistre.
        </p>
      </section>
    </div>
  );
}
