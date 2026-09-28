import { FormeJuridiqueEbnl, Referentiel } from '@prisma/client';
import { REFERENTIELS_KEY } from '../../common/decorators/referentiels.decorator';
import { FiscaliteController } from './fiscalite.controller';
import { FiscaliteService } from './fiscalite.service';
import { qualifierExemptionIs } from './exemption-is-ebnl';

/**
 * L'EXEMPTION D'IS N'EST PAS UN ATTRIBUT DU RÉFÉRENTIEL COMPTABLE · ce qui
 * cassait en silence.
 *
 * Le module fiscal indexait l'exemption de l'art. 5 de la loi n° 23/053 sur
 * le seul référentiel SYCEBNL, et servait la phrase « Une entité à but non
 * lucratif est exemptée d'impôt sur les sociétés » à une ONG comme à un
 * établissement d'utilité publique comme à une unité de gestion de projet.
 * Rien ne se plantait, rien ne se calculait faux : le logiciel affirmait un
 * droit sans en tenir la condition, et le seul moment où l'écart apparaît est
 * le contrôle, quand le vérificateur réclame l'attestation de l'art. 2 de
 * l'arrêté n° 007/2025.
 *
 * Les tests ci-dessous portent chacun sur une phrase du texte, jamais sur une
 * tournure du code.
 */

const tenant = (options: {
  referentiel?: Referentiel;
  forme?: FormeJuridiqueEbnl | null;
  droitEtranger?: boolean;
  acte?: string | null;
  attestation?: string | null;
}) => ({
  id: 't1',
  referentiel: options.referentiel ?? Referentiel.SYCEBNL,
  formeJuridique: options.forme === undefined ? FormeJuridiqueEbnl.ASSOCIATION : options.forme,
  droitEtranger: options.droitEtranger ?? false,
  actePersonnaliteJuridique: options.acte === undefined ? 'ARR/JUST/2024/117' : options.acte,
  attestationExemptionIs: options.attestation ?? null,
});

const service = (t: ReturnType<typeof tenant>) =>
  new FiscaliteService({ tenant: { findUnique: async () => t } } as never, {} as never);

describe("Fondement de l'exemption · art. 5, points 3, 4 et 5 de la loi n° 23/053", () => {
  it("range une association et une association confessionnelle au point 3, sans attestation", () => {
    for (const forme of [FormeJuridiqueEbnl.ASSOCIATION, FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE]) {
      const q = qualifierExemptionIs(tenant({ forme }));
      expect(q.fondement).toBe('ART_5_POINT_3');
      // Art. 1er de l'arrêté n° 007/2025 : il ne vise que les EUP et les ONG.
      // Réclamer une attestation à une association serait une exigence inventée.
      expect(q.attestationRequise).toBe(false);
      expect(q.exemptionAffirmable).toBe(true);
      expect(q.avertissements).toHaveLength(0);
    }
  });

  it("ne tranche pas pour une ONG, et sert les deux lectures du point 3 et du point 5", () => {
    const q = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE }));
    expect(q.fondement).toBe('ART_5_POINT_3_OU_POINT_5');
    expect(q.attestationRequise).toBe(true);
    expect(q.exemptionAffirmable).toBe(false);
    const dit = q.avertissements.join(' ');
    // Loi n° 004/2001, art. 35 · une ONG congolaise est une ASBL, d'où le point 3.
    expect(dit).toMatch(/art\. 35/);
    // Loi n° 23/053, art. 5, point 5 · elle est nommée, d'où le renvoi réglementaire.
    expect(dit).toMatch(/conditions définies par voie réglementaire/);
    expect(dit).toMatch(/le logiciel ne la tranche pas/);
  });

  it("réserve le point 5 seul à un établissement d'utilité publique, qui n'est pas une ASBL", () => {
    const q = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE, acte: null }));
    expect(q.fondement).toBe('ART_5_POINT_5');
    // Titre II de la loi n° 004/2001, art. 58 · les points 3 et 4 lui sont fermés,
    // et l'acte manquant ne doit donc PAS lui servir l'avertissement du point 3.
    expect(q.enonce).toMatch(/art\. 58/);
    // Ni le point 3 ni le point 4 ne doivent lui être servis, l'acte manquant
    // ne déclenchant l'avertissement du point 3 que pour une ASBL.
    const dit = q.avertissements.join(' ');
    expect(dit).not.toMatch(/point 4/);
    expect(dit).not.toMatch(/constituées conformément à la Loi/);
  });

  it("n'accorde aucun point de l'art. 5 à une unité de gestion de projet", () => {
    const q = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.UNITE_GESTION_PROJET }));
    expect(q.fondement).toBe('HORS_LOI_004_2001');
    expect(q.attestationRequise).toBeNull();
    expect(q.exemptionAffirmable).toBe(false);
    expect(q.avertissements.join(' ')).toMatch(/n'est pas une personne morale de la loi n° 004\/2001/);
  });

  it("ne qualifie rien quand la forme est « AUTRE » ou absente, et le dit", () => {
    for (const forme of [FormeJuridiqueEbnl.AUTRE, null]) {
      const q = qualifierExemptionIs(tenant({ forme }));
      expect(q.fondement).toBe('INDETERMINE');
      expect(q.attestationRequise).toBeNull();
      expect(q.exemptionAffirmable).toBe(false);
    }
  });

  it("distingue le point 4 du point 3 · il vise des PROFITS, et survit à l'acte manquant", () => {
    const avec = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.ASSOCIATION }));
    const sans = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.ASSOCIATION, acte: null }));
    // Constituée conformément à la Loi : le point 3 exempte tout, le point 4
    // n'ajoute rien et n'a rien à faire à l'écran.
    expect(avec.avertissements.join(' ')).not.toMatch(/point 4/);
    // Acte non renseigné : le point 3 n'est plus affirmable, et le point 4
    // devient le seul fondement encore ouvert pour ces profits-là.
    expect(sans.exemptionAffirmable).toBe(false);
    expect(sans.avertissements.join(' ')).toMatch(/point 4/);
    expect(sans.avertissements.join(' ')).toMatch(/foires, des expositions, des réunions sportives/);
  });
});

describe("Attestation de l'art. 2 de l'arrêté n° 007/2025 · elle est enfin LUE", () => {
  it("signale à une ONG sans attestation que rien n'est acquis, et nomme les pièces à joindre", () => {
    const q = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE }));
    expect(q.attestationConnue).toBe(false);
    const dit = q.avertissements.join(' ');
    expect(dit).toMatch(/AUCUNE ATTESTATION N'EST ENREGISTRÉE/);
    expect(dit).toMatch(/acte d'enregistrement auprès du Ministère du secteur d'activité visé/);
  });

  it("change de discours quand l'attestation est enregistrée, sans pour autant la valider", () => {
    const q = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, attestation: 'DGI/AE/2026/0789' }),
    );
    expect(q.attestationConnue).toBe(true);
    const dit = q.avertissements.join(' ');
    expect(dit).not.toMatch(/AUCUNE ATTESTATION N'EST ENREGISTRÉE/);
    expect(dit).toMatch(/Le logiciel ne la vérifie pas/);
    // L'art. 3 vaut même attestation en main : « ne fige pas l'exemption ».
    expect(q.exemptionAffirmable).toBe(false);
  });

  it("réclame à une ONG étrangère l'accord-cadre du Ministère du Plan, et ne le confond avec aucune autre pièce", () => {
    // Le manque était DÉCLARÉ ici (« OmegaX NE TIENT PAS l'accord-cadre ») et
    // il est refermé · le module `accord-cadre` le tient. Ce qui reste vrai,
    // et que ce test gèle, c'est que TROIS pièces distinctes ne se confondent
    // pas : l'accord-cadre (art. 37, l'existence de l'ONG étrangère), le
    // certificat d'enregistrement du Ministère du Plan, et l'arrêté
    // interministériel de l'art. 39 (les exonérations). Croire qu'un accord
    // signé exonère ferait dédouaner sur une pièce qui ne le permet pas.
    const q = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, droitEtranger: true }),
    );
    const dit = q.avertissements.join(' ');
    expect(dit).toMatch(/accord-cadre conclu avec le Ministère du Plan/);
    expect(dit).toMatch(/certificat d'enregistrement du Ministère du Plan, qui est une autre pièce/);
    expect(dit).toMatch(/arrêté interministériel de l'art. 39, qui ouvre les exonérations/);
    // Et ce module ne prétend pas LIRE l'accord · c'est le contrôle qui
    // constate son absence, pas cette qualification.
    expect(dit).toMatch(/ACCORD_CADRE_PLAN_ABSENT/);
  });
});

describe("Quatre conditions cumulatives de l'art. 3, et sanction de l'art. 5", () => {
  it("sert les quatre conditions et la gestion désintéressée à une ONG et à un EUP", () => {
    for (const forme of [
      FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
      FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE,
    ]) {
      const dit = qualifierExemptionIs(tenant({ forme })).avertissements.join(' ');
      expect(dit).toMatch(/but non lucratif/);
      expect(dit).toMatch(/gestion désintéressée/);
      expect(dit).toMatch(/doit être réinvesti dans le programme d'activités/);
      expect(dit).toMatch(/distorsion de concurrence/);
      // Art. 4 · c'est le NIVEAU de la rémunération qui compte, pas son existence.
      expect(dit).toMatch(/comparables à celles versées pour des responsabilités similaires/);
      // Art. 5 · l'impôt devient dû, et le logiciel dit qu'il ne le liquide pas.
      expect(dit).toMatch(/est dû » au titre de l'exercice concerné|dû au titre de l'exercice concerné/);
      expect(dit).toMatch(/OmegaX ne le liquide pas/);
    }
  });

  it("ne les sert PAS à une association du point 3, que l'arrêté ne vise pas", () => {
    const dit = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.ASSOCIATION })).avertissements.join(' ');
    expect(dit).not.toMatch(/distorsion de concurrence/);
    expect(dit).not.toMatch(/attestation/);
  });
});

describe("Sanction de l'art. 5 de l'arrêté · servie seulement là où l'arrêté s'applique (C2)", () => {
  // SANCTION_ART_5 est la seule phrase qui dise « OmegaX ne le liquide pas » ;
  // la version conditionnelle, la seule qui dise « se révèle être ».
  const brute = /OmegaX ne le liquide pas/;
  const conditionnelle = /se révèle être celle d'un établissement d'utilité publique ou d'une ONG/;

  it("sert la sanction brute si et seulement si l'arrêté s'applique, la conditionnelle au seul cas indéterminé", () => {
    const formes: (FormeJuridiqueEbnl | null)[] = [...Object.values(FormeJuridiqueEbnl), null];
    for (const forme of formes) {
      for (const droitEtranger of [false, true]) {
        for (const acte of ['ARR/JUST/2024/117', null]) {
          const q = qualifierExemptionIs(tenant({ forme, droitEtranger, acte }));
          const dit = q.avertissements.join(' ');
          // Art. 1er de l'arrêté n° 007/2025 · EUP et ONG seulement.
          const arreteSApplique = q.fondement === 'ART_5_POINT_5' || q.attestationRequise === true;
          expect({ forme, droitEtranger, acte, brute: brute.test(dit) }).toEqual({
            forme,
            droitEtranger,
            acte,
            brute: arreteSApplique,
          });
          expect({ forme, conditionnelle: conditionnelle.test(dit) }).toEqual({
            forme,
            conditionnelle: q.fondement === 'INDETERMINE',
          });
        }
      }
    }
  });

  it("ne sert aucune sanction à une unité de gestion de projet, que l'arrêté ne vise pas", () => {
    const dit = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.UNITE_GESTION_PROJET })).avertissements.join(' ');
    expect(dit).toMatch(/À établir pièce en main/);
    expect(brute.test(dit) || conditionnelle.test(dit)).toBe(false);
  });
});

describe("Acte de personnalité juridique manquant, entité de droit étranger (C3)", () => {
  // Loi n° 004/2001, art. 30 · l'autorisation du Président par décret.
  const art30 = /autorisation du Président de la République donnée par décret sur proposition du Ministre de la Justice » \(art\. 30\)/;
  // Art. 5 · propre à la Section I, les ASBL de droit congolais.
  const provisoire = /autorisation provisoire de fonctionnement » de six mois/;

  it("cite l'art. 30 à une ONG étrangère sans acte, nomme décret et ordonnance sans trancher, et tait l'autorisation provisoire", () => {
    const q = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, droitEtranger: true, acte: null }),
    );
    const dit = q.avertissements.join(' ');
    expect(dit).toMatch(art30);
    expect(dit).toMatch(/\(art\. 34\)/);
    expect(dit).toMatch(/ordonnance présidentielle accordant la personnalité juridique » là où la loi parle d'un décret/);
    expect(dit).toMatch(/ne tranche pas entre les deux désignations/);
    expect(provisoire.test(dit)).toBe(false);
  });

  it("cite l'art. 30 et l'art. 31 à une association étrangère sans acte, et l'art. 32 à la confessionnelle", () => {
    const asso = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ASSOCIATION, droitEtranger: true, acte: null }),
    ).avertissements.join(' ');
    expect(asso).toMatch(art30);
    expect(asso).toMatch(/\(art\. 31\)/);
    expect(provisoire.test(asso)).toBe(false);
    const conf = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE, droitEtranger: true, acte: null }),
    ).avertissements.join(' ');
    expect(conf).toMatch(art30);
    expect(conf).toMatch(/\(art\. 32\)/);
  });

  it("garde les art. 3 et 5 pour une association de droit congolais sans acte", () => {
    const dit = qualifierExemptionIs(tenant({ forme: FormeJuridiqueEbnl.ASSOCIATION, acte: null })).avertissements.join(
      ' ',
    );
    expect(dit).toMatch(provisoire);
    expect(art30.test(dit)).toBe(false);
  });
});

describe("Art. 3 de l'arrêté, point 4 · la clause finale est citée (C4)", () => {
  it("cite « condition limitée au public et à l'espace visés par l'objet de la structure »", () => {
    const dit = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE }),
    ).avertissements.join(' ');
    expect(dit).toMatch(
      /ne doit pas entraîner de distorsion de concurrence · condition limitée au public et à l'espace visés par l'objet de la structure\. »/,
    );
  });
});

describe("Pièces d'une entité de droit étranger · ONG et EUP ne se confondent pas (C5)", () => {
  it("dit l'impossibilité de l'ONG étrangère comme une lecture des pièces de l'art. 2", () => {
    const dit = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, droitEtranger: true }),
    ).avertissements.join(' ');
    expect(dit).toMatch(/parmi les pièces que l'ONG étrangère joint à sa demande d'attestation \(art\. 2\)\. Il s'ensuit/);
  });

  it("ne sert ni l'art. 37 ni les pièces de l'EUP de droit national à un EUP étranger, et dit que l'arrêté ne règle pas ce cas", async () => {
    const s = service(tenant({ forme: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE, droitEtranger: true }));
    const r = await s.exemptionIs('t1');
    expect(r.droitEtranger).toBe(true);
    const dit = r.avertissements.join(' ');
    expect(dit).toMatch(/L'arrêté ne règle pas le cas d'un établissement d'utilité publique de droit étranger/);
    expect(dit).toMatch(/Pièces à joindre à la demande : non fixées par l'arrêté pour un établissement de droit étranger/);
    // Art. 37 · propre aux ONG (articleTrenteSeptApplicable).
    expect(/La loi n° 004\/2001, art\. 37/.test(dit)).toBe(false);
    expect(/Pièces à joindre à la demande : arrêté du Ministre ayant la Justice/.test(dit)).toBe(false);
  });

  it("garde les pièces de l'EUP de droit national à un EUP congolais", () => {
    const dit = qualifierExemptionIs(
      tenant({ forme: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE }),
    ).avertissements.join(' ');
    expect(dit).toMatch(/Pièces à joindre à la demande : arrêté du Ministre ayant la Justice/);
  });
});

describe("Le refus du module fiscal n'affirme plus un droit qu'il ne vérifie pas", () => {
  it("affirme l'exemption à une association constituée conformément à la Loi, et à elle seule", async () => {
    const s = service(tenant({ forme: FormeJuridiqueEbnl.ASSOCIATION }));
    await expect(s.resultatFiscal('t1', 'N')).rejects.toThrow(/art\. 5, point 3/);
    await expect(s.resultatFiscal('t1', 'N')).rejects.toThrow(/SYSCOHADA/);
  });

  it("ne l'affirme pas à une ONG · le point 5 renvoie au règlement", async () => {
    const s = service(tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE }));
    await expect(s.resultatFiscal('t1', 'N')).rejects.toThrow(/n'est pas acquise du seul fait du référentiel/);
    await expect(s.resultatFiscal('t1', 'N')).rejects.toThrow(/007\/2025/);
  });

  it("ne l'affirme pas à un établissement d'utilité publique", async () => {
    const s = service(tenant({ forme: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE }));
    await expect(s.resultatFiscal('t1', 'N')).rejects.toThrow(/relève du seul point 5/);
  });

  it("ne l'affirme pas à une unité de gestion de projet", async () => {
    const s = service(tenant({ forme: FormeJuridiqueEbnl.UNITE_GESTION_PROJET }));
    await expect(s.resultatFiscal('t1', 'N')).rejects.toThrow(/hors du champ de la loi n° 004\/2001/);
  });
});

describe("La route ouverte au SYCEBNL · avertir, jamais calculer", () => {
  it("sert la qualification et les avertissements d'une ONG, sans aucun montant", async () => {
    const s = service(tenant({ forme: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE }));
    const r = await s.exemptionIs('t1');
    expect(r.fondement).toBe('ART_5_POINT_3_OU_POINT_5');
    expect(r.formeJuridique).toBe(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE);
    expect(r.avertissements.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(r)).not.toContain('impotDu');
  });

  it("refuse un dossier SYSCOHADA · l'art. 5 de la loi n° 23/053 ne le concerne pas", async () => {
    const s = service(tenant({ referentiel: Referentiel.SYSCOHADA }));
    await expect(s.exemptionIs('t1')).rejects.toThrow(/SYCEBNL/);
  });

  /**
   * Sans cette ouverture, la route hérite du SYSCOHADA de la classe et
   * ReferentielGuard la refuse au seul dossier qu'elle concerne · les
   * avertissements existeraient sans jamais atteindre personne, ce qui est
   * exactement le défaut d'origine.
   */
  it("est ouverte au SYCEBNL par un décorateur de méthode, qui l'emporte sur la classe", () => {
    const surLaMethode = Reflect.getMetadata(REFERENTIELS_KEY, FiscaliteController.prototype.exemptionIs);
    expect(surLaMethode).toEqual([Referentiel.SYCEBNL]);
    expect(Reflect.getMetadata(REFERENTIELS_KEY, FiscaliteController)).toEqual([Referentiel.SYSCOHADA]);
  });
});
