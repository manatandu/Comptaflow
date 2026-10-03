// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous jest.
import { AVERTISSEMENT_ATTESTATION, MOTIF_ATTESTATION_MAX, MOTIF_ATTESTATION_MIN, motifRefusAttestation } from './attestation-etat';

describe("l'attestation de l'état de l'écart · la règle du serveur, avant l'envoi", () => {
  it('le motif compte de 10 à 500 caractères, espaces de bord retirés', () => {
    expect(MOTIF_ATTESTATION_MIN).toBe(10);
    expect(MOTIF_ATTESTATION_MAX).toBe(500);
    expect(motifRefusAttestation('   court   ')).toMatch(/de 10 à 500 caractères/);
    expect(motifRefusAttestation('x'.repeat(501))).toMatch(/de l'attestation/);
    expect(motifRefusAttestation('Rapproché avec le grand livre repris')).toBeNull();
    expect(motifRefusAttestation('court', 'RETIRER')).toMatch(/du retrait/);
  });

  it("l'avertissement dit les trois refus qui restent", () => {
    expect(AVERTISSEMENT_ATTESTATION).toMatch(/banque ou de la caisse/);
    expect(AVERTISSEMENT_ATTESTATION).toMatch(/seconde contre-passation par le module/);
    expect(AVERTISSEMENT_ATTESTATION).toMatch(/inscription en négatif/);
  });
});
