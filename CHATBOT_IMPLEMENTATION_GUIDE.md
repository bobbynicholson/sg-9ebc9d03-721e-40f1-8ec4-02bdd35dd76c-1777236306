# AI Chatbot System - Implementation Guide

## 🎯 Overview
Beautiful, role-aware AI chatbot system that provides company-specific assistance to every user role.

## 🤖 Features Implemented

### 1. Role-Specific Intelligence
Each role has contextual example questions that showcase intelligent data access:

**Admin Role:**
- "Show me today's revenue"
- "Which orders need immediate attention?"
- "Staff performance this week"
- "Upcoming events summary"

**Driver Role:**
- "When is my next collection?"
- "Optimal route for today's deliveries"
- "My earnings this month"
- "Traffic updates for current route"

**Kitchen Role:**
- "When to start prepping order #3216?"
- "What ingredients are running low?"
- "Tomorrow's production schedule"
- "Recipe scaling for 200 guests"

**Shopping Role:**
- "What needs restocking urgently?"
- "Best supplier for bulk chicken?"
- "This week's procurement spending"
- "Compare prices for olive oil"

**Cleaning Role:**
- "Which equipment needs inspection today?"
- "Damaged items report this week"
- "My cleaning tasks for today"
- "Equipment usage history"

**Client Role:**
- "When is my next event?"
- "Update my event details"
- "What's included in my package?"
- "Payment schedule for my order"

### 2. Beautiful UI/UX

**Floating Button:**
- Bottom-right position (fixed)
- Animated pulse effect
- Role-specific gradient colors
- Badge with sparkle icon

**Chat Window:**
- 400px width × 600px height
- Beautiful card design with role gradient header
- Scrollable message area
- Example questions on first open
- Typing indicators
- Message timestamps
- User/Assistant avatars

**Role-Specific Colors:**
- Admin: Purple to Pink gradient
- Driver: Blue to Indigo gradient
- Kitchen: Orange to Red gradient
- Shopping: Green to Emerald gradient
- Cleaning: Cyan to Blue gradient
- Client: Blue to Cyan gradient

### 3. Company Data Isolation

**Current Implementation:**
- Each chatbot instance receives `companyId` prop
- Service layer prepared for company-specific queries
- Context fetching scoped to company data

**Future LLM Integration:**
```typescript
// Service already structured for real AI
async processAIQuery(
  query: string,
  companyId: string,
  userRole: string,
  context: Record<string, any>
): Promise<string>
```

### 4. Chat History System

**Database Schema (Ready to Apply):**
```sql
-- Chat Sessions Table
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES profiles(id),
  user_role TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP
);

-- Chat Messages Table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id),
  company_id UUID,
  user_id UUID,
  role TEXT, -- 'user' or 'assistant'
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMP
);
```

**RLS Policies:**
- Users only see their own chat history
- Company-scoped data access
- Admin can view company chat analytics

### 5. Intelligent Mock Responses

Current implementation includes smart placeholder responses that demonstrate:
- Order-specific queries (e.g., "order #3216")
- Time-sensitive information (e.g., "next collection at 2:30 PM")
- Data-driven insights (e.g., "Chicken: 8kg remaining")
- Financial information (e.g., "Earnings: R3,850")

## 🔌 Integration Points

### Page Integration
Chatbot added to all role-specific pages:
- ✅ `/admin/dashboard.tsx`
- ✅ `/portal/driver/dashboard.tsx`
- ✅ `/portal/kitchen/dashboard.tsx`
- ✅ `/portal/shopping/dashboard.tsx`
- ✅ `/portal/cleaning/dashboard.tsx`
- ✅ `/client-portal.tsx`

### Usage
```tsx
import { ChatBot } from "@/components/ChatBot";

// In component
<ChatBot 
  userRole="admin" 
  companyId={user?.user_metadata?.company_id} 
/>
```

## 🚀 Future LLM Integration

### Step 1: Choose LLM Provider
Options:
- **OpenAI GPT-4** (Best quality, higher cost)
- **Claude 3** (Great reasoning, good value)
- **Gemini Pro** (Google's offering)
- **Open Source** (Llama 3, Mistral - self-hosted)

### Step 2: Update Service Layer
```typescript
// Add to chatBotService.ts
async processAIQuery(
  query: string,
  companyId: string,
  userRole: string
): Promise<string> {
  // 1. Fetch company context
  const context = await this.getCompanyContext(companyId, userRole);
  
  // 2. Build prompt with context
  const prompt = this.buildContextualPrompt(query, context, userRole);
  
  // 3. Call LLM API
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
  });
  
  return response.choices[0].message.content;
}
```

### Step 3: Context Builder
```typescript
async getCompanyContext(
  companyId: string, 
  userRole: string
): Promise<Record<string, any>> {
  // Fetch only relevant data for the role
  switch (userRole) {
    case "admin":
      return {
        orders: await getRecentOrders(companyId),
        revenue: await getRevenueData(companyId),
        staff: await getStaffSummary(companyId)
      };
    case "driver":
      return {
        assignments: await getDriverAssignments(companyId),
        routes: await getRoutes(companyId)
      };
    // ... etc
  }
}
```

### Step 4: System Prompts (Per Role)
```typescript
const ROLE_SYSTEM_PROMPTS = {
  admin: `You are an AI assistant for a catering business admin. 
  Provide insights on orders, revenue, and operations. 
  Be concise and actionable.`,
  
  driver: `You are a delivery driver assistant. 
  Help with route optimization, delivery schedules, and earnings. 
  Always provide specific times and addresses.`,
  
  // ... etc
};
```

## 📊 Analytics & Insights

### Future Analytics Dashboard
Track chatbot usage per company:
- Most asked questions
- Response satisfaction
- Usage patterns by role
- Feature requests from chat
- Common pain points

### Data Collection
```typescript
// Log all interactions for improvement
await chatBotService.saveMessage(
  sessionId,
  companyId,
  userId,
  "user",
  userQuery,
  { 
    satisfaction: null, // User can rate
    responseTime: 1200 
  }
);
```

## 🔐 Security Considerations

1. **Data Isolation:** Each company only sees their own data
2. **Rate Limiting:** Prevent abuse (10 queries/minute per user)
3. **Content Filtering:** Block sensitive PII in responses
4. **Audit Logging:** Track all AI interactions
5. **Cost Management:** Set usage limits per company tier

## 💡 Enhancement Ideas

1. **Voice Input:** Speech-to-text for hands-free queries
2. **Proactive Notifications:** "Order #3216 prep should start in 30 minutes"
3. **Multi-language Support:** Detect user language
4. **Quick Actions:** "Book this job" buttons in chat
5. **File Attachments:** Upload receipts, photos
6. **Scheduled Reports:** "Send me daily revenue at 5 PM"

## 🎨 Customization Options

### Per-Company Branding
```typescript
// Use company theme colors
<ChatBot 
  userRole="admin"
  companyId={companyId}
  theme={{
    primaryColor: company.brandColor,
    headerGradient: company.gradient
  }}
/>
```

### Custom Responses
```typescript
// Company-specific responses
const customResponses = {
  greeting: company.chatGreeting || defaultGreeting,
  signature: company.chatSignature || "CateringMS Assistant"
};
```

## 📝 Current Status

✅ **Completed:**
- Beautiful UI component with role-specific styling
- Role-aware example questions
- Company-scoped service architecture
- Mock response system demonstrating intelligence
- Integration on all dashboards
- Database schema design

🔄 **In Progress:**
- Database tables (pending connection restore)
- Chat history persistence

⏳ **Pending:**
- LLM API integration
- Real-time company data fetching
- Usage analytics
- Rate limiting

## 🚀 Next Steps

1. **Restore Database Connection** - Apply schema for chat_sessions and chat_messages
2. **Add Environment Variables** - Add LLM API keys (OpenAI/Claude/etc.)
3. **Implement Real Queries** - Connect to actual company data
4. **Test with Real Users** - Gather feedback on response quality
5. **Add Analytics** - Track usage and improve responses

## 📞 Support

For questions or enhancements, refer to:
- `src/components/ChatBot.tsx` - UI component
- `src/services/chatBotService.ts` - Data layer
- This guide for implementation details