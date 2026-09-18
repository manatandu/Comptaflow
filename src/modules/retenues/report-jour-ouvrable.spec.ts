import { RetenuesService } from './retenues.service';
import { PrismaService } from '../../common/prisma.service';
import { AVERTISSEMENT_REGISTRE } from './correspondance-retenues';
import { estJourOuvrable, reporterAuJourOuvrable, RESERVE_JOUR_OUVRABLE } from './jour-ouvrable';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ART. 110 BIS, ALINÉA 2 · LE REPORT AU PREMIER JOUR OUVRABLE.
 *
 * Passe F10. Le registre calculait ses échéances en dates calendaires brutes et
 * en tirait un « en retard » catégorique. Ces tests figent la règle ET son
 * câblage, écrits ensemble · la leçon de F4a, où trois passes sur quatre
 * avaient vu la première réinjection porter sur le point d'appel et non sur la
 * règle.
 */

function ligne(numero: string, date: string, montant: { debit?: number; credit?: number }) {
  return {
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    dateVersement: null,
    compte: { numero, intitule: `Compte ${numero}` },
    ecriture: { date: new Date(date), libelle: 'Écriture', reference: null },
  };
}

function service(lignes: ReturnType<typeof ligne>[]) {
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL' }) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
  } as unknown as PrismaService;
  return new RetenuesService(prisma);
}

const moisDe = (r: { natures: Array<{ cle: string }> }, cle: string) =>
  (
    r.natures.find((n) => n.cle === cle) as unknown as {
      mois: Array<{ mois: string; echeance: Date; enRetard: boolean }>;
      moisEnRetard: number;
    }
  );

describe('Report au premier jour ouvrable · art. 110 bis, alinéa 2', () => {
  describe('la règle', () => {
    it('le DIMANCHE est le seul jour non ouvrable calculé · repos hebdomadaire, Code du travail art. 121 al. 2', () => {
      // 15 février 2026 est un dimanche · vérifié au calendrier, pas de mémoire.
      expect(new Date(2026, 1, 15).getDay()).toBe(0);
      expect(estJourOuvrable(new Date(2026, 1, 15))).toBe(false);
    });

    it('LE SAMEDI EST OUVRABLE et ne se reporte pas · la semaine congolaise compte six jours ouvrables', () => {
      // 25 juillet 2026 est un samedi · c'est la première échéance d'acompte.
      // Le reporter dirait au redevable qu'il a jusqu'au lundi alors qu'il est
      // en retard depuis le samedi : c'est la direction d'erreur dangereuse.
      expect(new Date(2026, 6, 25).getDay()).toBe(6);
      expect(estJourOuvrable(new Date(2026, 6, 25))).toBe(true);
      expect(reporterAuJourOuvrable(new Date(2026, 6, 25))).toEqual(new Date(2026, 6, 25));
    });

    it('reporte un dimanche au lundi qui suit, et ne touche pas un jour ouvrable', () => {
      expect(reporterAuJourOuvrable(new Date(2026, 1, 15))).toEqual(new Date(2026, 1, 16));
      expect(reporterAuJourOuvrable(new Date(2026, 1, 17))).toEqual(new Date(2026, 1, 17));
    });

    it('NE MUTE JAMAIS la date reçue · les appelants gardent des échéances calculées ailleurs', () => {
      const origine = new Date(2026, 1, 15);
      reporterAuJourOuvrable(origine);
      expect(origine).toEqual(new Date(2026, 1, 15));
    });
  });

  describe('le câblage · c’est lui qui produisait le faux retard', () => {
    it("l'échéance de la retenue de janvier 2026 est reportée au LUNDI 16 février", async () => {
      const r = await service([ligne('44720000', '2026-01-31', { credit: 200_000 })]).registre('t1', {
        exerciceId: 'e1',
        dateReference: '2026-06-15',
      });
      const janvier = moisDe(r, 'irppSalaires').mois.find((m) => m.mois === '2026-01');
      expect(janvier?.echeance).toEqual(new Date(2026, 1, 16));
    });

    it("AU 16 FÉVRIER 2026, LE REDEVABLE N'EST PAS EN RETARD · c'est le défaut que la passe corrige", async () => {
      const r = await service([ligne('44720000', '2026-01-31', { credit: 200_000 })]).registre('t1', {
        exerciceId: 'e1',
        // Le lundi 16 février, jour où l'échéance reportée expire : le
        // redevable a la journée entière. Avant la correction, le registre
        // écrivait « 1 mois en retard » en rouge et l'avertissement de
        // non-déductibilité de l'art. 20 avec.
        dateReference: '2026-02-16',
      });
      const n = moisDe(r, 'irppSalaires');
      expect(n.mois.find((m) => m.mois === '2026-01')?.enRetard).toBe(false);
      expect(n.moisEnRetard).toBe(0);
    });

    it('le retard est bien constaté le MARDI 17 février, une fois le terme reporté passé', async () => {
      const r = await service([ligne('44720000', '2026-01-31', { credit: 200_000 })]).registre('t1', {
        exerciceId: 'e1',
        dateReference: '2026-02-17',
      });
      expect(moisDe(r, 'irppSalaires').moisEnRetard).toBe(1);
    });

    it("une échéance qui tombe déjà un jour ouvrable n'est pas déplacée · avril 2026 reste le 15", async () => {
      // 15 avril 2026 est un mercredi · le report ne doit rien changer.
      expect(new Date(2026, 3, 15).getDay()).toBe(3);
      const r = await service([ligne('44720000', '2026-03-31', { credit: 100_000 })]).registre('t1', {
        exerciceId: 'e1',
        dateReference: '2026-06-15',
      });
      expect(moisDe(r, 'irppSalaires').mois.find((m) => m.mois === '2026-03')?.echeance).toEqual(
        new Date(2026, 3, 15),
      );
    });
  });

  describe('ce qui n’est PAS calculé, et qui doit être dit', () => {
    it("la réserve est servie avec le registre, et nomme les jours fériés comme non calculés", () => {
      expect(AVERTISSEMENT_REGISTRE).toContain(RESERVE_JOUR_OUVRABLE);
      expect(RESERVE_JOUR_OUVRABLE).toContain('JOURS FÉRIÉS LÉGAUX');
      expect(RESERVE_JOUR_OUVRABLE).toContain('art. 123');
      // La faculté d'anticipation de l'alinéa 3 joue en sens INVERSE du report
      // et n'est pas davantage calculable : elle est nommée, pas devinée.
      expect(RESERVE_JOUR_OUVRABLE).toContain('PRÉCÉDANT');
    });

    it("la réserve dit que le SAMEDI est ouvrable · sans quoi le cabinet croirait à un report qui n'existe pas", () => {
      expect(RESERVE_JOUR_OUVRABLE).toContain('LE SAMEDI EST OUVRABLE');
    });

    it("AUCUNE LISTE DE JOURS FÉRIÉS n'est écrite en dur · le décret de l'art. 123 n'est dans aucune source lue", () => {
      // Même forme que l'interdiction de prorata de `comparabilite-exercices.ts`
      // et de seuil du catalogue de questionnaire : la propriété se gèle dans
      // la SOURCE, parce qu'aucun jeu d'essai ne peut montrer l'absence d'une
      // liste qu'on ajouterait un jour.
      const source = readFileSync(join(__dirname, 'jour-ouvrable.ts'), 'utf8');
      expect(source).not.toMatch(/FERIES\s*[:=]\s*\[/i);
      expect(source).not.toMatch(/'01-01'|'05-01'|'06-30'/);
    });

    it('le report vit UNE SEULE FOIS · le service ne recalcule pas la règle dans son coin', () => {
      // Quatre échéances sont produites par le service (mensuelle de retenue,
      // prochaine échéance, déclarative mensuelle, trimestrielle et annuelle) ·
      // toutes doivent passer par la fonction, aucune ne doit refaire le test
      // du jour dans le service. C'est la leçon de `calculerPropositions`.
      const source = readFileSync(join(__dirname, 'retenues.service.ts'), 'utf8');
      expect(source).toContain("import { reporterAuJourOuvrable } from './jour-ouvrable'");
      expect(source).not.toMatch(/getDay\(\)/);
      expect((source.match(/reporterAuJourOuvrable\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    });
  });
});
