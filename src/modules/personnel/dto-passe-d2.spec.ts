import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LivreDePaieDto, SimulationPaieDto } from './dto/personnel.dto';

/**
 * PASSE D2 · deux portes du corps de requête.
 *  · la majoration des risques professionnels se déclare au niveau NOTIFIÉ,
 *    50 ou 100 (arrêté n° 140/2018, art. 22 et 24), jamais un booléen qui
 *    doublait toujours ;
 *  · les rangs du livre de paie sont ceux de l'arrêté de 2008 (1 à 33).
 */
const erreursSur = async <T extends object>(cls: new () => T, corps: object, champ: string) =>
  (await validate(plainToInstance(cls, corps))).filter((e) => e.property === champ);

describe('Passe D2 · les portes du corps de requête', () => {
  const simulation = { moisDePaie: '2026-03', elements: [] };

  it('la majoration des risques professionnels n’admet que 50 ou 100', async () => {
    for (const ok of [50, 100]) {
      expect(await erreursSur(SimulationPaieDto, { ...simulation, majorationRisquesProfessionnelsPourCent: ok }, 'majorationRisquesProfessionnelsPourCent')).toEqual([]);
    }
    for (const ko of [25, 150, true]) {
      expect(
        (await erreursSur(SimulationPaieDto, { ...simulation, majorationRisquesProfessionnelsPourCent: ko }, 'majorationRisquesProfessionnelsPourCent')).length,
      ).toBe(1);
    }
  });

  it('les rangs du livre de paie sont bornés à 1 et 33', async () => {
    expect(await erreursSur(LivreDePaieDto, { mentionsPortees: [1, 33] }, 'mentionsPortees')).toEqual([]);
    expect((await erreursSur(LivreDePaieDto, { mentionsPortees: [34] }, 'mentionsPortees')).length).toBe(1);
    expect((await erreursSur(LivreDePaieDto, { mentionsPortees: [0] }, 'mentionsPortees')).length).toBe(1);
  });
});
