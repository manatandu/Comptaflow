import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';

/**
 * LES NOTES DES ÉTATS IFRS · item 15, tranche 5 (IFRS 18 § 113 à 132, IAS 8).
 *
 * Deux moitiés. Les NOTES, telles que le serveur les bâtit · numérotées dans
 * l'ordre du § B112 c, chacune avec les postes qu'elle concerne (§ 114), et
 * chaque manque écrit à sa place plutôt que tu. Et les DÉCLARATIONS, tout ce
 * qu'aucun livre ne porte · une question sans réponse reste « Non déclaré »,
 * jamais « non ».
 *
 * « REPRENDRE N-1 » COPIE DANS LE FORMULAIRE, IL N'ENREGISTRE RIEN. Une méthode
 * ou un jugement de l'an dernier peut ne plus valoir · la reprise se relit, puis
 * s'enregistre d'un clic distinct.
 */
type Bloc =
  | { type: 'texte'; texte: string; source?: 'DECLARE' | 'FICHE_DOSSIER' | 'CALCULE' | 'TEXTE_NORME' }
  | { type: 'manque'; texte: string }
  | { type: 'tableau'; titre?: string; colonnes: string[]; lignes: { libelle: string; valeurs: (number | string | null)[]; total?: boolean }[] };
type Note = { numero: number; cle: string; titre: string; ref: string; postes: string[]; blocs: Bloc[] };
type Element = { libelle: string; rubrique: string; montant: number | string; effetImpot: number | string | null; description: string | null };
type Mesure = {
  libelle: string;
  aspect: string;
  calcul: string;
  sousTotalReference: string;
  elements: Element[];
  methodeImpot: string | null;
  changement: string | null;
};
type Categorie = {
  intitule: string;
  autorisees: number | string | null;
  emisesLiberees: number | string | null;
  emisesNonLiberees: number | string | null;
  valeurNominale: number | string | null;
  sansValeurNominale: boolean;
  enCirculationOuverture: number | string | null;
  enCirculationCloture: number | string | null;
  droitsRestrictions: string | null;
  autoDetenues: number | string | null;
  reserveesOptions: string | null;
};
export type Declarations = {
  entite: Record<
    'domicile' | 'formeJuridique' | 'paysConstitution' | 'adresseSiege' | 'natureOperations' | 'societeMere' | 'societeMereUltime' | 'informationsDureeVie',
    string | null
  > & { sansSocieteMere: boolean | null; dureeVieLimitee: boolean | null };
  conformiteDeclaree: boolean | null;
  continuite: { retenue: boolean | null; incertitudesSignificatives: boolean | null; incertitudes: string | null; baseRetenue: string | null; raison: string | null };
  methodes: { intitule: string; texte: string }[];
  jugements: { intitule: string; texte: string }[];
  aucunJugement: boolean | null;
  estimations: { nature: string; rubrique: string; valeurComptable: number | string | null; informations: string | null }[];
  aucuneEstimation: boolean | null;
  aucuneMesurePerformance: boolean | null;
  mesuresPerformance: Mesure[];
  capital: {
    description: string | null;
    commentObjectifsAtteints: string | null;
    soumisExigencesExternes: boolean | null;
    natureExigences: string | null;
    exigencesRespectees: boolean | null;
    consequencesNonRespect: string | null;
    changements: string | null;
    quantitatif: { libelle: string; montantN: number | string; montantN1: number | string | null }[];
  };
  sansCapitalSocial: boolean | null;
  informationsEquivalentes: string | null;
  categoriesActions: Categorie[];
  reserves: Record<string, string>;
  dividendes: Record<'proposesNonComptabilises' | 'proposesParAction' | 'preferentielsCumulesNonComptabilises' | 'comptabilisesParAction', number | string | null>;
  impotOci: Record<string, number | string>;
};
export type NotesIfrsServies = {
  notes: Note[];
  renvois: Record<string, number[]>;
  motifsNonPubliable: string[];
  declarations: Declarations;
  declarationsN1: Declarations | null;
  sousTotauxReference: Record<string, string>;
};
type Rubrique = { code: string; libelle: string; etat: 'SITUATION' | 'RESULTAT' | 'RESULTAT_GLOBAL' };

const champ = 'w-full border border-border px-1.5 py-1 text-[11.5px]';
const fc = (v: number | string | null) =>
  v == null || v === '' ? '' : typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : v;
const tri = (v: boolean | null) => (v == null ? '' : v ? 'OUI' : 'NON');
const deTri = (v: string) => (v === '' ? null : v === 'OUI');
const SOURCES: Record<string, string> = { FICHE_DOSSIER: 'fiche du dossier', TEXTE_NORME: 'texte de la norme', CALCULE: 'calculé' };

function Question({ libelle, valeur, onChange, actif, oui = 'Oui', non = 'Non' }: { libelle: string; valeur: boolean | null; onChange: (v: boolean | null) => void; actif: boolean; oui?: string; non?: string }) {
  return (
    <label className="block text-[11.5px] mb-1">
      <span className="text-text-dim">{libelle}</span>
      <select className={champ} disabled={!actif} value={tri(valeur)} onChange={(e) => onChange(deTri(e.target.value))}>
        <option value="">Non déclaré</option>
        <option value="OUI">{oui}</option>
        <option value="NON">{non}</option>
      </select>
    </label>
  );
}

function Texte({ libelle, valeur, onChange, actif, lignes = 2 }: { libelle: string; valeur: string | null; onChange: (v: string) => void; actif: boolean; lignes?: number }) {
  return (
    <label className="block text-[11.5px] mb-1">
      <span className="text-text-dim">{libelle}</span>
      <textarea className={champ} rows={lignes} disabled={!actif} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Nombre({ libelle, valeur, onChange, actif }: { libelle: string; valeur: number | string | null; onChange: (v: string) => void; actif: boolean }) {
  return (
    <label className="block text-[11.5px] mb-1">
      <span className="text-text-dim">{libelle}</span>
      <input className={champ} inputMode="decimal" disabled={!actif} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Rendu({ note }: { note: Note }) {
  return (
    <div className="mb-3" id={`note-ifrs-${note.numero}`}>
      <p className="text-[11.5px] font-bold">
        Note {note.numero} · {note.titre} <span className="font-normal text-text-dim">({note.ref})</span>
      </p>
      {note.blocs.map((b, i) =>
        b.type === 'texte' ? (
          <p key={i} className="text-[11.5px] leading-[1.6]">
            {b.texte}
            {b.source && SOURCES[b.source] ? <span className="text-text-dim"> · {SOURCES[b.source]}</span> : null}
          </p>
        ) : b.type === 'manque' ? (
          <p key={i} className="text-[11.5px] text-warning leading-[1.6]">
            · {b.texte}
          </p>
        ) : (
          <div key={i} className="overflow-x-auto my-1">
            {b.titre && <p className="text-[11.5px] font-semibold">{b.titre}</p>}
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2" />
                  {b.colonnes.map((c) => (
                    <th key={c} className="py-1 pr-2 text-right">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.lignes.map((l, j) => (
                  <tr key={j} className={l.total ? 'font-bold border-t border-border' : 'border-b border-border/40'}>
                    <td className="py-1 pr-2">{l.libelle}</td>
                    {l.valeurs.map((v, k) => (
                      <td key={k} className="py-1 pr-2 text-right">
                        {fc(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}

export function NotesIfrs({
  notes,
  exerciceId,
  rubriques,
  apresEnregistrement,
  consolide = false,
}: {
  notes: NotesIfrsServies;
  exerciceId: string;
  rubriques: Rubrique[];
  apresEnregistrement: () => Promise<void>;
  /** Les notes des états consolidés · leurs déclarations se rangent à part de celles du dossier. */
  consolide?: boolean;
}) {
  const { peutEcrire } = useAuth();
  const [d, setD] = useState<Declarations>(notes.declarations);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => setD(notes.declarations), [notes.declarations]);

  const maj = (f: (x: Declarations) => void) =>
    setD((x) => {
      const copie = structuredClone(x);
      f(copie);
      return copie;
    });
  const texteOuNull = (v: string) => (v.trim() ? v : null);
  const rubriquesDe = (etat: Rubrique['etat']) => rubriques.filter((r) => r.etat === etat);

  async function enregistrer() {
    setErreur(null);
    setMessage(null);
    try {
      await api.put('/ifrs/notes', { exerciceId, contenu: d, ...(consolide ? { consolide: true } : {}) });
      await apresEnregistrement();
      setMessage('Notes enregistrées.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Les notes n’ont pas pu être enregistrées.');
    }
  }

  const liste = <T,>(xs: T[], rendu: (x: T, i: number) => JSX.Element, ajouter: () => void, libelleAjout: string) => (
    <div>
      {xs.map((x, i) => (
        <div key={i} className="border-l-2 border-border pl-2 mb-1.5">
          {rendu(x, i)}
        </div>
      ))}
      {peutEcrire && (
        <button type="button" className="text-[11px] underline" onClick={ajouter}>
          {libelleAjout}
        </button>
      )}
    </div>
  );
  const retirer = (f: (x: Declarations) => unknown[], i: number) =>
    peutEcrire && (
      <button type="button" className="text-[11px] underline" onClick={() => maj((x) => void f(x).splice(i, 1))}>
        Retirer
      </button>
    );

  const rubriquesReserves = rubriques.filter((r) => r.code === 'SF_RESERVES' || r.code === 'SF_AUTRES_COMPOSANTES_CP');

  return (
    <>
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          Notes (IFRS 18 § 113 à 132, IAS 8)
          <Aide
            titre="Notes des états IFRS"
            texte="Les notes d’IFRS 18 et d’IAS 8 sont servies · celles qu’exige chacune des autres normes appliquées (§ 113 b) ne le sont pas, et le jeu reste non publiable tant qu’elles ne sont pas jointes. La déclaration de conformité du § 6B n’est jamais imprimée sur un jeu non publiable. La colonne « Note » des états renvoie aux notes qui concernent chaque poste (§ 114)."
            source="IFRS 18 § 113 b, § 114 · IAS 8 § 6B"
          />
        </h2>
        {notes.notes.map((n) => (
          <Rendu key={n.cle} note={n} />
        ))}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Déclarations des notes de l’exercice</h2>
        {peutEcrire && notes.declarationsN1 && (
          <p className="text-[11.5px] mb-2">
            <button type="button" className="underline" onClick={() => setD(structuredClone(notes.declarationsN1!))}>
              Reprendre les déclarations de l’exercice précédent
            </button>{' '}
            <Aide
              titre="Reprise des déclarations"
              texte="Les déclarations de l’exercice précédent sont copiées dans le formulaire, à relire, puis à enregistrer."
              source="Notes IFRS · déclarations de l’exercice"
            />
          </p>
        )}

        <h3 className="text-[11.5px] font-bold mt-2">L’entité (§ 116)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          {(
            [
              ['domicile', 'Domicile (§ 116 a)'],
              ['formeJuridique', 'Forme juridique (§ 116 a)'],
              ['paysConstitution', 'Pays de constitution (§ 116 a)'],
              ['adresseSiege', 'Adresse du siège social (§ 116 a)'],
              ['natureOperations', 'Nature des opérations et principales activités (§ 116 b)'],
            ] as const
          ).map(([k, l]) => (
            <Texte key={k} libelle={`${l} · à défaut, la fiche du dossier`} lignes={1} actif={peutEcrire} valeur={d.entite[k]} onChange={(v) => maj((x) => void (x.entite[k] = texteOuNull(v)))} />
          ))}
          <Question libelle="L’entité a-t-elle une société mère ? (§ 116 c)" oui="Non, aucune" non="Oui" actif={peutEcrire} valeur={d.entite.sansSocieteMere} onChange={(v) => maj((x) => void (x.entite.sansSocieteMere = v))} />
          {d.entite.sansSocieteMere === false && (
            <>
              <Texte libelle="Société mère" lignes={1} actif={peutEcrire} valeur={d.entite.societeMere} onChange={(v) => maj((x) => void (x.entite.societeMere = texteOuNull(v)))} />
              <Texte libelle="Société mère ultime du groupe" lignes={1} actif={peutEcrire} valeur={d.entite.societeMereUltime} onChange={(v) => maj((x) => void (x.entite.societeMereUltime = texteOuNull(v)))} />
            </>
          )}
          <Question libelle="Entité à durée de vie limitée ? (§ 116 d)" actif={peutEcrire} valeur={d.entite.dureeVieLimitee} onChange={(v) => maj((x) => void (x.entite.dureeVieLimitee = v))} />
          {d.entite.dureeVieLimitee === true && (
            <Texte libelle="Informations sur sa durée de vie" actif={peutEcrire} valeur={d.entite.informationsDureeVie} onChange={(v) => maj((x) => void (x.entite.informationsDureeVie = texteOuNull(v)))} />
          )}
        </div>

        <h3 className="text-[11.5px] font-bold mt-2">Base d’établissement (IAS 8 § 6B, § 6K)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Question libelle="L’entité déclare-t-elle la conformité à toutes les dispositions des normes IFRS ? (§ 6B)" actif={peutEcrire} valeur={d.conformiteDeclaree} onChange={(v) => maj((x) => void (x.conformiteDeclaree = v))} />
          <Question libelle="La base de la continuité d’exploitation est-elle retenue ? (§ 6K)" actif={peutEcrire} valeur={d.continuite.retenue} onChange={(v) => maj((x) => void (x.continuite.retenue = v))} />
          {d.continuite.retenue === true && (
            <Question libelle="Existe-t-il des incertitudes significatives ? (§ 6K)" actif={peutEcrire} valeur={d.continuite.incertitudesSignificatives} onChange={(v) => maj((x) => void (x.continuite.incertitudesSignificatives = v))} />
          )}
          {d.continuite.retenue === true && d.continuite.incertitudesSignificatives === true && (
            <Texte libelle="Les incertitudes" actif={peutEcrire} valeur={d.continuite.incertitudes} onChange={(v) => maj((x) => void (x.continuite.incertitudes = texteOuNull(v)))} />
          )}
          {d.continuite.retenue === false && (
            <>
              <Texte libelle="Base sur laquelle les états sont établis" actif={peutEcrire} valeur={d.continuite.baseRetenue} onChange={(v) => maj((x) => void (x.continuite.baseRetenue = texteOuNull(v)))} />
              <Texte libelle="Raison pour laquelle la continuité n’est pas retenue" actif={peutEcrire} valeur={d.continuite.raison} onChange={(v) => maj((x) => void (x.continuite.raison = texteOuNull(v)))} />
            </>
          )}
        </div>

        <h3 className="text-[11.5px] font-bold mt-2 flex items-center gap-1.5">
          Méthodes comptables significatives (IAS 8 § 27A à 27F)
          <Aide
            titre="Méthodes comptables significatives"
            texte="Propres à l’entité · une formule qui ne fait que résumer la norme n’apprend rien au lecteur."
            source="IAS 8 § 27D"
          />
        </h3>
        {liste(
          d.methodes,
          (m, i) => (
            <>
              <Texte libelle="Intitulé" lignes={1} actif={peutEcrire} valeur={m.intitule} onChange={(v) => maj((x) => void (x.methodes[i].intitule = v))} />
              <Texte libelle="Méthode appliquée" lignes={3} actif={peutEcrire} valeur={m.texte} onChange={(v) => maj((x) => void (x.methodes[i].texte = v))} />
              {retirer((x) => x.methodes, i)}
            </>
          ),
          () => maj((x) => void x.methodes.push({ intitule: '', texte: '' })),
          'Ajouter une méthode',
        )}

        <h3 className="text-[11.5px] font-bold mt-2">Jugements (IAS 8 § 27G) et sources d’incertitude (§ 31A)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Question libelle="Aucun jugement significatif, hors estimations ?" oui="Aucun" non="Il y en a" actif={peutEcrire} valeur={d.aucunJugement} onChange={(v) => maj((x) => void (x.aucunJugement = v))} />
          <Question libelle="Aucune source majeure d’incertitude ?" oui="Aucune" non="Il y en a" actif={peutEcrire} valeur={d.aucuneEstimation} onChange={(v) => maj((x) => void (x.aucuneEstimation = v))} />
        </div>
        {d.aucunJugement !== true &&
          liste(
            d.jugements,
            (j, i) => (
              <>
                <Texte libelle="Jugement" lignes={1} actif={peutEcrire} valeur={j.intitule} onChange={(v) => maj((x) => void (x.jugements[i].intitule = v))} />
                <Texte libelle="Description" actif={peutEcrire} valeur={j.texte} onChange={(v) => maj((x) => void (x.jugements[i].texte = v))} />
                {retirer((x) => x.jugements, i)}
              </>
            ),
            () => maj((x) => void x.jugements.push({ intitule: '', texte: '' })),
            'Ajouter un jugement',
          )}
        {d.aucuneEstimation !== true &&
          liste(
            d.estimations,
            (s, i) => (
              <>
                <Texte libelle="Nature de l’incertitude (§ 31A a)" lignes={1} actif={peutEcrire} valeur={s.nature} onChange={(v) => maj((x) => void (x.estimations[i].nature = v))} />
                <label className="block text-[11.5px] mb-1">
                  <span className="text-text-dim">Poste qui porte l’actif ou le passif</span>
                  <select className={champ} disabled={!peutEcrire} value={s.rubrique} onChange={(e) => maj((x) => void (x.estimations[i].rubrique = e.target.value))}>
                    <option value="">Poste…</option>
                    {rubriquesDe('SITUATION').map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.libelle}
                      </option>
                    ))}
                  </select>
                </label>
                <Nombre libelle="Valeur comptable à la clôture (§ 31A b)" actif={peutEcrire} valeur={s.valeurComptable} onChange={(v) => maj((x) => void (x.estimations[i].valeurComptable = v))} />
                <Texte libelle="Hypothèses, sensibilité, fourchette (§ 31E)" actif={peutEcrire} valeur={s.informations} onChange={(v) => maj((x) => void (x.estimations[i].informations = texteOuNull(v)))} />
                {retirer((x) => x.estimations, i)}
              </>
            ),
            () => maj((x) => void x.estimations.push({ nature: '', rubrique: '', valeurComptable: null, informations: null })),
            'Ajouter une source d’incertitude',
          )}

        <h3 className="text-[11.5px] font-bold mt-2">Mesures de la performance définies par la direction (§ 117 à 125)</h3>
        <Question
          libelle="L’entité communique-t-elle, hors des états financiers, des sous-totaux de produits et de charges au sens du § 117 ?"
          oui="Aucun"
          non="Oui"
          actif={peutEcrire}
          valeur={d.aucuneMesurePerformance}
          onChange={(v) => maj((x) => void (x.aucuneMesurePerformance = v))}
        />
        {d.aucuneMesurePerformance !== true &&
          liste(
            d.mesuresPerformance,
            (m, i) => (
              <>
                <Texte libelle="Intitulé de la mesure (§ 123)" lignes={1} actif={peutEcrire} valeur={m.libelle} onChange={(v) => maj((x) => void (x.mesuresPerformance[i].libelle = v))} />
                <Texte libelle="Aspect de la performance communiqué, et pourquoi il est utile (§ 123 a)" actif={peutEcrire} valeur={m.aspect} onChange={(v) => maj((x) => void (x.mesuresPerformance[i].aspect = v))} />
                <Texte libelle="Mode de calcul (§ 123 b)" actif={peutEcrire} valeur={m.calcul} onChange={(v) => maj((x) => void (x.mesuresPerformance[i].calcul = v))} />
                <label className="block text-[11.5px] mb-1">
                  <span className="text-text-dim">Sous-total de référence du rapprochement (§ 123 c)</span>
                  <select className={champ} disabled={!peutEcrire} value={m.sousTotalReference} onChange={(e) => maj((x) => void (x.mesuresPerformance[i].sousTotalReference = e.target.value))}>
                    <option value="">Sous-total…</option>
                    {Object.entries(notes.sousTotauxReference).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                {m.elements.map((el, j) => (
                  <div key={j} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_110px_110px_auto] gap-1 mb-1">
                    <input className={champ} placeholder="Élément de rapprochement" disabled={!peutEcrire} value={el.libelle} onChange={(e) => maj((x) => void (x.mesuresPerformance[i].elements[j].libelle = e.target.value))} />
                    <select className={champ} disabled={!peutEcrire} value={el.rubrique} onChange={(e) => maj((x) => void (x.mesuresPerformance[i].elements[j].rubrique = e.target.value))}>
                      <option value="">Poste du compte de résultat…</option>
                      {rubriquesDe('RESULTAT').map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.libelle}
                        </option>
                      ))}
                    </select>
                    <input className={champ} placeholder="Montant" inputMode="decimal" disabled={!peutEcrire} value={el.montant ?? ''} onChange={(e) => maj((x) => void (x.mesuresPerformance[i].elements[j].montant = e.target.value))} />
                    <input className={champ} placeholder="Incidence fiscale" inputMode="decimal" disabled={!peutEcrire} value={el.effetImpot ?? ''} onChange={(e) => maj((x) => void (x.mesuresPerformance[i].elements[j].effetImpot = e.target.value))} />
                    {retirer((x) => x.mesuresPerformance[i].elements, j)}
                  </div>
                ))}
                {peutEcrire && (
                  <button
                    type="button"
                    className="text-[11px] underline mr-3"
                    onClick={() => maj((x) => void x.mesuresPerformance[i].elements.push({ libelle: '', rubrique: '', montant: '', effetImpot: null, description: null }))}
                  >
                    Ajouter un élément de rapprochement
                  </button>
                )}
                <Texte libelle="Détermination de l’incidence fiscale (§ 123 e, B141)" actif={peutEcrire} valeur={m.methodeImpot} onChange={(v) => maj((x) => void (x.mesuresPerformance[i].methodeImpot = texteOuNull(v)))} />
                <Texte libelle="Changement, ajout ou cessation, et comparatif impraticable le cas échéant (§ 124, § 125)" actif={peutEcrire} valeur={m.changement} onChange={(v) => maj((x) => void (x.mesuresPerformance[i].changement = texteOuNull(v)))} />
                {retirer((x) => x.mesuresPerformance, i)}
              </>
            ),
            () => maj((x) => void x.mesuresPerformance.push({ libelle: '', aspect: '', calcul: '', sousTotalReference: '', elements: [], methodeImpot: null, changement: null })),
            'Ajouter une mesure',
          )}

        <h3 className="text-[11.5px] font-bold mt-2">Gestion du capital (§ 126 à 129)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Texte libelle="Ce que l’entité gère comme capital (§ 127 a i)" actif={peutEcrire} valeur={d.capital.description} onChange={(v) => maj((x) => void (x.capital.description = texteOuNull(v)))} />
          <Texte libelle="Comment elle atteint ses objectifs (§ 127 a iii)" actif={peutEcrire} valeur={d.capital.commentObjectifsAtteints} onChange={(v) => maj((x) => void (x.capital.commentObjectifsAtteints = texteOuNull(v)))} />
          <Question libelle="Soumise à des exigences en matière de capital imposées de l’extérieur ? (§ 127 a ii)" actif={peutEcrire} valeur={d.capital.soumisExigencesExternes} onChange={(v) => maj((x) => void (x.capital.soumisExigencesExternes = v))} />
          {d.capital.soumisExigencesExternes === true && (
            <>
              <Texte libelle="Nature des exigences et intégration à la gestion du capital" actif={peutEcrire} valeur={d.capital.natureExigences} onChange={(v) => maj((x) => void (x.capital.natureExigences = texteOuNull(v)))} />
              <Question libelle="Ont-elles été respectées durant l’exercice ? (§ 127 d)" actif={peutEcrire} valeur={d.capital.exigencesRespectees} onChange={(v) => maj((x) => void (x.capital.exigencesRespectees = v))} />
              {d.capital.exigencesRespectees === false && (
                <Texte libelle="Conséquences du non-respect (§ 127 e)" actif={peutEcrire} valeur={d.capital.consequencesNonRespect} onChange={(v) => maj((x) => void (x.capital.consequencesNonRespect = texteOuNull(v)))} />
              )}
            </>
          )}
          <Texte libelle="Changements par rapport à l’exercice précédent (§ 127 c)" actif={peutEcrire} valeur={d.capital.changements} onChange={(v) => maj((x) => void (x.capital.changements = texteOuNull(v)))} />
        </div>
        {liste(
          d.capital.quantitatif,
          (q, i) => (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_auto] gap-1">
              <input className={champ} placeholder="Élément géré comme capital" disabled={!peutEcrire} value={q.libelle} onChange={(e) => maj((x) => void (x.capital.quantitatif[i].libelle = e.target.value))} />
              <input className={champ} placeholder="N" inputMode="decimal" disabled={!peutEcrire} value={q.montantN ?? ''} onChange={(e) => maj((x) => void (x.capital.quantitatif[i].montantN = e.target.value))} />
              <input className={champ} placeholder="N-1" inputMode="decimal" disabled={!peutEcrire} value={q.montantN1 ?? ''} onChange={(e) => maj((x) => void (x.capital.quantitatif[i].montantN1 = e.target.value))} />
              {retirer((x) => x.capital.quantitatif, i)}
            </div>
          ),
          () => maj((x) => void x.capital.quantitatif.push({ libelle: '', montantN: '', montantN1: null })),
          'Ajouter une donnée quantitative (§ 127 b)',
        )}

        <h3 className="text-[11.5px] font-bold mt-2">Capital et réserves (§ 130, § 131)</h3>
        <Question libelle="L’entité a-t-elle un capital social ?" oui="Non (§ 131)" non="Oui (§ 130 a)" actif={peutEcrire} valeur={d.sansCapitalSocial} onChange={(v) => maj((x) => void (x.sansCapitalSocial = v))} />
        {d.sansCapitalSocial === true && (
          <Texte libelle="Informations équivalentes · variations et droits de chaque catégorie de capitaux propres (§ 131)" actif={peutEcrire} valeur={d.informationsEquivalentes} onChange={(v) => maj((x) => void (x.informationsEquivalentes = texteOuNull(v)))} />
        )}
        {d.sansCapitalSocial === false &&
          liste(
            d.categoriesActions,
            (a, i) => (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-2">
                <Texte libelle="Catégorie" lignes={1} actif={peutEcrire} valeur={a.intitule} onChange={(v) => maj((x) => void (x.categoriesActions[i].intitule = v))} />
                {(
                  [
                    ['autorisees', 'Actions autorisées (i)'],
                    ['emisesLiberees', 'Émises et entièrement libérées (ii)'],
                    ['emisesNonLiberees', 'Émises, non entièrement libérées (ii)'],
                    ['valeurNominale', 'Valeur nominale (iii)'],
                    ['enCirculationOuverture', 'En circulation à l’ouverture (iv)'],
                    ['enCirculationCloture', 'En circulation à la clôture (iv)'],
                    ['autoDetenues', 'Détenues par l’entité ou ses filiales (vi)'],
                  ] as const
                ).map(([k, l]) => (
                  <Nombre key={k} libelle={l} actif={peutEcrire && !(k === 'valeurNominale' && a.sansValeurNominale)} valeur={a[k]} onChange={(v) => maj((x) => void (x.categoriesActions[i][k] = v))} />
                ))}
                <label className="text-[11.5px] flex items-center gap-1">
                  <input type="checkbox" disabled={!peutEcrire} checked={a.sansValeurNominale} onChange={(e) => maj((x) => void Object.assign(x.categoriesActions[i], { sansValeurNominale: e.target.checked, valeurNominale: null }))} />
                  Sans valeur nominale (iii)
                </label>
                <Texte libelle="Droits, privilèges et restrictions (v)" actif={peutEcrire} valeur={a.droitsRestrictions} onChange={(v) => maj((x) => void (x.categoriesActions[i].droitsRestrictions = texteOuNull(v)))} />
                <Texte libelle="Réservées pour options et contrats de vente (vii)" actif={peutEcrire} valeur={a.reserveesOptions} onChange={(v) => maj((x) => void (x.categoriesActions[i].reserveesOptions = texteOuNull(v)))} />
                {retirer((x) => x.categoriesActions, i)}
              </div>
            ),
            () =>
              maj(
                (x) =>
                  void x.categoriesActions.push({
                    intitule: '',
                    autorisees: null,
                    emisesLiberees: null,
                    emisesNonLiberees: null,
                    valeurNominale: null,
                    sansValeurNominale: false,
                    enCirculationOuverture: null,
                    enCirculationCloture: null,
                    droitsRestrictions: null,
                    autoDetenues: null,
                    reserveesOptions: null,
                  }),
              ),
            'Ajouter une catégorie d’actions',
          )}
        {rubriquesReserves.map((r) => (
          <Texte
            key={r.code}
            libelle={`${r.libelle} · nature et objet (§ 130 b)`}
            actif={peutEcrire}
            valeur={d.reserves[r.code] ?? null}
            onChange={(v) => maj((x) => void (v.trim() ? (x.reserves[r.code] = v) : delete x.reserves[r.code]))}
          />
        ))}

        <h3 className="text-[11.5px] font-bold mt-2">Dividendes (§ 110, § 132) · zéro est une réponse</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          {(
            [
              ['proposesNonComptabilises', 'Proposés ou déclarés, non comptabilisés (§ 132 a)'],
              ['proposesParAction', 'Montant par action correspondant (§ 132 a)'],
              ['preferentielsCumulesNonComptabilises', 'Préférentiels cumulés non comptabilisés (§ 132 b)'],
              ['comptabilisesParAction', 'Comptabilisés en distribution, par action (§ 110)'],
            ] as const
          ).map(([k, l]) => (
            <Nombre key={k} libelle={l} actif={peutEcrire} valeur={d.dividendes[k]} onChange={(v) => maj((x) => void (x.dividendes[k] = v))} />
          ))}
        </div>

        <h3 className="text-[11.5px] font-bold mt-2">Impôt relatif aux autres éléments du résultat global (§ 93)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          {rubriquesDe('RESULTAT_GLOBAL').map((r) => (
            <Nombre
              key={r.code}
              libelle={r.libelle}
              actif={peutEcrire}
              valeur={d.impotOci[r.code] ?? null}
              onChange={(v) => maj((x) => void (v.trim() ? (x.impotOci[r.code] = v) : delete x.impotOci[r.code]))}
            />
          ))}
        </div>

        {peutEcrire && (
          <button type="button" className="mt-2 border border-border px-3 py-1 text-[11.5px] font-semibold" onClick={() => void enregistrer()}>
            Enregistrer les déclarations
          </button>
        )}
        {message && <p className="text-[11.5px] text-success mt-1">{message}</p>}
        {erreur && <p className="text-[11.5px] text-danger mt-1">{erreur}</p>}
      </section>
    </>
  );
}
