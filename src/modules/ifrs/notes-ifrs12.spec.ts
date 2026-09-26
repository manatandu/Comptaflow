import { ResultatEntite } from '../consolidation/perimetre-consolidation';
import { construireNoteIfrs12, DeclarationsIfrs12, EntreesIfrs12, normaliserDeclarationsIfrs12 } from './notes-ifrs12';

/**
 * La note IFRS 12 sur un périmètre chiffré à la main · une mère, une filiale
 * à 80 % d'intérêt et 90 % de contrôle, une filiale à 100 % (sans minoritaires), une entreprise associée à 30 %, une
 * coentreprise en intégration proportionnelle. Minoritaires de l'état
 * consolidé · résultat 40, cumul 130.
 */
const E = (x: Partial<ResultatEntite> & { nom: string }): ResultatEntite => ({
  id: x.nom,
  estConsolidante: false,
  pctControle: 100,
  pctInteret: 100,
  natureControle: 'EXCLUSIF_DE_DROIT',
  methode: 'IG',
  fondement: 'art. 78',
  aJustifierEnNotes: [],
  exclusion: null,
  dateCloture: null,
  ...x,
});
const ENTITES = [
  E({ nom: 'Mère', estConsolidante: true }),
  E({ nom: 'Filiale', pctControle: 90, pctInteret: 80 }),
  E({ nom: 'Filiale à 100 %' }),
  E({ nom: 'Associée', pctControle: 30, pctInteret: 30, methode: 'ME', natureControle: 'INFLUENCE_NOTABLE' }),
  E({ nom: 'Coentreprise', pctControle: 50, pctInteret: 50, methode: 'IP', natureControle: 'CONJOINT' }),
];
const COMPLETES = (): DeclarationsIfrs12 =>
  normaliserDeclarationsIfrs12({
    jugements: 'Contrôle exclusif de droit sur la filiale ; influence notable sur l’associée.',
    restrictions: 'Aucune.',
    entitesStructurees: false,
    filiales: { Filiale: { etablissement: 'Lubumbashi', resultatMinoritaires: 40, cumulMinoritaires: 130, dividendesMinoritaires: 15 } },
    partenaires: {
      Associée: { etablissement: 'Kinshasa', natureRelation: 'Distributeur', dividendesRecus: 30 },
      Coentreprise: { etablissement: 'Matadi', natureRelation: 'Terminal portuaire', typePartenariat: 'ENTREPRISE_COMMUNE', dividendesRecus: 0 },
    },
  });
const base = (d = COMPLETES()): EntreesIfrs12 => ({ entites: ENTITES, declarations: d, totaux: { resultatMinoritaires: 40, cumulMinoritaires: 130 }, variationsPartsInterets: [] });
const tableau = (r: ReturnType<typeof construireNoteIfrs12>, prefixe: string) =>
  r.note.blocs.find((b) => b.type === 'tableau' && b.titre?.startsWith(prefixe)) as Extract<ReturnType<typeof construireNoteIfrs12>['note']['blocs'][number], { type: 'tableau' }>;

describe('note IFRS 12 · intérêts détenus dans d’autres entités', () => {
  it('§ 10 a i · la composition du groupe vient du périmètre, entités exclues comprises', () => {
    const r = construireNoteIfrs12(base());
    expect(tableau(r, 'Composition du groupe').lignes.map((l) => l.libelle)).toEqual(['Mère (société mère)', 'Filiale', 'Filiale à 100 %', 'Associée', 'Coentreprise']);
  });

  it('§ 12 · la filiale à minoritaires, avec les pourcentages hors groupe calculés et le reste déclaré', () => {
    const r = construireNoteIfrs12(base());
    expect(tableau(r, 'Filiales dont').lignes).toEqual([{ libelle: 'Filiale', valeurs: ['Lubumbashi', 20, 10, 40, 130, 15] }]);
    // Seules restent les informations financières résumées, non servies.
    expect(r.motifs).toEqual(['Notes · IFRS 12 · informations financières résumées des filiales à minoritaires non servies (B10 b).', 'Notes · IFRS 12 · informations financières résumées des partenariats et entreprises associées non servies (B12 b, § 21 c).']);
  });

  it('la ventilation déclarée doit rendre les totaux des minoritaires de l’état consolidé', () => {
    const d = COMPLETES();
    d.filiales.Filiale.resultatMinoritaires = 35;
    expect(construireNoteIfrs12(base(d)).motifs.join(' ')).toContain('diffère de -5 de celui de l’état consolidé (40)');
    d.filiales.Filiale.resultatMinoritaires = 40;
    d.filiales.Filiale.cumulMinoritaires = 100;
    expect(construireNoteIfrs12(base(d)).motifs.join(' ')).toContain('le cumul des minoritaires, filiale par filiale, diffère de -30');
  });

  it('une déclaration manquante se nomme, jamais ne vaut zéro', () => {
    const r = construireNoteIfrs12(base(normaliserDeclarationsIfrs12({})));
    const m = r.motifs.join(' ');
    expect(m).toContain('hypothèses et jugements importants non déclarés (§ 7 à 9)');
    expect(m).toContain('Filiale · établissement principal (§ 12 b), résultat attribué aux minoritaires (§ 12 e)');
    expect(m).toContain('Coentreprise · établissement principal (§ 21 a iii), nature de la relation (§ 21 a ii), dividendes reçus (B12 a), type de partenariat (§ 7 c, IFRS 11 § 14)');
    expect(m).toContain('restrictions importantes non déclarées');
    expect(m).toContain('entités structurées · question non répondue');
    // Rien d'incomplet n'est confronté aux totaux.
    expect(m).not.toContain('diffère de');
  });

  it('IFRS 11 § 24 · une coentreprise en intégration proportionnelle est à retraiter', () => {
    const d = COMPLETES();
    d.partenaires.Coentreprise.typePartenariat = 'COENTREPRISE';
    expect(construireNoteIfrs12(base(d)).motifs.join(' ')).toContain('IFRS 11 § 24 · Coentreprise est déclarée coentreprise');
  });

  it('§ 11 · une date de clôture différente se dit, et sa raison se déclare', () => {
    const e = [...ENTITES];
    e[1] = { ...e[1], dateCloture: { ecartMois: 3, verdict: 'DEROGATION_POSSIBLE', message: 'Clôture au 30 septembre' } };
    const r = construireNoteIfrs12({ ...base(), entites: e });
    expect(r.note.blocs.some((b) => b.type === 'texte' && b.texte === 'Filiale · Clôture au 30 septembre')).toBe(true);
    expect(r.motifs.join(' ')).toContain('raison des dates de clôture différentes non déclarée');
  });

  it('§ 18 · les variations de parts d’intérêts ont leur tableau', () => {
    const r = construireNoteIfrs12({ ...base(), variationsPartsInterets: [{ libelle: 'Rachat de 5 %', groupe: -4, minoritaires: -20 }] });
    expect(tableau(r, 'Incidence des variations').lignes).toEqual([{ libelle: 'Rachat de 5 %', valeurs: [-4, -20] }]);
  });

  it('la normalisation ne garde que ce qui se lit · une chaîne vide et un montant illisible valent null', () => {
    const d = normaliserDeclarationsIfrs12({ jugements: '  ', filiales: { F: { resultatMinoritaires: '12' } }, partenaires: { P: { typePartenariat: 'AUTRE' } } });
    expect([d.jugements, d.filiales.F.resultatMinoritaires, d.partenaires.P.typePartenariat, d.entitesStructurees]).toEqual([null, null, null, null]);
  });
});
