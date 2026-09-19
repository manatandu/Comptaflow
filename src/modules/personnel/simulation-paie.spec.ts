import { NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import { assiettes } from './assiettes-paie';
import { retenueMensuelle } from './bareme-irpp';
import type { SimulationPaieDto } from './dto/personnel.dto';

/**
 * LE CÂBLAGE DE LA SIMULATION, ET NON LA RÈGLE.
 *
 * Les deux moteurs ont leurs propres specs. Ce fichier-ci vérifie ce que trois
 * passes de confrontation sur quatre ont vu casser en premier : le POINT
 * D'APPEL. Une règle juste qu'un service n'appelle pas, ou qu'il appelle avec
 * la mauvaise entrée, ne protège rien.
 */

function service(salarie?: unknown) {
  const findFirst = jest.fn().mockResolvedValue(salarie === undefined ? null : salarie);
  const prisma = {
    // COMPLÉTÉE, JAMAIS CONTOURNÉE · le service lit réellement le salarié pour
    // proposer un nombre de personnes à charge, et une doublure muette
    // validerait une lecture qui n'a pas lieu.
    salarie: { findFirst },
  } as unknown as PrismaService;
  return { svc: new PersonnelService(prisma), findFirst };
}

const dto = (over: Partial<SimulationPaieDto> = {}): SimulationPaieDto =>
  ({
    moisDePaie: '2026-03',
    elements: [
      { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
    ],
    ...over,
  }) as SimulationPaieDto;

describe('La simulation appelle bien les deux moteurs, et avec la bonne entrée', () => {
  it("rend EXACTEMENT ce que les fonctions pures rendent sur les mêmes données", () => {
    const { svc } = service();
    return svc
      .simulerPaie('t-1', null, dto({ retenuesArticle71Fc: 50_000, personnesACharge: 2 }))
      .then((res) => {
        const attendu = assiettes(
          [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000, conditionArticle69Attestee: null }],
          { tauxLegalAllocationsFamilialesFc: null, retenuesArticle71Fc: 50_000 },
        );
        expect(res.assiettes.assietteSocialeFc).toBe(attendu.assietteSocialeFc);
        expect(res.assiettes.assietteFiscaleNetteFc).toBe(attendu.assietteFiscaleNetteFc);
        expect(res.retenue?.retenueFc).toBeCloseTo(
          retenueMensuelle('2026-03', attendu.assietteFiscaleNetteFc as number, 2).retenueFc,
          6,
        );
      });
  });

  it("assied la retenue sur l'assiette NETTE de l'article 71, jamais sur le brut", () => {
    // Le défaut visé : appeler le barème avec `assietteFiscaleBruteFc`.
    // Il surestime l'impôt de tout ce que l'article 71 laisse déduire.
    const { svc } = service();
    return svc
      .simulerPaie('t-1', null, dto({ retenuesArticle71Fc: 200_000 }))
      .then((res) => {
        const surLeBrut = retenueMensuelle('2026-03', 1_000_000, 0).retenueFc;
        const surLeNet = retenueMensuelle('2026-03', 800_000, 0).retenueFc;
        expect(surLeNet).toBeLessThan(surLeBrut);
        expect(res.retenue?.retenueFc).toBeCloseTo(surLeNet, 6);
      });
  });

  it("ne chiffre AUCUNE retenue tant qu'une assiette est indéterminée", () => {
    const { svc } = service();
    return svc
      .simulerPaie(
        't-1',
        null,
        dto({
          elements: [
            { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
            { nature: 'INDEMNITE_DE_TRANSPORT', libelle: 'Transport', montantFc: 90_000 },
          ],
        } as Partial<SimulationPaieDto>),
      )
      .then((res) => {
        expect(res.assiettes.assietteFiscaleNetteFc).toBeNull();
        expect(res.retenue).toBeNull();
        expect(res.assiettes.abstentions).toHaveLength(1);
        // Et l'assiette SOCIALE reste chiffrée : l'abstention fiscale
        // n'emporte pas la cotisation.
        expect(res.assiettes.assietteSocialeFc).toBe(1_000_000);
      });
  });

it("ne présume JAMAIS un taux légal d'allocations familiales à zéro", async () => {
    // Le défaut visé est au POINT D'APPEL, pas dans la règle : passer `?? 0`
    // au lieu de `?? null` ferait imposer l'allocation ENTIÈRE sous couvert
    // d'un plafond que personne n'a fixé, et l'abstention disparaîtrait.
    const { svc } = service();
    const res = await svc.simulerPaie(
      't-1',
      null,
      dto({
        elements: [
          { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
          { nature: 'ALLOCATIONS_FAMILIALES_LEGALES', libelle: 'Allocations', montantFc: 40_000 },
        ],
      } as Partial<SimulationPaieDto>),
    );
    expect(res.assiettes.assietteFiscaleNetteFc).toBeNull();
    expect(res.retenue).toBeNull();
    expect(res.assiettes.abstentions[0].motif).toBe(
      'TAUX_LEGAL_ALLOCATIONS_FAMILIALES_NON_FOURNI',
    );
  });

  it("chiffre dès que le cabinet a fourni le taux légal", async () => {
    const { svc } = service();
    const res = await svc.simulerPaie(
      't-1',
      null,
      dto({
        elements: [
          { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
          { nature: 'ALLOCATIONS_FAMILIALES_LEGALES', libelle: 'Allocations', montantFc: 40_000 },
        ],
        tauxLegalAllocationsFamilialesFc: 25_000,
      } as Partial<SimulationPaieDto>),
    );
    expect(res.assiettes.assietteFiscaleNetteFc).toBe(1_015_000);
    expect(res.retenue).not.toBeNull();
  });

  it("refuse le barème sur un mois antérieur au 1er janvier 2026, et le DIT", () => {
    const { svc } = service();
    return svc.simulerPaie('t-1', null, dto({ moisDePaie: '2025-11' })).then((res) => {
      expect(res.baremeApplicable).toBe(false);
      expect(res.retenue).toBeNull();
      expect(res.motifBaremeInapplicable).toContain('1er janvier 2026');
      // L'assiette, elle, se calcule : le Code du travail ne change pas de
      // date, et c'est l'IMPÔT seul qui est hors de sa période.
      expect(res.assiettes.assietteSocialeFc).toBe(1_000_000);
    });
  });
});

describe('Le cloisonnement de la simulation', () => {
  it('borne la lecture du salarié au dossier de la session', async () => {
    const { svc, findFirst } = service({ nom: 'X', nomConjoint: 'Y', _count: { enfants: 3 } });
    await svc.simulerPaie('t-1', 'sal-9', dto());
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sal-9', tenantId: 't-1' } }),
    );
  });

  it("rend introuvable le salarié d'un autre dossier", async () => {
    const { svc } = service();
    await expect(svc.simulerPaie('t-1', 'sal-etranger', dto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("Les personnes à charge sont PROPOSÉES, jamais substituées", () => {
  it("propose le compte du registre et retient celui que le cabinet a donné", async () => {
    const { svc } = service({ nom: 'X', nomConjoint: 'Y', _count: { enfants: 3 } });
    const res = await svc.simulerPaie('t-1', 'sal-1', dto({ personnesACharge: 2 }));
    expect(res.propositionPersonnesACharge).toBe(4);
    expect(res.personnesAChargeRetenues).toBe(2);
    expect(res.retenue?.annuel.personnesAChargeRetenues).toBe(2);
  });

  it("ne substitue PAS la proposition quand le cabinet n'a rien donné", async () => {
    // Zéro réduction est le sens défavorable au contribuable · c'est celui
    // qu'on ne suppose pas en sa faveur. L'article 124 borne la qualité de
    // personne à charge par des ressources qu'aucun livre du dossier ne porte.
    const { svc } = service({ nom: 'X', nomConjoint: 'Y', _count: { enfants: 3 } });
    const res = await svc.simulerPaie('t-1', 'sal-1', dto());
    expect(res.propositionPersonnesACharge).toBe(4);
    expect(res.personnesAChargeRetenues).toBe(0);
    expect(res.retenue?.annuel.quotitePourCent).toBe(0);
  });

  it("nomme les articles 124 et 125 dans la source de la proposition", async () => {
    const { svc } = service({ nom: 'X', nomConjoint: null, _count: { enfants: 1 } });
    const res = await svc.simulerPaie('t-1', 'sal-1', dto());
    expect(res.propositionPersonnesACharge).toBe(1);
    expect(res.sourceProposition).toContain('article 124');
    expect(res.sourceProposition).toContain('article 125');
  });
});

describe("Ce que la simulation annonce ne pas être", () => {
  it("dit, avant tout chiffre, qu'elle n'est pas un bulletin de paie", async () => {
    const { svc } = service();
    const res = await svc.simulerPaie('t-1', null, dto());
    expect(res.avertissement).toContain("n'est PAS un bulletin de paie");
    expect(res.avertissement).toContain('ACOMPTE');
  });

  it('ne conserve rien · aucune écriture Prisma sur cette route', () => {
    // On gèle une PRÉSENCE, jamais une absence de mot : la seule opération
    // Prisma du corps de `simulerPaie` est la lecture du salarié.
    const source = readFileSync(join(__dirname, 'personnel.service.ts'), 'utf8');
    const debut = source.indexOf('async simulerPaie(');
    const fin = source.indexOf('  /** Le nombre de renouvellements', debut);
    const corps = source.slice(debut, fin);
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
    expect(corps.match(/this\.prisma\.\w+\.\w+\(/g)).toEqual(['this.prisma.salarie.findFirst(']);
  });
});
