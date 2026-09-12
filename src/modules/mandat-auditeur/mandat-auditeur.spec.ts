import { FormeJuridiqueSyscohada, OrganeDesignationAuditeur, Referentiel } from '@prisma/client';
import { MandatAuditeurService } from './mandat-auditeur.service';
import { ControlesService } from '../controles/controles.service';
import { PrismaService } from '../../common/prisma.service';
import { dernierExerciceCouvert, dureeMandat, dureeRamenee } from './duree-mandat';

/**
 * LE CONTRÔLE 6 RÉCLAMAIT DE « VÉRIFIER QUE LE MANDAT EST EN COURS » et aucune
 * table ne le détenait · même forme que `Tenant.longueurCompte`, qui promettait
 * une méthode inexistante. Ce qui suit tient les deux moitiés : les durées, que
 * trois textes chiffrent différemment, et la prorogation de l'art. 22, qui va
 * dans le sens inverse de l'intuition.
 */

type Faux = Record<string, unknown>;

describe('Durée du mandat · trois textes, trois durées', () => {
  it('SYCEBNL · trois exercices, renouvelables UNE FOIS', () => {
    // Art. 21 · « L'auditeur est nommé pour trois (3) exercices renouvelables
    // une fois. »
    const d = dureeMandat(Referentiel.SYCEBNL, null, 'ASSEMBLEE_GENERALE_ORDINAIRE');
    expect(d.exercices).toBe(3);
    expect(d.mandatsMaximum).toBe(2);
    expect(d.source).toContain('SYCEBNL art. 21');
  });

  it('SA · DEUX exercices par les statuts, SIX par l’assemblée ordinaire', () => {
    // Art. 704 · la durée dépend de l'ORGANE, pas seulement de la forme. La
    // déduire de la forme seule donnerait un mandat trois fois trop long ou
    // trois fois trop court, sans qu'aucun écran ne le dise.
    const statuts = dureeMandat(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_ANONYME, 'STATUTS_OU_AG_CONSTITUTIVE');
    const ago = dureeMandat(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_ANONYME, 'ASSEMBLEE_GENERALE_ORDINAIRE');
    expect(statuts.exercices).toBe(2);
    expect(ago.exercices).toBe(6);
    expect(statuts.source).not.toBe(ago.source);
  });

  it('SARL · trois exercices, et AUCUNE limite de renouvellement', () => {
    // Le « trois » de l'art. 379 n'est PAS celui du SYCEBNL · neuvième
    // occurrence du piège « un nombre, deux sens ». Transposer la limite du
    // SYCEBNL inventerait une interdiction que l'AUSCGIE n'écrit pas.
    const d = dureeMandat(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, 'ASSOCIES');
    expect(d.exercices).toBe(3);
    expect(d.mandatsMaximum).toBeNull();
    expect(d.source).toContain('AUSCGIE art. 379');
  });

  it('SAS et SNC · aucune durée lue, et le module le DIT', () => {
    // Une règle absente est déclarée absente, jamais remplacée par la plus
    // proche · même discipline que `regles-auditeur.ts`.
    for (const forme of [
      FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
      FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
      FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
    ]) {
      const d = dureeMandat(Referentiel.SYSCOHADA, forme, 'ASSEMBLEE_GENERALE_ORDINAIRE');
      expect(d.exercices).toBeNull();
      expect(d.source).toMatch(/aucun texte lu/i);
    }
  });

  it('la réduction à l’existence de l’entité est PROPRE au SYCEBNL', () => {
    // Art. 21, seconde phrase. Aucun article lu de l'AUSCGIE ne la porte : la
    // transposer raccourcirait un mandat que le texte ne raccourcit pas.
    expect(dureeRamenee(Referentiel.SYCEBNL, 3, 2)).toBe(2);
    expect(dureeRamenee(Referentiel.SYSCOHADA, 3, 2)).toBe(3);
    // Un dossier sans aucun exercice ne rend pas une durée nulle.
    expect(dureeRamenee(Referentiel.SYCEBNL, 3, 0)).toBe(1);
  });

  it('le dernier exercice couvert compte le PREMIER · pas un rang de plus', () => {
    // AUSCGIE art. 705 · les fonctions expirent à l'assemblée statuant sur les
    // comptes du deuxième (ou du sixième) exercice. L'erreur d'un rang ne casse
    // rien : le dossier croirait son contrôleur en fonction un an de trop.
    expect(dernierExerciceCouvert(2026, 3)).toBe(2028);
    expect(dernierExerciceCouvert(2026, 1)).toBe(2026);
  });
});

// ---------------------------------------------------------------------------

function service(referentiel: Referentiel, formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null, nbExercices = 5) {
  const cree: Faux[] = [];
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel, formeJuridiqueSyscohada }) },
    exercice: { count: jest.fn().mockResolvedValue(nbExercices) },
    mandatAuditeur: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        cree.push(data);
        return Promise.resolve({ id: 'm1', ...data });
      }),
    },
  } as Faux;
  return { svc: new MandatAuditeurService(prisma as unknown as PrismaService), cree };
}

const mandatValide = {
  nom: 'Cabinet X',
  inscriptionOrdre: 'ONEC/EC/2019/114',
  organeDesignation: OrganeDesignationAuditeur.ASSEMBLEE_GENERALE_ORDINAIRE,
  dateDesignation: '2026-06-12',
  premierExercice: 2026,
  nombreExercices: 3,
};

describe('Enregistrement du mandat · ce que les textes refusent', () => {
  it('enregistre un mandat conforme', async () => {
    const { svc, cree } = service(Referentiel.SYCEBNL, null);
    await svc.enregistrer('t', mandatValide);
    expect(cree[0].nombreExercices).toBe(3);
    expect(cree[0].inscriptionOrdre).toBe('ONEC/EC/2019/114');
  });

  it('REFUSE un auditeur sans référence d’inscription au tableau de l’ordre', async () => {
    // SYCEBNL art. 20. Le logiciel ne consulte aucun tableau · il exige la
    // référence parce que c'est elle qu'un réviseur demandera, et le message le
    // dit plutôt que de laisser croire à une vérification.
    const { svc } = service(Referentiel.SYCEBNL, null);
    await expect(svc.enregistrer('t', { ...mandatValide, inscriptionOrdre: '   ' })).rejects.toThrow(
      /tableau de l’ordre/i,
    );
    await expect(svc.enregistrer('t', { ...mandatValide, inscriptionOrdre: '' })).rejects.toThrow(
      /ne vérifie pas|sans la vérifier/i,
    );
  });

  it('REFUSE un TROISIÈME mandat au SYCEBNL · « renouvelables une fois »', async () => {
    const { svc } = service(Referentiel.SYCEBNL, null);
    await expect(svc.enregistrer('t', { ...mandatValide, rang: 3 })).rejects.toThrow(/renouvelables UNE FOIS/i);
    await expect(svc.enregistrer('t', { ...mandatValide, rang: 2 })).resolves.toBeDefined();
  });

  it('N’INVENTE PAS cette limite pour une SARL', async () => {
    // Aucun article lu de l'AUSCGIE ne borne le renouvellement · refuser ici
    // serait un signalement faux du § 10 bis.
    const { svc } = service(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    await expect(
      svc.enregistrer('t', {
        ...mandatValide,
        organeDesignation: OrganeDesignationAuditeur.ASSOCIES,
        rang: 4,
      }),
    ).resolves.toBeDefined();
  });

  it('REFUSE une durée que le texte contredit, et LAISSE libre celle qu’aucun texte ne fixe', async () => {
    const sarl = service(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    await expect(
      sarl.svc.enregistrer('t', { ...mandatValide, organeDesignation: OrganeDesignationAuditeur.ASSOCIES, nombreExercices: 6 }),
    ).rejects.toThrow(/3 exercice/);
    // La SAS n'a aucune durée chiffrée · toute durée passe, et c'est voulu.
    const sas = service(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE);
    await expect(sas.svc.enregistrer('t', { ...mandatValide, nombreExercices: 5 })).resolves.toBeDefined();
  });

  it('ramène la durée à l’existence de l’entité, et le DIT', async () => {
    // Deux exercices seulement au dossier · art. 21, seconde phrase.
    const { svc } = service(Referentiel.SYCEBNL, null, 2);
    const proposee = await svc.dureeProposee('t', OrganeDesignationAuditeur.ASSEMBLEE_GENERALE_ORDINAIRE);
    expect(proposee.exercices).toBe(2);
    expect(proposee.ramenee).toBe(true);
    await expect(svc.enregistrer('t', mandatValide)).rejects.toThrow(/ramenée à la durée d’existence/);
  });
});

// ---------------------------------------------------------------------------

function serviceControles(mandats: Faux[], formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null = null) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2029-01-01'),
        dateFin: new Date('2029-12-31'),
        dateArreteComptes: new Date('2030-03-31'),
      }),
    },
    tenant: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 't', referentiel: Referentiel.SYSCOHADA, formeJuridiqueSyscohada }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue(mandats) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService);
}

const anomalie = async (code: string, mandats: Faux[]) => {
  // La société anonyme porte une obligation SANS seuil (AUSCGIE art. 702) ·
  // c'est le seul moyen de déclencher le contrôle sur une balance vide.
  const rapport = await serviceControles(mandats, FormeJuridiqueSyscohada.SOCIETE_ANONYME).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === code);
};

describe('Le contrôle du mandat · et le piège de l’article 22', () => {
  it('signale l’ABSENCE totale de mandat sur un dossier qui en doit un', async () => {
    const a = await anomalie('AUDITEUR_OBLIGATOIRE_SANS_MANDAT', []);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
  });

  it('se TAIT quand un mandat couvre l’exercice', async () => {
    const couvrant = [{ id: 'm', nom: 'Cabinet X', premierExercice: 2027, nombreExercices: 3, refusDeProrogation: false }];
    expect(await anomalie('AUDITEUR_OBLIGATOIRE_SANS_MANDAT', couvrant)).toBeUndefined();
    expect(await anomalie('MANDAT_AUDITEUR_PROROGE', couvrant)).toBeUndefined();
  });

  it('un mandat ÉCHU n’est PAS un trou · il est prorogé de plein droit (art. 22)', async () => {
    // LE PIÈGE DU CHANTIER. Crier « mandat expiré » ici serait un signalement
    // faux : le texte dit que la mission CONTINUE. Le dire est utile, le
    // reprocher est faux · d'où INFORMATION et jamais AVERTISSEMENT.
    const echu = [{ id: 'm', nom: 'Cabinet X', premierExercice: 2024, nombreExercices: 3, refusDeProrogation: false }];
    expect(await anomalie('AUDITEUR_OBLIGATOIRE_SANS_MANDAT', echu)).toBeUndefined();
    const a = await anomalie('MANDAT_AUDITEUR_PROROGE', echu);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.consequence).toContain('art. 22');
    expect(a!.consequence).toMatch(/PROROGÉE/);
  });

  it('SEUL le refus exprès rouvre le trou · l’unique fait que l’art. 22 oppose', async () => {
    const refuse = [{ id: 'm', nom: 'Cabinet X', premierExercice: 2024, nombreExercices: 3, refusDeProrogation: true }];
    const a = await anomalie('MANDAT_AUDITEUR_SANS_PROROGATION', refuse);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(await anomalie('MANDAT_AUDITEUR_PROROGE', refuse)).toBeUndefined();
  });
});
