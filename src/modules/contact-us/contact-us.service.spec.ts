import { Types } from 'mongoose';
import { ContactUsService } from './contact-us.service';

describe('ContactUsService.listMine', () => {
  it('filters requests by the authenticated user and exposes review fields', async () => {
    const userId = new Types.ObjectId().toString();
    const rows = [{ status: 'resolved', admin_notes: 'Reviewed and fixed.', public_response: '' }];
    const lean = jest.fn().mockResolvedValue(rows);
    const sort = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ sort });
    const find = jest.fn().mockReturnValue({ select });
    const service = new ContactUsService({ find } as any, {} as any);

    await expect(service.listMine(userId)).resolves.toEqual({
      success: true,
      messages: [],
      data: [{
        status: 'resolved',
        public_response: 'Reviewed and fixed.',
        admin_notes: undefined,
      }],
    });
    expect(find).toHaveBeenCalledWith({ user_id: new Types.ObjectId(userId) });
    expect(select).toHaveBeenCalledWith(
      'type message all_games game_labels status public_response admin_notes createdAt updatedAt',
    );
  });

  it('rejects an invalid authenticated user id', async () => {
    const service = new ContactUsService({} as any, {} as any);
    await expect(service.listMine('invalid')).rejects.toMatchObject({ status: 401 });
  });
});
