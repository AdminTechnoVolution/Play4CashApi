import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { NowPaymentsClient, NowPaymentsRejectedError } from './nowpayments.client';
const base = { NOWPAYMENTS_BASE_URL: 'https://api-sandbox.nowpayments.io/v1', NOWPAYMENTS_API_KEY: 'fixture' };
describe('NOWPayments sandbox requests', () => {
  afterEach(() => jest.restoreAllMocks());
  it('requests the provider success scenario without sending chain funds', async () => {
    const request = jest.spyOn(axios, 'request').mockResolvedValue({ data: { payment_id: '1' } });
    await new NowPaymentsClient(new ConfigService(base)).createDeposit('order', '10.000000', 'usdttrc20', 'https://gateway.test/ipn');
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ case: 'success', order_id: 'order' }) }));
  });
  it('omits outcome_currency, which NOWPayments rejects on /payment, and settles fees on the merchant side', async () => {
    const request = jest.spyOn(axios, 'request').mockResolvedValue({ data: { payment_id: '1' } });
    await new NowPaymentsClient(new ConfigService(base)).createDeposit('order', '10.000000', 'usdttrc20', 'https://gateway.test/ipn');
    const data = (request.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ price_currency: 'usdttrc20', pay_currency: 'usdttrc20', is_fee_paid_by_user: false });
    expect(data).not.toHaveProperty('outcome_currency');
  });
  it.each(['common', 'failed', 'partially_paid'])('supports documented sandbox case %s', async value => {
    const request = jest.spyOn(axios, 'request').mockResolvedValue({ data: {} });
    await new NowPaymentsClient(new ConfigService({ ...base, NOWPAYMENTS_SANDBOX_CASE: value })).createDeposit('order', '10', 'usdttrc20', 'https://gateway.test/ipn');
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ case: value }) }));
  });
  it('rejects an invalid scenario before contacting the provider', async () => {
    const request = jest.spyOn(axios, 'request');
    expect(() => new NowPaymentsClient(new ConfigService({ ...base, NOWPAYMENTS_SANDBOX_CASE: 'bad' })).createDeposit('order', '10', 'usdttrc20', 'https://gateway.test/ipn')).toThrow('INVALID_NOWPAYMENTS_SANDBOX_CASE');
    expect(request).not.toHaveBeenCalled();
  });
  it('recognizes only explicit negative structured replies as definitive provider rejection', async () => {
    const request = jest.spyOn(axios, 'request');
    const client = new NowPaymentsClient(new ConfigService(base));
    request.mockRejectedValueOnce({ isAxiosError: true, response: { status: 403, data: { status: false, message: 'private upstream details' } } });
    await expect(client.createDeposit('order', '10', 'usdttrc20', 'https://gateway.test/ipn')).rejects.toBeInstanceOf(NowPaymentsRejectedError);
    for (const response of [undefined, { status: 503, data: { status: false } }, { status: 403, data: 'HTML' }, { status: 400, data: { status: false, payment_id: 'already-created' } }, { status: 400, data: { status: false, withdrawals: [{ id: 'created' }] } }]) {
      request.mockRejectedValueOnce({ isAxiosError: true, response });
      await expect(client.createDeposit('order', '10', 'usdttrc20', 'https://gateway.test/ipn')).rejects.toThrow('NOWPAYMENTS_REQUEST_UNRESOLVED');
    }
  });
});
