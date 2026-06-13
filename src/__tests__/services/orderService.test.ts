import { orderService } from '@/services/orderService';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

/**
 * Build a fully chainable, awaitable Supabase query-builder stub.
 * Every filter/modifier method returns the builder so any chain
 * (`.select().eq().is().order().range()`) resolves; terminal reads
 * (`single`/`maybeSingle`) and a thenable `then` resolve to `result`.
 * Pass `singleResult` when a `.single()`/post-update read needs to
 * differ from the chained-list result.
 */
function makeQueryBuilder(result: any, singleResult?: any) {
  const qb: any = {};
  ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'is', 'in', 'order', 'limit', 'range', 'match'].forEach(
    (m) => {
      qb[m] = jest.fn(() => qb);
    },
  );
  // `single` is the post-write read (returns the saved row);
  // `maybeSingle` is the pre-write current-state read. They differ,
  // so keep them distinct: `single` -> singleResult, the rest -> result.
  qb.single = jest.fn().mockResolvedValue(singleResult ?? result);
  qb.maybeSingle = jest.fn().mockResolvedValue(result);
  qb.then = (resolve: (v: any) => unknown) => resolve(result);
  return qb;
}

describe('OrderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllOrders', () => {
    it('should fetch all orders for a company', async () => {
      const mockOrders = [
        { id: '1', order_number: 'ORD-001', client_name: 'Test Client' },
        { id: '2', order_number: 'ORD-002', client_name: 'Another Client' },
      ];

      // getAllOrders chains .select().eq().is('deleted_at', null)
      // .order().range() and awaits the result.
      const qb = makeQueryBuilder({ data: mockOrders, error: null });
      (supabase.from as jest.Mock).mockReturnValue(qb);

      const result = await orderService.getAllOrders('company-123');

      expect(supabase.from).toHaveBeenCalledWith('orders');
      expect(qb.eq).toHaveBeenCalledWith('company_id', 'company-123');
      expect(result).toEqual(mockOrders);
    });

    it('should return empty array on error', async () => {
      const qb = makeQueryBuilder({ data: null, error: new Error('DB Error') });
      (supabase.from as jest.Mock).mockReturnValue(qb);

      const result = await orderService.getAllOrders('company-123');

      expect(result).toEqual([]);
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      const mockOrder = {
        id: 'order-1',
        order_number: 'ORD-001',
        status: 'confirmed',
      };

      // The state-machine guard first reads the current status
      // (.select().eq().is().maybeSingle()); it must differ from the
      // target so the transition actually runs. pending -> confirmed
      // is an allowed transition. The post-update .single() returns
      // the saved order.
      const qb = makeQueryBuilder(
        { data: { status: 'pending', confirmed_at: null }, error: null },
        { data: mockOrder, error: null },
      );
      (supabase.from as jest.Mock).mockReturnValue(qb);

      const result = await orderService.updateOrderStatus('order-1', 'confirmed');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockOrder);
    });
  });

  describe('confirmOrder', () => {
    it('should confirm order by updating status to confirmed', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'confirmed',
      };

      const qb = makeQueryBuilder(
        { data: { status: 'pending', confirmed_at: null }, error: null },
        { data: mockOrder, error: null },
      );
      (supabase.from as jest.Mock).mockReturnValue(qb);

      const result = await orderService.confirmOrder('order-1');

      expect(result.success).toBe(true);
    });
  });
});
