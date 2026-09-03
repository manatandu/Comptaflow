import { Referentiel } from '@prisma/client';
import { ManuelProceduresService, SQUELETTE_MANUEL, sourceManuel } from './manuel-procedures.service';
import { ControlesService } from '../controles/controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE QUATRIÈME DOCUMENT OBLIGATOIRE · AUDCIF, article 16, alinéa premier.
 *
 * « Pour maintenir la continuité dans le temps de l'accès à l'information,
 * TOUTE ENTITÉ ÉTABLIT UN MANUEL décrivant les procédures et l'organisation
 * comptables. Ce manuel, MIS À JOUR PÉRIODIQUEMENT, est destiné à garantir le
 * caractère définitif de l'enregistrement des mouvements. Il est CONSERVÉ
 * AUSSI LONGTEMPS qu'est exigée la présentation des états financiers
 * successifs auxquels il se rapporte. »
 *
 * Le livre d'inventaire et le rapport d'activité avaient leur place depuis le
 * 2026-09-02 ; celui-ci n'en avait aucune.
 *
 * CE QUE RIEN NE VOYAIT. Un dossier sans manuel tient une comptabilité
 * parfaitement équilibrée : aucun total ne bouge, aucun état ne manque. Le
 * défaut ne se voit que le jour où un auditeur demande selon quelles
 * procédures les comptes ont été tenus · et l'article 17, 3° renvoie au manuel
 * pour l'ORDRE DE CLASSEMENT des pièces justificatives, ordre qui sans lui
 * n'est écrit nulle part.
 *
 * DEUX ARTICLES 16, ET C'EST LE PIÈGE DE CE CHAPITRE. Celui de l'AUDCIF porte
 * le manuel ; celui du SYCEBNL porte les règles de présentation des états
 * financiers, et son 2) exige de son côté « la mise en place de PROCÉDURES
 * nécessaires à une organisation comptable permettant un contrôle interne
 * fiable et le contrôle externe ». L'obligation vaut des deux côtés, mais
 * chacun l'atteint par son chemin · c'est ce que vérifie le dernier bloc.
 */

type Faux = Record<string, unknown>;

function service(versions: Array<{ version: number; sections: unknown }> = []) {
  const crees: Faux[] = [];
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
    manuelProcedures: {
      findMany: jest.fn().mockResolvedValue(
        [...versions]
          .sort((a, b) => b.version - a.version)
          .map((v) => ({ ...v, dateApplication: new Date('2026-01-01') })),
      ),
      findFirst: jest
        .fn()
        .mockResolvedValue(versions.length ? versions.reduce((a, b) => (a.version > b.version ? a : b)) : null),
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        crees.push(data);
        return Promise.resolve({ id: 'm1', ...data });
      }),
    },
  } as Faux;
  return { svc: new ManuelProceduresService(prisma as unknown as PrismaService), crees };
}

const SECTIONS = [
  { cle: 'organisation', titre: 'Organisation', texte: 'Un comptable, un chef comptable, un directeur financier.' },
  { cle: 'classement-archivage', titre: 'Classement', texte: 'Par journal, puis par numéro de pièce croissant.' },
];

describe('le manuel se VERSIONNE, il ne s’écrase pas', () => {
  it('la première version porte le numéro 1', async () => {
    const { svc, crees } = service();
    await svc.enregistrer('t1', 'u1', { dateApplication: '2026-01-01', sections: SECTIONS });
    expect(crees[0].version).toBe(1);
  });

  it('la suivante incrémente, sans toucher à la précédente', async () => {
    // « Mis à jour périodiquement » et « conservé aussi longtemps qu'est
    // exigée la présentation des états financiers successifs » ne se
    // concilient que par la version. Écraser effacerait le manuel en vigueur
    // au moment d'un exercice encore opposable, et personne ne pourrait plus
    // dire selon quelles procédures cet exercice a été tenu.
    const { svc, crees } = service([{ version: 3, sections: SECTIONS }]);
    await svc.enregistrer('t1', 'u1', { dateApplication: '2027-01-01', sections: SECTIONS });
    expect(crees[0].version).toBe(4);
  });

  it('refuse un manuel sans section', async () => {
    const { svc } = service();
    await expect(svc.enregistrer('t1', 'u1', { dateApplication: '2026-01-01', sections: [] })).rejects.toThrow(
      /ne décrit rien/i,
    );
  });

  it('refuse deux sections de même clé · chacune doit être identifiable', async () => {
    const { svc } = service();
    await expect(
      svc.enregistrer('t1', 'u1', {
        dateApplication: '2026-01-01',
        sections: [SECTIONS[0], { ...SECTIONS[1], cle: 'organisation' }],
      }),
    ).rejects.toThrow(/même clé/i);
  });
});

describe('le squelette proposé', () => {
  it('reprend les sept rubriques que le CPCC énumère', () => {
    // § 0.1.4 · « informations POUVANT y figurer » · organisation générale et
    // comptable ; plan comptable particulier, livres et supports ; états de
    // sortie ; organisation des travaux d'élaboration des états financiers ;
    // classement et archivage ; modèle d'instruction d'inventaire ;
    // description des procédures comptables et de contrôle interne.
    expect(SQUELETTE_MANUEL).toHaveLength(7);
    expect(SQUELETTE_MANUEL.map((s) => s.cle)).toContain('classement-archivage');
    // Toutes vides · le texte ne fixe ni la forme ni le contenu, et un
    // gabarit prérempli ferait passer une proposition pour une exigence.
    expect(SQUELETTE_MANUEL.every((s) => s.texte === '')).toBe(true);
  });
});

describe('la conformité dit ce qui est vérifiable, et rien de plus', () => {
  it('signale l’absence de manuel', async () => {
    const { svc } = service();
    const c = await svc.conformite('t1');
    expect(c.existe).toBe(false);
    expect(c.classementRenseigne).toBe(false);
  });

  it('relève les sections restées vides', async () => {
    const { svc } = service([
      { version: 1, sections: [SECTIONS[0], { cle: 'classement-archivage', titre: 'Classement', texte: '  ' }] },
    ]);
    const c = await svc.conformite('t1');
    expect(c.existe).toBe(true);
    expect(c.sectionsVides).toEqual(['Classement']);
    // L'art. 17, 3° se réfère au manuel pour l'ordre de classement · une
    // section vide sur ce point prive cet article de son objet.
    expect(c.classementRenseigne).toBe(false);
  });

  it('reconnaît un manuel dont le classement est décrit', async () => {
    const { svc } = service([{ version: 2, sections: SECTIONS }]);
    const c = await svc.conformite('t1');
    expect(c.classementRenseigne).toBe(true);
    expect(c.sectionsVides).toEqual([]);
  });
});

describe('chaque référentiel cite le chemin par lequel l’obligation lui parvient', () => {
  it('le SYSCOHADA cite les articles de l’AUDCIF, seuls', () => {
    const s = sourceManuel(Referentiel.SYSCOHADA);
    expect(s).toContain('art. 16 al. 1');
    expect(s).toContain('art. 17, 3°');
    expect(s).not.toContain('SYCEBNL');
  });

  it('le SYCEBNL cite le RENVOI de son art. 3, et son propre art. 16, 2)', () => {
    // L'art. 16 de l'AUDCIF n'est pas dans la liste d'exclusion de l'art. 3 du
    // SYCEBNL. Le dire est ce qui rend l'obligation opposable à une EBNL,
    // plutôt que de lui citer un article comme s'il s'appliquait de plein
    // droit. Et le SYCEBNL a sa propre exigence de procédures, à son art. 16,
    // 2) · deux articles 16, deux objets, aucun ne remplace l'autre.
    const s = sourceManuel(Referentiel.SYCEBNL);
    expect(s).toContain("l'art. 3 du SYCEBNL");
    expect(s).toContain('art. 16, 2) du SYCEBNL');
    expect(s).toContain('contrôle interne fiable');
  });
});

function serviceControles(referentiel: Referentiel, manuel: Faux | null) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        dateArreteComptes: new Date('2027-04-28'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', nom: 'Dossier test', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(manuel) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService);
}

const anomalie = async (code: string, referentiel: Referentiel, manuel: Faux | null) => {
  const rapport = await serviceControles(referentiel, manuel).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === code);
};

describe('les contrôles du manuel', () => {
  for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA] as const) {
    it(`${referentiel} · signale l’absence complète de manuel`, async () => {
      const a = await anomalie('MANUEL_PROCEDURES_ABSENT', referentiel, null);
      expect(a).toBeDefined();
      expect(a!.gravite).toBe('AVERTISSEMENT');
      // La conséquence doit dire pourquoi rien ne le signale · sans cela,
      // l'utilisateur cherche un déséquilibre qui n'existe pas.
      expect(a!.consequence).toContain('comptabilité reste équilibrée');
    });
  }

  it('se tait dès qu’un manuel existe', async () => {
    const a = await anomalie('MANUEL_PROCEDURES_ABSENT', Referentiel.SYSCOHADA, {
      version: 1,
      sections: SECTIONS,
    });
    expect(a).toBeUndefined();
  });

  it('signale, en INFORMATION, un manuel muet sur l’ordre de classement', async () => {
    // Le manuel existe, l'art. 16 est satisfait ; c'est l'art. 17, 3° qui ne
    // l'est pas, et la gravité le reflète.
    const a = await anomalie('MANUEL_SANS_ORDRE_DE_CLASSEMENT', Referentiel.SYSCOHADA, {
      version: 5,
      sections: [SECTIONS[0]],
    });
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.occurrences[0].reference).toBe('Manuel version 5');
  });

  it('ne signale pas le classement quand il est décrit', async () => {
    expect(
      await anomalie('MANUEL_SANS_ORDRE_DE_CLASSEMENT', Referentiel.SYSCOHADA, { version: 5, sections: SECTIONS }),
    ).toBeUndefined();
  });
});
