import type { AppOrder, Delivery, Lead, Quote, InventoryItem, Payment } from "@/types";
import { addDays, subDays } from "date-fns";

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
    updatedAt: subDays(new Date(), 2).toISOString()
  }
];

export const mockOrders: AppOrder[] = [
  {
    id: "ORD-001",
    quoteId: "QUOTE-001",
    client: "Sarah Johnson",
    clientName: "Sarah Johnson",
    eventDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0],
    venue: "Grand Palace Hotel",
    location: "Grand Palace Hotel, 123 Victoria Road, Green Point, Cape Town",
    eventLocation: "Grand Palace Hotel, 123 Victoria Road, Green Point, Cape Town",
    guestCount: 150,
    menuItems: [
      {
        id: "m1",
        name: "Deluxe Braai Platter",
        category: "main",
        pricePerPerson: 285,
        quantity: 150,
        ingredients: [
          { id: "i1", name: "Premium Beef Fillet", quantity: 35, quantityNeeded: 35, unit: "kg", category: "fresh" },
          { id: "i2", name: "Free Range Chicken", quantity: 28, quantityNeeded: 28, unit: "kg", category: "fresh" },
          { id: "i3", name: "Boerewors", quantity: 22, quantityNeeded: 22, unit: "kg", category: "fresh" },
          { id: "i4", name: "Lamb Chops", quantity: 20, quantityNeeded: 20, unit: "kg", category: "fresh" },
        ],
      },
      {
        id: "m2",
        name: "Traditional Pap & Sauce",
        category: "side",
        pricePerPerson: 45,
        quantity: 150,
        ingredients: [
          { id: "i5", name: "Maize Meal", quantity: 15, quantityNeeded: 15, unit: "kg", category: "staple" },
          { id: "i6", name: "Tomato Sauce Mix", quantity: 8, quantityNeeded: 8, unit: "kg", category: "staple" },
        ],
      },
      {
        id: "m3",
        name: "Garden Salad Selection",
        category: "side",
        pricePerPerson: 35,
        quantity: 150,
        ingredients: [
          { id: "i7", name: "Mixed Lettuce", quantity: 12, quantityNeeded: 12, unit: "kg", category: "fresh" },
          { id: "i8", name: "Cherry Tomatoes", quantity: 8, quantityNeeded: 8, unit: "kg", category: "fresh" },
        ],
      },
    ],
    equipmentItems: [
      {
        id: "e1",
        name: "Large Chafing Dish",
        category: "chafing",
        quantity: 8,
        available: 8,
        condition: "excellent",
        rentalPrice: 65,
      },
      {
        id: "e2",
        name: "Serving Platters (Large)",
        category: "serving",
        quantity: 12,
        available: 12,
        condition: "good",
        rentalPrice: 25,
      },
      {
        id: "e3",
        name: "Cutlery Sets (Complete)",
        category: "cutlery",
        quantity: 150,
        available: 150,
        condition: "excellent",
        rentalPrice: 3,
      },
    ],
    kitchenInstructions: "Prepare 3 hours before event. Meat must be marinated overnight. Ensure vegetarian options are clearly labeled.",
    status: "in_progress",
    total: 56250,
    totalAmount: 56250,
    createdAt: subDays(new Date(), 5).toISOString(),
    assignedDriver: "D001",
    driverName: "James Wilson",
    driverPhone: "+27 82 345 6789",
  },
  {
    id: "ORD-002",
    quoteId: "QUOTE-002",
    client: "Michael Chen",
    clientName: "Michael Chen",
    eventDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    venue: "Waterfront Conference Centre",
    location: "Waterfront Conference Centre, 45 Beach Road, V&A Waterfront, Cape Town",
    eventLocation: "Waterfront Conference Centre, 45 Beach Road, V&A Waterfront, Cape Town",
    guestCount: 85,
    menuItems: [
      {
        id: "m4",
        name: "Executive Lunch Buffet",
        category: "main",
        pricePerPerson: 195,
        quantity: 85,
        ingredients: [
          { id: "i9", name: "Chicken Breast", quantity: 18, quantityNeeded: 18, unit: "kg", category: "fresh" },
          { id: "i10", name: "Salmon Fillets", quantity: 12, quantityNeeded: 12, unit: "kg", category: "fresh" },
          { id: "i11", name: "Beef Sirloin", quantity: 10, quantityNeeded: 10, unit: "kg", category: "fresh" },
        ],
      },
      {
        id: "m5",
        name: "Roasted Vegetables",
        category: "side",
        pricePerPerson: 42,
        quantity: 85,
        ingredients: [
          { id: "i12", name: "Mixed Vegetables", quantity: 15, quantityNeeded: 15, unit: "kg", category: "fresh" },
        ],
      },
    ],
    equipmentItems: [
      {
        id: "e4",
        name: "Medium Chafing Dish",
        category: "chafing",
        quantity: 6,
        available: 6,
        condition: "excellent",
        rentalPrice: 55,
      },
      {
        id: "e5",
        name: "Cutlery Sets (Complete)",
        category: "cutlery",
        quantity: 85,
        available: 85,
        condition: "excellent",
        rentalPrice: 3,
      },
    ],
    kitchenInstructions: "Setup by 11:30 AM. Corporate presentation format required.",
    status: "delivered",
    total: 20145,
    totalAmount: 20145,
    createdAt: subDays(new Date(), 8).toISOString(),
    assignedDriver: "D002",
    driverName: "Themba Khumalo",
    driverPhone: "+27 73 987 6543",
  },
  {
    id: "ORD-003",
    quoteId: "QUOTE-003",
    client: "Emily Rodriguez",
    clientName: "Emily Rodriguez",
    eventDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    venue: "Stellenbosch Wine Estate",
    location: "Stellenbosch Wine Estate, Wine Route R310, Stellenbosch",
    eventLocation: "Stellenbosch Wine Estate, Wine Route R310, Stellenbosch",
    guestCount: 200,
    menuItems: [
      {
        id: "m6",
        name: "Wedding Reception Buffet",
        category: "main",
        pricePerPerson: 325,
        quantity: 200,
        ingredients: [
          { id: "i13", name: "Prime Rib Roast", quantity: 45, quantityNeeded: 45, unit: "kg", category: "fresh" },
          { id: "i14", name: "Whole Salmon", quantity: 25, quantityNeeded: 25, unit: "kg", category: "fresh" },
          { id: "i15", name: "Lamb Rack", quantity: 35, quantityNeeded: 35, unit: "kg", category: "fresh" },
        ],
      },
      {
        id: "m7",
        name: "Gourmet Side Selection",
        category: "side",
        pricePerPerson: 68,
        quantity: 200,
        ingredients: [
          { id: "i16", name: "Truffle Mash", quantity: 25, quantityNeeded: 25, unit: "kg", category: "fresh" },
          { id: "i17", name: "Grilled Asparagus", quantity: 18, quantityNeeded: 18, unit: "kg", category: "fresh" },
        ],
      },
    ],
    equipmentItems: [
      {
        id: "e6",
        name: "Premium Chafing Dish",
        category: "chafing",
        quantity: 15,
        available: 15,
        condition: "excellent",
        rentalPrice: 85,
      },
      {
        id: "e7",
        name: "Fine China Plates",
        category: "crockery",
        quantity: 200,
        available: 200,
        condition: "excellent",
        rentalPrice: 8,
      },
      {
        id: "e8",
        name: "Premium Cutlery Sets",
        category: "cutlery",
        quantity: 200,
        available: 200,
        condition: "excellent",
        rentalPrice: 5,
      },
    ],
    kitchenInstructions: "VIP wedding. Extra attention to presentation. Setup 4 hours before. Coordinate with wedding planner.",
    status: "confirmed",
    total: 78600,
    totalAmount: 78600,
    createdAt: subDays(new Date(), 1).toISOString(),
    assignedDriver: null,
    driverName: "Maria Garcia",
    driverPhone: "+27 84 123 4567",
  },
  {
    id: "ORD-004",
    quoteId: "Q-004",
    client: "David Naidoo",
    clientName: "David Naidoo",
    eventDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    venue: "Century City Convention Centre",
    location: "Century City Convention Centre, Sable Road, Century City, Cape Town",
    eventLocation: "Century City Convention Centre, Sable Road, Century City, Cape Town",
    guestCount: 120,
    menuItems: [
      {
        id: "m8",
        name: "Gala Dinner Menu",
        category: "main",
        pricePerPerson: 265,
        quantity: 120,
        ingredients: [
          { id: "i18", name: "Duck Breast", quantity: 22, quantityNeeded: 22, unit: "kg", category: "fresh" },
          { id: "i19", name: "Beef Tenderloin", quantity: 18, quantityNeeded: 18, unit: "kg", category: "fresh" },
        ],
      },
    ],
    equipmentItems: [
      {
        id: "e9",
        name: "Large Chafing Dish",
        category: "chafing",
        quantity: 10,
        available: 10,
        condition: "excellent",
        rentalPrice: 65,
      },
    ],
    kitchenInstructions: "Black tie event. Premium presentation required.",
    status: "preparing",
    total: 31800,
    totalAmount: 31800,
    createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
    assignedDriver: null,
    driverName: null,
    driverPhone: null,
  },
  {
    id: "ORD-005",
    quoteId: "Q-005",
    client: "Patricia Williams",
    clientName: "Patricia Williams",
    eventDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    venue: "Table Mountain Venue",
    location: "Table Mountain Venue, Tafelberg Road, Cape Town",
    eventLocation: "Table Mountain Venue, Tafelberg Road, Cape Town",
    guestCount: 95,
    menuItems: [
      {
        id: "m9",
        name: "Mediterranean Feast",
        category: "main",
        pricePerPerson: 245,
        quantity: 95,
        ingredients: [
          { id: "i20", name: "Grilled Prawns", quantity: 15, quantityNeeded: 15, unit: "kg", category: "fresh" },
          { id: "i21", name: "Lamb Koftas", quantity: 12, quantityNeeded: 12, unit: "kg", category: "fresh" },
        ],
      },
    ],
    equipmentItems: [
      {
        id: "e10",
        name: "Medium Chafing Dish",
        category: "chafing",
        quantity: 7,
        available: 7,
        condition: "excellent",
        rentalPrice: 55,
      },
    ],
    kitchenInstructions: "Special dietary requirements. No pork. Halal preparation required.",
    status: "confirmed",
    total: 23275,
    totalAmount: 23275,
    createdAt: new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString(),
    assignedDriver: null,
    driverName: null,
    driverPhone: null,
  },
];

export const mockDeliveries: Delivery[] = [
  {
    id: "DEL001",
    orderId: "ORD-001",
    pickupTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    deliveryTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    location: "Grand Palace Hotel, 123 Victoria Road, Green Point, Cape Town",
    status: "in_transit",
    driverName: "James Wilson",
    driverId: "D001"
  },
  {
    id: "DEL002",
    orderId: "ORD-002",
    pickupTime: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    deliveryTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    location: "Waterfront Conference Centre, 45 Beach Road, V&A Waterfront, Cape Town",
    status: "delivered",
    driverName: "Lisa Martinez",
    driverId: "D002"
  },
  {
    id: "DEL003",
    orderId: "ORD-003",
    pickupTime: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
    deliveryTime: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
    location: "Stellenbosch Wine Estate, Wine Route R310, Stellenbosch",
    status: "available",
    driverName: null,
    driverId: null
  },
  {
    id: "DEL004",
    orderId: "ORD-004",
    pickupTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
    deliveryTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
    location: "Century City Convention Centre, Sable Road, Century City, Cape Town",
    status: "available",
    driverName: null,
    driverId: null
  },
  {
    id: "DEL005",
    orderId: "ORD-005",
    pickupTime: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
    deliveryTime: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
    location: "Table Mountain Venue, Tafelberg Road, Cape Town",
    status: "available",
    driverName: null,
    driverId: null
  }
];

export const mockPayments: Payment[] = [
  {
    id: "PAY001",
    quoteId: "Q001",
    amount: 56250,
    status: "paid",
    paidAmount: 56250,
    reconciled: true
  },
  {
    id: "PAY002",
    quoteId: "Q002",
    amount: 20145,
    status: "paid",
    paidAmount: 20145,
    reconciled: true
  },
  {
    id: "PAY003",
    quoteId: "Q003",
    amount: 78600,
    status: "pending",
    paidAmount: 39300,
    reconciled: false
  },
  {
    id: "PAY004",
    quoteId: "Q004",
    amount: 31800,
    status: "paid",
    paidAmount: 31800,
    reconciled: true
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
