import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * DÉCLARATION SPÉCIALE DE RÉÉVALUATION · un contrôle né d'une VÉRIFICATION.
 *
 * Le relevé de manques annonçait « une déclaration spéciale avant le 30 avril »
 * et « une astreinte de 100 000 CDF par jour ». Les deux viennent de
 * l'Ordonnance-loi n° 89/017 du 18 février 1989, art. 16 et 20 · abrogée par
 * la loi n° 23/053, art. 152 point 3, avec effet au 1er janvier 2026.
 *
 * Les coder tels quels aurait produit le défaut du § 10 bis de CLAUDE.md dans
 * sa forme la plus coûteuse : un signalement plausible, sourcé, faux, et une
 * sanction sous-évaluée d'un facteur trois. Le texte en vigueur dit « AU PLUS
 * TARD le 30 avril » (art. 136) et « 300.000,00 Francs congolais PAR JOUR »
 * (art. 138).
 *
 * Ce fichier fige les deux chiffres vérifiés, le bornage d'entrée en vigueur,
 * et le fait que le contrôle ne CONSTATE jamais le manquement.
 */

type Ligne = { numero: string; intitule: string; debit: number; credit: number };

function service(lignes: Ligne[], finExercice = '2026-12-31') {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date(`${finExercice.slice(0, 4)}-01-01`),
        dateFin: new Date(finExercice),
        dateArreteComptes: null,
      }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        nom: 'Dossier',
        referentiel: Referentiel.SYSCOHADA,
        formeJuridique: null,
        droitEtranger: false,
        actePersonnaliteJuridique: null,
        attestationExemptionIs: null,
        dateAttestationExemptionIs: null,
      }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation((a: { where?: { OR?: { compte?: { numero?: { startsWith?: string } } }[] } }) => {
        const prefixes = (a?.where?.OR ?? []).map((o) => o.compte?.numero?.startsWith).filter(Boolean) as string[];
        if (prefixes.length === 0) return Promise.resolve([]);
        return Promise.resolve(
          lignes
            .filter((l) => prefixes.some((prefixe) => l.numero.startsWith(prefixe)))
            .map((l) => ({ debit: l.debit, credit: l.credit, compte: { numero: l.numero, intitule: l.intitule } })),
        );
      }),
    },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reevaluationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  } as Record<string, unknown>;
  return new ControlesService(prisma as unknown as PrismaService);
}

const SOURCE = require('fs').readFileSync(require('path').join(__dirname, 'controles.service.ts'), 'utf8') as string;
const BLOC = SOURCE.slice(
  SOURCE.indexOf('DECLARATION_REEVALUATION_A_DEPOSER'),
  SOURCE.indexOf('const ordre: Record<Gravite'),
);

describe('Déclaration spéciale de réévaluation · les deux chiffres du texte en vigueur', () => {
  it('cite 300 000 francs par jour, jamais 100 000 · l’ancien montant vient d’un texte abrogé', () => {
    const bloc = BLOC;
    expect(bloc).toContain('300.000,00');
    expect(bloc).not.toContain('100 000');
    expect(bloc).not.toContain('100.000,00');
  });

  it('écrit « AU PLUS TARD le 30 avril », la formule de l’art. 136 · pas « avant le 30 avril »', () => {
    const bloc = BLOC;
    expect(bloc).toContain('AU PLUS TARD LE 30 AVRIL');
    expect(bloc.toLowerCase()).not.toContain('avant le 30 avril');
  });

  it('l’ordonnance-loi abrogée n’est citée nulle part comme droit positif', () => {
    const bloc = BLOC;
    expect(bloc).not.toContain('89/017');
  });
});

describe('Déclaration spéciale de réévaluation · déclenchement et bornage', () => {
  const anomalie = async (lignes: Ligne[], finExercice = '2026-12-31') => {
    const r = await service(lignes, finExercice).analyser('t', 'ex');
    return r.anomalies.find((a) => a.code === 'DECLARATION_REEVALUATION_A_DEPOSER');
  };

  it('se déclenche sur un mouvement du 106', async () => {
    const a = await anomalie([{ numero: '10610000', intitule: 'Écarts de réévaluation légale', debit: 0, credit: 5000000 }]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('INFORMATION');
  });

  it('se déclenche aussi sur le 154 · c’est le schéma attendu quand la neutralité fiscale est exigée', async () => {
    const a = await anomalie([{ numero: '15400000', intitule: 'Provisions spéciales de réévaluation', debit: 0, credit: 900000 }]);
    expect(a).toBeDefined();
  });

  it('ne se déclenche pas sans mouvement', async () => {
    expect(await anomalie([])).toBeUndefined();
  });

  it('NE SE DÉCLENCHE PAS sur un exercice 2025 · la loi n’entre en vigueur qu’au 1er janvier 2026', async () => {
    // Art. 153 : « La présente Loi entre en vigueur après vingt-quatre mois à
    // compter du 31 décembre de l'année de sa promulgation », promulguée le 30
    // novembre 2023. Un exercice 2025 relève de l'ordonnance-loi abrogée, dont
    // ni la formule ni le montant n'étaient les mêmes.
    const a = await anomalie(
      [{ numero: '10610000', intitule: 'Écarts de réévaluation légale', debit: 0, credit: 5000000 }],
      '2025-12-31',
    );
    expect(a).toBeUndefined();
  });

  it('ne CONSTATE aucun manquement · le dépôt est un fait externe', async () => {
    const a = await anomalie([{ numero: '10610000', intitule: 'Écarts', debit: 0, credit: 5000000 }]);
    expect(a!.consequence).toContain('NE CONSTATE AUCUN MANQUEMENT');
    expect(a!.libelle).not.toMatch(/non déposée|manquante|absente/i);
  });

  it('porte la réserve sur les entités à but non lucratif au lieu de la taire', async () => {
    const a = await anomalie([{ numero: '10610000', intitule: 'Écarts', debit: 0, credit: 5000000 }]);
    expect(a!.consequence).toContain('n’est tranché par aucun texte lu');
  });

  it('ne descend PAS sous le 106 · 1061 et 1062 ne veulent pas dire la même chose des deux côtés', () => {
    const table = SOURCE.slice(SOURCE.indexOf('const COMPTES_REEVALUATION'), SOURCE.indexOf('const COMPTES_REEVALUATION') + 200);
    expect(table).toContain("'106'");
    expect(table).not.toContain("'1061'");
    expect(table).not.toContain("'1062'");
  });
});
