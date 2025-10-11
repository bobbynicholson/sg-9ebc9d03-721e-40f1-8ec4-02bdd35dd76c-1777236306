import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EquipmentInventory } from "@/types";
import { Sparkles, Clock, CheckCircle, AlertCircle, Package } from "lucide-react";
import { Footer } from "@/components/Footer";

export default function CleaningPage() {
  const [equipment, setEquipment] = useState<EquipmentInventory[]>([]);
  const [selectedItem, setSelectedItem] = useState<EquipmentInventory | null>(null);
  const [cleaningTimeHours, setCleaningTimeHours] = useState<number>(2);
  const [filter, setFilter] = useState<"all" | "cleaning" | "available">("all");

  useEffect(() => {
    const mockEquipment: EquipmentInventory[] = [
      {
        id: "eq1",
        name: "Dinner Plates",
        category: "crockery",
        totalQuantity: 500,
        availableQuantity: 350,
        inUseQuantity: 100,
        cleaningQuantity: 50,
        damagedQuantity: 0,
        defaultCleaningTimeHours: 2,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "eq2",
        name: "Wine Glasses",
        category: "crockery",
        totalQuantity: 300,
        availableQuantity: 200,
        inUseQuantity: 80,
        cleaningQuantity: 20,
        damagedQuantity: 0,
        defaultCleaningTimeHours: 1.5,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "eq3",
        name: "Chafing Dishes",
        category: "chafing",
        totalQuantity: 50,
        availableQuantity: 30,
        inUseQuantity: 15,
        cleaningQuantity: 5,
        damagedQuantity: 0,
        defaultCleaningTimeHours: 3,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "eq4",
        name: "Stainless Steel Cutlery Set",
        category: "cutlery",
        totalQuantity: 1000,
        availableQuantity: 600,
        inUseQuantity: 300,
        cleaningQuantity: 100,
        damagedQuantity: 0,
        defaultCleaningTimeHours: 1,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "eq5",
        name: "Serving Platters",
        category: "serving",
        totalQuantity: 100,
        availableQuantity: 70,
        inUseQuantity: 20,
        cleaningQuantity: 10,
        damagedQuantity: 0,
        defaultCleaningTimeHours: 2,
        lastUpdated: new Date().toISOString(),
      },
    ];

    const stored = localStorage.getItem("equipment_inventory");
    setEquipment(stored ? JSON.parse(stored) : mockEquipment);
  }, []);

  const handleStartCleaning = (item: EquipmentInventory, quantity: number) => {
    const updated = equipment.map((eq) => {
      if (eq.id === item.id) {
        return {
          ...eq,
          inUseQuantity: eq.inUseQuantity - quantity,
          cleaningQuantity: eq.cleaningQuantity + quantity,
          lastUpdated: new Date().toISOString(),
        };
      }
      return eq;
    });

    setEquipment(updated);
    localStorage.setItem("equipment_inventory", JSON.stringify(updated));

    const cleaningRecord = {
      id: Math.random().toString(36).substring(7),
      equipmentId: item.id,
      equipmentName: item.name,
      quantity,
      startTime: new Date().toISOString(),
      estimatedCompletion: new Date(Date.now() + cleaningTimeHours * 60 * 60 * 1000).toISOString(),
      status: "in_progress",
    };

    const records = JSON.parse(localStorage.getItem("cleaning_records") || "[]");
    records.push(cleaningRecord);
    localStorage.setItem("cleaning_records", JSON.stringify(records));
  };

  const handleCompleteCleaning = (item: EquipmentInventory) => {
    const updated = equipment.map((eq) => {
      if (eq.id === item.id) {
        return {
          ...eq,
          availableQuantity: eq.availableQuantity + eq.cleaningQuantity,
          cleaningQuantity: 0,
          lastUpdated: new Date().toISOString(),
        };
      }
      return eq;
    });

    setEquipment(updated);
    localStorage.setItem("equipment_inventory", JSON.stringify(updated));

    const records = JSON.parse(localStorage.getItem("cleaning_records") || "[]");
    const updatedRecords = records.map((record: any) =>
      record.equipmentId === item.id && record.status === "in_progress"
        ? { ...record, status: "completed", completedTime: new Date().toISOString() }
        : record
    );
    localStorage.setItem("cleaning_records", JSON.stringify(updatedRecords));
  };

  const filteredEquipment = equipment.filter((item) => {
    if (filter === "cleaning") return item.cleaningQuantity > 0;
    if (filter === "available") return item.availableQuantity > 0;
    return true;
  });

  const getCategoryColor = (category: string) => {
    const colors = {
      cutlery: "bg-blue-100 text-blue-800",
      crockery: "bg-purple-100 text-purple-800",
      chafing: "bg-orange-100 text-orange-800",
      serving: "bg-green-100 text-green-800",
      other: "bg-slate-100 text-slate-800",
    };
    return colors[category as keyof typeof colors] || colors.other;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Cleaning Management</h1>
              <p className="text-slate-600">Track equipment cleaning status and availability</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="gap-2"
            >
              <Package className="w-4 h-4" />
              All Equipment
            </Button>
            <Button
              variant={filter === "cleaning" ? "default" : "outline"}
              onClick={() => setFilter("cleaning")}
              className="gap-2"
            >
              <Clock className="w-4 h-4" />
              In Cleaning
            </Button>
            <Button
              variant={filter === "available" ? "default" : "outline"}
              onClick={() => setFilter("available")}
              className="gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Available
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Items</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {equipment.reduce((sum, item) => sum + item.totalQuantity, 0)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Available Now</p>
                  <p className="text-2xl font-bold text-green-600">
                    {equipment.reduce((sum, item) => sum + item.availableQuantity, 0)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">In Cleaning</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {equipment.reduce((sum, item) => sum + item.cleaningQuantity, 0)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">In Use</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {equipment.reduce((sum, item) => sum + item.inUseQuantity, 0)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Equipment Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Available</TableHead>
                  <TableHead className="text-center">In Use</TableHead>
                  <TableHead className="text-center">Cleaning</TableHead>
                  <TableHead className="text-center">Clean Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(item.category)}>
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{item.totalQuantity}</TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold text-green-600">{item.availableQuantity}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold text-purple-600">{item.inUseQuantity}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold text-orange-600">{item.cleaningQuantity}</span>
                    </TableCell>
                    <TableCell className="text-center">{item.defaultCleaningTimeHours}h</TableCell>
                    <TableCell className="text-right space-x-2">
                      {item.inUseQuantity > 0 && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedItem(item);
                                setCleaningTimeHours(item.defaultCleaningTimeHours);
                              }}
                            >
                              Start Cleaning
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Start Cleaning: {item.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label>Quantity to Clean</Label>
                                <Input
                                  type="number"
                                  max={item.inUseQuantity}
                                  min={1}
                                  defaultValue={Math.min(10, item.inUseQuantity)}
                                  id="quantity"
                                />
                              </div>
                              <div>
                                <Label>Estimated Cleaning Time (hours)</Label>
                                <Input
                                  type="number"
                                  value={cleaningTimeHours}
                                  onChange={(e) => setCleaningTimeHours(Number(e.target.value))}
                                  step={0.5}
                                  min={0.5}
                                />
                              </div>
                              <Button
                                onClick={() => {
                                  const quantityInput = document.getElementById("quantity") as HTMLInputElement;
                                  handleStartCleaning(item, Number(quantityInput.value));
                                }}
                                className="w-full"
                              >
                                Start Cleaning Process
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                      {item.cleaningQuantity > 0 && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleCompleteCleaning(item)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Mark as Clean
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      
      <Footer />
    </div>
  );
}
