import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Sparkles, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface RoleConfig {
  title: string;
  greeting: string;
  examples: string[];
  color: string;
  icon: string;
}

const ROLE_CONFIGS: Record<string, RoleConfig> = {
  admin: {
    title: "Admin Assistant",
    greeting: "Hi! I'm your admin assistant. I can help you manage your catering business, analyze data, and make informed decisions.",
    examples: [
      "Show me today's revenue",
      "Which orders need immediate attention?",
      "Staff performance this week",
      "Upcoming events summary"
    ],
    color: "from-purple-500 to-pink-500",
    icon: "🎯"
  },
  driver: {
    title: "Driver Assistant",
    greeting: "Hey driver! I'm here to help with your routes, deliveries, and earnings.",
    examples: [
      "When is my next collection?",
      "Optimal route for today's deliveries",
      "My earnings this month",
      "Traffic updates for current route"
    ],
    color: "from-blue-500 to-indigo-500",
    icon: "🚚"
  },
  kitchen: {
    title: "Kitchen Assistant",
    greeting: "Hello chef! I can help with prep schedules, ingredient planning, and production timing.",
    examples: [
      "When to start prepping order #3216?",
      "What ingredients are running low?",
      "Tomorrow's production schedule",
      "Recipe scaling for 200 guests"
    ],
    color: "from-orange-500 to-red-500",
    icon: "👨‍🍳"
  },
  shopping: {
    title: "Procurement Assistant",
    greeting: "Hi! I'm your procurement assistant. I can help with inventory, suppliers, and purchasing decisions.",
    examples: [
      "What needs restocking urgently?",
      "Best supplier for bulk chicken?",
      "This week's procurement spending",
      "Compare prices for olive oil"
    ],
    color: "from-green-500 to-emerald-500",
    icon: "🛒"
  },
  cleaning: {
    title: "Maintenance Assistant",
    greeting: "Hello! I'm here to help with equipment tracking, maintenance schedules, and inspections.",
    examples: [
      "Which equipment needs inspection today?",
      "Damaged items report this week",
      "My cleaning tasks for today",
      "Equipment usage history"
    ],
    color: "from-cyan-500 to-blue-500",
    icon: "✨"
  },
  client: {
    title: "Event Assistant",
    greeting: "Welcome! I can help you track your orders, answer questions about your events, and assist with bookings.",
    examples: [
      "When is my next event?",
      "Update my event details",
      "What's included in my package?",
      "Payment schedule for my order"
    ],
    color: "from-blue-500 to-cyan-500",
    icon: "🎉"
  }
};

interface ChatBotProps {
  userRole?: string;
  companyId?: string;
}

export function ChatBot({ userRole = "admin", companyId }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const config = ROLE_CONFIGS[userRole] || ROLE_CONFIGS.admin;

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Add welcome message when chat first opens
      const welcomeMessage: Message = {
        id: "welcome",
        role: "assistant",
        content: config.greeting,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length, config.greeting]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (content?: string) => {
    const messageContent = content || inputValue.trim();
    if (!messageContent) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    // Simulate AI response (placeholder for future LLM integration)
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: getPlaceholderResponse(messageContent, userRole),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const handleExampleClick = (example: string) => {
    handleSendMessage(example);
  };

  const getPlaceholderResponse = (question: string, role: string): string => {
    // Placeholder responses - will be replaced with actual LLM integration
    const responses: Record<string, Record<string, string>> = {
      admin: {
        default: "I'm analyzing your company data... This feature will be fully powered by AI soon! For now, check your dashboard for detailed insights."
      },
      driver: {
        "next collection": "Your next collection is at **2:30 PM** from Sandton City for Order #3245 (150 guests). The pickup address is: 83 Rivonia Rd, Sandhurst.",
        default: "I'm checking your delivery schedule... Full AI integration coming soon! Check your driver dashboard for current assignments."
      },
      kitchen: {
        "order #3216": "For Order #3216 (180 guests), you should start prepping the chicken **2.5 hours before** the 6:00 PM event time. Start at **3:30 PM** to ensure proper marinating and cooking time.",
        "low": "Currently running low on: **Chicken** (8kg remaining), **Olive Oil** (2L remaining), **Rice** (15kg remaining). Consider restocking soon!",
        default: "I'm analyzing your kitchen operations... Full AI-powered prep scheduling coming soon!"
      },
      shopping: {
        "restocking": "**Urgent restocking needed:** Chicken (5kg left, min 25kg), Olive Oil (2L left, min 10L), Plates (50 units left, min 100). Estimated cost: R3,850",
        default: "I'm checking your inventory levels... AI-powered procurement recommendations coming soon!"
      },
      cleaning: {
        "inspection": "**Equipment needing inspection today:** Gas Burners (last cleaned 5 days ago), Table Linens (in cleaning queue), Chafing Dishes (due for inspection).",
        default: "I'm reviewing equipment status... Full AI-powered maintenance scheduling coming soon!"
      },
      client: {
        "next event": "Your next event is on **Friday, April 25th** at Sandton Convention Centre for 200 guests. Everything is on track!",
        default: "I'm checking your event details... Full AI assistance coming soon! Visit your client portal for complete information."
      }
    };

    const roleResponses = responses[role] || responses.admin;
    const lowerQuestion = question.toLowerCase();
    
    for (const [key, response] of Object.entries(roleResponses)) {
      if (lowerQuestion.includes(key)) {
        return response;
      }
    }
    
    return roleResponses.default || "I'm here to help! This feature will be fully AI-powered soon.";
  };

  return (
    <>
      {/* Floating Chat Button */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen && (
          <Button
            onClick={() => setIsOpen(true)}
            className={cn(
              "w-16 h-16 rounded-full shadow-2xl hover:scale-110 transition-all duration-300 bg-gradient-to-r",
              config.color
            )}
          >
            <MessageSquare className="w-6 h-6 text-white" />
            <Badge className="absolute -top-2 -right-2 bg-red-500 text-white border-0 px-2">
              <Sparkles className="w-3 h-3" />
            </Badge>
          </Button>
        )}

        {/* Chat Window */}
        {isOpen && (
          <Card className="w-96 h-[600px] shadow-2xl flex flex-col animate-in slide-in-from-bottom-4">
            {/* Header */}
            <CardHeader className={cn("bg-gradient-to-r text-white rounded-t-lg", config.color)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-2xl">
                    {config.icon}
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg">{config.title}</CardTitle>
                    <p className="text-xs text-white/80 mt-0.5">AI-Powered Assistant</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:bg-white/20 h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex items-start gap-3",
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                        message.role === "user"
                          ? "bg-gradient-to-r from-blue-500 to-blue-600"
                          : `bg-gradient-to-r ${config.color}`
                      )}
                    >
                      {message.role === "user" ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 max-w-[75%]",
                        message.role === "user"
                          ? "bg-blue-500 text-white"
                          : "bg-slate-100 text-slate-900"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <p className="text-xs mt-1 opacity-70">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex items-start gap-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-r", config.color)}>
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-slate-100 rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Example Questions (show only at start) */}
                {messages.length === 1 && (
                  <div className="space-y-2 mt-4">
                    <p className="text-xs text-slate-500 font-semibold">Try asking:</p>
                    {config.examples.map((example, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-3 px-4 hover:bg-slate-100"
                        onClick={() => handleExampleClick(example)}
                      >
                        <Sparkles className="w-4 h-4 mr-2 flex-shrink-0 text-slate-400" />
                        <span className="text-sm text-slate-700">{example}</span>
                      </Button>
                    ))}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <CardContent className="p-4 border-t">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-2"
              >
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask me anything..."
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className={cn("bg-gradient-to-r text-white", config.color)}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <p className="text-xs text-slate-400 mt-2 text-center">
                🚀 AI-powered • Company-specific data
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}