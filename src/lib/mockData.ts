
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
    id: "O001",
    quoteId: "Q001",
    clientName: "Michael Chen",
    eventDate: "2025-11-20",
    eventLocation: "Convention Center, Downtown",
    guestCount: 75,
    menuItems: mockQuotes[0].menuItems,
    equipmentItems: mockQuotes[0].equipmentItems,
    kitchenInstructions: "Prepare day before, reheat on-site",
    status: "pending",
    createdAt: "2025-10-11T08:00:00Z"
  }
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
