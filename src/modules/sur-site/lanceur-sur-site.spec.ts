/**
 * Le lanceur du service Windows (`installation/demarrer.cjs`) · deux lectures
 * qui, fausses, ne se verraient que chez un client : une configuration dont
 * la première clé est perdue, et une mise à jour migrée sans copie.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { analyserEnv, identiteVersion } = require('../../../installation/demarrer.cjs');

describe('lanceur sur site', () => {
  it('lit la configuration écrite par PowerShell 5, marque d’ordre des octets comprise', () => {
    const v = analyserEnv('﻿DATABASE_URL=postgresql://a:b@127.0.0.1:5433/omegax\r\n# PORT=1\r\nPORT = 8080 \r\nX="entre guillemets"\n');
    expect(v.DATABASE_URL).toBe('postgresql://a:b@127.0.0.1:5433/omegax');
    expect(v.PORT).toBe('8080');
    expect(v.X).toBe('entre guillemets');
    expect(Object.keys(v)).toHaveLength(3);
  });

  it('identifie une version par son commit · deux paquets du même jour ne se confondent pas', () => {
    expect(identiteVersion({ date: '2026-09-26', commit: 'aaa' })).not.toBe(identiteVersion({ date: '2026-09-26', commit: 'bbb' }));
    expect(identiteVersion({ date: '2026-09-26' })).toBe('2026-09-26');
    expect(identiteVersion({})).toBeNull();
  });
});
