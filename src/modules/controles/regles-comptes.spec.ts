import { REGLES_COMPTES_SYCEBNL } from './regles-comptes-sycebnl';
import { REGLES_COMPTES_SYSCOHADA } from './regles-comptes-syscohada';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { DossierRevisionService } from './dossier-revision.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * RÈGLES PAR COMPTE · ce que le texte SYCEBNL dit de chaque compte et que le
 * logiciel ignorait.
 *
 * Deux rubriques de la Partie 2 chapitre 3, transcrites verbatim :
 *
 *  · « Exclusions » · ce que le compte ne doit PAS enregistrer, et le compte
 *    à utiliser à la place. C'est un avertissement d'imputation, opposable
 *    parce qu'il cite le texte.
 *  · « Éléments de contrôle » · les pièces qui justifient le solde. C'est le
 *    dossier de révision, compte par compte.
 *
 * Ces tests éprouvent l'EXTRACTION. Une règle mal extraite ne lève aucune
 * erreur : elle avertit à tort, ou n'avertit pas.
 */

const NUMEROS_PLAN = PLAN_COMPTES_SYCEBNL.map((c) => c.numero);
const existe = (n: string) => NUMEROS_PLAN.some((p) => p.startsWith(n) || n.startsWith(p));

describe('couverture du chapitre 3', () => {
  it('porte les 79 fiches · 77 comptes des classes 1 à 8, plus 90 et 91', () => {
    // La classe 9 ne présente pas de fiche par compte : le texte traite 90 et
    // 91 ENSEMBLE sous une sous-section. Les écarter aurait perdu une règle
    // vraie, ils reçoivent donc le même texte, ce que le texte dit lui-même.
    // Même partage pour 62 et 63, sous un seul titre (passe R5-C5).
    expect(REGLES_COMPTES_SYCEBNL).toHaveLength(79);
    expect(REGLES_COMPTES_SYCEBNL.filter((r) => r.exclusions)).toHaveLength(71);
    expect(REGLES_COMPTES_SYCEBNL.filter((r) => r.elementsDeControle)).toHaveLength(78);
  });

  it('le 63 a sa fiche, sur le texte commun aux comptes 62 et 63 (R5-C5)', () => {
    const par = (n: string) => REGLES_COMPTES_SYCEBNL.find((r) => r.numero === n)!;
    expect([par('62').intitule, par('63').intitule]).toEqual(['Services extérieurs', 'Autres services extérieurs']);
    expect(par('63').elementsDeControle).toContain('Les comptes 62 et 63');
    expect(par('63').elementsDeControle).toBe(par('62').elementsDeControle);
    expect(DossierRevisionService.regleDe('63100000', REGLES_COMPTES_SYCEBNL)?.numero).toBe('63');
  });

  it('les trois fiches à TROIS chiffres sont là', () => {
    // 603, 659 et 759 · le texte descend d'un cran là où la division le
    // demande, et un motif à deux chiffres les perdait en silence.
    const numeros = REGLES_COMPTES_SYCEBNL.map((r) => r.numero);
    expect(numeros).toEqual(expect.arrayContaining(['603', '659', '759']));
  });

  it('aucun doublon · une fiche par compte', () => {
    const numeros = REGLES_COMPTES_SYCEBNL.map((r) => r.numero);
    expect(numeros.filter((n, i) => numeros.indexOf(n) !== i)).toEqual([]);
  });
});

describe('les comptes cités existent', () => {
  it('chaque fiche porte un numéro du plan SYCEBNL', () => {
    const fantomes = REGLES_COMPTES_SYCEBNL.filter((r) => !existe(r.numero)).map((r) => r.numero);
    expect(fantomes).toEqual([]);
  });

  it('chaque compte À UTILISER existe au plan', () => {
    const fantomes = [
      ...new Set(
        REGLES_COMPTES_SYCEBNL.flatMap((r) => r.comptesAUtiliser.map((n) => `${r.numero} → ${n}`)).filter((paire) => {
          const n = paire.split(' → ')[1];
          return !existe(n);
        }),
      ),
    ].sort();
    expect(fantomes).toEqual([]);
  });
});

describe('un compte ne se propose jamais en remplacement de lui-même', () => {
  it('aucune fiche ne se cite', () => {
    // LE DÉFAUT CORRIGÉ LE 2026-09-03. Prendre tous les nombres du bloc était
    // faux : la phrase nomme d'ABORD les comptes exclus. Le bloc du compte 10
    // dit « Les comptes 101 et 102 ne doivent pas servir à … (utiliser 104) »,
    // et l'extraction naïve proposait 101 et 102 comme remplacement d'eux-
    // mêmes. Seuls comptent les numéros qui SUIVENT « utiliser ».
    //
    // La comparaison porte sur le numéro EXACT, pas sur le préfixe : une
    // SUBDIVISION du même compte est un remplacement parfaitement valable, et
    // le texte s'en sert. Le compte 65 renvoie à son propre 659 (« charges
    // pour dépréciations et provisions à court terme »), et la fiche 10
    // renvoie de 101/102 vers 104. Interdire le préfixe rejetterait ces deux
    // règles vraies.
    const boucles = REGLES_COMPTES_SYCEBNL.filter((r) => r.comptesAUtiliser.includes(r.numero)).map(
      (r) => `${r.numero} → ${r.comptesAUtiliser.join(', ')}`,
    );
    expect(boucles).toEqual([]);
  });

  it('les trois cas de référence sont extraits comme le texte les écrit', () => {
    const par = (n: string) => REGLES_COMPTES_SYCEBNL.find((r) => r.numero === n)!;
    // « (utiliser 104 - Dotation consomptible) » et non 101/102, qui sont les
    // comptes exclus.
    expect(par('10').comptesAUtiliser).toEqual(['104', '16', '46']);
    // « Il convient … d'utiliser les comptes ci-après : 481 … ; 25 … »
    expect(par('40').comptesAUtiliser).toEqual(['25', '481']);
    // « … utiliser les comptes ci-après : 53 … ; 538 … »
    expect(par('52').comptesAUtiliser).toEqual(['53', '538']);
  });

  it('une plage « 21 à 26 » se restitue en entier, jamais en deux numéros (R5-B4)', () => {
    const vingt = REGLES_COMPTES_SYCEBNL.find((r) => r.numero === '20')!;
    expect(vingt.exclusions).toContain('utiliser comptes 21 à 26');
    expect(vingt.comptesAUtiliser).toEqual(['21', '22', '23', '24', '25', '26']);
  });
});

describe('un renvoi que le plan du même référentiel numérote autrement (R5-A1, R5-C1)', () => {
  const par = (n: string) => REGLES_COMPTES_SYCEBNL.find((r) => r.numero === n)!;
  it('« 16 · Emprunts et dettes assimilées » des fiches 64 et 67 est nommé discordant, pas proposé', () => {
    // Au plan détaillé (ch. 2) et au semis, 16 est « Fonds affectés », les
    // emprunts sont au 18 · la fiche 56 écrit bien 18.
    for (const n of ['64', '67']) {
      expect(par(n).exclusions).toContain('16 \u2014 Emprunts et dettes assimilées');
      expect(par(n).comptesAUtiliser).not.toContain('16');
      expect(par(n).renvoisDiscordants).toEqual([
        { numero: '16', intituleCite: 'Emprunts et dettes assimilées', intitulePlan: 'Fonds affectés' },
      ]);
    }
    expect(par('56').comptesAUtiliser).toContain('18');
  });

  it('le 848 de la fiche 78 est nommé discordant, sans qu’aucun autre numéro soit choisi', () => {
    expect(par('78').renvoisDiscordants.map((d) => [d.numero, d.intitulePlan])).toEqual([
      ['848', 'Transferts de produits H.A.O.'],
    ]);
    expect(par('78').comptesAUtiliser).toEqual(['72']);
  });

  it('un intitulé partagé (« 654 et 7542 - … ») ou juste n’est jamais discordant', () => {
    expect(par('90').renvoisDiscordants).toEqual([]);
    // Le 831 est cité deux fois, dont une sous son intitulé du plan.
    expect(par('65').comptesAUtiliser).toContain('831');
    expect(REGLES_COMPTES_SYCEBNL.flatMap((r) => r.renvoisDiscordants.map((d) => `${r.numero} → ${d.numero}`))).toEqual([
      '64 → 16',
      '67 → 16',
      '78 → 848',
    ]);
  });
});

describe('le texte est cité, jamais reformulé', () => {
  it('l’exclusion du compte 40 est celle du référentiel, mot pour mot', () => {
    // Un avertissement qui paraphrase la règle cesse d'être opposable · c'est
    // sa citation qui vaut devant un réviseur.
    const quarante = REGLES_COMPTES_SYCEBNL.find((r) => r.numero === '40')!;
    expect(quarante.exclusions).toContain("ne doit pas servir à enregistrer : les fournisseurs d'immobilisations");
    expect(quarante.exclusions).toContain("481 — Fournisseurs d'investissements");
  });

  it('les éléments de contrôle nomment des PIÈCES, pas des consignes', () => {
    // Le dossier de révision se justifie par des documents · une phrase sans
    // pièce ne dit pas au réviseur quoi demander.
    const quarante = REGLES_COMPTES_SYCEBNL.find((r) => r.numero === '40')!;
    expect(quarante.elementsDeControle).toContain('factures');
    expect(quarante.elementsDeControle).toContain('chèques de règlement');
  });

  it('aucun texte tronqué · les blocs font des phrases', () => {
    for (const r of REGLES_COMPTES_SYCEBNL) {
      if (r.exclusions) expect([r.numero, r.exclusions.length > 40]).toEqual([r.numero, true]);
      if (r.elementsDeControle) {
        expect([r.numero, r.elementsDeControle.length > 30]).toEqual([r.numero, true]);
      }
    }
  });
});

describe('règles par compte du SYSCOHADA · AUDCIF, Titre VII', () => {
  const numeros = PLAN_COMPTES_SYSCOHADA.map((c) => c.numero);
  const existeSyscohada = (n: string) => numeros.some((p) => p.startsWith(n) || n.startsWith(p));

  it('porte les 115 fiches des neuf classes', () => {
    // Dont les 31 comptes d'engagements hors bilan de la classe 9, à QUATRE
    // chiffres (9011 Crédits confirmés obtenus…) · un motif à trois chiffres
    // perdait la classe entière en silence.
    expect(REGLES_COMPTES_SYSCOHADA).toHaveLength(115);
    expect(REGLES_COMPTES_SYSCOHADA.filter((r) => r.numero.length === 4).length).toBe(31);
  });

  it('l’AUDCIF écrit la règle AUTREMENT, et l’extraction le sait', () => {
    // Le SYCEBNL dit « … (utiliser 104) », l'AUDCIF « … → 481 ». Appliquer
    // la règle de lecture de l'un à l'autre ne rendrait rien, ou pire.
    const quarante = REGLES_COMPTES_SYSCOHADA.find((r) => r.numero === '40')!;
    expect(quarante.exclusions).toContain('→ 481');
    expect(quarante.comptesAUtiliser).toEqual(['25', '481']);
  });

  it('un renvoi vers des CLASSES ne produit aucun numéro de compte', () => {
    // « … → classes 6, 7 et 8 » ne nomme aucun compte · en fabriquer un
    // enverrait le comptable vers une imputation inventée.
    const treize = REGLES_COMPTES_SYSCOHADA.find((r) => r.numero === '13')!;
    expect(treize.exclusions).toContain('classes 6, 7 et 8');
    expect(treize.comptesAUtiliser).toEqual([]);
  });

  it('chaque compte à utiliser existe au plan SYSCOHADA', () => {
    const fantomes = [
      ...new Set(
        REGLES_COMPTES_SYSCOHADA.flatMap((r) => r.comptesAUtiliser).filter((n) => !existeSyscohada(n)),
      ),
    ].sort();
    expect(fantomes).toEqual([]);
  });

  it('des en-têtes consécutifs partagent la fiche commune (R1-C3)', () => {
    const par = (n: string) => REGLES_COMPTES_SYSCOHADA.find((r) => r.numero === n)!;
    expect(par('62').elementsDeControle).toBe('Factures et avoirs fournisseurs ; dispositions des contrats.');
    expect(par('62').elementsDeControle).toBe(par('63').elementsDeControle);
    for (const [seul, commun] of [
      ['9013', '9018'],
      ['9014', '9018'],
      ['9033', '9038'],
      ['9043', '9048'],
      ['9051', '9058'],
      ['9083', '9088'],
    ]) {
      expect([seul, par(seul).elementsDeControle]).toEqual([seul, par(commun).elementsDeControle]);
      expect([seul, par(seul).elementsDeControle]).not.toEqual([seul, null]);
    }
    expect(par('9013').comptesAUtiliser).toEqual(['9011']);
  });

  it('la liste des remplacements lit tout le segment, hors parenthèses et notes de transcription (R1-C10)', () => {
    const par = (n: string) => REGLES_COMPTES_SYSCOHADA.find((r) => r.numero === n)!;
    expect(par('79').comptesAUtiliser).toEqual(['759', '779', '849', '86']);
    expect(par('86').comptesAUtiliser).toEqual(['691', '697', '759', '779', '791', '797']);
    // Les notes « *[…]* » et « > *Anomalie…* » commentent, elles ne renvoient pas.
    expect(par('759').comptesAUtiliser).toEqual(['791', '797']);
    expect(par('9024').comptesAUtiliser).toEqual(['9088']);
  });

  it('aucune fiche ne se cite elle-même en remplacement', () => {
    const boucles = REGLES_COMPTES_SYSCOHADA.filter((r) => r.comptesAUtiliser.includes(r.numero)).map((r) => r.numero);
    expect(boucles).toEqual([]);
  });
});

describe('les deux tables ne se servent jamais l’une pour l’autre', () => {
  it('un dossier reçoit les fiches de SON texte, et rien pour un référentiel inconnu', () => {
    // Servir les fiches SYCEBNL à une société commerciale ferait avertir sur
    // un plan qui n'est pas le sien · les numéros se ressemblent sans se
    // recouvrir (CLAUDE.md §6).
    const svc = new DossierRevisionService({} as never);
    expect(svc.regles('SYCEBNL')).toBe(REGLES_COMPTES_SYCEBNL);
    expect(svc.regles('SYSCOHADA')).toBe(REGLES_COMPTES_SYSCOHADA);
    expect(svc.regles(undefined)).toEqual([]);
    expect(svc.regles('AUTRE')).toEqual([]);
  });

  it('la fiche retenue est la plus PRÉCISE de la table donnée', () => {
    // Trois fiches SYCEBNL descendent à trois chiffres (603, 659, 759) · un
    // compte 65910000 relève de 659, pas de 65 qui dit autre chose.
    const fiche = DossierRevisionService.regleDe('65910000', REGLES_COMPTES_SYCEBNL);
    expect(fiche?.numero).toBe('659');
    // Et côté SYSCOHADA, les engagements à quatre chiffres.
    const engagement = DossierRevisionService.regleDe('90110000', REGLES_COMPTES_SYSCOHADA);
    expect(engagement?.numero).toBe('9011');
  });
});
