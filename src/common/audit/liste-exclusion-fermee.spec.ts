import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLONNES_EXCLUES_PAR_MODELE,
  MARQUEUR_MASQUE,
  colonnesExclues,
  estChampSensible,
  masquer,
} from './champs-audites';

/**
 * LE JOURNAL D'AUDIT NE RECOPIE PAS CE QUE L'API N'EXPOSE PAS.
 *
 * `masquer()` décidait par le NOM du champ · neuf fragments (`motdepasse`,
 * `token`, `secret`…). L'heuristique attrape ce qui s'annonce, et rien
 * d'autre.
 *
 * `User.estOperateurPlateforme` ne s'annonce pas. Le schéma dit de lui
 * « aucun DTO n'expose ce champ, il est donc inatteignable par l'API » et
 * « jamais renvoyé par /utilisateurs ». Pourtant `User` est un modèle audité,
 * la charge `apres` recopie la ligne entière, et `/journal-audit` la rend à
 * tout utilisateur du dossier. Le drapeau désigne le compte de l'exploitant
 * du logiciel présent chez le client · exactement celui qu'on cherche quand
 * on cherche.
 *
 * D'où une liste par colonne, et le test qui la tient FERMÉE.
 */

const RACINE = join(__dirname, '..', '..', '..');

function colonnesDuModele(nom: string): string[] {
  const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
  const bloc = new RegExp(`^model ${nom} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
  if (!bloc) throw new Error(`Modèle ${nom} introuvable dans le schéma.`);
  return bloc[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0]);
}

describe('la liste d’exclusion est fermée sur User', () => {
  // Toute colonne de `User` doit être classée · admise au journal, ou exclue.
  // Une colonne ajoutée demain fait tomber ce test tant que personne ne l'a
  // tranchée. C'est ce qui distingue une liste fermée d'une liste oubliée.
  const ADMISES = [
    'id',
    'tenantId',
    'tenant',
    'email',
    'role',
    'estActif',
    // Attrapé par le fragment `motdepasse` · un sur-masquage sans conséquence,
    // le journal n'a pas besoin de dire si le drapeau valait vrai ou faux.
    'doitChangerMotDePasse',
    'sessionsInvalidesAvant',
    'tentativesEchouees',
    'verrouilleJusqua',
    'createdAt',
  ];

  it('classe chaque colonne de User, sans exception ni oubli', () => {
    const exclues = COLONNES_EXCLUES_PAR_MODELE.User;
    expect([...colonnesDuModele('User')].sort()).toEqual([...ADMISES, ...exclues].sort());
  });

  it('masque estOperateurPlateforme dans la charge d’un événement User', () => {
    const ligne = {
      id: 'u-1',
      email: 'jean@asbl.cd',
      motDePasse: '$2b$10$empreinteBcrypt',
      role: 'COMPTABLE',
      estOperateurPlateforme: true,
    };
    const masque = masquer(ligne, colonnesExclues('User')) as Record<string, unknown>;
    expect(masque.estOperateurPlateforme).toBe(MARQUEUR_MASQUE);
    expect(masque.motDePasse).toBe(MARQUEUR_MASQUE);
    // Ce qui n'est pas sensible reste lisible · un journal qui masque tout ne
    // sert plus de chemin de révision (AUDCIF art. 22, 6°).
    expect(masque.email).toBe('jean@asbl.cd');
    expect(masque.role).toBe('COMPTABLE');
  });

  it('masque à toute profondeur, filtre d’une opération de masse compris', () => {
    const masse = {
      operation: 'updateMany',
      filtre: { tenantId: 'd-1', estOperateurPlateforme: false },
      resultat: { count: 3 },
    };
    const masque = masquer(masse, colonnesExclues('User')) as {
      filtre: Record<string, unknown>;
    };
    expect(masque.filtre.estOperateurPlateforme).toBe(MARQUEUR_MASQUE);
    expect(masque.filtre.tenantId).toBe('d-1');
  });

  it('n’exclut rien sur un modèle qui n’a pas de liste', () => {
    // La liste est nommée modèle par modèle · `estOperateurPlateforme` n'est
    // pas un nom réservé, c'est une colonne de `User`.
    expect(colonnesExclues('Compte').size).toBe(0);
    expect(estChampSensible('estOperateurPlateforme')).toBe(false);
    expect(estChampSensible('estOperateurPlateforme', colonnesExclues('User'))).toBe(true);
  });
});
