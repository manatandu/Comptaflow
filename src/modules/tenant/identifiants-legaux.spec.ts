import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TenantService } from './tenant.service';
import { ModifierIdentiteDto } from './dto/parametres-dossier.dto';

/**
 * IDENTIFIANTS LÉGAUX D'UNE ENTITÉ À BUT NON LUCRATIF · voir
 * docs/identifiants-legaux-ebnl-rdc.md. Deux règles se jouent ici, et aucune
 * ne se voit à la lecture du modèle : la chaîne vide EFFACE (elle ne devient
 * pas la chaîne « » stockée), et la date vide doit passer la validation, sans
 * quoi une date saisie par erreur serait indélébile.
 */
describe('Identifiants légaux du dossier', () => {
  const tenant = { id: 't1' } as never;
  const service = (capture: { data?: Record<string, unknown> }) =>
    new TenantService({
      tenant: {
        findUnique: async () => tenant,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capture.data = data;
          return tenant;
        },
      },
      ecriture: { count: async () => 0 },
    } as never);

  it('la chaîne vide EFFACE l’identifiant, l’absence de champ n’y touche pas', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture);
    // parametres() relit le dossier en fin de méthode · le stub le sert, seul
    // le `data` de l'update nous intéresse ici.
    await s.modifierIdentite('t1', { numeroImpot: '  A1234567B  ', idNat: '' });
    expect(capture.data!.numeroImpot).toBe('A1234567B');
    expect(capture.data!.idNat).toBeNull();
    // Jamais transmis = jamais modifié (et non « remis à null »).
    expect(capture.data!.rccm).toBeUndefined();
    expect(capture.data!.actePersonnaliteJuridique).toBeUndefined();
  });

  it('la date de l’acte s’efface par une chaîne vide et se pose par une date ISO', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture);
    await s.modifierIdentite('t1', { dateActePersonnalite: '' });
    expect(capture.data!.dateActePersonnalite).toBeNull();
    await s.modifierIdentite('t1', { dateActePersonnalite: '2024-06-12' });
    expect((capture.data!.dateActePersonnalite as Date).toISOString().slice(0, 10)).toBe('2024-06-12');
  });

  it('la validation accepte la date vide · sans quoi l’effacement serait refusé', async () => {
    const vide = plainToInstance(ModifierIdentiteDto, { dateActePersonnalite: '' });
    expect(await validate(vide)).toHaveLength(0);
    const bonne = plainToInstance(ModifierIdentiteDto, { dateActePersonnalite: '2024-06-12' });
    expect(await validate(bonne)).toHaveLength(0);
    // Une date qui n'en est pas une reste refusée.
    const mauvaise = plainToInstance(ModifierIdentiteDto, { dateActePersonnalite: '12 juin' });
    expect(await validate(mauvaise)).not.toHaveLength(0);
  });

  it('l’acte de personnalité juridique tient 120 caractères · un numéro d’arrêté est long', async () => {
    const long = plainToInstance(ModifierIdentiteDto, {
      actePersonnaliteJuridique: 'Arrêté ministériel n° 087/CAB/MIN/J&GS/2024 du 12 juin 2024 portant octroi de la personnalité juridique',
    });
    expect(await validate(long)).toHaveLength(0);
  });
});
