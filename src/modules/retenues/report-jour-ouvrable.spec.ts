import { RetenuesService } from './retenues.service';
import { PrismaService } from '../../common/prisma.service';
import { AVERTISSEMENT_REGISTRE } from './correspondance-retenues';
import {
  estJourOuvrable,
  jourFerie,
  reporterAuJourOuvrable,
  JOURS_FERIES,
  RESERVE_JOUR_OUVRABLE,
} from './jour-ouvrable';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ART. 110 BIS, ALINÉA 2 · LE REPORT AU PREMIER JOUR OUVRABLE.
 *
 * Passe F10, puis correction du 2026-09-18 sur les deux sources que Manasse a
 * fournies le jour même · l'ordonnance n° 23-042 (jours fériés) et, par elle,
 * le décret n° 24/09 sur l'horaire des services publics.
 *
 * Ces tests figent la règle ET son câblage, écrits ensemble · la leçon de F4a.
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
  r.natures.find((n) => n.cle === cle) as unknown as {
    mois: Array<{ mois: string; echeance: Date; enRetard: boolean }>;
    moisEnRetard: number;
  };

describe('Report au premier jour ouvrable · art. 110 bis, alinéa 2', () => {
  describe('la règle · trois exclusions, trois sources, trois bornes', () => {
    it('le DIMANCHE est non ouvrable de tout temps · Code du travail, art. 121, alinéa 2', () => {
      // 15 février 2026 est un dimanche · vérifié au calendrier, pas de mémoire.
      expect(new Date(2026, 1, 15).getDay()).toBe(0);
      expect(estJourOuvrable(new Date(2026, 1, 15))).toBe(false);
      // Le repos hebdomadaire ne vient d'aucun texte daté récent : il vaut
      // aussi sur les exercices anciens que le registre calcule.
      expect(new Date(2020, 0, 5).getDay()).toBe(0);
      expect(estJourOuvrable(new Date(2020, 0, 5))).toBe(false);
    });

    it("LE SAMEDI N'EST PAS OUVRABLE · les services publics travaillent du lundi au vendredi", () => {
      // Décret n° 24/09 du 17 février 2024, art. 1er. CORRIGÉ LE 2026-09-18 :
      // ce fichier posait d'abord le samedi comme ouvrable, en transposant le
      // Code du travail, qui régit l'employeur et le travailleur. Or
      // l'obligation de l'art. 110 bis s'exécute DEVANT L'ADMINISTRATION, dont
      // les jours d'ouverture sont fixés par ce décret-là.
      //
      // 25 juillet 2026 est un samedi, et c'est la PREMIÈRE ÉCHÉANCE D'ACOMPTE
      // sur l'impôt des sociétés : le logiciel l'opposait telle quelle.
      expect(new Date(2026, 6, 25).getDay()).toBe(6);
      expect(estJourOuvrable(new Date(2026, 6, 25))).toBe(false);
      expect(reporterAuJourOuvrable(new Date(2026, 6, 25))).toEqual(new Date(2026, 6, 27));
    });

    it("le samedi n'est fermé QU'À COMPTER du 17 février 2024 · avant, le texte n'est pas au corpus", () => {
      // Deuxième piège du dépôt · un texte daté se borne à son entrée en
      // vigueur (art. 51, « entre en vigueur à la date de sa signature »), et
      // le décret abroge l'ordonnance n° 81-067 sans en reprendre le contenu.
      const avant = new Date(2024, 1, 10);
      expect(avant.getDay()).toBe(6);
      expect(estJourOuvrable(avant)).toBe(true);
      const apres = new Date(2024, 1, 24);
      expect(apres.getDay()).toBe(6);
      expect(estJourOuvrable(apres)).toBe(false);
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

  describe('les jours fériés · ordonnance n° 23-042 du 30 mars 2023', () => {
    it("la liste compte DIX jours, tous à date FIXE · l'art. 1er la ferme", () => {
      expect(JOURS_FERIES).toHaveLength(10);
      // Aucune fête mobile : la liste est limitative. Un onzième jour « par
      // évidence » reporterait une échéance que la loi ne reporte pas.
      expect(JOURS_FERIES.map((f) => `${f.mois}-${f.jour}`)).toEqual([
        '1-1',
        '1-4',
        '1-16',
        '1-17',
        '4-6',
        '5-1',
        '5-17',
        '6-30',
        '8-1',
        '12-25',
      ]);
    });

    it('un VENDREDI férié est reporté au lundi · Noël 2026 tombe un vendredi', () => {
      const noel = new Date(2026, 11, 25);
      expect(noel.getDay()).toBe(5);
      expect(jourFerie(noel)).toBe('Noël');
      // Vendredi férié, puis samedi et dimanche fermés : trois jours sautés.
      expect(reporterAuJourOuvrable(noel)).toEqual(new Date(2026, 11, 28));
    });

    it('le report CHAÎNE dimanche et férié · 3 janvier 2027 est un dimanche, le 4 est la Journée des Martyrs', () => {
      expect(new Date(2027, 0, 3).getDay()).toBe(0);
      expect(jourFerie(new Date(2027, 0, 4))).toContain('Martyrs');
      expect(reporterAuJourOuvrable(new Date(2027, 0, 3))).toEqual(new Date(2027, 0, 5));
    });

    it("LA LISTE EST BORNÉE AU 30 MARS 2023 · avant, l'ordonnance 14-010 s'appliquait et n'est pas au corpus", () => {
      expect(jourFerie(new Date(2022, 5, 30))).toBeNull();
      expect(jourFerie(new Date(2023, 5, 30))).toContain("l'indépendance");
      // Le dimanche, lui, vaut de tout temps · il ne vient pas de cette
      // ordonnance mais de l'art. 121 du Code du travail.
      expect(new Date(2022, 11, 25).getDay()).toBe(0);
      expect(estJourOuvrable(new Date(2022, 11, 25))).toBe(false);
    });
  });

  describe("le câblage · c'est lui qui produisait le faux retard", () => {
    it("l'échéance de la retenue de janvier 2026 est reportée au LUNDI 16 février", async () => {
      const r = await service([ligne('44720000', '2026-01-31', { credit: 200_000 })]).registre('t1', {
        exerciceId: 'e1',
        dateReference: '2026-06-15',
      });
      expect(moisDe(r, 'irppSalaires').mois.find((m) => m.mois === '2026-01')?.echeance).toEqual(
        new Date(2026, 1, 16),
      );
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

    it("une échéance du 15 tombant un SAMEDI est reportée au lundi · août 2026", async () => {
      // 15 août 2026 est un samedi. Avant la correction du samedi, le registre
      // l'opposait telle quelle et comptait le retard dès le dimanche 16.
      expect(new Date(2026, 7, 15).getDay()).toBe(6);
      const r = await service([ligne('44720000', '2026-07-31', { credit: 120_000 })]).registre('t1', {
        exerciceId: 'e1',
        dateReference: '2026-12-01',
      });
      expect(moisDe(r, 'irppSalaires').mois.find((m) => m.mois === '2026-07')?.echeance).toEqual(
        new Date(2026, 7, 17),
      );
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

  describe("ce qui n'est PAS calculé, et qui doit être dit", () => {
    it('la réserve est servie avec le registre et porte ses trois sources datées', () => {
      expect(AVERTISSEMENT_REGISTRE).toContain(RESERVE_JOUR_OUVRABLE);
      expect(RESERVE_JOUR_OUVRABLE).toContain('art. 121');
      expect(RESERVE_JOUR_OUVRABLE).toContain('décret n° 24/09 du 17 février 2024');
      expect(RESERVE_JOUR_OUVRABLE).toContain('ordonnance n° 23-042 du 30 mars 2023');
    });

    it('la réserve dit que les trois règles sont EMPRUNTÉES · la loi fiscale ne définit pas le jour ouvrable', () => {
      expect(RESERVE_JOUR_OUVRABLE).toContain('EMPRUNTÉES');
      // Les textes antérieurs, hors corpus, sont nommés plutôt que tus.
      expect(RESERVE_JOUR_OUVRABLE).toContain('14-010');
      expect(RESERVE_JOUR_OUVRABLE).toContain('81-067');
    });

    it("L'ARTICLE 2 N'EST PAS CALCULÉ · il fait RECULER un congé quand l'art. 110 bis fait AVANCER une échéance", () => {
      expect(RESERVE_JOUR_OUVRABLE).toContain('est pris le jour précédent');
      // Et la faculté d'anticipation de l'alinéa 3 joue elle aussi à rebours.
      expect(RESERVE_JOUR_OUVRABLE).toContain('PRÉCÉDANT');
    });

    it('AUCUNE FÊTE MOBILE ne peut entrer · la liste ne porte que des entiers littéraux', () => {
      // PREMIÈRE VERSION DE CE TEST : `not.toMatch(/paques|ascension|.../i)` sur
      // la source. Elle est tombée sur le COMMENTAIRE qui dit précisément que
      // la liste n'en porte aucune. Deuxième fois en deux jours qu'une
      // interdiction de mot est trop large, après « art. 98 bis » la veille.
      // On gèle donc la PROPRIÉTÉ, pas le vocabulaire : chaque entrée est un
      // couple d'entiers littéraux, et rien dans ce fichier ne calcule une
      // date · un algorithme de Pâques passe tous par de l'arithmétique.
      for (const f of JOURS_FERIES) {
        expect(Number.isInteger(f.mois)).toBe(true);
        expect(Number.isInteger(f.jour)).toBe(true);
      }
      const source = readFileSync(join(__dirname, 'jour-ouvrable.ts'), 'utf8');
      expect(source).not.toMatch(/Math\./);
      // Et la liste elle-même est figée plus haut par un `toEqual` exact :
      // ajouter un onzième jour, mobile ou non, y fait tomber le test.
    });

    it('le report vit UNE SEULE FOIS · le service ne recalcule pas la règle dans son coin', () => {
      // Les quatre calculs d'échéance du service passent par la fonction, et
      // aucun ne refait le test du jour. C'est la leçon de
      // `calculerPropositions`.
      const source = readFileSync(join(__dirname, 'retenues.service.ts'), 'utf8');
      expect(source).toContain("import { reporterAuJourOuvrable } from './jour-ouvrable'");
      expect(source).not.toMatch(/getDay\(\)/);
      expect((source.match(/reporterAuJourOuvrable\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    });
  });
});
