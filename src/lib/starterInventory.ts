// starterInventory.ts
import { InventoryItem } from "@/types/app";

export const starterInventory: Omit<InventoryItem, "id" | "currentStock" | "lastRestocked">[] = [
  {
    name: "Chicken Breast",
    category: "meat",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 89.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 95.50, lastUpdated: "2025-01-09" },
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 87.50, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Beef Brisket",
    category: "meat",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 20,
    averageCost: 145.00,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 145.00, lastUpdated: "2025-01-09" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 152.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Lamb Chops",
    category: "meat",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 15,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 189.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 185.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Pork Ribs",
    category: "meat",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 119.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 119.99, lastUpdated: "2025-01-08" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 125.00, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Salmon Fillets",
    category: "meat",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 249.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 249.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP005", supplierName: "Seafood Market", price: 265.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Prawns",
    category: "meat",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 299.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 299.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP005", supplierName: "Seafood Market", price: 289.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Turkey Breast",
    category: "meat",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 95.00,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 95.00, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Sausages (Boerewors)",
    category: "meat",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 20,
    averageCost: 79.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 79.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 75.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Potatoes",
    category: "vegetables",
    unit: "kg",
    minimumStock: 30,
    reorderPoint: 40,
    averageCost: 15.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 15.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 18.50, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Onions",
    category: "vegetables",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 12.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 14.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Tomatoes",
    category: "vegetables",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 25.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Lettuce",
    category: "vegetables",
    unit: "heads",
    minimumStock: 15,
    reorderPoint: 20,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 8.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Carrots",
    category: "vegetables",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 20,
    averageCost: 14.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 14.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 16.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Bell Peppers",
    category: "vegetables",
    unit: "kg",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP007", supplierName: "Veggie Depot", price: 32.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Broccoli",
    category: "vegetables",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cauliflower",
    category: "vegetables",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 25.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 25.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Green Beans",
    category: "vegetables",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 32.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Butternut Squash",
    category: "vegetables",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Milk (Full Cream)",
    category: "dairy",
    unit: "L",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 16.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP009", supplierName: "Milk Market", price: 18.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cream",
    category: "dairy",
    unit: "L",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Butter",
    category: "dairy",
    unit: "kg",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 89.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP009", supplierName: "Milk Market", price: 92.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Cheddar Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 125.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Mozzarella Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 139.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 139.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Yogurt (Plain)",
    category: "dairy",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 32.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Rice (White)",
    category: "staples",
    unit: "kg",
    minimumStock: 50,
    reorderPoint: 60,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 18.99, lastUpdated: "2025-01-08" },
      { supplierId: "SUP011", supplierName: "Wholesale Direct", price: 20.50, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Pasta (Penne)",
    category: "staples",
    unit: "kg",
    minimumStock: 40,
    reorderPoint: 50,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 22.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Flour (All Purpose)",
    category: "staples",
    unit: "kg",
    minimumStock: 60,
    reorderPoint: 70,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 12.99, lastUpdated: "2025-01-07" },
      { supplierId: "SUP011", supplierName: "Wholesale Direct", price: 11.50, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Sugar (White)",
    category: "staples",
    unit: "kg",
    minimumStock: 45,
    reorderPoint: 55,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 16.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Salt",
    category: "staples",
    unit: "kg",
    minimumStock: 30,
    reorderPoint: 35,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 8.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    name: "Olive Oil",
    category: "staples",
    unit: "L",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 89.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP011", supplierName: "Wholesale Direct", price: 85.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Vegetable Oil",
    category: "staples",
    unit: "L",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Bread Rolls",
    category: "bakery",
    unit: "units",
    minimumStock: 100,
    reorderPoint: 120,
    averageCost: 3.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 3.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP013", supplierName: "Fresh Bake", price: 4.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Burger Buns",
    category: "bakery",
    unit: "units",
    minimumStock: 75,
    reorderPoint: 90,
    averageCost: 2.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 2.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Garlic Bread",
    category: "bakery",
    unit: "units",
    minimumStock: 40,
    reorderPoint: 50,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 12.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Black Pepper",
    category: "spices",
    unit: "g",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 189.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    name: "Paprika",
    category: "spices",
    unit: "g",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 145.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Curry Powder",
    category: "spices",
    unit: "g",
    minimumStock: 6,
    reorderPoint: 7,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Garlic Powder",
    category: "spices",
    unit: "g",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Oregano",
    category: "spices",
    unit: "g",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 145.99, lastUpdated: "2025-01-04" }
    ]
  },
  {
    name: "Basil (Dried)",
    category: "spices",
    unit: "g",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 165.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    name: "Coca-Cola (2L)",
    category: "beverages",
    unit: "L",
    minimumStock: 50,
    reorderPoint: 60,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 18.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP015", supplierName: "Drinks Direct", price: 20.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Sprite (2L)",
    category: "beverages",
    unit: "L",
    minimumStock: 40,
    reorderPoint: 50,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Orange Juice (1L)",
    category: "beverages",
    unit: "L",
    minimumStock: 30,
    reorderPoint: 35,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 22.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Still Water (500ml)",
    category: "beverages",
    unit: "units",
    minimumStock: 100,
    reorderPoint: 120,
    averageCost: 5.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 5.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP015", supplierName: "Drinks Direct", price: 5.50, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Sparkling Water (500ml)",
    category: "beverages",
    unit: "units",
    minimumStock: 75,
    reorderPoint: 90,
    averageCost: 7.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 7.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Coffee Beans",
    category: "beverages",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP016", supplierName: "Bean There", price: 189.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Tea Bags (Black)",
    category: "beverages",
    unit: "units",
    minimumStock: 250,
    reorderPoint: 300,
    averageCost: 0.89,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 0.89, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Frozen Peas",
    category: "frozen",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 28.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Frozen Mixed Vegetables",
    category: "frozen",
    unit: "kg",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 32.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Ice Cream (Vanilla)",
    category: "frozen",
    unit: "L",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Bacon",
    category: "meat",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 115.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 115.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Ground Beef",
    category: "meat",
    unit: "kg",
    minimumStock: 18,
    reorderPoint: 22,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 95.99, lastUpdated: "2025-01-09" },
      { supplierId: "SUP002", supplierName: "Butcher's Choice", price: 99.00, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Steak (Sirloin)",
    category: "meat",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 189.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 185.00, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Chicken Thighs",
    category: "meat",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 69.99,
    supplierPrices: [
      { supplierId: "SUP001", supplierName: "Fresh Meats SA", price: 69.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Duck Breast",
    category: "meat",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP003", supplierName: "Prime Cuts", price: 225.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Tuna Steaks",
    category: "meat",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 279.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 279.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Calamari",
    category: "meat",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 189.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Mussels",
    category: "meat",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP004", supplierName: "Ocean Fresh", price: 145.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Asparagus",
    category: "vegetables",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 89.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Zucchini",
    category: "vegetables",
    unit: "kg",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Eggplant",
    category: "vegetables",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Spinach",
    category: "vegetables",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Mushrooms (Button)",
    category: "vegetables",
    unit: "kg",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 55.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Sweet Corn",
    category: "vegetables",
    unit: "units",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Cucumber",
    category: "vegetables",
    unit: "units",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Sweet Potato",
    category: "vegetables",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 25,
    averageCost: 19.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 19.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Celery",
    category: "vegetables",
    unit: "stalks",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 24.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Leeks",
    category: "vegetables",
    unit: "stalks",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Parmesan Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 225.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Feta Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 145.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Sour Cream",
    category: "dairy",
    unit: "L",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Eggs (Large)",
    category: "dairy",
    unit: "units",
    minimumStock: 150,
    reorderPoint: 180,
    averageCost: 2.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 2.99, lastUpdated: "2025-01-10" },
      { supplierId: "SUP009", supplierName: "Milk Market", price: 3.25, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Condensed Milk",
    category: "dairy",
    unit: "cans",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 18.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Evaporated Milk",
    category: "dairy",
    unit: "cans",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 14.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 14.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Basmati Rice",
    category: "staples",
    unit: "kg",
    minimumStock: 35,
    reorderPoint: 42,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 32.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Quinoa",
    category: "staples",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 89.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Couscous",
    category: "staples",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 35.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Lentils (Red)",
    category: "staples",
    unit: "kg",
    minimumStock: 18,
    reorderPoint: 22,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 28.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Chickpeas (Dried)",
    category: "staples",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 32.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Balsamic Vinegar",
    category: "staples",
    unit: "L",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 65.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Soy Sauce",
    category: "staples",
    unit: "L",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Worcestershire Sauce",
    category: "staples",
    unit: "L",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 55.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Honey",
    category: "staples",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Maple Syrup",
    category: "staples",
    unit: "L",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 189.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    name: "Tomato Paste",
    category: "staples",
    unit: "g",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 8.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Diced Tomatoes (Canned)",
    category: "staples",
    unit: "cans",
    minimumStock: 30,
    reorderPoint: 36,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 12.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Coconut Milk",
    category: "staples",
    unit: "cans",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 18.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Peanut Butter",
    category: "staples",
    unit: "kg",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 65.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Croissants",
    category: "bakery",
    unit: "units",
    minimumStock: 50,
    reorderPoint: 60,
    averageCost: 6.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 6.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Muffins (Blueberry)",
    category: "bakery",
    unit: "units",
    minimumStock: 40,
    reorderPoint: 48,
    averageCost: 8.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 8.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Bagels",
    category: "bakery",
    unit: "units",
    minimumStock: 60,
    reorderPoint: 72,
    averageCost: 4.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 4.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cake (Chocolate)",
    category: "bakery",
    unit: "units",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 189.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Cupcakes (Assorted)",
    category: "bakery",
    unit: "units",
    minimumStock: 30,
    reorderPoint: 36,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 12.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Cookies (Chocolate Chip)",
    category: "bakery",
    unit: "units",
    minimumStock: 50,
    reorderPoint: 60,
    averageCost: 3.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 3.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cinnamon",
    category: "spices",
    unit: "g",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 135.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 135.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Cumin",
    category: "spices",
    unit: "g",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 115.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 115.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Turmeric",
    category: "spices",
    unit: "g",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    name: "Chili Powder",
    category: "spices",
    unit: "g",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Thyme",
    category: "spices",
    unit: "g",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 155.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 155.99, lastUpdated: "2025-01-04" }
    ]
  },
  {
    name: "Rosemary",
    category: "spices",
    unit: "g",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 165.99, lastUpdated: "2025-01-05" }
    ]
  }
];

export const remainingStarterInventory: Omit<InventoryItem, "id" | "currentStock" | "lastRestocked">[] = [
  {
    name: "Bay Leaves",
    category: "spices",
    unit: "g",
    minimumStock: 1,
    reorderPoint: 2,
    averageCost: 175.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 175.99, lastUpdated: "2025-01-03" }
    ]
  },
  {
    name: "Nutmeg",
    category: "spices",
    unit: "g",
    minimumStock: 1,
    reorderPoint: 1,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 285.99, lastUpdated: "2025-01-02" }
    ]
  },
  {
    name: "Ginger (Ground)",
    category: "spices",
    unit: "g",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 145.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Mustard Powder",
    category: "spices",
    unit: "g",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-04" }
    ]
  },
  {
    name: "Cayenne Pepper",
    category: "spices",
    unit: "g",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    name: "Red Wine",
    category: "beverages",
    unit: "bottles",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 89.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "White Wine",
    category: "beverages",
    unit: "bottles",
    minimumStock: 18,
    reorderPoint: 22,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 85.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Champagne",
    category: "beverages",
    unit: "bottles",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 189.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Beer (Lager)",
    category: "beverages",
    unit: "cases",
    minimumStock: 50,
    reorderPoint: 60,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Lemonade (2L)",
    category: "beverages",
    unit: "L",
    minimumStock: 35,
    reorderPoint: 42,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 16.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Apple Juice (1L)",
    category: "beverages",
    unit: "L",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cranberry Juice (1L)",
    category: "beverages",
    unit: "L",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Iced Tea (1L)",
    category: "beverages",
    unit: "L",
    minimumStock: 30,
    reorderPoint: 36,
    averageCost: 19.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 19.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Energy Drinks",
    category: "beverages",
    unit: "cans",
    minimumStock: 40,
    reorderPoint: 48,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP014", supplierName: "Beverage Wholesale", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "French Fries (Frozen)",
    category: "frozen",
    unit: "kg",
    minimumStock: 30,
    reorderPoint: 36,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 35.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Pizza Bases (Frozen)",
    category: "frozen",
    unit: "units",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 18.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Chicken Nuggets (Frozen)",
    category: "frozen",
    unit: "kg",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 65.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Spring Rolls (Frozen)",
    category: "frozen",
    unit: "units",
    minimumStock: 18,
    reorderPoint: 22,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 55.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Samosas (Frozen)",
    category: "frozen",
    unit: "units",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP017", supplierName: "Frozen Foods Co", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Garlic (Fresh)",
    category: "vegetables",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 45.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Ginger (Fresh)",
    category: "vegetables",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 55.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Kale",
    category: "vegetables",
    unit: "bunches",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 38.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 38.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Arugula",
    category: "vegetables",
    unit: "g",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 42.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 42.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Cabbage",
    category: "vegetables",
    unit: "heads",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 12.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Radishes",
    category: "vegetables",
    unit: "bunches",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Beets",
    category: "vegetables",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Pumpkin",
    category: "vegetables",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 16.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Avocado",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 12.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 12.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Lemons",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Limes",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 20,
    reorderPoint: 24,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Oranges",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 30,
    reorderPoint: 36,
    averageCost: 16.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 16.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Apples (Granny Smith)",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 25,
    reorderPoint: 30,
    averageCost: 19.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 19.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Bananas",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 35,
    reorderPoint: 42,
    averageCost: 14.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 14.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Strawberries",
    category: "fresh_produce",
    unit: "punnets",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 55.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Blueberries",
    category: "fresh_produce",
    unit: "punnets",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 89.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 89.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Raspberries",
    category: "fresh_produce",
    unit: "punnets",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 95.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Grapes (Green)",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Watermelon",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 45.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Pineapple",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Mango",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Peaches",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 32.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Plums",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Cherries",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 125.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Kiwi",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 45.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Pears",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 25.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 25.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cantaloupe",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 35.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Papaya",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Passion Fruit",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 65.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Coconut (Fresh)",
    category: "fresh_produce",
    unit: "units",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP006", supplierName: "Farm Fresh Produce", price: 18.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Dates",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Figs (Dried)",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Almonds",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 189.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Cashews",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 225.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Walnuts",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 195.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 195.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Pecans",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 245.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 245.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Pistachios",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 285.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Sunflower Seeds",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 65.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 65.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Pumpkin Seeds",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 85.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Chia Seeds",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 125.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Flaxseeds",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Raisins",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 55.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 55.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cranberries (Dried)",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 85.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Apricots (Dried)",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 95.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Prunes",
    category: "fresh_produce",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 75.99,
    supplierPrices: [
      { supplierId: "SUP010", supplierName: "Bulk Foods SA", price: 75.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Chocolate Chips",
    category: "bakery",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 125.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Cocoa Powder",
    category: "bakery",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 189.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 189.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Vanilla Extract",
    category: "bakery",
    unit: "L",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 285.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Baking Powder",
    category: "bakery",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 45.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 45.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Baking Soda",
    category: "bakery",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 35.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 35.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Yeast (Active Dry)",
    category: "bakery",
    unit: "g",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 125.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Cornstarch",
    category: "bakery",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 32.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 32.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Icing Sugar",
    category: "bakery",
    unit: "kg",
    minimumStock: 12,
    reorderPoint: 15,
    averageCost: 28.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 28.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Brown Sugar",
    category: "bakery",
    unit: "kg",
    minimumStock: 15,
    reorderPoint: 18,
    averageCost: 24.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 24.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Gelatin",
    category: "bakery",
    unit: "g",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 145.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Food Coloring (Assorted)",
    category: "bakery",
    unit: "bottles",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 18.99,
    supplierPrices: [
      { supplierId: "SUP012", supplierName: "Baker's Best", price: 18.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Whipped Cream",
    category: "dairy",
    unit: "cans",
    minimumStock: 18,
    reorderPoint: 22,
    averageCost: 22.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 22.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Cream Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 95.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Mascarpone",
    category: "dairy",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 165.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Ricotta Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 85.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 85.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Blue Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 195.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 195.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Goat Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 185.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 185.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Brie Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 225.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Camembert",
    category: "dairy",
    unit: "kg",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 245.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 245.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Provolone",
    category: "dairy",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 155.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 155.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Swiss Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 165.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Colby Jack Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 10,
    reorderPoint: 12,
    averageCost: 135.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 135.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Monterey Jack Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 7,
    reorderPoint: 9,
    averageCost: 145.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 145.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Pepper Jack Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 155.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 155.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Havarti Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 175.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 175.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Gruyere Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 265.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 265.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Emmental Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 185.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 185.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Manchego Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 245.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 245.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Halloumi Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 6,
    reorderPoint: 8,
    averageCost: 165.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 165.99, lastUpdated: "2025-01-09" }
    ]
  },
  {
    name: "Paneer",
    category: "dairy",
    unit: "kg",
    minimumStock: 8,
    reorderPoint: 10,
    averageCost: 125.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 125.99, lastUpdated: "2025-01-10" }
    ]
  },
  {
    name: "Queso Fresco",
    category: "dairy",
    unit: "kg",
    minimumStock: 5,
    reorderPoint: 6,
    averageCost: 95.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 95.99, lastUpdated: "2025-01-08" }
    ]
  },
  {
    name: "Cotija Cheese",
    category: "dairy",
    unit: "kg",
    minimumStock: 4,
    reorderPoint: 5,
    averageCost: 115.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 115.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Boursin Cheese",
    category: "dairy",
    unit: "units",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 225.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 225.99, lastUpdated: "2025-01-06" }
    ]
  },
  {
    name: "Gorgonzola",
    category: "dairy",
    unit: "kg",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 205.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 205.99, lastUpdated: "2025-01-07" }
    ]
  },
  {
    name: "Roquefort",
    category: "dairy",
    unit: "kg",
    minimumStock: 2,
    reorderPoint: 3,
    averageCost: 285.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 285.99, lastUpdated: "2025-01-05" }
    ]
  },
  {
    name: "Stilton",
    category: "dairy",
    unit: "kg",
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 265.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 265.99, lastUpdated: "2025-01-06" }
    ]
  }
];

export const fullStarterInventory = [...starterInventory, ...remainingStarterInventory];