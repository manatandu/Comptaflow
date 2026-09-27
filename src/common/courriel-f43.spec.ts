import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { normaliserCourriel } from './courriel';
import { LoginDto } from '../modules/auth/dto/login.dto';
import { RegisterDto } from '../modules/auth/dto/register.dto';
import { ChangerAdresseDto } from '../modules/auth/dto/changer-adresse.dto';
import { CreerUtilisateurDto } from '../modules/utilisateurs/dto/utilisateur.dto';
import { CreerCabinetDto, PreparerDemonstrationDto, ReinitialiserAdminDto } from '../modules/plateforme/dto/plateforme.dto';
import { CreerCelluleDto } from '../modules/groupe/dto/groupe.dto';
import { AuthService } from '../modules/auth/auth.service';
import { UtilisateurService } from '../modules/utilisateurs/utilisateur.service';
import { PrismaService } from './prisma.service';
import * as bcrypt from 'bcryptjs';

/**
 * AUDIT FINAL F43 · L'ADRESSE DE CONNEXION EST NORMALISÉE À CHAQUE PORTE.
 *
 * L'unicité des adresses est sensible à la casse, la promotion d'un opérateur
 * ne l'était pas · un compte « ADMIN@… » créé dans n'importe quel dossier
 * recevait la console au déploiement suivant. Les portes normalisent, les
 * services aussi (siège et console appellent `register` sans passer par
 * HTTP), et la base refuse le reste (migration 20261125000000).
 */
const BRUTE = '  Admin@VMGConsulting.NET ';
const NETTE = 'admin@vmgconsulting.net';

describe('F43 · la règle', () => {
  it('retire les espaces et passe en minuscules', () => {
    expect(normaliserCourriel(BRUTE)).toBe(NETTE);
  });
});

describe('F43 · chaque porte qui reçoit une adresse de COMPTE la normalise', () => {
  const cas: Array<[string, new () => object, string]> = [
    ['connexion', LoginDto, 'email'],
    ['inscription', RegisterDto, 'email'],
    ['changement d’adresse', ChangerAdresseDto, 'nouvelleAdresse'],
    ['utilisateur du dossier', CreerUtilisateurDto, 'email'],
    ['cabinet de la console', CreerCabinetDto, 'emailAdmin'],
    ['réinitialisation par la console', ReinitialiserAdminDto, 'email'],
    ['dossier de démonstration', PreparerDemonstrationDto, 'email'],
    ['cellule du siège', CreerCelluleDto, 'emailAdmin'],
  ];
  it.each(cas)('%s', (_nom, Classe, champ) => {
    const dto = plainToInstance(Classe, { [champ]: BRUTE }) as Record<string, unknown>;
    expect(dto[champ]).toBe(NETTE);
  });

  it('aucune adresse de compte n’entre par un DTO sans être normalisée', () => {
    // Les fichiers qui portent une adresse de COMPTE · une adresse de tiers,
    // de banque ou de l'entité n'ouvre aucune session.
    const fichiers = [
      '../modules/auth/dto/login.dto.ts',
      '../modules/auth/dto/register.dto.ts',
      '../modules/auth/dto/changer-adresse.dto.ts',
      '../modules/utilisateurs/dto/utilisateur.dto.ts',
      '../modules/plateforme/dto/plateforme.dto.ts',
      '../modules/groupe/dto/groupe.dto.ts',
    ];
    for (const f of fichiers) {
      const lignes = readFileSync(join(__dirname, f), 'utf8').split('\n');
      lignes.forEach((ligne, i) => {
        if (ligne.includes('@IsEmail(')) expect(`${f}:${i + 1} ${lignes[i - 1].trim()}`).toContain('@CourrielNormalise()');
      });
    }
  });
});

describe('F43 · les services normalisent aussi', () => {
  it('la connexion cherche l’adresse normalisée', async () => {
    const recherches: unknown[] = [];
    const s = new AuthService(
      { user: { findUnique: async (a: unknown) => (recherches.push(a), null) } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(s.login({ email: BRUTE, motDePasse: 'x' } as never)).rejects.toThrow(/Identifiants invalides/);
    expect(recherches).toEqual([{ where: { email: NETTE } }]);
  });

  const auth = (prisma: unknown) =>
    new AuthService(prisma as never, { sign: () => 'jeton' } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  it('le changement d’adresse écrit l’adresse normalisée', async () => {
    const ecrites: Array<{ data: { email: string } }> = [];
    const hache = await bcrypt.hash('actuel-123456', 4);
    const s = auth({
      user: {
        findUnique: async () => ({ id: 'u1', email: 'ancienne@exemple.cd', motDePasse: hache }),
        update: async (a: { data: { email: string } }) => (ecrites.push(a), a),
      },
    });
    const r = await s.changerAdresse('u1', 'actuel-123456', BRUTE);
    expect(r.adresse).toBe(NETTE);
    expect(ecrites[0].data.email).toBe(NETTE);
  });

  it('l’inscription appelée sans passer par HTTP (siège, console) normalise elle-même', async () => {
    const vus: unknown[] = [];
    const s = auth({
      user: { findUnique: async (a: unknown) => (vus.push(a), { id: 'deja' }) },
    });
    await expect(s.register({ nomEntite: 'X', referentiel: 'SYCEBNL', email: BRUTE, motDePasse: 'motdepasse12' } as never)).rejects.toThrow(/existe déjà/);
    expect(vus).toEqual([{ where: { email: NETTE } }]);
  });

  it('un utilisateur créé par l’administrateur du dossier naît avec l’adresse normalisée', async () => {
    const crees: Array<{ data: { email: string } }> = [];
    const recherches: unknown[] = [];
    const prisma = {
      user: {
        findUnique: async (a: unknown) => (recherches.push(a), null),
        create: async (a: { data: { email: string } }) => (crees.push(a), a.data),
      },
    };
    await new UtilisateurService(prisma as unknown as PrismaService).creer('t1', {
      email: BRUTE,
      motDePasse: 'motdepasse12',
      role: 'COMPTABLE',
    } as never);
    expect(recherches).toEqual([{ where: { email: NETTE } }]);
    expect(crees[0].data.email).toBe(NETTE);
  });
});
