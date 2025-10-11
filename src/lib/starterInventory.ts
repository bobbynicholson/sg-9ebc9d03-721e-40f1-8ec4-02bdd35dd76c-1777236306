
import { InventoryItem } from "@/types";

export const starterInventory: InventoryItem[] = [
  {
    id: "INV001",
    name: "Chicken Breast",
    category: "meat",
    currentStock: 50,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-10",
    reorderPoint: 25,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 89.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 95.50, lastUpdated: "2025-01-09" },
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 87.50, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV002",
    name: "Beef Brisket",
    category: "meat",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-09",
    reorderPoint: 20,
    averageCost: 145.00,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 145.00, lastUpdated: "2025-01-09" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 152.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV003",
    name: "Lamb Chops",
    category: "meat",
    currentStock: 25,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 15,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 189.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 185.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV004",
    name: "Pork Ribs",
    category: "meat",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-08",
    reorderPoint: 25,
    averageCost: 119.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 119.99, lastUpdated: "2025-01-08" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 125.00, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV005",
    name: "Salmon Fillets",
    category: "meat",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 249.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 249.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP005", supplierName: "Seafood Market", price: 265.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV006",
    name: "Prawns",
    category: "meat",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-09",
    reorderPoint: 8,
    averageCost: 299.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 299.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP005", supplierName: "Seafood Market", price: 289.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV007",
    name: "Turkey Breast",
    category: "meat",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-07",
    reorderPoint: 12,
    averageCost: 95.00,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 95.00, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV008",
    name: "Sausages (Boerewors)",
    category: "meat",
    currentStock: 35,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-10",
    reorderPoint: 20,
    averageCost: 79.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 79.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 75.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV009",
    name: "Potatoes",
    category: "vegetables",
    currentStock: 60,
    unit: "kg",
    minimumStock: 30,
    lastRestocked: "2025-01-09",
    reorderPoint: 40,
    averageCost: 15.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 15.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 18.50, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV010",
    name: "Onions",
    category: "vegetables",
    currentStock: 45,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-10",
    reorderPoint: 25,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 12.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 14.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV011",
    name: "Tomatoes",
    category: "vegetables",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-10",
    reorderPoint: 25,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 25.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV012",
    name: "Lettuce",
    category: "vegetables",
    currentStock: 30,
    unit: "heads",
    minimumStock: 15,
    lastRestocked: "2025-01-10",
    reorderPoint: 20,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 8.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV013",
    name: "Carrots",
    category: "vegetables",
    currentStock: 35,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-09",
    reorderPoint: 20,
    averageCost: 14.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 14.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 16.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV014",
    name: "Bell Peppers",
    category: "vegetables",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-10",
    reorderPoint: 15,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 32.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV015",
    name: "Broccoli",
    category: "vegetables",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-09",
    reorderPoint: 12,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV016",
    name: "Cauliflower",
    category: "vegetables",
    currentStock: 18,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-08",
    reorderPoint: 10,
    averageCost: 25.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 25.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV017",
    name: "Green Beans",
    category: "vegetables",
    currentStock: 22,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 32.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV018",
    name: "Butternut Squash",
    category: "vegetables",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-09",
    reorderPoint: 18,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV019",
    name: "Milk (Full Cream)",
    category: "dairy",
    currentStock: 50,
    unit: "liters",
    minimumStock: 25,
    lastRestocked: "2025-01-10",
    reorderPoint: 30,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 16.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP009", supplierName: "Milk Market", price: 18.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV020",
    name: "Cream",
    category: "dairy",
    currentStock: 30,
    unit: "liters",
    minimumStock: 15,
    lastRestocked: "2025-01-10",
    reorderPoint: 18,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV021",
    name: "Butter",
    category: "dairy",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 89.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP009", supplierName: "Milk Market", price: 92.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV022",
    name: "Cheddar Cheese",
    category: "dairy",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 125.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV023",
    name: "Mozzarella Cheese",
    category: "dairy",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-09",
    reorderPoint: 10,
    averageCost: 139.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 139.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV024",
    name: "Yogurt (Plain)",
    category: "dairy",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-10",
    reorderPoint: 25,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 32.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV025",
    name: "Rice (White)",
    category: "staples",
    currentStock: 100,
    unit: "kg",
    minimumStock: 50,
    lastRestocked: "2025-01-08",
    reorderPoint: 60,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 18.99, lastUpdated: "2025-01-08" },
      { supplierId: "SUP011", supplierName: "Wholesale Direct", price: 20.50, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV026",
    name: "Pasta (Penne)",
    category: "staples",
    currentStock: 80,
    unit: "kg",
    minimumStock: 40,
    lastRestocked: "2025-01-09",
    reorderPoint: 50,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 22.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV027",
    name: "Flour (All Purpose)",
    category: "staples",
    currentStock: 120,
    unit: "kg",
    minimumStock: 60,
    lastRestocked: "2025-01-07",
    reorderPoint: 70,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 12.99, lastUpdated: "2025-01-07" },
      { supplierId: "SUP011", supplierName: "Wholesale Direct", price: 11.50, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV028",
    name: "Sugar (White)",
    category: "staples",
    currentStock: 90,
    unit: "kg",
    minimumStock: 45,
    lastRestocked: "2025-01-08",
    reorderPoint: 55,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 16.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV029",
    name: "Salt",
    category: "staples",
    currentStock: 60,
    unit: "kg",
    minimumStock: 30,
    lastRestocked: "2025-01-05",
    reorderPoint: 35,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 8.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    id: "INV030",
    name: "Olive Oil",
    category: "staples",
    currentStock: 40,
    unit: "liters",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 25,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 89.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP011", supplierName: "Wholesale Direct", price: 85.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV031",
    name: "Vegetable Oil",
    category: "staples",
    currentStock: 50,
    unit: "liters",
    minimumStock: 25,
    lastRestocked: "2025-01-10",
    reorderPoint: 30,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV032",
    name: "Bread Rolls",
    category: "bakery",
    currentStock: 200,
    unit: "units",
    minimumStock: 100,
    lastRestocked: "2025-01-10",
    reorderPoint: 120,
    averageCost: 3.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 3.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP013", supplierName: "Fresh Bake", price: 4.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV033",
    name: "Burger Buns",
    category: "bakery",
    currentStock: 150,
    unit: "units",
    minimumStock: 75,
    lastRestocked: "2025-01-10",
    reorderPoint: 90,
    averageCost: 2.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 2.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV034",
    name: "Garlic Bread",
    category: "bakery",
    currentStock: 80,
    unit: "units",
    minimumStock: 40,
    lastRestocked: "2025-01-09",
    reorderPoint: 50,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 12.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV035",
    name: "Black Pepper",
    category: "spices",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-05",
    reorderPoint: 6,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 189.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    id: "INV036",
    name: "Paprika",
    category: "spices",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-06",
    reorderPoint: 5,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 145.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV037",
    name: "Curry Powder",
    category: "spices",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-07",
    reorderPoint: 7,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV038",
    name: "Garlic Powder",
    category: "spices",
    currentStock: 7,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-08",
    reorderPoint: 4,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV039",
    name: "Oregano",
    category: "spices",
    currentStock: 5,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-04",
    reorderPoint: 3,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 145.99, lastUpdated: "2025-01-04" }
    ]
  },
  {
    id: "INV040",
    name: "Basil (Dried)",
    category: "spices",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-05",
    reorderPoint: 4,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 165.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    id: "INV041",
    name: "Coca-Cola (2L)",
    category: "beverages",
    currentStock: 100,
    unit: "bottles",
    minimumStock: 50,
    lastRestocked: "2025-01-10",
    reorderPoint: 60,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 18.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP015", supplierName: "Drinks Direct", price: 20.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV042",
    name: "Sprite (2L)",
    category: "beverages",
    currentStock: 80,
    unit: "bottles",
    minimumStock: 40,
    lastRestocked: "2025-01-10",
    reorderPoint: 50,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV043",
    name: "Orange Juice (1L)",
    category: "beverages",
    currentStock: 60,
    unit: "bottles",
    minimumStock: 30,
    lastRestocked: "2025-01-09",
    reorderPoint: 35,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 22.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV044",
    name: "Still Water (500ml)",
    category: "beverages",
    currentStock: 200,
    unit: "bottles",
    minimumStock: 100,
    lastRestocked: "2025-01-10",
    reorderPoint: 120,
    averageCost: 5.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 5.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP015", supplierName: "Drinks Direct", price: 5.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV045",
    name: "Sparkling Water (500ml)",
    category: "beverages",
    currentStock: 150,
    unit: "bottles",
    minimumStock: 75,
    lastRestocked: "2025-01-10",
    reorderPoint: 90,
    averageCost: 7.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 7.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV046",
    name: "Coffee Beans",
    category: "beverages",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-07",
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP016", supplierName: "Bean There", price: 189.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV047",
    name: "Tea Bags (Black)",
    category: "beverages",
    currentStock: 500,
    unit: "bags",
    minimumStock: 250,
    lastRestocked: "2025-01-08",
    reorderPoint: 300,
    averageCost: 0.89,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 0.89, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV048",
    name: "Frozen Peas",
    category: "frozen",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-06",
    reorderPoint: 25,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 28.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV049",
    name: "Frozen Mixed Vegetables",
    category: "frozen",
    currentStock: 50,
    unit: "kg",
    minimumStock: 25,
    lastRestocked: "2025-01-07",
    reorderPoint: 30,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 32.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV050",
    name: "Ice Cream (Vanilla)",
    category: "frozen",
    currentStock: 30,
    unit: "liters",
    minimumStock: 15,
    lastRestocked: "2025-01-09",
    reorderPoint: 18,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV051",
    name: "Bacon",
    category: "meat",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 115.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 115.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV052",
    name: "Ground Beef",
    category: "meat",
    currentStock: 35,
    unit: "kg",
    minimumStock: 18,
    lastRestocked: "2025-01-09",
    reorderPoint: 22,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 95.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 99.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV053",
    name: "Steak (Sirloin)",
    category: "meat",
    currentStock: 28,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-10",
    reorderPoint: 18,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 189.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 185.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV054",
    name: "Chicken Thighs",
    category: "meat",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 25,
    averageCost: 69.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 69.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV055",
    name: "Duck Breast",
    category: "meat",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-08",
    reorderPoint: 8,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 225.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV056",
    name: "Tuna Steaks",
    category: "meat",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-10",
    reorderPoint: 6,
    averageCost: 279.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 279.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV057",
    name: "Calamari",
    category: "meat",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-09",
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 189.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV058",
    name: "Mussels",
    category: "meat",
    currentStock: 18,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 145.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV059",
    name: "Asparagus",
    category: "vegetables",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 89.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV060",
    name: "Zucchini",
    category: "vegetables",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV061",
    name: "Eggplant",
    category: "vegetables",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV062",
    name: "Spinach",
    category: "vegetables",
    currentStock: 18,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV063",
    name: "Mushrooms (Button)",
    category: "vegetables",
    currentStock: 22,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 55.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV064",
    name: "Sweet Corn",
    category: "vegetables",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-08",
    reorderPoint: 18,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV065",
    name: "Cucumber",
    category: "vegetables",
    currentStock: 28,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-10",
    reorderPoint: 18,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV066",
    name: "Sweet Potato",
    category: "vegetables",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 25,
    averageCost: 19.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 19.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV067",
    name: "Celery",
    category: "vegetables",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 24.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV068",
    name: "Leeks",
    category: "vegetables",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-08",
    reorderPoint: 8,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV069",
    name: "Parmesan Cheese",
    category: "dairy",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-09",
    reorderPoint: 6,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 225.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV070",
    name: "Feta Cheese",
    category: "dairy",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-10",
    reorderPoint: 8,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 145.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV071",
    name: "Sour Cream",
    category: "dairy",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-10",
    reorderPoint: 15,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV072",
    name: "Eggs (Large)",
    category: "dairy",
    currentStock: 300,
    unit: "units",
    minimumStock: 150,
    lastRestocked: "2025-01-10",
    reorderPoint: 180,
    averageCost: 2.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 2.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP009", supplierName: "Milk Market", price: 3.25, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV073",
    name: "Condensed Milk",
    category: "dairy",
    currentStock: 20,
    unit: "cans",
    minimumStock: 10,
    lastRestocked: "2025-01-08",
    reorderPoint: 12,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 18.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV074",
    name: "Evaporated Milk",
    category: "dairy",
    currentStock: 25,
    unit: "cans",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 14.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 14.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV075",
    name: "Basmati Rice",
    category: "staples",
    currentStock: 70,
    unit: "kg",
    minimumStock: 35,
    lastRestocked: "2025-01-07",
    reorderPoint: 42,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 32.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV076",
    name: "Quinoa",
    category: "staples",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-08",
    reorderPoint: 18,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 89.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV077",
    name: "Couscous",
    category: "staples",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 24,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 35.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV078",
    name: "Lentils (Red)",
    category: "staples",
    currentStock: 35,
    unit: "kg",
    minimumStock: 18,
    lastRestocked: "2025-01-07",
    reorderPoint: 22,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 28.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV079",
    name: "Chickpeas (Dried)",
    category: "staples",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-08",
    reorderPoint: 24,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 32.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV080",
    name: "Balsamic Vinegar",
    category: "staples",
    currentStock: 15,
    unit: "liters",
    minimumStock: 8,
    lastRestocked: "2025-01-06",
    reorderPoint: 10,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 65.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV081",
    name: "Soy Sauce",
    category: "staples",
    currentStock: 20,
    unit: "liters",
    minimumStock: 10,
    lastRestocked: "2025-01-09",
    reorderPoint: 12,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV082",
    name: "Worcestershire Sauce",
    category: "staples",
    currentStock: 12,
    unit: "liters",
    minimumStock: 6,
    lastRestocked: "2025-01-07",
    reorderPoint: 8,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 55.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV083",
    name: "Honey",
    category: "staples",
    currentStock: 18,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-08",
    reorderPoint: 12,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV084",
    name: "Maple Syrup",
    category: "staples",
    currentStock: 10,
    unit: "liters",
    minimumStock: 5,
    lastRestocked: "2025-01-05",
    reorderPoint: 6,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 189.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    id: "INV085",
    name: "Tomato Paste",
    category: "staples",
    currentStock: 50,
    unit: "cans",
    minimumStock: 25,
    lastRestocked: "2025-01-09",
    reorderPoint: 30,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 8.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV086",
    name: "Diced Tomatoes (Canned)",
    category: "staples",
    currentStock: 60,
    unit: "cans",
    minimumStock: 30,
    lastRestocked: "2025-01-10",
    reorderPoint: 36,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 12.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV087",
    name: "Coconut Milk",
    category: "staples",
    currentStock: 40,
    unit: "cans",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 24,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 18.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV088",
    name: "Peanut Butter",
    category: "staples",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-08",
    reorderPoint: 15,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 65.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV089",
    name: "Croissants",
    category: "bakery",
    currentStock: 100,
    unit: "units",
    minimumStock: 50,
    lastRestocked: "2025-01-10",
    reorderPoint: 60,
    averageCost: 6.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 6.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV090",
    name: "Muffins (Blueberry)",
    category: "bakery",
    currentStock: 80,
    unit: "units",
    minimumStock: 40,
    lastRestocked: "2025-01-10",
    reorderPoint: 48,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 8.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV091",
    name: "Bagels",
    category: "bakery",
    currentStock: 120,
    unit: "units",
    minimumStock: 60,
    lastRestocked: "2025-01-09",
    reorderPoint: 72,
    averageCost: 4.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 4.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV092",
    name: "Cake (Chocolate)",
    category: "bakery",
    currentStock: 10,
    unit: "units",
    minimumStock: 5,
    lastRestocked: "2025-01-10",
    reorderPoint: 6,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 189.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV093",
    name: "Cupcakes (Assorted)",
    category: "bakery",
    currentStock: 60,
    unit: "units",
    minimumStock: 30,
    lastRestocked: "2025-01-10",
    reorderPoint: 36,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 12.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV094",
    name: "Cookies (Chocolate Chip)",
    category: "bakery",
    currentStock: 100,
    unit: "units",
    minimumStock: 50,
    lastRestocked: "2025-01-09",
    reorderPoint: 60,
    averageCost: 3.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 3.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV095",
    name: "Cinnamon",
    category: "spices",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-06",
    reorderPoint: 4,
    averageCost: 135.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 135.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV096",
    name: "Cumin",
    category: "spices",
    currentStock: 7,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-07",
    reorderPoint: 4,
    averageCost: 115.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 115.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV097",
    name: "Turmeric",
    category: "spices",
    currentStock: 5,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-05",
    reorderPoint: 3,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    id: "INV098",
    name: "Chili Powder",
    category: "spices",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-08",
    reorderPoint: 5,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV099",
    name: "Thyme",
    category: "spices",
    currentStock: 4,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-04",
    reorderPoint: 3,
    averageCost: 155.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 155.99, lastUpdated: "2025-01-04" }
    ]
  },
  {
    id: "INV100",
    name: "Rosemary",
    category: "spices",
    currentStock: 5,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-05",
    reorderPoint: 3,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 165.99, lastUpdated: "2025-01-05" }
    ]
  }
];

export const remainingStarterInventory: InventoryItem[] = [
  {
    id: "INV101",
    name: "Bay Leaves",
    category: "spices",
    currentStock: 3,
    unit: "kg",
    minimumStock: 1,
    lastRestocked: "2025-01-03",
    reorderPoint: 2,
    averageCost: 175.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 175.99, lastUpdated: "2025-01-03" }
    ]
  },
  {
    id: "INV102",
    name: "Nutmeg",
    category: "spices",
    currentStock: 2,
    unit: "kg",
    minimumStock: 1,
    lastRestocked: "2025-01-02",
    reorderPoint: 1,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 285.99, lastUpdated: "2025-01-02" }
    ]
  },
  {
    id: "INV103",
    name: "Ginger (Ground)",
    category: "spices",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-06",
    reorderPoint: 4,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 145.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV104",
    name: "Mustard Powder",
    category: "spices",
    currentStock: 4,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-04",
    reorderPoint: 3,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-04" }
    ]
  },
  {
    id: "INV105",
    name: "Cayenne Pepper",
    category: "spices",
    currentStock: 5,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-05",
    reorderPoint: 3,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    id: "INV106",
    name: "Red Wine",
    category: "beverages",
    currentStock: 40,
    unit: "bottles",
    minimumStock: 20,
    lastRestocked: "2025-01-08",
    reorderPoint: 24,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 89.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV107",
    name: "White Wine",
    category: "beverages",
    currentStock: 35,
    unit: "bottles",
    minimumStock: 18,
    lastRestocked: "2025-01-08",
    reorderPoint: 22,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 85.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV108",
    name: "Champagne",
    category: "beverages",
    currentStock: 20,
    unit: "bottles",
    minimumStock: 10,
    lastRestocked: "2025-01-07",
    reorderPoint: 12,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 189.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV109",
    name: "Beer (Lager)",
    category: "beverages",
    currentStock: 100,
    unit: "bottles",
    minimumStock: 50,
    lastRestocked: "2025-01-10",
    reorderPoint: 60,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV110",
    name: "Lemonade (2L)",
    category: "beverages",
    currentStock: 70,
    unit: "bottles",
    minimumStock: 35,
    lastRestocked: "2025-01-10",
    reorderPoint: 42,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 16.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV111",
    name: "Apple Juice (1L)",
    category: "beverages",
    currentStock: 50,
    unit: "bottles",
    minimumStock: 25,
    lastRestocked: "2025-01-09",
    reorderPoint: 30,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV112",
    name: "Cranberry Juice (1L)",
    category: "beverages",
    currentStock: 40,
    unit: "bottles",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 24,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV113",
    name: "Iced Tea (1L)",
    category: "beverages",
    currentStock: 60,
    unit: "bottles",
    minimumStock: 30,
    lastRestocked: "2025-01-10",
    reorderPoint: 36,
    averageCost: 19.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 19.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV114",
    name: "Energy Drinks",
    category: "beverages",
    currentStock: 80,
    unit: "cans",
    minimumStock: 40,
    lastRestocked: "2025-01-10",
    reorderPoint: 48,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV115",
    name: "French Fries (Frozen)",
    category: "frozen",
    currentStock: 60,
    unit: "kg",
    minimumStock: 30,
    lastRestocked: "2025-01-08",
    reorderPoint: 36,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 35.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV116",
    name: "Pizza Bases (Frozen)",
    category: "frozen",
    currentStock: 50,
    unit: "units",
    minimumStock: 25,
    lastRestocked: "2025-01-09",
    reorderPoint: 30,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 18.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV117",
    name: "Chicken Nuggets (Frozen)",
    category: "frozen",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 24,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 65.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV118",
    name: "Spring Rolls (Frozen)",
    category: "frozen",
    currentStock: 35,
    unit: "kg",
    minimumStock: 18,
    lastRestocked: "2025-01-08",
    reorderPoint: 22,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 55.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV119",
    name: "Samosas (Frozen)",
    category: "frozen",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-09",
    reorderPoint: 24,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV120",
    name: "Garlic (Fresh)",
    category: "vegetables",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV121",
    name: "Ginger (Fresh)",
    category: "vegetables",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-09",
    reorderPoint: 8,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 55.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV122",
    name: "Kale",
    category: "vegetables",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-10",
    reorderPoint: 6,
    averageCost: 38.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 38.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV123",
    name: "Arugula",
    category: "vegetables",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-10",
    reorderPoint: 5,
    averageCost: 42.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 42.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV124",
    name: "Cabbage",
    category: "vegetables",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 12.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV125",
    name: "Radishes",
    category: "vegetables",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-08",
    reorderPoint: 6,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV126",
    name: "Beets",
    category: "vegetables",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-09",
    reorderPoint: 12,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV127",
    name: "Pumpkin",
    category: "vegetables",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-08",
    reorderPoint: 18,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 16.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV128",
    name: "Avocado",
    category: "fresh_produce",
    currentStock: 40,
    unit: "units",
    minimumStock: 20,
    lastRestocked: "2025-01-10",
    reorderPoint: 24,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 12.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV129",
    name: "Lemons",
    category: "fresh_produce",
    currentStock: 50,
    unit: "kg",
    minimumStock: 25,
    lastRestocked: "2025-01-10",
    reorderPoint: 30,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV130",
    name: "Limes",
    category: "fresh_produce",
    currentStock: 40,
    unit: "kg",
    minimumStock: 20,
    lastRestocked: "2025-01-10",
    reorderPoint: 24,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV131",
    name: "Oranges",
    category: "fresh_produce",
    currentStock: 60,
    unit: "kg",
    minimumStock: 30,
    lastRestocked: "2025-01-09",
    reorderPoint: 36,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 16.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV132",
    name: "Apples (Granny Smith)",
    category: "fresh_produce",
    currentStock: 50,
    unit: "kg",
    minimumStock: 25,
    lastRestocked: "2025-01-09",
    reorderPoint: 30,
    averageCost: 19.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 19.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV133",
    name: "Bananas",
    category: "fresh_produce",
    currentStock: 70,
    unit: "kg",
    minimumStock: 35,
    lastRestocked: "2025-01-10",
    reorderPoint: 42,
    averageCost: 14.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 14.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV134",
    name: "Strawberries",
    category: "fresh_produce",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-10",
    reorderPoint: 15,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 55.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV135",
    name: "Blueberries",
    category: "fresh_produce",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 89.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV136",
    name: "Raspberries",
    category: "fresh_produce",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 95.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV137",
    name: "Grapes (Green)",
    category: "fresh_produce",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-09",
    reorderPoint: 18,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV138",
    name: "Watermelon",
    category: "fresh_produce",
    currentStock: 20,
    unit: "units",
    minimumStock: 10,
    lastRestocked: "2025-01-08",
    reorderPoint: 12,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 45.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV139",
    name: "Pineapple",
    category: "fresh_produce",
    currentStock: 25,
    unit: "units",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV140",
    name: "Mango",
    category: "fresh_produce",
    currentStock: 30,
    unit: "units",
    minimumStock: 15,
    lastRestocked: "2025-01-10",
    reorderPoint: 18,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV141",
    name: "Peaches",
    category: "fresh_produce",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 32.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV142",
    name: "Plums",
    category: "fresh_produce",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-08",
    reorderPoint: 12,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV143",
    name: "Cherries",
    category: "fresh_produce",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 125.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV144",
    name: "Kiwi",
    category: "fresh_produce",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-09",
    reorderPoint: 12,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV145",
    name: "Pears",
    category: "fresh_produce",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-09",
    reorderPoint: 18,
    averageCost: 25.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 25.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV146",
    name: "Cantaloupe",
    category: "fresh_produce",
    currentStock: 15,
    unit: "units",
    minimumStock: 8,
    lastRestocked: "2025-01-08",
    reorderPoint: 10,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV147",
    name: "Papaya",
    category: "fresh_produce",
    currentStock: 12,
    unit: "units",
    minimumStock: 6,
    lastRestocked: "2025-01-09",
    reorderPoint: 8,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV148",
    name: "Passion Fruit",
    category: "fresh_produce",
    currentStock: 18,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 65.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV149",
    name: "Coconut (Fresh)",
    category: "fresh_produce",
    currentStock: 20,
    unit: "units",
    minimumStock: 10,
    lastRestocked: "2025-01-08",
    reorderPoint: 12,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV150",
    name: "Dates",
    category: "fresh_produce",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-07",
    reorderPoint: 6,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV151",
    name: "Figs (Dried)",
    category: "fresh_produce",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-06",
    reorderPoint: 5,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV152",
    name: "Almonds",
    category: "fresh_produce",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-08",
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 189.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV153",
    name: "Cashews",
    category: "fresh_produce",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-08",
    reorderPoint: 8,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 225.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV154",
    name: "Walnuts",
    category: "fresh_produce",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-07",
    reorderPoint: 6,
    averageCost: 195.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 195.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV155",
    name: "Pecans",
    category: "fresh_produce",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-06",
    reorderPoint: 5,
    averageCost: 245.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 245.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV156",
    name: "Pistachios",
    category: "fresh_produce",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-08",
    reorderPoint: 6,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 285.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV157",
    name: "Sunflower Seeds",
    category: "fresh_produce",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-09",
    reorderPoint: 10,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 65.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV158",
    name: "Pumpkin Seeds",
    category: "fresh_produce",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-08",
    reorderPoint: 8,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 85.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV159",
    name: "Chia Seeds",
    category: "fresh_produce",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-07",
    reorderPoint: 6,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV160",
    name: "Flaxseeds",
    category: "fresh_produce",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-06",
    reorderPoint: 5,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV161",
    name: "Raisins",
    category: "fresh_produce",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-09",
    reorderPoint: 12,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 55.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV162",
    name: "Cranberries (Dried)",
    category: "fresh_produce",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-08",
    reorderPoint: 10,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 85.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV163",
    name: "Apricots (Dried)",
    category: "fresh_produce",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-07",
    reorderPoint: 8,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV164",
    name: "Prunes",
    category: "fresh_produce",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-06",
    reorderPoint: 6,
    averageCost: 75.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 75.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV165",
    name: "Chocolate Chips",
    category: "bakery",
    currentStock: 20,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-09",
    reorderPoint: 12,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 125.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV166",
    name: "Cocoa Powder",
    category: "bakery",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-08",
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 189.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV167",
    name: "Vanilla Extract",
    category: "bakery",
    currentStock: 8,
    unit: "liters",
    minimumStock: 4,
    lastRestocked: "2025-01-07",
    reorderPoint: 5,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 285.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV168",
    name: "Baking Powder",
    category: "bakery",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-08",
    reorderPoint: 8,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 45.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV169",
    name: "Baking Soda",
    category: "bakery",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-07",
    reorderPoint: 6,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 35.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV170",
    name: "Yeast (Active Dry)",
    category: "bakery",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-06",
    reorderPoint: 4,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 125.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV171",
    name: "Cornstarch",
    category: "bakery",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-08",
    reorderPoint: 10,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 32.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV172",
    name: "Icing Sugar",
    category: "bakery",
    currentStock: 25,
    unit: "kg",
    minimumStock: 12,
    lastRestocked: "2025-01-09",
    reorderPoint: 15,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV173",
    name: "Brown Sugar",
    category: "bakery",
    currentStock: 30,
    unit: "kg",
    minimumStock: 15,
    lastRestocked: "2025-01-09",
    reorderPoint: 18,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV174",
    name: "Gelatin",
    category: "bakery",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-07",
    reorderPoint: 5,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 145.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV175",
    name: "Food Coloring (Assorted)",
    category: "bakery",
    currentStock: 20,
    unit: "bottles",
    minimumStock: 10,
    lastRestocked: "2025-01-08",
    reorderPoint: 12,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 18.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV176",
    name: "Whipped Cream",
    category: "dairy",
    currentStock: 35,
    unit: "cans",
    minimumStock: 18,
    lastRestocked: "2025-01-10",
    reorderPoint: 22,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV177",
    name: "Cream Cheese",
    category: "dairy",
    currentStock: 18,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-09",
    reorderPoint: 12,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 95.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV178",
    name: "Mascarpone",
    category: "dairy",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-08",
    reorderPoint: 6,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 165.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV179",
    name: "Ricotta Cheese",
    category: "dairy",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-09",
    reorderPoint: 8,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 85.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV180",
    name: "Blue Cheese",
    category: "dairy",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-08",
    reorderPoint: 5,
    averageCost: 195.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 195.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV181",
    name: "Goat Cheese",
    category: "dairy",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-09",
    reorderPoint: 6,
    averageCost: 185.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 185.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV182",
    name: "Brie Cheese",
    category: "dairy",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-07",
    reorderPoint: 4,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 225.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV183",
    name: "Camembert",
    category: "dairy",
    currentStock: 5,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-06",
    reorderPoint: 3,
    averageCost: 245.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 245.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV184",
    name: "Provolone",
    category: "dairy",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-09",
    reorderPoint: 8,
    averageCost: 155.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 155.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV185",
    name: "Swiss Cheese",
    category: "dairy",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 165.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV186",
    name: "Colby Jack Cheese",
    category: "dairy",
    currentStock: 18,
    unit: "kg",
    minimumStock: 10,
    lastRestocked: "2025-01-10",
    reorderPoint: 12,
    averageCost: 135.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 135.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV187",
    name: "Monterey Jack Cheese",
    category: "dairy",
    currentStock: 14,
    unit: "kg",
    minimumStock: 7,
    lastRestocked: "2025-01-09",
    reorderPoint: 9,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 145.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV188",
    name: "Pepper Jack Cheese",
    category: "dairy",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-09",
    reorderPoint: 8,
    averageCost: 155.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 155.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV189",
    name: "Havarti Cheese",
    category: "dairy",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-08",
    reorderPoint: 6,
    averageCost: 175.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 175.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV190",
    name: "Gruyere Cheese",
    category: "dairy",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-07",
    reorderPoint: 5,
    averageCost: 265.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 265.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV191",
    name: "Emmental Cheese",
    category: "dairy",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-08",
    reorderPoint: 6,
    averageCost: 185.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 185.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV192",
    name: "Manchego Cheese",
    category: "dairy",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-06",
    reorderPoint: 4,
    averageCost: 245.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 245.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV193",
    name: "Halloumi Cheese",
    category: "dairy",
    currentStock: 12,
    unit: "kg",
    minimumStock: 6,
    lastRestocked: "2025-01-09",
    reorderPoint: 8,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 165.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    id: "INV194",
    name: "Paneer",
    category: "dairy",
    currentStock: 15,
    unit: "kg",
    minimumStock: 8,
    lastRestocked: "2025-01-10",
    reorderPoint: 10,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 125.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    id: "INV195",
    name: "Queso Fresco",
    category: "dairy",
    currentStock: 10,
    unit: "kg",
    minimumStock: 5,
    lastRestocked: "2025-01-08",
    reorderPoint: 6,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 95.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    id: "INV196",
    name: "Cotija Cheese",
    category: "dairy",
    currentStock: 8,
    unit: "kg",
    minimumStock: 4,
    lastRestocked: "2025-01-07",
    reorderPoint: 5,
    averageCost: 115.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 115.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV197",
    name: "Boursin Cheese",
    category: "dairy",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-06",
    reorderPoint: 4,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 225.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    id: "INV198",
    name: "Gorgonzola",
    category: "dairy",
    currentStock: 7,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-07",
    reorderPoint: 4,
    averageCost: 205.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 205.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    id: "INV199",
    name: "Roquefort",
    category: "dairy",
    currentStock: 5,
    unit: "kg",
    minimumStock: 2,
    lastRestocked: "2025-01-05",
    reorderPoint: 3,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 285.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    id: "INV200",
    name: "Stilton",
    category: "dairy",
    currentStock: 6,
    unit: "kg",
    minimumStock: 3,
    lastRestocked: "2025-01-06",
    reorderPoint: 4,
    averageCost: 265.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 265.99, lastUpdated: "2025-01-06" }
    ]
  }
];

export const fullStarterInventory = [...starterInventory, ...remainingStarterInventory];
