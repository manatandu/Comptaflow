import { BadRequestException } from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import type { DecompteFinalDto } from './dto/personnel.dto';

/**
 * LE CÂBLAGE DU DÉCOMPTE · le moteur pur est éprouvé dans son spec ; ici, ce
 * que le service ajoute · le refus des combinaisons exclues, et la lecture de
 * la colonne 19 de la grille du mois de cessation, versions du cabinet
 * comprises. La doublure honore le filtre (dossier, barème, mois).
 */
function service(versions: { tenantId: string; bareme: string; aPartirDu: string; smig: number }[]) {
  const prisma = {
    versionBaremePaie: {
      findFirst: jest.fn(async (args: { where: { tenantId: string; bareme: string; aPartirDu: { lt: string } } }) => {
        const w = args.where;
        const l = versions
          .filter((v) => v.tenantId === w.tenantId && v.bareme === w.bareme && v.aPartirDu < w.aPartirDu.lt)
          .sort((a, b) => (a.aPartirDu < b.aPartirDu ? 1 : -1))[0];
        return l
          ? { bareme: l.bareme, aPartirDu: l.aPartirDu, reference: 'Arrêté d’essai n° 1/2027', valeurs: { smigJournalierFc: l.smig } }
          : null;
      }),
    },
  } as unknown as PrismaService;
  return new PersonnelService(prisma);
}

const DTO: DecompteFinalDto = {
  anneesAnciennete: 1,
  moisNonCouvertsParUnConge: 12,
  initiative: 'EMPLOYEUR',
  motif: 'LICENCIEMENT',
  typeContrat: 'DUREE_INDETERMINEE',
  enfantsBeneficiairesAllocations: 1,
  joursAllocationsFamiliales: 10,
};

describe('le service du décompte final', () => {
  it('refuse une démission posée à l’initiative de l’employeur', async () => {
    await expect(service([]).decompteFinal('t1', { ...DTO, motif: 'DEMISSION' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lit la colonne 19 de la grille du mois de cessation', async () => {
    const v = await service([]).decompteFinal('t1', { ...DTO, moisDeCessation: '2026-03' });
    expect(v.horsBrut[0].montantFc).toBeCloseTo(10 * 796.3, 6);
  });

  it('prend la version du cabinet du dossier, et celle-là seule', async () => {
    const versions = [
      { tenantId: 't1', bareme: 'SMIG', aPartirDu: '2027-01-01', smig: 27_000 },
      { tenantId: 't2', bareme: 'SMIG', aPartirDu: '2027-01-01', smig: 99_000 },
    ];
    const v = await service(versions).decompteFinal('t1', { ...DTO, moisDeCessation: '2027-02' });
    expect(v.horsBrut[0].montantFc).toBeCloseTo(10 * 1000, 6);
  });

  it('laisse les allocations indéterminées sans mois de cessation', async () => {
    const v = await service([]).decompteFinal('t1', DTO);
    expect(v.horsBrut[0].montantFc).toBeNull();
  });
});
