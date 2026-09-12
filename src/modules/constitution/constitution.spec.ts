import { readFileSync } from 'fs';
import { join } from 'path';
import { FormeJuridiqueEbnl } from '@prisma/client';
import { ConstitutionService } from './constitution.service';
import { PrismaService } from '../../common/prisma.service';
import { parcoursConstitution, piecesDuParcours } from './catalogue-constitution';

/**
 * LE LOGICIEL TENAIT L'AVAL DE CETTE CHAÎNE SANS SON AMONT · le module
 * `exonerations` exige « le certificat d'enregistrement EN COURS DE VALIDITÉ »
 * à chacun de ses trois dossiers, et rien ne disait comment on l'obtient.
 */
type Faux = Record<string, unknown>;

const ONG = FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE;

describe('Catalogue de constitution · trois fondements qui ne se valent pas', () => {
  it('les DIX pièces de la section A sont là, dans l’ordre de la note circulaire', () => {
    const enregistrement = parcoursConstitution(FormeJuridiqueEbnl.ASSOCIATION, false).find(
      (e) => e.cle === 'enregistrement-plan',
    )!;
    // Le décompte est EN DUR · c'est lui qui oblige à rouvrir ce fichier le
    // jour où quelqu'un ajoute une pièce « de la note circulaire » qui n'y est
    // pas, comme pour les vingt-quatre items du CPCC.
    expect(enregistrement.pieces).toHaveLength(10);
    expect(enregistrement.pieces[0].cle).toBe('lettre-demande');
    expect(enregistrement.pieces[9].cle).toBe('frais-dgrad');
  });

  it('UNE pièce de la liste officielle ne repose sur AUCUN texte en vigueur', () => {
    // La découverte de ce chantier. Le guide Kahasha (§ 6) : « cette exigence
    // ne découle d'AUCUN TEXTE LÉGAL. Elle procède de la pratique d'un ancien
    // texte de loi, savoir le Décret-loi n° 195 […] ABROGÉ par la loi
    // n° 004/2001 ». La note circulaire la réclame pourtant à son point 4.
    // Une checklist qui présenterait les dix pièces comme également légales
    // serait fausse.
    const pieces = piecesDuParcours(FormeJuridiqueEbnl.ASSOCIATION, false);
    const sansBase = pieces.filter((p) => p.fondement === 'USAGE_SANS_BASE_LEGALE');
    expect(sansBase).toHaveLength(1);
    expect(sansBase[0].cle).toBe('reconnaissance-provinciale');
    expect(sansBase[0].reserve).toMatch(/AUCUN TEXTE LÉGAL/);
    expect(sansBase[0].reserve).toMatch(/Décret-loi n° 195/);
    expect(sansBase[0].reserve).toMatch(/ABROGÉ/);
    // Et elle est CONSERVÉE, parce qu'un dossier sans elle est recalé · la
    // retirer tromperait autant que taire son origine.
    expect(pieces.some((p) => p.cle === 'reconnaissance-provinciale')).toBe(true);
  });

  it('les cinq pièces de la personnalité juridique viennent de l’ARTICLE 4, pas d’une pratique', () => {
    const etape = parcoursConstitution(FormeJuridiqueEbnl.ASSOCIATION, false).find(
      (e) => e.cle === 'personnalite-juridique',
    )!;
    expect(etape.pieces).toHaveLength(5);
    for (const p of etape.pieces) {
      expect(p.fondement).toBe('LOI');
      expect(p.source).toMatch(/art\. 4/);
    }
  });

  it('AUCUN MONTANT de frais DGRAD n’est donné · l’annotation est manuscrite', () => {
    // Le texte imprimé porte 50 et 100 USD, tous deux BARRÉS À LA MAIN sur le
    // scan. Une annotation en marge n'a pas la valeur probante du texte
    // imprimé, et la lecture reste incertaine · en citer un ferait passer une
    // lecture douteuse pour un barème officiel.
    const source = readFileSync(join(__dirname, 'catalogue-constitution.ts'), 'utf8');
    const frais = piecesDuParcours(FormeJuridiqueEbnl.ASSOCIATION, false).find((p) => p.cle === 'frais-dgrad')!;
    expect(frais.libelle).toBe('Frais DGRAD');
    expect(frais.reserve).toMatch(/BARRÉS À LA MAIN/);
    expect(frais.reserve).toMatch(/vérifier le barème en vigueur auprès de la DGRAD/);
    // Aucun chiffre de barème dans le catalogue · les deux seuls montants
    // cités le sont DANS la réserve, pour dire qu'ils sont barrés.
    expect((source.match(/50 USD|100 USD/g) ?? []).length).toBe(2);
    expect(source).not.toMatch(/70\.?755|141\.?510/);
  });

  it('le dossier de l’avis de tutelle n’est PAS inventé · la loi ne le fixe pas', () => {
    // « La loi ne détermine ni la forme de la requête […] ni la procédure […]
    // ni les frais à payer. Chaque Ministère les fixe librement. » Lister des
    // pièces ici ferait passer une supposition pour une exigence.
    const etape = parcoursConstitution(FormeJuridiqueEbnl.ASSOCIATION, false)[0];
    expect(etape.cle).toBe('avis-tutelle');
    expect(etape.pieces).toHaveLength(1);
    expect(etape.pieces[0].reserve).toMatch(/chaque Ministère les fixe librement|les fixe librement/i);
  });

  it('l’étape de l’ONG étrangère n’est servie QU’à elle, et ne recopie pas l’art. 37', () => {
    // Les quatre conditions vivent dans le module `accord-cadre` · les
    // recopier aurait fait deux listes divergentes de la même règle.
    expect(parcoursConstitution(ONG, true).map((e) => e.cle)).toContain('conditions-ong-etrangere');
    expect(parcoursConstitution(ONG, false).map((e) => e.cle)).not.toContain('conditions-ong-etrangere');
    expect(parcoursConstitution(FormeJuridiqueEbnl.ASSOCIATION, true).map((e) => e.cle)).not.toContain(
      'conditions-ong-etrangere',
    );
    const etape = parcoursConstitution(ONG, true).find((e) => e.cle === 'conditions-ong-etrangere')!;
    expect(etape.pieces).toHaveLength(0);
    expect(etape.produit).toMatch(/fenêtre Accord-cadre/);
  });
});

// ---------------------------------------------------------------------------

function service(dossier: Faux) {
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(dossier) },
  } as Faux;
  return new ConstitutionService(prisma as unknown as PrismaService);
}

const vide = {
  formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
  droitEtranger: false,
  actePersonnaliteJuridique: null,
  dateActePersonnalite: null,
  numeroEnregistrementSecteur: null,
  certificatEnregistrementPlan: null,
};

describe('Confrontation avec ce que le dossier détient déjà', () => {
  it('n’ouvre AUCUNE table · il lit les champs existants du dossier', async () => {
    // Une checklist cochable aurait dupliqué `actePersonnaliteJuridique` et
    // ses voisins. Deux endroits pour le même fait auraient divergé au
    // premier correctif.
    const source = readFileSync(join(__dirname, 'constitution.service.ts'), 'utf8');
    for (const mot of ['create(', 'update(', 'upsert(', 'delete(']) {
      expect(source).not.toContain(`prisma.${mot}`);
    }
    expect(source).not.toMatch(/checklistConstitution|pieceConstitution\./);
  });

  it('dit « non renseigné » sur un dossier vide, et « renseigné » quand la pièce est là', async () => {
    const rien = await service(vide).parcours('t');
    expect(rien.etapes.map((e) => e.produitDetenu?.renseigne)).toEqual([false, false, false]);

    const garni = await service({
      ...vide,
      actePersonnaliteJuridique: 'Arrêté 0142/CAB/MIN/J/2019',
      numeroEnregistrementSecteur: 'MINSANTE/ONG/2019/77',
      certificatEnregistrementPlan: 'CE/PLAN/2020/311',
    }).parcours('t');
    expect(garni.etapes.map((e) => e.produitDetenu?.renseigne)).toEqual([true, true, true]);
  });

  it('l’appariement se fait PAR CLÉ, jamais par rang · gelé dans la source', async () => {
    // CE TEST EXISTE PARCE QU'UN DÉFAUT RÉINJECTÉ N'A PAS ÉTÉ VU. Remplacer
    // `detenu[e.cle]` par `Object.values(detenu)[i]` laissait passer les dix
    // tests : avec l'ordre ACTUEL du catalogue, rang et clé coïncident, et
    // l'étape propre à l'ONG étrangère est la dernière, donc `undefined` des
    // deux façons. Le défaut est invisible aujourd'hui et faux demain · dès
    // qu'une étape s'insère au milieu, un produit se retrouve en face de la
    // mauvaise démarche, sans qu'aucun total ne bouge.
    //
    // Aucun jeu d'essai ne peut le montrer sans inventer une étape qui
    // n'existe pas. La propriété se gèle donc dans la SOURCE, comme l'absence
    // de prorata dans `comparabilite-exercices.ts`.
    const source = readFileSync(join(__dirname, 'constitution.service.ts'), 'utf8');
    expect(source).toContain('detenu[e.cle]');
    expect(source).not.toMatch(/Object\.values\(detenu\)|detenu\[\s*i\s*\]/);
  });

  it('l’étape de l’ONG étrangère ne porte AUCUN produit détenu · null, jamais false', async () => {
    // `false` y ferait croire à un manque, alors que la fenêtre Accord-cadre
    // tient la réponse. La nuance est la même qu'entre zéro et null dans
    // l'évolution des soldes.
    const r = await service({ ...vide, formeJuridique: ONG, droitEtranger: true }).parcours('t');
    const etrangere = r.etapes.find((e) => e.cle === 'conditions-ong-etrangere')!;
    expect(etrangere.produitDetenu).toBeNull();
  });

  it('compte les pièces PAR FONDEMENT · c’est là que l’usage sans base se voit', async () => {
    const r = await service(vide).parcours('t');
    expect(r.parFondement.USAGE_SANS_BASE_LEGALE).toBe(1);
    expect(r.parFondement.LOI).toBe(7);
    expect(r.parFondement.PRATIQUE_ADMINISTRATIVE).toBe(8);
  });
});
