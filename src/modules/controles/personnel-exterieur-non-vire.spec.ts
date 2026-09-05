import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE VIREMENT 637 → 667, ÉCRIT DANS LES DEUX TEXTES.
 *
 *  · SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 63 : « à la clôture de
 *    l'exercice, le compte 637 est viré, POUR SOLDE, au débit du compte 667
 *    Rémunération transférée de personnel extérieur ». La fiche du COMPTE 66
 *    le redit : « ce virement solde le compte 637 ».
 *  · AUDCIF, Titre VIII ch. 27 § 2 : « les comptes 6371 et 6372 sont virés,
 *    pour solde, au débit du compte 667 ».
 *
 * Chacun l'écrit dans SON texte · le contrôle ne transpose rien, et cite la
 * source du référentiel du dossier.
 *
 * CE QUE RIEN NE VOYAIT. Le virement oublié laisse la charge sur la ligne
 * « Services extérieurs » au lieu de « Charges de personnel ». Le résultat net
 * est identique au franc près, les deux comptes étant en classe 6 : la balance
 * boucle, le bilan boucle, aucun contrôle d'équilibre ne peut se déclencher.
 * Seule la présentation du compte de résultat est fausse · et au SYSCOHADA, la
 * cascade des soldes intermédiaires que l'art. 31 impose de faire apparaître.
 */

const ligne = (numero: string, intitule: string, debit: number, credit = 0) => ({
  debit,
  credit,
  compte: { numero, intitule },
});

function service(lignes637: ReturnType<typeof ligne>[], referentiel: Referentiel = Referentiel.SYCEBNL) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 14 est le seul à interroger ligneEcriture avec un préfixe de
    // compte · les autres passent par ecriture/compte, servis à vide ci-dessus.
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes637) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 21 lit le manuel des procédures (AUDCIF art. 16 al. 1) ·
    // sans ce faux, il croirait la table absente plutôt que le manuel.
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    // Dossiers de subvention · vides ici, ces specs ne les testent pas. Sans
    // cette doublure, le contrôle 24 tomberait sur undefined.
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const signale = async (lignes: ReturnType<typeof ligne>[], referentiel: Referentiel = Referentiel.SYCEBNL) => {
  const rapport = await service(lignes, referentiel).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'PERSONNEL_EXTERIEUR_NON_VIRE');
};

describe('personnel extérieur resté au compte 637', () => {
  it('signale un solde débiteur non viré', async () => {
    const a = await signale([ligne('63710000', 'Personnel intérimaire', 4_500_000)]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences).toHaveLength(1);
    expect(a!.occurrences[0].montant).toBe(4_500_000);
    // La conséquence doit dire pourquoi rien ne le signale · sans cela,
    // l'utilisateur cherche un déséquilibre qui n'existe pas.
    expect(a!.consequence).toContain('résultat net ne bouge pas');
    expect(a!.consequence).toContain('Services extérieurs');
  });

  it('se tait quand le virement a été passé', async () => {
    // Le débit de l'exercice, puis le virement pour solde au crédit.
    const a = await signale([
      ligne('63710000', 'Personnel intérimaire', 4_500_000),
      ligne('63710000', 'Personnel intérimaire', 0, 4_500_000),
    ]);
    expect(a).toBeUndefined();
  });

  it('se tait quand aucun personnel extérieur n’a été facturé', async () => {
    expect(await signale([])).toBeUndefined();
  });

  it('additionne par sous-compte et les cite un à un', async () => {
    const a = await signale([
      ligne('63710000', 'Personnel intérimaire', 3_000_000),
      ligne('63710000', 'Personnel intérimaire', 1_000_000),
      ligne('63720000', 'Personnel détaché ou prêté à l’entité', 2_000_000),
    ]);
    expect(a!.occurrences.map((o) => o.montant)).toEqual([4_000_000, 2_000_000]);
  });

  it('cite le texte du référentiel du dossier, jamais celui de l’autre', async () => {
    const sycebnl = await signale([ligne('63710000', 'Personnel intérimaire', 1)], Referentiel.SYCEBNL);
    expect(sycebnl!.consequence).toContain('SYCEBNL, Partie 2 ch. 3');
    expect(sycebnl!.consequence).not.toContain('Titre VIII ch. 27');

    const syscohada = await signale([ligne('63710000', 'Personnel intérimaire', 1)], Referentiel.SYSCOHADA);
    expect(syscohada!.consequence).toContain('AUDCIF, Titre VIII ch. 27');
    expect(syscohada!.consequence).not.toContain('SYCEBNL');
  });
});
