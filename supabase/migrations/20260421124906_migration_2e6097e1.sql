-- LOGISTICS & ROUTING TABLES
CREATE TABLE IF NOT EXISTS public.driver_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status assignment_status DEFAULT 'assigned',
  assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  arrived_at_venue_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  base_fee DECIMAL(10, 2),
  distance_fee DECIMAL(10, 2),
  total_earnings DECIMAL(10, 2),
  notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_assignments_company ON public.driver_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_order ON public.driver_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver ON public.driver_assignments(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_status ON public.driver_assignments(status);

DROP TRIGGER IF EXISTS update_driver_assignments_updated_at ON public.driver_assignments;
CREATE TRIGGER update_driver_assignments_updated_at BEFORE UPDATE ON public.driver_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.optimized_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  route_name TEXT NOT NULL,
  route_date DATE NOT NULL,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_stops INTEGER DEFAULT 0,
  total_distance_km DECIMAL(10, 2),
  estimated_duration_minutes INTEGER,
  optimized_at TIMESTAMPTZ,
  optimization_algorithm TEXT DEFAULT 'nearest_neighbor',
  is_active BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_optimized_routes_company ON public.optimized_routes(company_id);
CREATE INDEX IF NOT EXISTS idx_optimized_routes_driver ON public.optimized_routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_optimized_routes_date ON public.optimized_routes(company_id, route_date);

DROP TRIGGER IF EXISTS update_optimized_routes_updated_at ON public.optimized_routes;
CREATE TRIGGER update_optimized_routes_updated_at BEFORE UPDATE ON public.optimized_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.optimized_routes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  venue_address TEXT NOT NULL,
  venue_lat DECIMAL(10, 8),
  venue_lng DECIMAL(11, 8),
  estimated_arrival_time TIMESTAMPTZ,
  actual_arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  distance_to_next_km DECIMAL(10, 2),
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 2,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_stops_route ON public.delivery_stops(route_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_order ON public.delivery_stops(order_id);

DROP TRIGGER IF EXISTS update_delivery_stops_updated_at ON public.delivery_stops;
CREATE TRIGGER update_delivery_stops_updated_at BEFORE UPDATE ON public.delivery_stops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.gps_tracking_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy_meters DECIMAL(6, 2),
  altitude_meters DECIMAL(8, 2),
  speed_kmh DECIMAL(6, 2),
  heading_degrees DECIMAL(5, 2),
  assignment_id UUID REFERENCES public.driver_assignments(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.optimized_routes(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gps_logs_driver_time ON public.gps_tracking_logs(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_logs_assignment ON public.gps_tracking_logs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_gps_logs_route ON public.gps_tracking_logs(route_id);

CREATE TABLE IF NOT EXISTS public.driver_replacement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  original_driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pending',
  replacement_driver_id UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_replacement_company ON public.driver_replacement_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_driver_replacement_order ON public.driver_replacement_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_replacement_status ON public.driver_replacement_requests(status);

DROP TRIGGER IF EXISTS update_driver_replacement_updated_at ON public.driver_replacement_requests;
CREATE TRIGGER update_driver_replacement_updated_at BEFORE UPDATE ON public.driver_replacement_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();