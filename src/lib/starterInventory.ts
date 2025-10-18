// starterInventory.ts
import { InventoryItem } from "@/types/app";

export const starterInventory: Omit<InventoryItem, "id" | "currentStock" | "lastRestocked">[] = [
  {
    name: "Chicken Breast",
    category: "meat",
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
    minimumStock: 3,
    reorderPoint: 4,
    averageCost: 265.99,
    supplierPrices: [
      { supplierId: "SUP008", supplierName: "Dairy Fresh", price: 265.99, lastUpdated: "2025-01-06" }
    ]
  }
];

export const fullStarterInventory = [...starterInventory, ...remainingStarterInventory];
