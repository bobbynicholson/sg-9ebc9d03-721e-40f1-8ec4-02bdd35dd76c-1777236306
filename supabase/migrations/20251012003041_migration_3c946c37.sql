-- Create blog posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  published_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  featured_image TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  meta_title TEXT,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  read_time_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pages table for CMS
CREATE TABLE IF NOT EXISTS cms_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  is_published BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;

-- Public read access, admin write access
CREATE POLICY "Anyone can view published blog posts" ON blog_posts 
  FOR SELECT USING (is_published = TRUE);
  
CREATE POLICY "Authenticated users can manage blog posts" ON blog_posts 
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view published pages" ON cms_pages 
  FOR SELECT USING (is_published = TRUE);
  
CREATE POLICY "Authenticated users can manage pages" ON cms_pages 
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Insert dummy blog posts
INSERT INTO blog_posts (slug, title, excerpt, content, author, category, tags, is_published, read_time_minutes) VALUES
(
  'reduce-food-waste-catering-business',
  'How to Reduce Food Waste in Your Catering Business',
  'Learn practical strategies to minimize food waste, cut costs, and increase profitability in your catering operation.',
  'Food waste is one of the biggest profit killers in the catering industry. Studies show that catering businesses waste up to 20% of food purchased, directly impacting bottom lines.

## The Real Cost of Food Waste

Every plate of food thrown away represents lost profit. When you factor in purchase costs, labor, storage, and disposal, food waste becomes expensive quickly.

## Accurate Portion Control

Use digital scales and standardized recipes. Train kitchen staff on exact measurements. This ensures consistency and reduces over-preparation.

## Smart Inventory Management

Implement a first-in-first-out system. Track expiry dates automatically. Order based on actual needs, not estimates.

## Menu Engineering

Analyze which dishes generate the most waste. Consider simplifying your menu to focus on high-margin, low-waste items.

## Client Communication

Set clear expectations about guest counts. Charge for last-minute changes. This reduces over-ordering and protects your margins.

## Technology Solutions

Modern catering management software can track waste patterns, predict accurate quantities, and alert you to expiring inventory. The investment pays for itself through reduced waste.

## Staff Training

Educate your team on the financial impact of waste. Create accountability systems. Reward waste reduction efforts.

## Conclusion

Reducing food waste is not just environmentally responsible, it is financially smart. Small changes in processes can lead to significant profit improvements.',
  'Sarah Mitchell',
  'Operations',
  ARRAY['food waste', 'profitability', 'operations'],
  TRUE,
  5
),
(
  'automate-catering-quote-process',
  'Automating Your Catering Quote Process: Save 10 Hours Per Week',
  'Discover how automation can transform your quoting process from hours of manual work to minutes of efficient service.',
  'Creating quotes manually is time-consuming and error-prone. The average catering business spends 10-15 hours per week on quotes and follow-ups.

## The Manual Quote Problem

Spreadsheets, calculators, email chains, forgotten follow-ups. This chaos costs you money and opportunities.

## What to Automate

**Quote Generation**: Templates with automatic pricing based on guest count, menu selections, and equipment needs.

**Follow-Up Emails**: Scheduled reminders that go out automatically if clients have not responded.

**Price Calculations**: Real-time updates when clients change quantities or options.

**Calendar Integration**: Automatic date availability checking to prevent double-bookings.

## ROI of Quote Automation

A business handling 50 quotes per month can save 40+ hours monthly. That is time redirected to growing your business instead of administrative tasks.

## Client Experience Improvements

Instant quotes impress clients. Professional, consistent communication builds trust. Faster response times win more bookings.

## Integration with Operations

Automated systems connect quotes to inventory, kitchen prep, and driver scheduling. One data entry point flows through your entire operation.

## Common Mistakes to Avoid

Do not automate broken processes. Fix your workflow first, then automate. Keep human touch points for complex or high-value events.

## Getting Started

Start with email automation and quote templates. Add complexity gradually. Measure time saved and conversion rate improvements.

## Conclusion

Quote automation is not about replacing personal service. It is about eliminating repetitive tasks so you can focus on what matters: delivering amazing events.',
  'Michael Chen',
  'Technology',
  ARRAY['automation', 'efficiency', 'quotes'],
  TRUE,
  6
),
(
  'catering-profit-margins-guide',
  'Understanding and Improving Catering Profit Margins',
  'A comprehensive guide to calculating true profit margins and implementing strategies to improve profitability in your catering business.',
  'Many catering businesses operate on razor-thin margins without knowing their actual profitability per event.

## Industry Benchmarks

Successful catering businesses aim for 25-35% gross profit margins. Net profit margins typically range from 5-15% after all expenses.

## Hidden Cost Killers

**Labor Inefficiency**: Staff standing idle or working overtime unnecessarily.

**Equipment Underutilization**: Buying equipment that sits unused most of the time.

**Fuel Costs**: Inefficient routing for deliveries and pickups.

**Food Waste**: Already covered in detail, but worth emphasizing again.

## Pricing Strategy

Never compete on price alone. Your value proposition should include reliability, quality, and service. Price for your costs plus desired margin.

## Cost Control Systems

Track every expense per event. Know your cost per plate. Monitor ingredient price fluctuations. Adjust pricing quarterly if needed.

## Menu Engineering for Profit

Analyze the profitability and popularity of each menu item. Focus on high-profit, high-demand dishes. Eliminate low-margin items that do not drive bookings.

## Operational Efficiency

Reduce setup and cleanup times through better processes. Optimize kitchen workflows. Minimize trips and touches for each task.

## Technology Investment

Modern catering management platforms provide real-time visibility into profitability. The data helps make informed decisions quickly.

## Conclusion

Improving margins requires understanding your costs, pricing strategically, and operating efficiently. Small improvements across multiple areas compound into significant profit gains.',
  'David Thompson',
  'Finance',
  ARRAY['profit margins', 'pricing', 'finance'],
  TRUE,
  7
);

-- Insert more blog posts
INSERT INTO blog_posts (slug, title, excerpt, content, author, category, tags, is_published, read_time_minutes) VALUES
(
  'scale-catering-business-multiple-locations',
  'How to Scale Your Catering Business Across Multiple Locations',
  'Learn the systems and strategies needed to successfully expand your catering operation into new markets.',
  'Scaling a catering business requires more than just opening new kitchens. You need robust systems, clear processes, and the right technology.

## When to Scale

Scale when your current location is operating profitably with strong systems. Never scale to solve cash flow problems or escape operational issues.

## System Requirements

**Standardized Processes**: Document everything from how quotes are created to how equipment is cleaned.

**Centralized Management**: One system for all locations to track orders, inventory, and performance.

**Quality Control**: Mechanisms to ensure consistency across locations.

## Regional Considerations

Different areas have different tastes, price sensitivities, and competition levels. Adapt your offerings while maintaining core brand standards.

## Staffing Challenges

Finding and training reliable staff in new markets is difficult. Build training programs and incentive structures that attract quality people.

## Financial Planning

Each new location requires significant upfront investment. Plan for 6-12 months of losses before profitability.

## Technology as an Enabler

Modern catering platforms allow centralized quote generation with regionalized operations. Head office handles sales while local teams execute.

## Common Pitfalls

Growing too fast, inadequate working capital, poor communication between locations, and inconsistent quality standards.

## Success Metrics

Track performance by location. Monitor food costs, labor efficiency, client satisfaction, and profitability independently.

## Conclusion

Scaling successfully requires strong foundations, adequate capital, and technology that connects all locations while allowing operational independence.',
  'Sarah Mitchell',
  'Growth',
  ARRAY['scaling', 'expansion', 'multi-location'],
  TRUE,
  8
),
(
  'driver-management-catering-logistics',
  'Effective Driver Management for Catering Logistics',
  'Best practices for managing delivery drivers to ensure on-time delivery and excellent client experiences.',
  'Your drivers are the final touchpoint with clients. Poor driver management leads to late deliveries, damaged food, and lost business.

## Driver Selection

Hire for reliability and professionalism, not just availability. Background checks are essential. Look for people with customer service experience.

## GPS Tracking Benefits

Real-time location tracking provides accountability, helps optimize routes, and gives clients peace of mind. It also protects your business in disputes.

## Communication Systems

Drivers need clear instructions, client contact information, and setup details. Mobile apps streamline communication and reduce errors.

## Performance Metrics

Track on-time delivery rates, client feedback, vehicle maintenance, and fuel efficiency. Provide regular performance reviews.

## Fair Compensation

Pay structure should reward reliability and efficiency. Consider per-event rates plus bonuses for consistent performance.

## Training Programs

Proper setup techniques, client interaction protocols, vehicle safety, and emergency procedures. Ongoing training maintains standards.

## Equipment Management

Drivers should inspect equipment before and after events. Systems should track what equipment is where and when it needs to return.

## Problem Resolution

Have clear escalation procedures when issues arise. Drivers should know when to call the office vs. handle situations independently.

## Conclusion

Professional driver management transforms logistics from a liability into a competitive advantage. The right systems make this scalable.',
  'Michael Chen',
  'Operations',
  ARRAY['drivers', 'logistics', 'delivery'],
  TRUE,
  6
);