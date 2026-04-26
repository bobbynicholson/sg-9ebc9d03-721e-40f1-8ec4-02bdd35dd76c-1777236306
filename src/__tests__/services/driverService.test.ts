import driverService from '@/services/driverService';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('DriverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateDriverLocation', () => {
    it('should update driver GPS location', async () => {
      const mockLocation = {
        latitude: -26.1076,
        longitude: 28.0567,
        accuracy: 10,
        heading: 90,
        speed: 50,
      };

      const mockSupabase = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockLocation, error: null }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockSupabase);

      const result = await driverService.gps.updateDriverLocation('driver-1', mockLocation);

      expect(result.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('gps_tracking');
    });
  });

  describe('getDriverRoutes', () => {
    it('should fetch driver routes', async () => {
      const mockRoutes = [
        { id: 'route-1', driver_id: 'driver-1', status: 'active' },
      ];

      const mockSupabase = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockRoutes, error: null }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockSupabase);

      const result = await driverService.routes.getDriverRoutes('driver-1');

      expect(result.success).toBe(true);
      expect(result.routes).toEqual(mockRoutes);
    });
  });

  describe('calculateDepartureTimes', () => {
    it('should calculate departure times for assignment', async () => {
      const result = await driverService.calculateDepartureTimes('assignment-1');

      expect(result).toHaveProperty('leaveForKitchenTime');
      expect(result).toHaveProperty('collectionTime');
      expect(result).toHaveProperty('leaveForVenueTime');
    });
  });
});