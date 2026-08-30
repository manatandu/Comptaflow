import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type {
  Donation,
  ModeLiberation,
  NatureLiberalite,
  RapportConformiteRegistre,
  TypeDonateur,
} from '../lib/types';

/**
 * REGISTRE DES DONATEURS · articles 17, 18 et 24 de l'Acte uniforme SYCEBNL.
 *
 * Trois partis pris de cet écran, tous imposés par le texte et non par
 * l'ergonomie :
 *
 * 1. AUCUN bouton « Supprimer ». Le registre est « numéroté de façon
 *    continue » (art. 17) : effacer une ligne y ouvrirait un trou. Une
 *    erreur s'annule avec motif, en gardant son numéro · la ligne reste
 *    affichée, barrée. Le serveur n'expose d'ailleurs aucune route DELETE.
 * 2. Le numéro n'est PAS saisissable. Il est attribué par le serveur ; le
 *    proposer à la saisie inviterait à le choisir, donc à le trouer.
 * 3. Les mentions manquantes de l'article 17 sont SIGNALÉES, pas bloquantes.
 *    L'article 24 sanctionne le défaut de tenue du registre : refuser un don
 *    réel parce que l'adresse électronique du donateur est inconnue
 *    pousserait à ne l'inscrire nulle part, ce qui est l'infraction
 *    elle-même. On inscrit, puis le rapport de conformité (art. 18) dit
 *    ligne par ligne ce qui manque.
 */

const NATURES: { valeur: NatureLiberalite; libelle: string }[] = [
  { valeur: 'DON', libelle: 'Don' },
  { valeur: 'DONATION', libelle: 'Donation' },
  { valeur: 'LEGS', libelle: 'Legs' },
];

const MODES: { valeur: ModeLiberation; libelle: string }[] = [
  { valeur: 'ESPECES', libelle: 'Espèces' },
  { valeur: 'CHEQUE', libelle: 'Chèque' },
  { valeur: 'VIREMENT', libelle: 'Virement' },
  { valeur: 'NATURE', libelle: 'En nature' },
];

/** Libellés des champs, tels que l'article 17 les nomme. */
const LIBELLE_CHAMP: Record<string, string> = {
  nom: 'nom',
  prenoms: 'prénoms',
  domicile: 'domicile',
  denomination: 'dénomination',
  numeroImmatriculation: "numéro d'immatriculation",
  numeroIdentificationFiscale: "numéro d'identification fiscale",
  adresseSiegeSocial: 'adresse du siège social',
  adresseElectronique: 'adresse électronique',
};

type Formulaire = {
  dateOperation: string;
  nature: NatureLiberalite;
  typeDonateur: TypeDonateur;
  nom: string;
  prenoms: string;
  domicile: string;
  denomination: string;
  numeroImmatriculation: string;
  numeroIdentificationFiscale: string;
  adresseSiegeSocial: string;
  adresseElectronique: string;
  montant: string;
  modeLiberation: ModeLiberation;
  designationNature: string;
};

const FORMULAIRE_VIDE: Formulaire = {
  dateOperation: '',
  nature: 'DON',
  typeDonateur: 'PERSONNE_PHYSIQUE',
  nom: '',
  prenoms: '',
  domicile: '',
  denomination: '',
  numeroImmatriculation: '',
  numeroIdentificationFiscale: '',
  adresseSiegeSocial: '',
  adresseElectronique: '',
  montant: '',
  modeLiberation: 'VIREMENT',
  designationNature: '',
};

export function RegistreDonateursPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const peutTenir = utilisateur?.role === 'ADMIN_CABINET' || utilisateur?.role === 'COMPTABLE';

  const [lignes, setLignes] = useState<Donation[] | null>(null);
  const [rapport, setRapport] = useState<RapportConformiteRegistre | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<'registre' | 'conformite'>('registre');
  const [form, setForm] = useState<Formulaire>(FORMULAIRE_VIDE);
  const [formOuvert, setFormOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = () => {
    if (!exerciceCourant) return;
    api
      .get<Donation[]>(`/registre-donateurs?exerciceId=${exerciceCourant.id}`)
      .then(setLignes, (e) => setErreur(e instanceof Error ? e.message : String(e)));
    api
      .get<RapportConformiteRegistre>(`/registre-donateurs/rapport-conformite?exerciceId=${exerciceCourant.id}`)
      .then(setRapport, () => {});
  };

  useEffect(charger, [exerciceCourant?.id]);

  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (v: string) => new Date(v).toLocaleDateString('fr-FR');

  const physique = form.typeDonateur === 'PERSONNE_PHYSIQUE';

  const inscrire = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setEnCours(true);
    try {
      // Les champs de l'autre type de donateur sont OMIS, pas envoyés vides :
      // le serveur refuse un identifiant de personne morale sur une personne
      // physique (art. 17, points 2 et 3), et une chaîne vide y ressemblerait.
      const identite = physique
        ? { nom: form.nom, prenoms: form.prenoms || undefined, domicile: form.domicile || undefined }
        : {
            denomination: form.denomination,
            numeroImmatriculation: form.numeroImmatriculation || undefined,
            numeroIdentificationFiscale: form.numeroIdentificationFiscale || undefined,
            adresseSiegeSocial: form.adresseSiegeSocial || undefined,
          };
      await api.post('/registre-donateurs', {
        dateOperation: form.dateOperation,
        nature: form.nature,
        typeDonateur: form.typeDonateur,
        ...identite,
        adresseElectronique: form.adresseElectronique || undefined,
        montant: Number(form.montant),
        modeLiberation: form.modeLiberation,
        designationNature: form.designationNature || undefined,
      });
      setForm(FORMULAIRE_VIDE);
      setFormOuvert(false);
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Impossible d'inscrire cette libéralité");
    } finally {
      setEnCours(false);
    }
  };

  const signer = async (d: Donation) => {
    const signataire = window.prompt(
      'Art. 17 : « Toutes les écritures contenues dans ce registre doivent être signées par le représentant légal de l’entité à but non lucratif. »\n\nNom du représentant légal signataire :',
    );
    if (!signataire?.trim()) return;
    setErreur(null);
    try {
      await api.patch(`/registre-donateurs/${d.id}/signature`, { signeePar: signataire.trim() });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Impossible d’enregistrer la signature');
    }
  };

  const annuler = async (d: Donation) => {
    const motif = window.prompt(
      `Annulation de la ligne n° ${d.numero}.\n\nLa ligne CONSERVE son numéro et reste au registre : la numérotation doit rester continue (art. 17). Motif de l’annulation :`,
    );
    if (!motif?.trim()) return;
    setErreur(null);
    try {
      await api.patch(`/registre-donateurs/${d.id}/annulation`, { motifAnnulation: motif.trim() });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Impossible d’annuler cette ligne');
    }
  };

  const exporter = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(`/exports/registre-donateurs?exerciceId=${exerciceCourant.id}`, 'registre-donateurs.xlsx');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  const manquementsParLigne = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const l of rapport?.completude.lignesIncompletes ?? []) {
      m.set(l.numero, l.manquements.map((x) => LIBELLE_CHAMP[x.champ] ?? x.champ));
    }
    return m;
  }, [rapport]);

  const champ = (
    libelle: string,
    cle: keyof Formulaire,
    options?: { type?: string; requis?: boolean; large?: boolean },
  ) => (
    <label className={`flex flex-col gap-0.5 ${options?.large ? 'col-span-2' : ''}`}>
      <span className="text-[10px] font-bold text-text-dim">
        {libelle}
        {options?.requis && <span className="text-danger"> *</span>}
      </span>
      <input
        type={options?.type ?? 'text'}
        value={form[cle]}
        onChange={(e) => setForm((f) => ({ ...f, [cle]: e.target.value }))}
        className="border border-border-dark px-2 py-1 text-[11.5px]"
      />
    </label>
  );

  return (
    <div className="p-2">
      <EnteteImpression titre="Registre des donateurs" />
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-[9.5px] font-mono text-text-dim leading-none">TRAITEMENT</div>
          <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
            Registre des donateurs
            <Aide sujet="registreDonateurs" />
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[11px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          <button
            onClick={exporter}
            disabled={exportEnCours}
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter Excel'}
          </button>
        </div>
      </div>

      <p className="text-[10.5px] text-text-dim mb-2">
        Article 17 : « Il est établi pour chaque entité à but non lucratif un registre des donateurs pour tous les dons,
        donations et legs reçus par l’entité. » Sa tenue et sa mise à jour sont <strong>pénalement sanctionnées</strong>{' '}
        (art. 24). Une ligne erronée s’annule avec motif et conserve son numéro · la numérotation doit rester continue.
      </p>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[11.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[11px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="flex gap-0 mb-2.5 border-b border-border">
        {(
          [
            ['registre', 'REGISTRE'],
            ['conformite', 'CONFORMITÉ (ART. 18)'],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            onClick={() => setOnglet(cle)}
            className={`px-3.5 py-1.5 text-[11px] font-bold border border-b-0 ${
              onglet === cle ? 'bg-surface border-border' : 'bg-chrome border-transparent text-text-dim hover:bg-surface-alt'
            }`}
          >
            {libelle}
            {cle === 'conformite' && rapport && !estConforme(rapport) && <span className="text-danger"> ⚠</span>}
          </button>
        ))}
      </div>

      {onglet === 'registre' && (
        <>
          {peutTenir && (
            <div className="mb-2.5">
              {!formOuvert ? (
                <button
                  onClick={() => setFormOuvert(true)}
                  className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5"
                >
                  Inscrire une libéralité
                </button>
              ) : (
                <div className="border border-border bg-surface p-3">
                  <div className="text-[10px] font-bold text-text-dim mb-2">
                    NOUVELLE INSCRIPTION · le numéro d’ordre est attribué automatiquement (art. 17)
                  </div>
                  <div className="grid grid-cols-4 gap-2.5 mb-2.5">
                    {champ('Date de l’opération', 'dateOperation', { type: 'date', requis: true })}
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-text-dim">Nature</span>
                      <select
                        value={form.nature}
                        onChange={(e) => setForm((f) => ({ ...f, nature: e.target.value as NatureLiberalite }))}
                        className="border border-border-dark px-2 py-1 text-[11.5px]"
                      >
                        {NATURES.map((n) => (
                          <option key={n.valeur} value={n.valeur}>
                            {n.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-text-dim">Type de donateur</span>
                      <select
                        value={form.typeDonateur}
                        onChange={(e) => setForm((f) => ({ ...f, typeDonateur: e.target.value as TypeDonateur }))}
                        className="border border-border-dark px-2 py-1 text-[11.5px]"
                      >
                        <option value="PERSONNE_PHYSIQUE">Personne physique</option>
                        <option value="PERSONNE_MORALE">Personne morale</option>
                      </select>
                    </label>
                    {champ('Adresse électronique', 'adresseElectronique')}
                  </div>

                  {/* Art. 17 : deux jeux d'identifiants distincts · on n'affiche
                      que celui du type choisi, le serveur refusant le mélange. */}
                  <div className="grid grid-cols-4 gap-2.5 mb-2.5">
                    {physique ? (
                      <>
                        {champ('Nom', 'nom', { requis: true })}
                        {champ('Prénoms', 'prenoms')}
                        {champ('Domicile', 'domicile', { large: true })}
                      </>
                    ) : (
                      <>
                        {champ('Dénomination', 'denomination', { requis: true })}
                        {champ('N° d’immatriculation', 'numeroImmatriculation')}
                        {champ('N° d’identification fiscale', 'numeroIdentificationFiscale')}
                        {champ('Adresse du siège social', 'adresseSiegeSocial')}
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2.5 mb-2.5">
                    {champ('Montant', 'montant', { type: 'number', requis: true })}
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-text-dim">Mode de libération</span>
                      <select
                        value={form.modeLiberation}
                        onChange={(e) => setForm((f) => ({ ...f, modeLiberation: e.target.value as ModeLiberation }))}
                        className="border border-border-dark px-2 py-1 text-[11.5px]"
                      >
                        {MODES.map((m) => (
                          <option key={m.valeur} value={m.valeur}>
                            {m.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                    {form.modeLiberation === 'NATURE' &&
                      champ('Désignation du bien reçu', 'designationNature', { requis: true, large: true })}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={inscrire}
                      disabled={enCours || !form.dateOperation || !form.montant}
                      className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50"
                    >
                      {enCours ? 'Inscription…' : 'Inscrire'}
                    </button>
                    <button
                      onClick={() => {
                        setFormOuvert(false);
                        setForm(FORMULAIRE_VIDE);
                      }}
                      className="border border-border bg-surface text-[11px] px-3 py-1.5"
                    >
                      Annuler
                    </button>
                    <span className="text-[10px] text-text-dim italic">
                      Les mentions de l’article 17 laissées vides ne bloquent pas l’inscription : elles sont signalées
                      dans l’onglet Conformité.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border border-border bg-surface overflow-x-auto">
            <div className="grid grid-cols-[48px_86px_78px_1.4fr_110px_100px_1fr_150px] gap-2 px-3 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
              <span>N°</span>
              <span>DATE</span>
              <span>NATURE</span>
              <span>DONATEUR</span>
              <span className="text-right">MONTANT</span>
              <span>LIBÉRATION</span>
              <span>SIGNATURE (ART. 17)</span>
              <span />
            </div>

            {lignes?.length === 0 && (
              <div className="px-3 py-4 text-[12px] text-text-dim">Aucune libéralité inscrite sur cet exercice.</div>
            )}

            {lignes?.map((d) => {
              const manque = manquementsParLigne.get(d.numero) ?? [];
              return (
                <div
                  key={d.id}
                  className={`grid grid-cols-[48px_86px_78px_1.4fr_110px_100px_1fr_150px] gap-2 px-3 py-1.5 border-b border-border last:border-b-0 text-[11.5px] ${
                    d.annulee ? 'text-text-dim line-through bg-surface-alt' : ''
                  }`}
                  title={d.annulee ? `Annulée : ${d.motifAnnulation ?? ''}` : undefined}
                >
                  <span className="font-mono">{d.numero}</span>
                  <span className="font-mono">{date(d.dateOperation)}</span>
                  <span>{NATURES.find((n) => n.valeur === d.nature)?.libelle}</span>
                  <span className="truncate">
                    {d.typeDonateur === 'PERSONNE_PHYSIQUE'
                      ? [d.nom, d.prenoms].filter(Boolean).join(' ')
                      : d.denomination}
                    {manque.length > 0 && !d.annulee && (
                      <span className="text-danger italic" title={`Mentions manquantes (art. 17) : ${manque.join(', ')}`}>
                        {' '}
                        ⚠ {manque.length} mention{manque.length > 1 ? 's' : ''} manquante{manque.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-right">{montant(d.montant)}</span>
                  <span>{MODES.find((m) => m.valeur === d.modeLiberation)?.libelle}</span>
                  <span className="truncate">
                    {d.signeePar ? (
                      <>
                        {d.signeePar}{' '}
                        <span className="text-text-dim font-mono text-[10px]">{d.signeeLe ? date(d.signeeLe) : ''}</span>
                      </>
                    ) : d.annulee ? (
                      <span className="text-text-dim italic">·</span>
                    ) : (
                      <span className="text-danger italic">non signée</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 justify-end">
                    {peutTenir && !d.annulee && !d.signeePar && (
                      <button onClick={() => signer(d)} className="text-sel text-[10.5px] font-semibold hover:underline">
                        Signer
                      </button>
                    )}
                    {peutTenir && !d.annulee && (
                      <button onClick={() => annuler(d)} className="text-danger text-[10.5px] hover:underline">
                        Annuler
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {onglet === 'conformite' && rapport && <BlocConformite rapport={rapport} montant={montant} />}
      {onglet === 'conformite' && !rapport && (
        <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>
      )}
    </div>
  );
}

/** Les cinq constatations sont conformes · sert au marqueur d'onglet. */
function estConforme(r: RapportConformiteRegistre): boolean {
  return (
    r.numerotation.continue &&
    r.signature.lignesNonSignees.length === 0 &&
    r.completude.lignesIncompletes.length === 0 &&
    r.rapprochement.rapproche
  );
}

function BlocConformite({
  rapport,
  montant,
}: {
  rapport: RapportConformiteRegistre;
  montant: (v: number) => string;
}) {
  const r = rapport.rapprochement;
  const constat = (titre: string, ok: boolean, resultat: string, detail: string) => (
    <div className="border border-border bg-surface mb-2 px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-bold">{titre}</span>
        <span className={`text-[11px] font-bold ${ok ? 'text-positive' : 'text-danger'}`}>{resultat}</span>
      </div>
      <div className="text-[10.5px] text-text-dim mt-1 italic">{detail}</div>
    </div>
  );

  const n = rapport.numerotation;
  const blocComptes = (titre: string, comptes: typeof r.comptesLiberalite, attenue: boolean) => (
    <div className="mb-3">
      <div className="text-[10px] font-bold text-text-dim mb-1">{titre}</div>
      {comptes.map((c) => (
        <div
          key={c.numero}
          className={`grid grid-cols-[64px_1fr_92px_110px] gap-2 px-3 py-1 border-b border-border last:border-b-0 text-[11px] ${
            attenue ? 'text-text-dim' : ''
          }`}
          title={c.fondement}
        >
          <span className="font-mono">{c.numero}</span>
          <span className="truncate">{c.intitule}</span>
          <span className="font-mono text-[9.5px] text-text-dim">{c.lecture}</span>
          <span className="font-mono text-right">{montant(c.montant)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {constat(
        'Existence du registre',
        rapport.existence.registreOuvert,
        rapport.existence.registreOuvert ? 'OUI' : 'NON',
        `${rapport.existence.lignesTotalRegistre} ligne(s) au registre, dont ${rapport.existence.lignesSurExercice} sur l’exercice (${rapport.existence.lignesAnnuleesSurExercice} annulée(s)). Art. 18 : le rapport « constate l’existence du registre des donateurs ».`,
      )}
      {constat(
        'Numérotation continue',
        n.continue,
        n.continue ? 'CONFORME' : 'NON CONFORME',
        `${n.exigence} Numéros ${n.premier ?? ''} à ${n.dernier ?? ''}.` +
          (n.trous.length ? ` Trous : ${n.trous.join(', ')}.` : '') +
          (n.doublons.length ? ` Doublons : ${n.doublons.join(', ')}.` : ''),
      )}
      {constat(
        'Signature du représentant légal',
        rapport.signature.lignesNonSignees.length === 0,
        rapport.signature.lignesNonSignees.length === 0
          ? 'CONFORME'
          : `${rapport.signature.lignesNonSignees.length} non signée(s)`,
        rapport.signature.exigence +
          (rapport.signature.lignesNonSignees.length
            ? ` Lignes n° ${rapport.signature.lignesNonSignees.map((l) => l.numero).join(', ')}.`
            : ''),
      )}
      {constat(
        'Contenu obligatoire (art. 17, points 1 à 4)',
        rapport.completude.lignesIncompletes.length === 0,
        rapport.completude.lignesIncompletes.length === 0
          ? 'CONFORME'
          : `${rapport.completude.lignesIncompletes.length} ligne(s) incomplète(s)`,
        rapport.completude.lignesIncompletes.length === 0
          ? 'Toutes les mentions exigées sont renseignées.'
          : rapport.completude.lignesIncompletes
              .map((l) => `n° ${l.numero} : ${l.manquements.map((m) => LIBELLE_CHAMP[m.champ] ?? m.champ).join(', ')}`)
              .join(' ; '),
      )}

      <div className={`border px-3.5 py-2.5 mb-2 ${r.rapproche ? 'border-positive/40 bg-positive-soft' : 'border-danger/30 bg-danger-soft'}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-bold">Rapprochement avec la comptabilité</span>
          <span className={`text-[11px] font-bold ${r.rapproche ? 'text-positive' : 'text-danger'}`}>
            {r.rapproche ? 'RAPPROCHÉ' : `Écart de ${montant(r.ecart)}`}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-2 text-[11.5px]">
          <span>
            Total comptabilisé : <span className="font-mono font-bold">{montant(r.totalComptable)}</span>
          </span>
          <span>
            Total du registre : <span className="font-mono font-bold">{montant(r.totalRegistre)}</span>
          </span>
          <span>
            Écart : <span className="font-mono font-bold">{montant(r.ecart)}</span>
          </span>
        </div>
        <div className="text-[10.5px] mt-1.5 italic">{r.lecture}</div>
      </div>

      <div className="border border-border bg-surface px-3.5 py-3">
        {blocComptes('COMPTES DE LIBÉRALITÉ · rapprochés', r.comptesLiberalite, false)}
        {blocComptes('COMPTES FRONTIÈRE · chiffrés, non rapprochés (survolez pour le fondement)', r.comptesFrontiere, true)}
        {blocComptes('HORS PÉRIMÈTRE DE L’ARTICLE 17', r.comptesHorsPerimetre, true)}
        <div className="text-[10px] text-text-dim italic border-t border-border pt-2">{r.avertissement}</div>
      </div>

      <div className="text-[10.5px] text-text-dim italic mt-2.5 border border-border bg-surface-alt px-3.5 py-2">
        Ces constatations ne valent pas avis. Art. 18 : « S’il existe un auditeur, ce dernier soumet […] un rapport qui
        constate l’existence du registre des donateurs et donne son avis sur sa tenue conforme. S’il n’existe pas
        d’auditeur, une déclaration des dirigeants attestant de la tenue conforme du registre des donateurs est annexée
        audit rapport ou soumise à l’assemblée générale ou l’instance qui en tient lieu. »
      </div>
    </div>
  );
}
