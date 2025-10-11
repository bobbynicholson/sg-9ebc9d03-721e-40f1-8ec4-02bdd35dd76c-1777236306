
import { Lead, Quote, Order, InventoryItem, Driver, Delivery, Payment } from "@/types";

export const mockLeads: Lead[] = [
  {
    id: "L001",
    clientName: "Sarah Johnson",
    email: "sarah@example.com",
    phone: "+1234567890",
    eventDate: "2025-11-15",
    eventType: "Wedding Reception",
    guestCount: 150,
    budget: 8000,
    specialRequests: "Vegetarian options needed for 20 guests",
    status: "new",
    createdAt: "2025-10-10T10:00:00Z",
    updatedAt: "2025-10-10T10:00:00Z"
  },
  {
    id: "L002",
    clientName: "Michael Chen",
    email: "michael@example.com",
    phone: "+1234567891",
    eventDate: "2025-11-20",
    eventType: "Corporate Event",
    guestCount: 75,
    budget: 4500,
    specialRequests: "Need setup by 11 AM",
    status: "quoted",
    createdAt: "2025-10-09T14:30:00Z",
    updatedAt: "2025-10-10T09:15:00Z"
  }
];

export const mockQuotes: Quote[] = [
  {
    id: "Q001",
    leadId: "L002",
    clientName: "Michael Chen",
    email: "michael@example.com",
    eventDate: "2025-11-20",
    eventType: "Corporate Event",
    guestCount: 75,
    menuItems: [
      {
        id: "M001",
        name: "Chicken Satay Skewers",
        category: "appetizer",
        pricePerPerson: 8,
        quantity: 75,
        ingredients: [
          { id: "I001", name: "Chicken Breast", quantity: 10, quantityNeeded: 10, unit: "kg", category: "fresh" }
        ]
      }
    ],
    equipmentItems: [
      {
        id: "E001",
        name: "Chafing Dish",
        category: "chafing",
        quantity: 4,
        available: 4,
        condition: "good",
        rentalPrice: 25
      }
    ],
    subtotal: 700,
    tax: 105,
    total: 805,
    status: "sent",
    version: 1,
    createdAt: "2025-10-10T09:00:00Z",
    updatedAt: "2025-10-10T09:00:00Z"
  }
];

export const mockOrders: Order[] = [
  {
    id: "ORD-001",
    quoteId: "Q-001",
    client: "Sarah Johnson",
    clientName: "Sarah Johnson",
    eventDate: "2024-02-15",
    date: "2024-02-15",
    venue: "Grand Palace Hotel",
    location: "123 Main St, Cape Town",
    eventLocation: "123 Main St, Cape Town",
    guestCount: 150,
    menuItems: [
      {
        id: "m1",
        name: "Braai Platter",
        category: "main",
        pricePerPerson: 250,
        quantity: 150,
        ingredients: [
          { id: "i1", name: "Beef", quantity: 30, quantityNeeded: 30, unit: "kg", category: "fresh" },
          { id: "i2", name: "Chicken", quantity: 25, quantityNeeded: 25, unit: "kg", category: "fresh" },
        ],
      },
    ],
    equipmentItems: [
      {
        id: "e1",
        name: "Chafing Dish",
        category: "chafing",
        quantity: 10,
        available: 8,
        condition: "excellent",
        rentalPrice: 50,
      },
    ],
    kitchenInstructions: "Prepare 2 hours before event",
    status: "pending",
    total: 37500,
    totalAmount: 37500,
    createdAt: new Date().toISOString(),
  },
];

export const mockInventory: InventoryItem[] = [
  {
    id: "INV001",
    name: "Chicken Breast",
    category: "fresh_produce",
    currentStock: 25,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-10-10",
    supplier: "Fresh Meats Co."
  },
  {
    id: "INV002",
    name: "Rice",
    category: "staples",
    currentStock: 50,
    unit: "kg",
    minimumStock: 30,
    lastRestocked: "2025-10-05",
    supplier: "Bulk Foods Ltd"
  },
  {
    id: "INV003",
    name: "Chafing Dish",
    category: "equipment",
    currentStock: 12,
    unit: "units",
    minimumStock: 8,
    lastRestocked: "2025-09-15"
  }
];

export const mockDrivers: Driver[] = [
  {
    id: "D001",
    name: "James Wilson",
    phone: "+1234567892",
    email: "james@example.com",
    availableJobs: ["O001"],
    assignedJobs: [],
    completedJobs: 45
  },
  {
    id: "D002",
    name: "Lisa Martinez",
    phone: "+1234567893",
    email: "lisa@example.com",
    availableJobs: ["O001"],
    assignedJobs: [],
    completedJobs: 62
  }
];

export const mockDeliveries: Delivery[] = [
  {
    id: "DEL001",
    orderId: "O001",
    pickupTime: "2025-11-20T09:00:00Z",
    deliveryTime: "2025-11-20T10:30:00Z",
    location: "Convention Center, Downtown",
    status: "available"
  }
];

export const mockPayments: Payment[] = [
  {
    id: "PAY001",
    quoteId: "Q001",
    amount: 805,
    status: "pending",
    paidAmount: 0,
    reconciled: false
  }
];
