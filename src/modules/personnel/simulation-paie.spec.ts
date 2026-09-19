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

function service(salarie?: unknown, referentiel?: 'SYSCOHADA' | 'SYCEBNL') {
  const findFirst = jest.fn().mockResolvedValue(salarie === undefined ? null : salarie);
  const tenantFind = jest.fn().mockResolvedValue({ referentiel: referentiel ?? 'SYSCOHADA' });
  const prisma = {
    // COMPLÉTÉE, JAMAIS CONTOURNÉE · le service lit réellement le salarié pour
    // proposer un nombre de personnes à charge, et le référentiel du dossier
    // pour la passation. Une doublure muette validerait une lecture qui n'a
    // pas lieu.
    salarie: { findFirst },
    tenant: { findUniqueOrThrow: tenantFind },
  } as unknown as PrismaService;
  return { svc: new PersonnelService(prisma), findFirst, tenantFind };
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
        // DEPUIS P2b, la quote-part ouvrière de la CNSS est CALCULÉE et entre
        // d'office dans les retenues de l'article 71 : 5 % de l'assiette
        // sociale, soit 50 000 FC, qui s'AJOUTENT aux 50 000 saisis. Le champ
        // du DTO ne porte plus que les AUTRES versements de l'article 71.
        const attendu = assiettes(
          [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000, conditionArticle69Attestee: null }],
          { tauxLegalAllocationsFamilialesFc: null, retenuesArticle71Fc: 100_000 },
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
        // 200 000 saisis au titre de l'article 71, PLUS les 50 000 de
        // quote-part ouvrière que P2b calcule : l'assiette nette vaut 750 000.
        const surLeBrut = retenueMensuelle('2026-03', 1_000_000, 0).retenueFc;
        const surLeNet = retenueMensuelle('2026-03', 750_000, 0).retenueFc;
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
    // Brut imposable 1 015 000 (salaire + excédent d'allocation), moins les
    // 50 000 de quote-part ouvrière calculée sur l'assiette sociale de
    // 1 000 000 · l'allocation familiale n'est pas de la rémunération.
    expect(res.assiettes.assietteFiscaleNetteFc).toBe(965_000);
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
    // ON GÈLE LA PROPRIÉTÉ, PAS LE DÉCOMPTE. La première version exigeait UN
    // SEUL appel Prisma, ce qui n'était qu'une approximation de « aucune
    // écriture » · elle est tombée quand P3 a ajouté la lecture du
    // référentiel, qui est pourtant parfaitement légitime. Ce qui compte est
    // qu'aucune opération d'ÉCRITURE n'apparaisse dans ce corps.
    const appels = corps.match(/this\.prisma\.\w+\.(\w+)\(/g) ?? [];
    expect(appels.length).toBeGreaterThan(0);
    for (const appel of appels) {
      expect(appel).toMatch(/\.(find\w*|count|aggregate|groupBy)\($/);
    }
    // Et les deux lectures attendues sont bien là.
    expect(corps).toContain('this.prisma.salarie.findFirst(');
    expect(corps).toContain('this.prisma.tenant.findUniqueOrThrow(');
  });
});

describe("P2b · l'ordre de calcul, et le net qui ne part pas de l'assiette", () => {
  it("assied les cotisations sur l'assiette SOCIALE, pas sur le total versé", () => {
    // 1 000 000 de salaire + 400 000 de logement. Le logement sort de la
    // rémunération de plein droit : les cotisations portent sur 1 000 000.
    const { svc } = service();
    return svc
      .simulerPaie(
        't-1',
        null,
        dto({
          elements: [
            { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
            { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
          ],
          natureEmployeurInpp: 'PRIVE',
          effectif: 10,
        } as Partial<SimulationPaieDto>),
      )
      .then((res) => {
        expect(res.assiettes.assietteSocialeFc).toBe(1_000_000);
        for (const ligne of res.cotisations.lignes) {
          expect(ligne.assietteFc).toBe(1_000_000);
        }
        // 13 % patronal, 5 % ouvrier sur la CNSS.
        expect(res.cotisations.totalTravailleurFc).toBeCloseTo(50_000, 6);
      });
  });

  it("fait entrer la quote-part ouvrière dans les retenues de l'article 71", () => {
    // Le défaut visé : calculer l'impôt AVANT les cotisations. Il serait
    // surestimé de tout ce que l'article 71 laisse déduire.
    const { svc } = service();
    return svc
      .simulerPaie('t-1', null, dto({ natureEmployeurInpp: 'PRIVE', effectif: 10 } as Partial<SimulationPaieDto>))
      .then((res) => {
        expect(res.assiettes.retenuesArticle71Fc).toBeCloseTo(50_000, 6);
        expect(res.assiettes.assietteFiscaleNetteFc).toBe(950_000);
      });
  });

  it("ADDITIONNE la quote-part calculée et les autres versements saisis", () => {
    // Le défaut symétrique : faire saisir la quote-part de la CNSS en plus,
    // ce qui la compterait deux fois.
    const { svc } = service();
    return svc
      .simulerPaie(
        't-1',
        null,
        dto({
          natureEmployeurInpp: 'PRIVE',
          effectif: 10,
          retenuesArticle71Fc: 20_000,
        } as Partial<SimulationPaieDto>),
      )
      .then((res) => {
        expect(res.assiettes.retenuesArticle71Fc).toBeCloseTo(70_000, 6);
      });
  });

  it('rend un net qui part du TOTAL VERSÉ, logement compris', () => {
    const { svc } = service();
    return svc
      .simulerPaie(
        't-1',
        null,
        dto({
          elements: [
            { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
            { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
          ],
          natureEmployeurInpp: 'PRIVE',
          effectif: 10,
        } as Partial<SimulationPaieDto>),
      )
      .then((res) => {
        expect(res.net.totalVerseFc).toBe(1_400_000);
        expect(res.net.netAPayerFc).toBeCloseTo(
          1_400_000 - res.net.quotePartOuvriereFc - (res.retenue?.retenueFc ?? 0),
          6,
        );
        // Et surtout : le net dépasse l'assiette sociale.
        expect(res.net.netAPayerFc!).toBeGreaterThan(res.assiettes.assietteSocialeFc - 100_000);
      });
  });

  it("s'abstient sur l'INPP sans emporter la CNSS ni le net", () => {
    const { svc } = service();
    return svc.simulerPaie('t-1', null, dto()).then((res) => {
      expect(res.cotisations.abstentions.join(' ')).toContain('NATURE');
      expect(res.cotisations.lignes.some((l) => l.organisme === 'CNSS')).toBe(true);
      expect(res.net.netAPayerFc).not.toBeNull();
    });
  });
});

describe("P3 · la passation lit le référentiel du dossier, et le cloisonne", () => {
  it('borne la lecture du référentiel au dossier de la session', async () => {
    const { svc, tenantFind } = service();
    await svc.simulerPaie('t-1', null, dto({ natureEmployeurInpp: 'PRIVE', effectif: 10 } as Partial<SimulationPaieDto>));
    expect(tenantFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-1' } }),
    );
  });

  it('route la pension vers 43130000 en SYSCOHADA et 43210000 en SYCEBNL', async () => {
    const p = { natureEmployeurInpp: 'PRIVE', effectif: 10 } as Partial<SimulationPaieDto>;
    const sys = await service(undefined, 'SYSCOHADA').svc.simulerPaie('t-1', null, dto(p));
    const syc = await service(undefined, 'SYCEBNL').svc.simulerPaie('t-1', null, dto(p));
    expect(sys.passation.lignes.some((l) => l.compte === '43130000')).toBe(true);
    expect(syc.passation.lignes.some((l) => l.compte === '43210000')).toBe(true);
    expect(syc.passation.lignes.some((l) => l.compte === '43130000')).toBe(false);
  });

  it("propose une écriture équilibrée sur un dossier complet", async () => {
    const { svc } = service();
    const res = await svc.simulerPaie(
      't-1',
      null,
      dto({ natureEmployeurInpp: 'PRIVE', effectif: 10 } as Partial<SimulationPaieDto>),
    );
    expect(res.passation.refus).toEqual([]);
    expect(res.passation.equilibree).toBe(true);
    expect(res.passation.totalDebitFc).toBeCloseTo(res.passation.totalCreditFc, 6);
  });

  it("REFUSE la passation tant que la nature de l'employeur INPP manque", async () => {
    // L'abstention de P2b remonte jusqu'ici : l'écriture serait équilibrée
    // avec une charge de personnel minorée de l'INPP manquant.
    const { svc } = service();
    const res = await svc.simulerPaie('t-1', null, dto());
    expect(res.passation.lignes).toEqual([]);
    expect(res.passation.refus.map((r) => r.motif)).toContain('COTISATION_EN_ABSTENTION');
    // Et le reste de la simulation tient : le refus ne casse pas les assiettes.
    expect(res.assiettes.assietteSocialeFc).toBe(1_000_000);
    expect(res.net.netAPayerFc).not.toBeNull();
  });
});
