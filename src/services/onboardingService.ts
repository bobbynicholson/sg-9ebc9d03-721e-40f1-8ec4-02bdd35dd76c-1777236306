// @ts-nocheck

import { supabase } from "@/integrations/supabase/client";

export interface OnboardingStep {
  id: string;
  label: string;
  completed: boolean;
  required: boolean;
  estimatedMinutes: number;
  description: string;
  icon: string;
}

export interface OnboardingProgress {
  userId: string;
  currentStep: string;
  steps: OnboardingStep[];
  progress: number;
  startedAt: string;
  completedAt?: string;
}

export interface CSVImportMapping {
  csvColumn: string;
  systemField: string;
  required: boolean;
  dataType: "text" | "number" | "date" | "email" | "phone";
  example?: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  skipped: number;
  errors: Array<{
    row: number;
    field: string;
    error: string;
    value: string;
  }>;
  warnings: Array<{
    row: number;
    field: string;
    warning: string;
    value: string;
  }>;
}

const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    label: "Welcome",
    completed: false,
    required: true,
    estimatedMinutes: 2,
    description: "Quick overview of the onboarding process",
    icon: "👋"
  },
  {
    id: "company_info",
    label: "Company Profile",
    completed: false,
    required: true,
    estimatedMinutes: 5,
    description: "Your catering business details and branding",
    icon: "🏢"
  },
  {
    id: "import_clients",
    label: "Import Clients",
    completed: false,
    required: false,
    estimatedMinutes: 10,
    description: "Upload your existing client database",
    icon: "👥"
  },
  {
    id: "import_bookings",
    label: "Import Bookings",
    completed: false,
    required: false,
    estimatedMinutes: 15,
    description: "Add your scheduled events and confirmed orders",
    icon: "📅"
  },
  {
    id: "import_team",
    label: "Add Team Members",
    completed: false,
    required: true,
    estimatedMinutes: 10,
    description: "Kitchen staff, drivers, and cleaning team",
    icon: "👨‍🍳"
  },
  {
    id: "import_products",
    label: "Import Menu & Products",
    completed: false,
    required: false,
    estimatedMinutes: 15,
    description: "Your menu items and pricing",
    icon: "🍽️"
  },
  {
    id: "import_inventory",
    label: "Import Inventory",
    completed: false,
    required: false,
    estimatedMinutes: 20,
    description: "Current stock, ingredients, and supplies",
    icon: "📦"
  },
  {
    id: "import_equipment",
    label: "Import Equipment",
    completed: false,
    required: false,
    estimatedMinutes: 15,
    description: "Cutlery, crockery, chafing dishes, and gear",
    icon: "🍴"
  },
  {
    id: "setup_payment",
    label: "Payment Gateway",
    completed: false,
    required: true,
    estimatedMinutes: 5,
    description: "Connect PayFast for online payments",
    icon: "💳"
  },
  {
    id: "final_review",
    label: "Review & Launch",
    completed: false,
    required: true,
    estimatedMinutes: 5,
    description: "Final checks before going live",
    icon: "🚀"
  }
];

export const onboardingService = {
  async getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
    const stored = localStorage.getItem(`onboarding_${userId}`);
    
    if (stored) {
      return JSON.parse(stored);
    }

    const newProgress: OnboardingProgress = {
      userId,
      currentStep: "welcome",
      steps: DEFAULT_ONBOARDING_STEPS,
      progress: 0,
      startedAt: new Date().toISOString()
    };

    localStorage.setItem(`onboarding_${userId}`, JSON.stringify(newProgress));
    return newProgress;
  },

  async updateStepStatus(userId: string, stepId: string, completed: boolean): Promise<void> {
    const progress = await this.getOnboardingProgress(userId);
    
    const stepIndex = progress.steps.findIndex(s => s.id === stepId);
    if (stepIndex !== -1) {
      progress.steps[stepIndex].completed = completed;
    }

    const completedSteps = progress.steps.filter(s => s.completed).length;
    progress.progress = Math.round((completedSteps / progress.steps.length) * 100);

    if (progress.progress === 100 && !progress.completedAt) {
      progress.completedAt = new Date().toISOString();
    }

    localStorage.setItem(`onboarding_${userId}`, JSON.stringify(progress));
  },

  async setCurrentStep(userId: string, stepId: string): Promise<void> {
    const progress = await this.getOnboardingProgress(userId);
    progress.currentStep = stepId;
    localStorage.setItem(`onboarding_${userId}`, JSON.stringify(progress));
  },

  async initializeUserData(data: {
    userId: string;
    companyName: string;
    email: string;
    fullName: string;
    currency: string;
  }): Promise<void> {
    // This function ensures the onboarding process is started for a new user.
    await this.getOnboardingProgress(data.userId);
  },

  parseCSV(csvText: string): Array<Record<string, string>> {
    const lines = csvText.split("\n").filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(",").map(h => h.trim().replace(/['"]/g, ""));
    const rows: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/['"]/g, ""));
      const row: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      if (Object.values(row).some(v => v.length > 0)) {
        rows.push(row);
      }
    }

    return rows;
  },

  validateEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },

  validatePhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length >= 10;
  },

  validateDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return date instanceof Date && !isNaN(date.getTime());
  },

  async importClients(
    csvData: Array<Record<string, string>>, 
    mapping: Record<string, string>,
    userId: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      warnings: []
    };

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNum = i + 2;
      
      try {
        const clientName = row[mapping.name]?.trim();
        const email = row[mapping.email]?.trim();
        const phone = row[mapping.phone]?.trim();

        if (!clientName) {
          result.errors.push({
            row: rowNum,
            field: "name",
            error: "Client name is required",
            value: clientName || "(empty)"
          });
          result.failed++;
          continue;
        }

        if (email && !this.validateEmail(email)) {
          result.warnings.push({
            row: rowNum,
            field: "email",
            warning: "Invalid email format",
            value: email
          });
        }

        if (phone && !this.validatePhone(phone)) {
          result.warnings.push({
            row: rowNum,
            field: "phone",
            warning: "Invalid phone format",
            value: phone
          });
        }

        result.imported++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          field: "general",
          error: error.message,
          value: JSON.stringify(row)
        });
      }
    }

    return result;
  },

  async importBookings(
    csvData: Array<Record<string, string>>, 
    mapping: Record<string, string>,
    userId: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      warnings: []
    };

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNum = i + 2;
      
      try {
        const clientName = row[mapping.client]?.trim();
        const eventDate = row[mapping.date]?.trim();
        const guestCount = parseInt(row[mapping.guests] || "0");
        const location = row[mapping.location]?.trim();

        if (!clientName) {
          result.errors.push({
            row: rowNum,
            field: "client",
            error: "Client name is required",
            value: clientName || "(empty)"
          });
          result.failed++;
          continue;
        }

        if (!eventDate || !this.validateDate(eventDate)) {
          result.errors.push({
            row: rowNum,
            field: "date",
            error: "Valid event date is required",
            value: eventDate || "(empty)"
          });
          result.failed++;
          continue;
        }

        const eventDateObj = new Date(eventDate);
        const today = new Date();
        if (eventDateObj < today) {
          result.warnings.push({
            row: rowNum,
            field: "date",
            warning: "Event date is in the past",
            value: eventDate
          });
        }

        if (guestCount <= 0) {
          result.warnings.push({
            row: rowNum,
            field: "guests",
            warning: "Guest count should be greater than 0",
            value: row[mapping.guests] || "0"
          });
        }

        result.imported++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          field: "general",
          error: error.message,
          value: JSON.stringify(row)
        });
      }
    }

    return result;
  },

  async importTeamMembers(
    csvData: Array<Record<string, string>>, 
    mapping: Record<string, string>, 
    role: string,
    userId: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      warnings: []
    };

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNum = i + 2;
      
      try {
        const name = row[mapping.name]?.trim();
        const email = row[mapping.email]?.trim();
        const phone = row[mapping.phone]?.trim();

        if (!name) {
          result.errors.push({
            row: rowNum,
            field: "name",
            error: "Name is required",
            value: name || "(empty)"
          });
          result.failed++;
          continue;
        }

        if (!email || !this.validateEmail(email)) {
          result.errors.push({
            row: rowNum,
            field: "email",
            error: "Valid email is required",
            value: email || "(empty)"
          });
          result.failed++;
          continue;
        }

        if (phone && !this.validatePhone(phone)) {
          result.warnings.push({
            row: rowNum,
            field: "phone",
            warning: "Phone format may be incorrect",
            value: phone
          });
        }

        result.imported++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          field: "general",
          error: error.message,
          value: JSON.stringify(row)
        });
      }
    }

    return result;
  },

  async importInventory(
    csvData: Array<Record<string, string>>, 
    mapping: Record<string, string>,
    userId: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      warnings: []
    };

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNum = i + 2;
      
      try {
        const name = row[mapping.name]?.trim();
        const quantity = parseFloat(row[mapping.quantity] || "0");
        const unit = row[mapping.unit]?.trim() || "units";

        if (!name) {
          result.errors.push({
            row: rowNum,
            field: "name",
            error: "Item name is required",
            value: name || "(empty)"
          });
          result.failed++;
          continue;
        }

        if (quantity < 0) {
          result.errors.push({
            row: rowNum,
            field: "quantity",
            error: "Quantity cannot be negative",
            value: row[mapping.quantity] || "0"
          });
          result.failed++;
          continue;
        }

        if (quantity === 0) {
          result.warnings.push({
            row: rowNum,
            field: "quantity",
            warning: "Item has zero quantity",
            value: "0"
          });
        }

        result.imported++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          field: "general",
          error: error.message,
          value: JSON.stringify(row)
        });
      }
    }

    return result;
  },

  detectCSVColumns(headers: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    
    const patterns = {
      name: ["name", "client name", "customer name", "full name", "cliente", "naam"],
      email: ["email", "email address", "e-mail", "epos", "mail"],
      phone: ["phone", "mobile", "cell", "contact", "telefoon", "tel"],
      date: ["date", "event date", "booking date", "function date", "datum"],
      guests: ["guests", "guest count", "pax", "people", "attendees", "gaste"],
      location: ["location", "venue", "address", "place", "plek"],
      amount: ["amount", "total", "price", "cost", "bedrag"],
      quantity: ["quantity", "qty", "stock", "current stock", "hoeveelheid"],
      unit: ["unit", "uom", "measurement", "eenheid"],
      category: ["category", "type", "group", "kategorie"],
      minStock: ["min stock", "minimum", "reorder", "min voorraad"],
    };

    headers.forEach(header => {
      const lower = header.toLowerCase().trim();
      
      for (const [key, variants] of Object.entries(patterns)) {
        if (variants.some(v => lower.includes(v))) {
          if (!mapping[key]) {
            mapping[key] = header;
          }
        }
      }
    });

    return mapping;
  },

  generateSampleCSV(type: "clients" | "bookings" | "team" | "inventory" | "equipment"): string {
    const samples = {
      clients: 
`Name,Email,Phone,Company,Address
John Smith,john@example.com,082 123 4567,ABC Corp,123 Main St
Sarah Johnson,sarah@company.co.za,083 456 7890,XYZ Ltd,456 Oak Ave
David Williams,david@email.com,084 789 0123,Williams Events,789 Pine Rd`,
      
      bookings: 
`Client Name,Event Date,Guests,Location,Amount,Menu
John Smith,2025-11-15,150,Grand Palace Hotel,45000,Deluxe Braai
Sarah Johnson,2025-11-20,75,Waterfront Centre,22500,Executive Lunch
David Williams,2025-11-25,200,Wine Estate,68000,Wedding Package`,
      
      team: 
`Name,Email,Phone,Role,Experience
Mary Wilson,mary@kitchen.com,084 111 2222,Kitchen Manager,5 years
James Brown,james@kitchen.com,085 333 4444,Sous Chef,3 years
Lisa Martinez,lisa@driver.com,086 555 6666,Driver,2 years`,
      
      inventory: 
`Name,Category,Quantity,Unit,Min Stock,Cost
Chicken Breast,Meat,50,kg,20,120
Rice,Staples,100,kg,30,25
Tomatoes,Vegetables,25,kg,10,35
Olive Oil,Staples,15,liters,5,180`,
      
      equipment:
`Name,Category,Quantity,Condition,Rental Price
Large Chafing Dish,Chafing,20,Excellent,65
Serving Platter,Serving,50,Good,25
Cutlery Set,Cutlery,100,Excellent,3
Wine Glass,Crockery,200,Good,5`
    };

    return samples[type];
  },

  downloadSampleCSV(type: "clients" | "bookings" | "team" | "inventory" | "equipment") {
    const csv = this.generateSampleCSV(type);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sample_${type}_import.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
};
