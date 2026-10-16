import { assertFinanceEligibility } from './eligibility';
const id = '507f1f77bcf86cd799439011';
function database(user: any = { status: 'active' }, evidence: any = null) {
  return { collection: (name: string) => ({ findOne: jest.fn(async () => name === 'users' ? user : evidence) }) } as any;
}
describe('financial eligibility without a P4C country allowlist', () => {
  it('accepts an active sandbox account without country or KYC records', async () => {
    await expect(assertFinanceEligibility(database(), id)).resolves.toEqual({ risk: false });
  });
  it('does not reject countries, missing geo, or an expired geo observation', async () => {
    await expect(assertFinanceEligibility(database({ status: 'active' }, {
      verifiedCountry: 'XX', observedCountry: 'YY', expiresAt: new Date(0), observedAt: new Date(0), adultVerified: true,
    }), id)).resolves.toEqual({ risk: false });
  });
  it('retains trusted risk signals for withdrawal review', async () => {
    await expect(assertFinanceEligibility(database({ status: 'active' }, { risk: true }), id)).resolves.toEqual({ risk: true });
  });
  it('still rejects inactive users, invalid identities and explicit minor evidence', async () => {
    await expect(assertFinanceEligibility(database(null), id)).rejects.toThrow('PAYMENTS_USER_NOT_ACTIVE');
    await expect(assertFinanceEligibility(database(), 'invalid')).rejects.toThrow('PAYMENTS_USER_NOT_ACTIVE');
    await expect(assertFinanceEligibility(database({ status: 'active' }, { adultVerified: false }), id)).rejects.toThrow('PAYMENTS_ADULT_REQUIRED');
  });
});
