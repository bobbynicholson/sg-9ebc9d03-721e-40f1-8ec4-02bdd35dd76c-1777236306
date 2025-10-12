import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EquipmentInventory } from "@/types";
import { Sparkles, Clock, CheckCircle, AlertCircle, Package } from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";

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
    <>
      <NoIndexMeta />
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          {/* Header Section - Mobile Optimized */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900">Cleaning Management</h1>
                  <p className="text-sm md:text-base text-slate-600">Track equipment cleaning status</p>
                </div>
              </div>

              {/* Filter Buttons - Mobile Optimized */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  onClick={() => setFilter("all")}
                  className="gap-2 text-sm md:text-base flex-1 sm:flex-none"
                  size="sm"
                >
                  <Package className="w-4 h-4" />
                  <span className="hidden sm:inline">All Equipment</span>
                  <span className="sm:hidden">All</span>
                </Button>
                <Button
                  variant={filter === "cleaning" ? "default" : "outline"}
                  onClick={() => setFilter("cleaning")}
                  className="gap-2 text-sm md:text-base flex-1 sm:flex-none"
                  size="sm"
                >
                  <Clock className="w-4 h-4" />
                  <span className="hidden sm:inline">In Cleaning</span>
                  <span className="sm:hidden">Cleaning</span>
                </Button>
                <Button
                  variant={filter === "available" ? "default" : "outline"}
                  onClick={() => setFilter("available")}
                  className="gap-2 text-sm md:text-base flex-1 sm:flex-none"
                  size="sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Available</span>
                  <span className="sm:hidden">Ready</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Stats Cards - Mobile Optimized Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Total Items</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900">
                      {equipment.reduce((sum, item) => sum + item.totalQuantity, 0)}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center self-end md:self-auto">
                    <Package className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Available</p>
                    <p className="text-xl md:text-2xl font-bold text-green-600">
                      {equipment.reduce((sum, item) => sum + item.availableQuantity, 0)}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Cleaning</p>
                    <p className="text-xl md:text-2xl font-bold text-orange-600">
                      {equipment.reduce((sum, item) => sum + item.cleaningQuantity, 0)}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center self-end md:self-auto">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">In Use</p>
                    <p className="text-xl md:text-2xl font-bold text-purple-600">
                      {equipment.reduce((sum, item) => sum + item.inUseQuantity, 0)}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-purple-100 flex items-center justify-center self-end md:self-auto">
                    <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Equipment List - Mobile Card View / Desktop Table */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-4 md:px-6">
              <CardTitle className="text-lg md:text-xl">Equipment Inventory</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6">
              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {filteredEquipment.map((item) => (
                  <Card key={item.id} className="border-2 border-slate-200">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-base text-slate-900">{item.name}</h3>
                            <Badge className={`${getCategoryColor(item.category)} text-xs mt-1`}>
                              {item.category}
                            </Badge>
                          </div>
                          <div className="text-sm font-semibold text-slate-600 ml-2">
                            {item.defaultCleaningTimeHours}h
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-slate-600">Total:</span>
                            <span className="ml-1 font-semibold">{item.totalQuantity}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Available:</span>
                            <span className="ml-1 font-semibold text-green-600">{item.availableQuantity}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">In Use:</span>
                            <span className="ml-1 font-semibold text-purple-600">{item.inUseQuantity}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Cleaning:</span>
                            <span className="ml-1 font-semibold text-orange-600">{item.cleaningQuantity}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
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
                                  className="flex-1 text-xs"
                                >
                                  Start Clean
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-[90vw] sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle className="text-base">Start Cleaning: {item.name}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label className="text-sm">Quantity to Clean</Label>
                                    <Input
                                      type="number"
                                      max={item.inUseQuantity}
                                      min={1}
                                      defaultValue={Math.min(10, item.inUseQuantity)}
                                      id={`quantity-${item.id}`}
                                      className="mt-1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-sm">Cleaning Time (hours)</Label>
                                    <Input
                                      type="number"
                                      value={cleaningTimeHours}
                                      onChange={(e) => setCleaningTimeHours(Number(e.target.value))}
                                      step={0.5}
                                      min={0.5}
                                      className="mt-1"
                                    />
                                  </div>
                                  <Button
                                    onClick={() => {
                                      const quantityInput = document.getElementById(`quantity-${item.id}`) as HTMLInputElement;
                                      handleStartCleaning(item, Number(quantityInput.value));
                                    }}
                                    className="w-full"
                                    size="sm"
                                  >
                                    Start Cleaning
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
                              className="bg-green-600 hover:bg-green-700 flex-1 text-xs"
                            >
                              Mark Clean
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Equipment</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Category</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700">Total</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700">Available</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700">In Use</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700">Cleaning</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700">Time</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipment.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium">{item.name}</td>
                        <td className="py-3 px-4">
                          <Badge className={getCategoryColor(item.category)}>
                            {item.category}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">{item.totalQuantity}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-semibold text-green-600">{item.availableQuantity}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-semibold text-purple-600">{item.inUseQuantity}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-semibold text-orange-600">{item.cleaningQuantity}</span>
                        </td>
                        <td className="py-3 px-4 text-center">{item.defaultCleaningTimeHours}h</td>
                        <td className="py-3 px-4 text-right space-x-2">
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
                                  Start Clean
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
                                      id={`desktop-quantity-${item.id}`}
                                    />
                                  </div>
                                  <div>
                                    <Label>Cleaning Time (hours)</Label>
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
                                      const quantityInput = document.getElementById(`desktop-quantity-${item.id}`) as HTMLInputElement;
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
                              Mark Clean
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Footer />
      </div>
    </>
  );
}
