import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsBoolean, IsDateString, IsOptional, IsString, ValidateIf } from 'class-validator';
import { FacultatifNonNul } from './facultatif-non-nul';

/**
 * FACULTATIF NE VEUT PAS DIRE NULLABLE (2026-09-28).
 *
 * Le décorateur est éprouvé À TRAVERS LE PIPE DE PRODUCTION, pas par
 * `validate` seul · c'est le pipe qui transforme un refus en 400, et un refus
 * qui n'arriverait qu'au service rendrait le 500 que ce correctif ferme. Le
 * premier test relit `bootstrap.ts` et exige que ces options soient celles
 * du pipe global, pour que ce banc ne se mette pas à valider un autre pipe.
 */

const OPTIONS_DU_PIPE_GLOBAL = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** Passe un corps au pipe global et rend le refus, ou null s'il passe. */
async function refusDuPipe(metatype: new () => object, corps: Record<string, unknown>): Promise<BadRequestException | null> {
  const pipe = new ValidationPipe(OPTIONS_DU_PIPE_GLOBAL);
  try {
    await pipe.transform(corps, { type: 'body', metatype, data: undefined });
    return null;
  } catch (e) {
    if (e instanceof BadRequestException) return e;
    throw e;
  }
}

/** Les motifs portés par un refus du pipe. */
function motifsDu(refus: BadRequestException | null): string[] {
  if (!refus) return [];
  const reponse = refus.getResponse() as { message?: string[] | string };
  return Array.isArray(reponse.message) ? reponse.message : [String(reponse.message)];
}

const MOTIF = 'La coche se répond par true ou false, jamais par null.';
const MOTIF_DATE = 'La date ne s’efface pas par null · une chaîne vide l’efface.';

class Banc {
  @FacultatifNonNul(MOTIF)
  @IsBoolean()
  coche?: boolean;

  // Le voisinage d'une date effaçable · la chaîne vide garde son effet.
  @FacultatifNonNul(MOTIF_DATE)
  @ValidateIf((o: Banc) => o.date !== '')
  @IsDateString()
  date?: string;

  // Témoin · le comportement que le correctif remplace.
  @IsOptional()
  @IsString()
  libre?: string;
}

describe('FacultatifNonNul · à travers le pipe global', () => {
  it('les options du banc sont celles du pipe global de bootstrap.ts', () => {
    const source = readFileSync(join(__dirname, '..', 'bootstrap.ts'), 'utf8');
    expect(source).toContain('app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))');
  });

  it('absent = inchangé · le champ se laisse omettre', async () => {
    expect(await refusDuPipe(Banc, {})).toBeNull();
  });

  it('null est refusé en 400, avec le motif nommé', async () => {
    const refus = await refusDuPipe(Banc, { coche: null });
    expect(refus).not.toBeNull();
    expect(refus!.getStatus()).toBe(400);
    expect(motifsDu(refus)).toContain(MOTIF);
  });

  it('une valeur présente reste validée comme avant', async () => {
    expect(await refusDuPipe(Banc, { coche: false })).toBeNull();
    expect(motifsDu(await refusDuPipe(Banc, { coche: 'oui' }))).not.toHaveLength(0);
  });

  it('la chaîne vide d’une date effaçable passe encore, null non', async () => {
    expect(await refusDuPipe(Banc, { date: '' })).toBeNull();
    expect(await refusDuPipe(Banc, { date: '2027-08-31' })).toBeNull();
    expect(motifsDu(await refusDuPipe(Banc, { date: null }))).toContain(MOTIF_DATE);
  });

  it('témoin · `@IsOptional` laisse passer null, et c’est ce que le décorateur ferme', async () => {
    expect(await refusDuPipe(Banc, { libre: null })).toBeNull();
  });
});
