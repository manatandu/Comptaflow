import { FormeJuridiqueEbnl, Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE CONTRÔLE 25 · l'attestation d'exemption d'impôt sur les sociétés.
 *
 * Arrêté ministériel n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025, art. 2 :
 * « Le bénéfice de l'exemption n'est pas automatique : il passe par une
 * attestation d'exemption. » Sans elle, l'exemption n'est pas obtenue.
 *
 * CE QUE CES TESTS PROTÈGENT EST L'INVERSE DE CE QU'ON ATTEND D'UN CONTRÔLE.
 * Le risque n'est pas qu'il se taise quand il devrait parler · c'est qu'il
 * PARLE quand aucun texte ne le lui permet. Un contrôle qui réclame à une
 * association une pièce que l'arrêté ne lui demande pas, ou qui reproche à un
 * exercice 2024 une obligation entrée en vigueur en 2026, ne lève aucune
 * erreur : il fabrique une anomalie, le cabinet la corrige, et personne ne
 * saura jamais qu'elle n'existait pas.
 */

function service(options: {
  formeJuridique?: FormeJuridiqueEbnl;
  attestationExemptionIs?: string | null;
  dateAttestationExemptionIs?: Date | null;
  droitEtranger?: boolean;
  referentiel?: Referentiel;
  finExercice?: string;
}) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date(`${(options.finExercice ?? '2026-12-31').slice(0, 4)}-01-01`),
        dateFin: new Date(options.finExercice ?? '2026-12-31'),
        dateArreteComptes: null,
      }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        nom: 'Dossier',
        referentiel: options.referentiel ?? Referentiel.SYCEBNL,
        formeJuridique: options.formeJuridique ?? FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
        droitEtranger: options.droitEtranger ?? false,
        // Renseigné pour que la branche ASSOCIATION n'échoue pas sur l'acte
        // manquant, qui est un AUTRE avertissement et brouillerait la lecture.
        actePersonnaliteJuridique: 'Arrêté n° 087/CAB/MIN/J/2024',
        attestationExemptionIs: options.attestationExemptionIs ?? null,
        dateAttestationExemptionIs: options.dateAttestationExemptionIs ?? null,
      }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reevaluationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  } as Record<string, unknown>;
  return new ControlesService(prisma as unknown as PrismaService);
}

const attestation = async (s: ControlesService) =>
  (await s.analyser('t', 'ex')).anomalies.find((a) => a.code === 'ATTESTATION_EXEMPTION_IS_ABSENTE');

describe("contrôle 25 · l'attestation d'exemption d'IS", () => {
  it('signale son absence à une ONG, sur un exercice postérieur à l’entrée en vigueur', async () => {
    const a = await attestation(service({ formeJuridique: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE }));
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    // Le message CITE l'article qui fonde l'exigence · sans lui, l'anomalie
    // n'est pas opposable et le cabinet ne peut pas la vérifier.
    expect(a!.consequence).toContain('art. 2');
    expect(a!.consequence).toContain("n’est pas automatique");
    // Et il dit ce que le logiciel NE conclut pas · l'art. 5 n'attache l'impôt
    // qu'au non-respect des art. 3 et 4, jamais à l'absence d'une pièce.
    expect(a!.consequence).toContain('art. 3');
    expect(a!.consequence).toContain('et 4');
  });

  it('se tait dès que l’attestation est enregistrée', async () => {
    const a = await attestation(service({ attestationExemptionIs: 'DGI/AE/2026/0789' }));
    expect(a).toBeUndefined();
  });

  it("se tait pour une ASSOCIATION · l'arrêté ne vise que les EUP et les ONG", async () => {
    // Art. 1er de l'arrêté. Une association relève du point 3 de l'art. 5 de
    // la loi n° 23/053, qui ne renvoie à aucun texte d'application : lui
    // réclamer une attestation serait une exigence inventée, et rien ne le
    // signalerait · le cabinet irait la demander.
    const a = await attestation(service({ formeJuridique: FormeJuridiqueEbnl.ASSOCIATION }));
    expect(a).toBeUndefined();
  });

  describe('NULL n’est pas « non » · le fondement non qualifiable ne fait rien réclamer', () => {
    // `attestationRequise` vaut NULL quand le logiciel ne peut pas qualifier le
    // fondement. Traiter ce NULL comme un OUI ferait réclamer une attestation à
    // un dossier dont il vient lui-même de dire qu'il ne sait pas de quel point
    // de l'art. 5 il relève · une exigence inventée, sourcée, et fausse.
    //
    // Ces deux cas manquaient, et la mutation `!== false` à la place de
    // `=== true` a SURVÉCU à la première version de ce fichier.
    it("se tait pour une unité de gestion de projet · hors loi n° 004/2001", async () => {
      const a = await attestation(service({ formeJuridique: FormeJuridiqueEbnl.UNITE_GESTION_PROJET }));
      expect(a).toBeUndefined();
    });

    it('se tait pour une forme « AUTRE » · rien n’est qualifiable', async () => {
      const a = await attestation(service({ formeJuridique: FormeJuridiqueEbnl.AUTRE }));
      expect(a).toBeUndefined();
    });
  });

  it('se tait pour un dossier SYSCOHADA · une société commerciale n’est pas une EBNL', async () => {
    const a = await attestation(service({ referentiel: Referentiel.SYSCOHADA }));
    expect(a).toBeUndefined();
  });

  describe("l'entrée en vigueur du 1er janvier 2026 · art. 6", () => {
    // LA BORNE QUI CASSERAIT LE PLUS SILENCIEUSEMENT. Le contrôle est PAR
    // EXERCICE : sans borne, un dossier qui fait analyser 2024 ou 2025 se voit
    // reprocher une pièce qu'aucun texte ne lui demandait alors, au nom d'un
    // arrêté qui n'était pas en vigueur. L'anomalie est plausible, le message
    // est sourcé, et il est faux.
    it('se tait sur un exercice clos le 31 décembre 2025', async () => {
      expect(await attestation(service({ finExercice: '2025-12-31' }))).toBeUndefined();
    });

    it('parle sur un exercice clos le 1er janvier 2026, premier jour couvert', async () => {
      expect(await attestation(service({ finExercice: '2026-01-01' }))).toBeDefined();
    });
  });

  it("ne surveille AUCUNE échéance · l'arrêté n'en fixe aucune", async () => {
    // Aucun des six articles ne fixe de durée de validité, de renouvellement
    // ni de délai. Une attestation ancienne ne doit donc RIEN déclencher : le
    // jour où quelqu'un rétablit un compte à rebours, ce test tombe.
    const vieille = await attestation(
      service({
        attestationExemptionIs: 'DGI/AE/2026/0001',
        dateAttestationExemptionIs: new Date('2026-01-02'),
        finExercice: '2036-12-31',
      }),
    );
    expect(vieille).toBeUndefined();
  });

  it("aucune anomalie du dossier ne parle d'échéance ou de renouvellement d'attestation", async () => {
    // Filet plus large que le précédent : il attrape un contrôle NOUVEAU qui
    // réintroduirait la règle inventée sous un autre code.
    const rapport = await service({ attestationExemptionIs: 'DGI/AE/2026/0001' }).analyser('t', 'ex');
    const texte = JSON.stringify(rapport.anomalies).toLowerCase();
    for (const interdit of ['attestation expirée', 'attestation périmée', 'renouveler l’attestation']) {
      expect(texte).not.toContain(interdit);
    }
  });
});
