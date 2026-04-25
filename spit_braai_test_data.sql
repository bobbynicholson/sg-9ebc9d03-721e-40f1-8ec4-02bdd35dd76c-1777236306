-- ============================================
-- SPIT BRAAI DELIVERY - COMPREHENSIVE TEST DATA
-- Based on actual menu from spitbraaidelivery.co.za
-- ============================================

-- Get the Spit Braai Delivery company ID
-- Replace this with actual company_id after checking the database
-- For this script, we'll use a variable that should be replaced
-- SET company_id = 'actual-company-uuid-here';

-- ============================================
-- 1. SUPPLIERS
-- ============================================
INSERT INTO suppliers (company_id, name, contact_person, email, phone, address, category, payment_terms, notes, is_active)
VALUES
  -- Replace 'COMPANY_ID_HERE' with actual Spit Braai company_id
  ('COMPANY_ID_HERE', 'Pick n Pay Brackenfell', 'John Smith', 'john.smith@pnp.co.za', '021 981 0000', 'Brackenfell Boulevard, Brackenfell, Cape Town, 7560', 'meat', 'NET 30', 'Main meat supplier', true),
  ('COMPANY_ID_HERE', 'Woolworths Willowbridge', 'Sarah Jones', 'sarah.jones@woolworths.co.za', '021 914 8000', 'Willowbridge Shopping Centre, Tyger Valley, Bellville, 7530', 'produce', 'NET 30', 'Premium produce supplier', true),
  ('COMPANY_ID_HERE', 'Makro Brackenfell', 'Mike Johnson', 'mike.j@makro.co.za', '021 982 9000', 'Old Paarl Road, Brackenfell, Cape Town, 7560', 'dry_goods', 'NET 30', 'Bulk dry goods and disposables', true),
  ('COMPANY_ID_HERE', 'Cape Meat Market', 'David Brown', 'david@capemeatmarket.co.za', '021 555 1234', '15 Main Road, Bellville, Cape Town, 7530', 'meat', 'NET 14', 'Local butcher - premium cuts', true),
  ('COMPANY_ID_HERE', 'Fresh Produce Suppliers', 'Lisa Williams', 'lisa@freshproduce.co.za', '021 555 5678', '23 Industrial Street, Parow, Cape Town, 7500', 'produce', 'NET 7', 'Farm-fresh vegetables daily', true),
  ('COMPANY_ID_HERE', 'Party Supplies Cape Town', 'Emma Davis', 'emma@partysupplies.co.za', '021 555 9012', '45 Party Avenue, Bellville, Cape Town, 7530', 'disposables', 'NET 30', 'Disposable plates, cutlery, etc', true);

-- ============================================
-- 2. MENU ITEMS
-- ============================================
INSERT INTO menu_items (company_id, name, description, category, base_price, unit, dietary_info, is_available)
VALUES
  -- MEATS
  ('COMPANY_ID_HERE', 'Lamb Spit (200g)', 'Succulent spit-roasted lamb, carved fresh - 200g per person', 'main', 89.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Lamb Spit (100g)', 'Spit-roasted lamb - 100g per person (when paired with chicken)', 'main', 45.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Chicken Quarter', 'Marinated chicken quarter, grilled to perfection', 'main', 45.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Lamb Ribs (300g)', 'Tender lamb ribs - 300g per person', 'main', 95.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Lamb Ribs (600g)', 'Generous lamb ribs - 600g per person', 'main', 175.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Boerewors', 'Traditional South African sausage', 'main', 35.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Beef Burgers', 'Handmade beef burger patties', 'main', 42.00, 'per_person', '{"allergens": ["gluten"], "dietary": []}', true),
  
  -- SIDES - STARCH
  ('COMPANY_ID_HERE', 'Baby Potatoes', 'Roasted baby potatoes with herbs', 'side', 25.00, 'per_person', '{"allergens": [], "dietary": ["vegetarian", "vegan"]}', true),
  ('COMPANY_ID_HERE', 'Potato Salad', 'Creamy potato salad', 'side', 28.00, 'per_person', '{"allergens": ["eggs"], "dietary": ["vegetarian"]}', true),
  
  -- SIDES - SALADS
  ('COMPANY_ID_HERE', 'Green Salad', 'Fresh mixed greens with vinaigrette', 'side', 22.00, 'per_person', '{"allergens": [], "dietary": ["vegetarian", "vegan"]}', true),
  ('COMPANY_ID_HERE', 'Greek Salad', 'Tomatoes, cucumber, feta, olives, red onion', 'side', 32.00, 'per_person', '{"allergens": ["dairy"], "dietary": ["vegetarian"]}', true),
  ('COMPANY_ID_HERE', 'Pasta Vinaigrette', 'Pasta salad with balsamic vinaigrette', 'side', 28.00, 'per_person', '{"allergens": ["gluten"], "dietary": ["vegetarian", "vegan"]}', true),
  ('COMPANY_ID_HERE', 'Curry-Noodle Pasta', 'Curry-flavored noodle salad', 'side', 30.00, 'per_person', '{"allergens": ["gluten"], "dietary": ["vegetarian", "vegan"]}', true),
  ('COMPANY_ID_HERE', 'Pasta Salad', 'Classic pasta salad', 'side', 26.00, 'per_person', '{"allergens": ["gluten"], "dietary": ["vegetarian"]}', true),
  ('COMPANY_ID_HERE', 'Coleslaw', 'Creamy cabbage coleslaw', 'side', 20.00, 'per_person', '{"allergens": [], "dietary": ["vegetarian"]}', true),
  ('COMPANY_ID_HERE', 'Rice Salad', 'Colorful rice salad with vegetables', 'side', 24.00, 'per_person', '{"allergens": [], "dietary": ["vegetarian", "vegan"]}', true),
  ('COMPANY_ID_HERE', 'Mixed Chunky Veg', 'Seasonal roasted vegetables', 'side', 28.00, 'per_person', '{"allergens": [], "dietary": ["vegetarian", "vegan"]}', true),
  
  -- BREADS
  ('COMPANY_ID_HERE', 'Garlic Bread', 'Freshly baked garlic bread', 'side', 15.00, 'per_person', '{"allergens": ["gluten", "dairy"], "dietary": ["vegetarian"]}', true),
  
  -- PUDDINGS
  ('COMPANY_ID_HERE', 'Malva Pudding & Custard', 'Traditional South African dessert with custard', 'dessert', 35.00, 'per_person', '{"allergens": ["gluten", "dairy", "eggs"], "dietary": ["vegetarian"]}', true),
  ('COMPANY_ID_HERE', 'Peppermint Crisp Tart', 'Classic South African peppermint dessert', 'dessert', 38.00, 'per_person', '{"allergens": ["dairy"], "dietary": ["vegetarian"]}', true),
  ('COMPANY_ID_HERE', 'Chocolate Fudge Brownie & Cream', 'Rich chocolate brownie with cream', 'dessert', 40.00, 'per_person', '{"allergens": ["gluten", "dairy", "eggs"], "dietary": ["vegetarian"]}', true),
  
  -- STARTERS
  ('COMPANY_ID_HERE', 'Lamb Rib Starter', 'Tender lamb ribs as starter portion', 'starter', 55.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Sticky Chicken Wings', 'Glazed chicken wings', 'starter', 45.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  ('COMPANY_ID_HERE', 'Spicy Beef Strips', 'Marinated beef strips with spices', 'starter', 50.00, 'per_person', '{"allergens": [], "dietary": ["halaal"]}', true),
  
  -- VEGETARIAN
  ('COMPANY_ID_HERE', 'Vegetarian Lasagne', 'Layered vegetable lasagne', 'main', 65.00, 'per_person', '{"allergens": ["gluten", "dairy"], "dietary": ["vegetarian"]}', true),
  
  -- DISPOSABLES & SERVICES
  ('COMPANY_ID_HERE', 'Knives, Forks & Plates', 'Disposable cutlery and plates set', 'service', 12.00, 'per_person', '{"allergens": [], "dietary": []}', true),
  ('COMPANY_ID_HERE', 'Full Cutlery Set', 'Knives, forks, spoons, plates, bowls', 'service', 18.00, 'per_person', '{"allergens": [], "dietary": []}', true),
  ('COMPANY_ID_HERE', 'Waiter Service (2 hours)', 'Professional waiter for setup, serving, cleanup', 'service', 300.00, 'flat_rate', '{"allergens": [], "dietary": []}', true),
  ('COMPANY_ID_HERE', 'On-Site Chef (4 hours)', 'Dedicated chef for on-site preparation and service', 'service', 900.00, 'flat_rate', '{"allergens": [], "dietary": []}', true);

-- ============================================
-- 3. INVENTORY ITEMS
-- ============================================
INSERT INTO inventory_items (company_id, item_name, category, current_stock, unit_of_measurement, minimum_stock_level, maximum_stock_level, cost_per_unit, supplier_id, last_restocked, notes)
VALUES
  -- MEATS (supplier: Pick n Pay or Cape Meat Market)
  ('COMPANY_ID_HERE', 'Lamb Leg (whole)', 'meat', 150.00, 'kg', 40.00, 200.00, 180.00, (SELECT id FROM suppliers WHERE name = 'Cape Meat Market' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For spit roasting'),
  ('COMPANY_ID_HERE', 'Lamb Ribs', 'meat', 80.00, 'kg', 25.00, 120.00, 220.00, (SELECT id FROM suppliers WHERE name = 'Cape Meat Market' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Premium lamb ribs'),
  ('COMPANY_ID_HERE', 'Chicken Quarters', 'meat', 300.00, 'units', 100.00, 500.00, 28.00, (SELECT id FROM suppliers WHERE name = 'Pick n Pay Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Fresh chicken quarters'),
  ('COMPANY_ID_HERE', 'Boerewors', 'meat', 60.00, 'kg', 20.00, 100.00, 85.00, (SELECT id FROM suppliers WHERE name = 'Pick n Pay Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Traditional boerewors'),
  ('COMPANY_ID_HERE', 'Beef Mince (Premium)', 'meat', 50.00, 'kg', 15.00, 80.00, 120.00, (SELECT id FROM suppliers WHERE name = 'Cape Meat Market' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For burger patties'),
  ('COMPANY_ID_HERE', 'Beef Strips', 'meat', 30.00, 'kg', 10.00, 50.00, 140.00, (SELECT id FROM suppliers WHERE name = 'Cape Meat Market' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For starter strips'),
  ('COMPANY_ID_HERE', 'Chicken Wings', 'meat', 40.00, 'kg', 15.00, 70.00, 95.00, (SELECT id FROM suppliers WHERE name = 'Pick n Pay Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For sticky wings'),
  
  -- VEGETABLES (supplier: Fresh Produce or Woolworths)
  ('COMPANY_ID_HERE', 'Potatoes', 'produce', 120.00, 'kg', 40.00, 200.00, 15.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Baby potatoes & potato salad'),
  ('COMPANY_ID_HERE', 'Lettuce', 'produce', 30.00, 'kg', 10.00, 50.00, 25.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For salads'),
  ('COMPANY_ID_HERE', 'Tomatoes', 'produce', 50.00, 'kg', 15.00, 80.00, 22.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For Greek salad'),
  ('COMPANY_ID_HERE', 'Cucumbers', 'produce', 25.00, 'kg', 8.00, 40.00, 18.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For Greek salad'),
  ('COMPANY_ID_HERE', 'Cabbage', 'produce', 35.00, 'kg', 12.00, 60.00, 12.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For coleslaw'),
  ('COMPANY_ID_HERE', 'Carrots', 'produce', 30.00, 'kg', 10.00, 50.00, 14.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For coleslaw & veg'),
  ('COMPANY_ID_HERE', 'Mixed Vegetables', 'produce', 40.00, 'kg', 15.00, 70.00, 32.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Bell peppers, zucchini, etc'),
  ('COMPANY_ID_HERE', 'Red Onions', 'produce', 20.00, 'kg', 8.00, 35.00, 16.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For salads'),
  ('COMPANY_ID_HERE', 'Garlic', 'produce', 5.00, 'kg', 2.00, 10.00, 85.00, (SELECT id FROM suppliers WHERE name = 'Fresh Produce Suppliers' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For garlic bread & marinades'),
  
  -- DAIRY (supplier: Woolworths)
  ('COMPANY_ID_HERE', 'Feta Cheese', 'dairy', 15.00, 'kg', 5.00, 25.00, 120.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For Greek salad'),
  ('COMPANY_ID_HERE', 'Mayonnaise', 'condiments', 20.00, 'L', 8.00, 35.00, 65.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For salads'),
  ('COMPANY_ID_HERE', 'Butter', 'dairy', 10.00, 'kg', 4.00, 20.00, 95.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For garlic bread'),
  ('COMPANY_ID_HERE', 'Cream', 'dairy', 12.00, 'L', 5.00, 20.00, 75.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For desserts'),
  ('COMPANY_ID_HERE', 'Custard', 'dairy', 15.00, 'L', 6.00, 25.00, 55.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For malva pudding'),
  
  -- DRY GOODS (supplier: Makro)
  ('COMPANY_ID_HERE', 'Pasta (various)', 'dry_goods', 40.00, 'kg', 15.00, 60.00, 28.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For pasta salads'),
  ('COMPANY_ID_HERE', 'Rice', 'dry_goods', 50.00, 'kg', 20.00, 80.00, 22.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For rice salad'),
  ('COMPANY_ID_HERE', 'Bread Loaves', 'dry_goods', 60.00, 'units', 20.00, 100.00, 18.00, (SELECT id FROM suppliers WHERE name = 'Pick n Pay Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For garlic bread'),
  ('COMPANY_ID_HERE', 'Flour', 'dry_goods', 30.00, 'kg', 10.00, 50.00, 15.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For desserts'),
  ('COMPANY_ID_HERE', 'Sugar', 'dry_goods', 25.00, 'kg', 10.00, 40.00, 18.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For desserts'),
  
  -- CONDIMENTS & SAUCES
  ('COMPANY_ID_HERE', 'Olive Oil', 'condiments', 15.00, 'L', 6.00, 25.00, 125.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For salads & cooking'),
  ('COMPANY_ID_HERE', 'Balsamic Vinegar', 'condiments', 8.00, 'L', 3.00, 15.00, 95.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For vinaigrette'),
  ('COMPANY_ID_HERE', 'BBQ Marinade', 'condiments', 10.00, 'L', 4.00, 18.00, 75.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For meats'),
  ('COMPANY_ID_HERE', 'Chicken Marinade', 'condiments', 12.00, 'L', 5.00, 20.00, 68.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For chicken'),
  ('COMPANY_ID_HERE', 'Mixed Herbs & Spices', 'condiments', 8.00, 'kg', 3.00, 15.00, 180.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Various seasonings'),
  
  -- DESSERT INGREDIENTS
  ('COMPANY_ID_HERE', 'Chocolate (cooking)', 'dry_goods', 10.00, 'kg', 4.00, 18.00, 145.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For brownies'),
  ('COMPANY_ID_HERE', 'Peppermint Crisp Bars', 'dry_goods', 50.00, 'units', 20.00, 80.00, 12.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For peppermint tart'),
  ('COMPANY_ID_HERE', 'Caramel (for Malva)', 'dry_goods', 8.00, 'L', 3.00, 15.00, 85.00, (SELECT id FROM suppliers WHERE name = 'Woolworths Willowbridge' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For malva pudding'),
  
  -- DISPOSABLES (supplier: Party Supplies)
  ('COMPANY_ID_HERE', 'Disposable Plates', 'supplies', 800.00, 'units', 300.00, 1500.00, 3.50, (SELECT id FROM suppliers WHERE name = 'Party Supplies Cape Town' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Eco-friendly plates'),
  ('COMPANY_ID_HERE', 'Disposable Cutlery Sets', 'supplies', 600.00, 'sets', 200.00, 1000.00, 4.20, (SELECT id FROM suppliers WHERE name = 'Party Supplies Cape Town' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Fork, knife, spoon sets'),
  ('COMPANY_ID_HERE', 'Disposable Bowls', 'supplies', 400.00, 'units', 150.00, 700.00, 3.00, (SELECT id FROM suppliers WHERE name = 'Party Supplies Cape Town' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For puddings'),
  ('COMPANY_ID_HERE', 'Serviettes', 'supplies', 2000.00, 'units', 500.00, 3000.00, 0.80, (SELECT id FROM suppliers WHERE name = 'Party Supplies Cape Town' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'Paper serviettes'),
  ('COMPANY_ID_HERE', 'Chafing Dishes', 'equipment', 15.00, 'units', 5.00, 25.00, 450.00, (SELECT id FROM suppliers WHERE name = 'Party Supplies Cape Town' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For buffet service'),
  ('COMPANY_ID_HERE', 'Fuel Canisters', 'supplies', 50.00, 'units', 20.00, 80.00, 25.00, (SELECT id FROM suppliers WHERE name = 'Makro Brackenfell' AND company_id = 'COMPANY_ID_HERE' LIMIT 1), NOW(), 'For chafing dishes');

-- ============================================
-- 4. SAMPLE CLIENTS
-- ============================================
INSERT INTO clients (company_id, first_name, last_name, email, phone, company_name, address_line1, city, state_province, postal_code, country, client_type, tags, notes)
VALUES
  ('COMPANY_ID_HERE', 'Sarah', 'Mitchell', 'sarah.mitchell@abccorp.co.za', '+27 21 555 0001', 'ABC Corporation', '123 Business Park', 'Cape Town', 'Western Cape', '8001', 'South Africa', 'corporate', '["repeat_customer", "corporate", "monthly_events"]', 'Monthly corporate events - VIP client'),
  ('COMPANY_ID_HERE', 'John', 'Williams', 'john.williams@gmail.com', '+27 82 123 4567', NULL, '45 Sunset Avenue', 'Brackenfell', 'Western Cape', '7560', 'South Africa', 'individual', '["wedding", "large_event"]', 'Wedding for 150 guests'),
  ('COMPANY_ID_HERE', 'Lisa', 'van der Merwe', 'lisa.vdm@brackenfelllps.co.za', '+27 21 981 2345', 'Brackenfell Primary School', '10 School Road', 'Brackenfell', 'Western Cape', '7560', 'South Africa', 'corporate', '["school", "annual_events"]', 'Annual school events'),
  ('COMPANY_ID_HERE', 'Michael', 'Johnson', 'michael.j@capetown.gov.za', '+27 21 400 1234', 'City of Cape Town', 'Civic Centre, 12 Hertzog Boulevard', 'Cape Town', 'Western Cape', '8001', 'South Africa', 'government', '["corporate", "large_events", "government"]', 'Municipal events and functions'),
  ('COMPANY_ID_HERE', 'Emma', 'Brown', 'emma.brown@yahoo.com', '+27 83 456 7890', NULL, '78 Mountain View Drive', 'Durbanville', 'Western Cape', '7550', 'South Africa', 'individual', '["birthday", "repeat_customer"]', '50th birthday celebration'),
  ('COMPANY_ID_HERE', 'David', 'Thompson', 'david.t@stellentech.co.za', '+27 21 808 9999', 'Stellenbosch Tech', '25 Innovation Street', 'Stellenbosch', 'Western Cape', '7600', 'South Africa', 'corporate', '["corporate", "tech_industry"]', 'Year-end function'),
  ('COMPANY_ID_HERE', 'Rachel', 'Naidoo', 'rachel.naidoo@gmail.com', '+27 84 567 8901', NULL, '12 Vineyard Road', 'Stellenbosch', 'Western Cape', '7600', 'South Africa', 'individual', '["wedding"]', 'Outdoor vineyard wedding'),
  ('COMPANY_ID_HERE', 'James', 'Koopman', 'james.k@parowcollege.ac.za', '+27 21 930 1111', 'Parow College', '56 College Avenue', 'Parow', 'Western Cape', '7500', 'South Africa', 'corporate', '["school", "matric_dance"]', 'Annual matric dance'),
  ('COMPANY_ID_HERE', 'Sophie', 'Daniels', 'sophie.daniels@hotmail.com', '+27 82 234 5678', NULL, '89 Beach Road', 'Bloubergstrand', 'Western Cape', '7441', 'South Africa', 'individual', '["birthday", "beach_event"]', '30th birthday beach party'),
  ('COMPANY_ID_HERE', 'Mark', 'Fourie', 'mark.fourie@construction.co.za', '+27 21 555 7777', 'Fourie Construction', '34 Industrial Park', 'Bellville', 'Western Cape', '7530', 'South Africa', 'corporate', '["corporate", "quarterly_events"]', 'Quarterly staff appreciation events');

-- ============================================
-- 5. SAMPLE ORDERS
-- ============================================

-- NOTE: You'll need to replace CLIENT_ID_1, CLIENT_ID_2, etc. with actual client IDs after running the client inserts
-- This is a template showing the structure

-- Order 1: ABC Corporation Monthly Event (150 people)
INSERT INTO orders (
  company_id, client_id, order_number, event_date, event_time, 
  guest_count, final_guest_count, venue_name, venue_address, 
  order_status, payment_status, total_amount, amount_paid,
  menu_items, special_instructions, created_at, confirmed_at, completed_at
)
VALUES (
  'COMPANY_ID_HERE',
  (SELECT id FROM clients WHERE email = 'sarah.mitchell@abccorp.co.za' AND company_id = 'COMPANY_ID_HERE' LIMIT 1),
  'SBD-2026-001',
  '2026-03-15',
  '12:00:00',
  150,
  150,
  'ABC Corporation Head Office',
  '123 Business Park, Cape Town, 8001',
  'completed',
  'completed',
  42750.00,
  42750.00,
  '[
    {"name": "Lamb Spit (200g)", "quantity": 150, "price": 89.00},
    {"name": "Chicken Quarter", "quantity": 150, "price": 45.00},
    {"name": "Baby Potatoes", "quantity": 150, "price": 25.00},
    {"name": "Greek Salad", "quantity": 150, "price": 32.00},
    {"name": "Coleslaw", "quantity": 150, "price": 20.00},
    {"name": "Garlic Bread", "quantity": 150, "price": 15.00},
    {"name": "Knives, Forks & Plates", "quantity": 150, "price": 12.00},
    {"name": "On-Site Chef (4 hours)", "quantity": 1, "price": 900.00}
  ]'::jsonb,
  'Set up by 11:30am. VIP clients present. Ensure premium presentation.',
  '2026-02-20 10:30:00',
  '2026-02-21 14:00:00',
  '2026-03-15 16:00:00'
);

-- Order 2: John & Sarah Wedding (200 people)
INSERT INTO orders (
  company_id, client_id, order_number, event_date, event_time,
  guest_count, final_guest_count, venue_name, venue_address,
  order_status, payment_status, total_amount, amount_paid,
  menu_items, special_instructions, created_at, confirmed_at
)
VALUES (
  'COMPANY_ID_HERE',
  (SELECT id FROM clients WHERE email = 'john.williams@gmail.com' AND company_id = 'COMPANY_ID_HERE' LIMIT 1),
  'SBD-2026-002',
  '2026-05-20',
  '18:00:00',
  200,
  200,
  'Nooitgedacht Wine Estate',
  'Wine Farm Road, Stellenbosch, 7600',
  'confirmed',
  'pending',
  68400.00,
  20000.00,
  '[
    {"name": "Lamb Spit (200g)", "quantity": 200, "price": 89.00},
    {"name": "Lamb Ribs (300g)", "quantity": 200, "price": 95.00},
    {"name": "Baby Potatoes", "quantity": 200, "price": 25.00},
    {"name": "Green Salad", "quantity": 200, "price": 22.00},
    {"name": "Greek Salad", "quantity": 200, "price": 32.00},
    {"name": "Garlic Bread", "quantity": 200, "price": 15.00},
    {"name": "Malva Pudding & Custard", "quantity": 200, "price": 35.00},
    {"name": "Full Cutlery Set", "quantity": 200, "price": 18.00},
    {"name": "On-Site Chef (4 hours)", "quantity": 2, "price": 900.00},
    {"name": "Waiter Service (2 hours)", "quantity": 3, "price": 300.00}
  ]'::jsonb,
  'Outdoor wedding. Backup plan for rain. Setup by 17:00. White tablecloths requested.',
  '2026-04-01 09:00:00',
  '2026-04-05 11:30:00'
);

-- Order 3: Brackenfell Primary School Year-End (80 people - mix of adults and kids)
INSERT INTO orders (
  company_id, client_id, order_number, event_date, event_time,
  guest_count, final_guest_count, venue_name, venue_address,
  order_status, payment_status, total_amount, amount_paid,
  menu_items, special_instructions, created_at, confirmed_at, completed_at
)
VALUES (
  'COMPANY_ID_HERE',
  (SELECT id FROM clients WHERE email = 'lisa.vdm@brackenfellps.co.za' AND company_id = 'COMPANY_ID_HERE' LIMIT 1),
  'SBD-2026-003',
  '2026-02-28',
  '13:00:00',
  80,
  75,
  'Brackenfell Primary School Hall',
  '10 School Road, Brackenfell, 7560',
  'completed',
  'completed',
  15300.00,
  15300.00,
  '[
    {"name": "Chicken Quarter", "quantity": 75, "price": 45.00},
    {"name": "Boerewors", "quantity": 75, "price": 35.00},
    {"name": "Potato Salad", "quantity": 75, "price": 28.00},
    {"name": "Coleslaw", "quantity": 75, "price": 20.00},
    {"name": "Chocolate Fudge Brownie & Cream", "quantity": 75, "price": 40.00},
    {"name": "Knives, Forks & Plates", "quantity": 75, "price": 12.00}
  ]'::jsonb,
  'School event - kid-friendly setup. No pork. Delivery and buffet setup only (no chef).',
  '2026-01-15 08:00:00',
  '2026-01-16 10:00:00',
  '2026-02-28 15:30:00'
);

-- Order 4: City of Cape Town Municipal Event (120 people)
INSERT INTO orders (
  company_id, client_id, order_number, event_date, event_time,
  guest_count, final_guest_count, venue_name, venue_address,
  order_status, payment_status, total_amount, amount_paid,
  menu_items, special_instructions, created_at, confirmed_at
)
VALUES (
  'COMPANY_ID_HERE',
  (SELECT id FROM clients WHERE email = 'michael.j@capetown.gov.za' AND company_id = 'COMPANY_ID_HERE' LIMIT 1),
  'SBD-2026-004',
  '2026-06-10',
  '12:30:00',
  120,
  120,
  'Cape Town Civic Centre',
  'Civic Centre, 12 Hertzog Boulevard, Cape Town, 8001',
  'pending',
  'pending',
  32160.00,
  0.00,
  '[
    {"name": "Lamb Spit (200g)", "quantity": 120, "price": 89.00},
    {"name": "Vegetarian Lasagne", "quantity": 10, "price": 65.00},
    {"name": "Baby Potatoes", "quantity": 130, "price": 25.00},
    {"name": "Green Salad", "quantity": 130, "price": 22.00},
    {"name": "Mixed Chunky Veg", "quantity": 130, "price": 28.00},
    {"name": "Garlic Bread", "quantity": 130, "price": 15.00},
    {"name": "Full Cutlery Set", "quantity": 130, "price": 18.00},
    {"name": "On-Site Chef (4 hours)", "quantity": 1, "price": 900.00}
  ]'::jsonb,
  'Official government function. 10 vegetarian meals required. Security clearance needed.',
  '2026-05-15 14:00:00',
  '2026-05-20 09:00:00'
);

-- Order 5: Emma Brown 50th Birthday (60 people)
INSERT INTO orders (
  company_id, client_id, order_number, event_date, event_time,
  guest_count, final_guest_count, venue_name, venue_address,
  order_status, payment_status, total_amount, amount_paid,
  menu_items, special_instructions, created_at, confirmed_at, completed_at
)
VALUES (
  'COMPANY_ID_HERE',
  (SELECT id FROM clients WHERE email = 'emma.brown@yahoo.com' AND company_id = 'COMPANY_ID_HERE' LIMIT 1),
  'SBD-2026-005',
  '2026-03-08',
  '18:30:00',
  60,
  58,
  'Private Residence',
  '78 Mountain View Drive, Durbanville, 7550',
  'completed',
  'completed',
  18792.00,
  18792.00,
  '[
    {"name": "Lamb Spit (200g)", "quantity": 58, "price": 89.00},
    {"name": "Chicken Quarter", "quantity": 58, "price": 45.00},
    {"name": "Greek Salad", "quantity": 58, "price": 32.00},
    {"name": "Pasta Vinaigrette", "quantity": 58, "price": 28.00},
    {"name": "Garlic Bread", "quantity": 58, "price": 15.00},
    {"name": "Peppermint Crisp Tart", "quantity": 58, "price": 38.00},
    {"name": "Knives, Forks & Plates", "quantity": 58, "price": 12.00},
    {"name": "Waiter Service (2 hours)", "quantity": 1, "price": 300.00}
  ]'::jsonb,
  'Private garden party. Access through side gate. Birthday cake provided by client.',
  '2026-02-10 16:00:00',
  '2026-02-12 10:00:00',
  '2026-03-08 21:00:00'
);

-- Order 6: Stellenbosch Tech Year-End Function (100 people)
INSERT INTO orders (
  company_id, client_id, order_number, event_date, event_time,
  guest_count, final_guest_count, venue_name, venue_address,
  order_status, payment_status, total_amount, amount_paid,
  menu_items, special_instructions, created_at
)
VALUES (
  'COMPANY_ID_HERE',
  (SELECT id FROM clients WHERE email = 'david.t@stellentech.co.za' AND company_id = 'COMPANY_ID_HERE' LIMIT 1),
  'SBD-2026-006',
  '2026-12-05',
  '19:00:00',
  100,
  NULL,
  'Stellenbosch Tech Campus',
  '25 Innovation Street, Stellenbosch, 7600',
  'pending',
  'pending',
  28700.00,
  0.00,
  '[
    {"name": "Lamb Spit (200g)", "quantity": 100, "price": 89.00},
    {"name": "Sticky Chicken Wings", "quantity": 100, "price": 45.00},
    {"name": "Baby Potatoes", "quantity": 100, "price": 25.00},
    {"name": "Greek Salad", "quantity": 100, "price": 32.00},
    {"name": "Rice Salad", "quantity": 100, "price": 24.00},
    {"name": "Malva Pudding & Custard", "quantity": 100, "price": 35.00},
    {"name": "Full Cutlery Set", "quantity": 100, "price": 18.00},
    {"name": "On-Site Chef (4 hours)", "quantity": 1, "price": 900.00}
  ]'::jsonb,
  'Company year-end function. Indoor venue. Late booking - confirm availability.',
  '2026-04-18 11:00:00'
);

-- Order 7: Sophie Daniels Beach Birthday Party (40 people)
INSERT INTO orders (
  company_id, client_id, order_number, event_date, event_time,
  guest_count, final_guest_count, venue_name, venue_address,
  order_status, payment_status, total_amount, amount_paid,
  menu_items, special_instructions, created_at, confirmed_at
)
VALUES (
  'COMPANY_ID_HERE',
  (SELECT id FROM clients WHERE email = 'sophie.daniels@hotmail.com' AND company_id = 'COMPANY_ID_HERE' LIMIT 1),
  'SBD-2026-007',
  '2026-07-15',
  '17:00:00',
  40,
  40,
  'Blouberg Beach Pavilion',
  'Beach Road, Bloubergstrand, 7441',
  'confirmed',
  'pending',
  10380.00,
  5000.00,
  '[
    {"name": "Chicken Quarter", "quantity": 40, "price": 45.00},
    {"name": "Boerewors", "quantity": 40, "price": 35.00},
    {"name": "Potato Salad", "quantity": 40, "price": 28.00},
    {"name": "Coleslaw", "quantity": 40, "price": 20.00},
    {"name": "Green Salad", "quantity": 40, "price": 22.00},
    {"name": "Chocolate Fudge Brownie & Cream", "quantity": 40, "price": 40.00},
    {"name": "Knives, Forks & Plates", "quantity": 40, "price": 12.00},
    {"name": "Waiter Service (2 hours)", "quantity": 1, "price": 300.00}
  ]'::jsonb,
  'Beach setup - wind protection needed. Sunset timing. Casual vibe.',
  '2026-06-20 13:00:00',
  '2026-06-22 15:00:00'
);

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
-- This script populates the database with realistic test data for Spit Braai Delivery
-- Remember to replace 'COMPANY_ID_HERE' with the actual company_id from the companies table
-- Run: SELECT id FROM companies WHERE company_slug = 'spit-braai-delivery';
-- Then find-and-replace COMPANY_ID_HERE with that UUID