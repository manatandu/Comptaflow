import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE TERRAIN QUI S'AMORTIT AVEC SON BÂTIMENT.
 *
 * Les deux textes l'imposent, chacun dans le sien :
 *
 *  · AUDCIF, Titre VIII ch. 11 § 1.7.1 · « La ventilation du coût
 *    d'acquisition d'un immeuble entre le terrain et la construction doit être
 *    effectuée dès l'origine, à la date d'inscription à l'actif du bilan » ;
 *    et le Titre VII, fiche du COMPTE 22 · « la valeur d'entrée de ces
 *    terrains doit toujours être distinguée de celle du bâtiment
 *    correspondant ».
 *  · SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 23 · « La valeur des terrains
 *    n'est pas comprise dans celle des bâtiments. Les terrains et les
 *    bâtiments doivent faire l'objet d'évaluation distincte. »
 *
 * CE QUE RIEN NE VOYAIT. Un immeuble acheté d'un bloc et entré sur un seul
 * compte 231 s'amortit EN ENTIER, terrain compris. L'écriture s'équilibre, la
 * balance boucle, le bilan boucle, et la dotation est majorée chaque exercice
 * de la part du terrain, qui ne s'use pas. Au terme du plan, le bilan porte
 * zéro pour un terrain qui vaut toujours son prix. C'est exactement le défaut
 * du § 10 bis de CLAUDE.md, sur l'opération la plus ordinaire qui soit.
 *
 * LE PIÈGE DE CE CONTRÔLE est le 232. Les deux plans distinguent 231 « sur sol
 * propre » et 232 « sur sol d'autrui » : un bâtiment sur sol d'autrui n'a par
 * définition aucun terrain à ventiler, et crier dessus serait un faux positif
 * permanent sur le sujet propre du ch. 11 section 1.
 */

interface Bien {
  designation: string;
  numero: string;
  /** Les comptes que touche l'écriture d'acquisition du bien. */
  comptesAcquisition: string[];
}

function service(biens: Bien[], referentiel: Referentiel = Referentiel.SYSCOHADA) {
  const biensServis = biens.map((b) => ({
    designation: b.designation,
    valeurOrigine: 200_000_000,
    dateAcquisition: new Date('2026-02-10'),
    compteImmobilisation: { numero: b.numero, intitule: 'Bâtiment' },
    ecritureAcquisition: {
      numeroPiece: 'AC-000001',
      lignes: b.comptesAcquisition.map((numero) => ({ compte: { numero } })),
    },
  }));
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        dateArreteComptes: new Date('2027-04-28'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', nom: 'Dossier', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    // Dossiers de subvention · vides ici, ces specs ne les testent pas. Sans
    // cette doublure, le contrôle 24 tomberait sur undefined.
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reevaluationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: {
      count: jest.fn().mockResolvedValue(0),
      // UNE SEULE FONCTION SERT TOUTES LES LECTURES D'IMMOBILISATIONS du
      // service · rendre les bâtiments à toutes ferait travailler les
      // contrôles voisins sur des lignes qui ne sont pas les leurs, et un
      // test vert dirait alors n'importe quoi. On aiguille sur le `where`,
      // comme le service lui-même.
      findMany: jest.fn().mockImplementation((args: { where?: { compteImmobilisation?: unknown } }) =>
        Promise.resolve(
          args?.where?.compteImmobilisation ? biensServis : [],
        ),
      ),
    },
  } as Record<string, unknown>;
  return new ControlesService(prisma as unknown as PrismaService);
}

const anomalie = async (biens: Bien[], referentiel: Referentiel = Referentiel.SYSCOHADA) => {
  const rapport = await service(biens, referentiel).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'BATIMENT_SANS_VENTILATION_TERRAIN');
};

const BATIMENT_SEUL: Bien = {
  designation: 'Immeuble de siège',
  numero: '23130000',
  // L'écriture d'acquisition ne touche que le bâtiment et le fournisseur.
  comptesAcquisition: ['23130000', '48100000'],
};

describe('la ventilation du terrain et de la construction', () => {
  it('signale un bâtiment sur sol propre entré sans aucune ligne de terrain', async () => {
    const a = await anomalie([BATIMENT_SEUL]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences).toHaveLength(1);
    expect(a!.occurrences[0].montant).toBe(200_000_000);
    // Le message doit dire pourquoi rien d'autre ne le signale.
    expect(a!.consequence).toContain('s’amortit EN ENTIER');
    expect(a!.consequence).toContain('la balance boucle');
  });

  it('se tait dès que l’acquisition touche un compte de terrain', async () => {
    expect(
      await anomalie([{ ...BATIMENT_SEUL, comptesAcquisition: ['23130000', '22100000', '48100000'] }]),
    ).toBeUndefined();
  });

  it('NE CRIE JAMAIS sur un bâtiment sur sol d’autrui · il n’a pas de terrain à ventiler', async () => {
    // Le piège du contrôle. 232 est « sur sol d'autrui » dans les DEUX plans,
    // et c'est le sujet propre de la section 1 du ch. 11.
    expect(await anomalie([{ ...BATIMENT_SEUL, numero: '23230000', comptesAcquisition: ['23230000'] }])).toBeUndefined();
  });

  it('ne crie pas non plus sur un ouvrage d’infrastructure (233)', async () => {
    expect(await anomalie([{ ...BATIMENT_SEUL, numero: '23310000', comptesAcquisition: ['23310000'] }])).toBeUndefined();
  });

  it('se tait quand le dossier ne tient aucune immobilisation', async () => {
    expect(await anomalie([])).toBeUndefined();
  });

  it('chaque référentiel cite SON texte, jamais celui de l’autre', async () => {
    const syscohada = await anomalie([BATIMENT_SEUL], Referentiel.SYSCOHADA);
    expect(syscohada!.consequence).toContain('AUDCIF, Titre VIII ch. 11 § 1.7.1');
    expect(syscohada!.consequence).not.toContain('SYCEBNL');

    const sycebnl = await anomalie([BATIMENT_SEUL], Referentiel.SYCEBNL);
    expect(sycebnl!.consequence).toContain('SYCEBNL, Partie 2 ch. 3, fiche du compte 23');
    expect(sycebnl!.consequence).not.toContain('AUDCIF');
  });

  it('dit au comptable que le montant lui appartient, et ne le lui impose pas', async () => {
    // Le logiciel ne connaît pas la part du terrain, et l'art. 38 laisse le
    // choix de la méthode quand l'acte ne la détaille pas. Un contrôle qui
    // imposerait un chiffre le ferait inventer.
    const a = await anomalie([BATIMENT_SEUL]);
    expect(a!.action).toContain('art. 38');
    expect(a!.action).toContain('vous appartient');
    // Et il annonce lui-même sa propre limite, pour qu'on ne la cherche pas.
    expect(a!.action).toContain('sol d’autrui');
  });
});
