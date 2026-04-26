import { orderService } from '@/services/orderService';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

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

      const mockSupabase = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockOrders, error: null }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockSupabase);

      const result = await orderService.getAllOrders('company-123');

      expect(supabase.from).toHaveBeenCalledWith('orders');
      expect(mockSupabase.eq).toHaveBeenCalledWith('company_id', 'company-123');
      expect(result).toEqual(mockOrders);
    });

    it('should return empty array on error', async () => {
      const mockSupabase = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockSupabase);

      const result = await orderService.getAllOrders('company-123');

      expect(result).toEqual([]);
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      const mockOrder = { 
        id: 'order-1', 
        order_number: 'ORD-001', 
        status: 'confirmed' 
      };

      const mockSupabase = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockSupabase);

      const result = await orderService.updateOrderStatus('order-1', 'confirmed');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockOrder);
    });
  });

  describe('confirmOrder', () => {
    it('should confirm order by updating status to confirmed', async () => {
      const mockOrder = { 
        id: 'order-1', 
        status: 'confirmed' 
      };

      const mockSupabase = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockSupabase);

      const result = await orderService.confirmOrder('order-1');

      expect(result.success).toBe(true);
    });
  });
});