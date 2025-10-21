
import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inventoryService } from "@/services/inventoryService";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

export default function NewInventoryItemPage() {
  const router = useRouter();
  const { companySlug } = router.query;
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    category: "equipment",
    quantity: "0",
    unit: "pieces",
    unit_cost: "0",
    supplier: "",
    min_stock_level: "0",
    location: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id || !profile?.company_id) {
      toast({
        title: "Error",
        description: "User information not available",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await inventoryService.createInventoryItem({
        user_id: user.id,
        company_id: profile.company_id,
        name: formData.name,
        category: formData.category,
        quantity: parseInt(formData.quantity),
        unit: formData.unit,
        unit_cost: parseFloat(formData.unit_cost),
        supplier: formData.supplier || null,
        min_stock_level: parseInt(formData.min_stock_level) || null,
        location: formData.location || null,
        notes: formData.notes || null,
        status: "in_stock",
      } as any);

      toast({
        title: "Success",
        description: "Inventory item created successfully",
      });

      router.push(`/${companySlug}/admin/inventory`);
    } catch (error) {
      console.error("Error creating inventory item:", error);
      toast({
        title: "Error",
        description: "Failed to create inventory item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-8">
            <Link href={`/${companySlug}/admin/inventory`}>
              <Button variant="ghost" className="gap-2 mb-4">
                <ArrowLeft className="w-4 h-4" />
                Back to Inventory
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">New Inventory Item</h1>
            <p className="text-slate-600">Add a new item to your inventory</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Item Information</CardTitle>
              <CardDescription>Fill in the details for the new inventory item</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Item Name *</Label>
                    <Input
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Dinner Plates"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equipment">Equipment</SelectItem>
                        <SelectItem value="crockery">Crockery</SelectItem>
                        <SelectItem value="cutlery">Cutlery</SelectItem>
                        <SelectItem value="linen">Linen</SelectItem>
                        <SelectItem value="glassware">Glassware</SelectItem>
                        <SelectItem value="furniture">Furniture</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      required
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder="100"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="unit">Unit *</Label>
                    <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pieces">Pieces</SelectItem>
                        <SelectItem value="sets">Sets</SelectItem>
                        <SelectItem value="kg">Kilograms</SelectItem>
                        <SelectItem value="liters">Liters</SelectItem>
                        <SelectItem value="boxes">Boxes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="unit_cost">Unit Cost</Label>
                    <Input
                      id="unit_cost"
                      type="number"
                      step="0.01"
                      value={formData.unit_cost}
                      onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                      placeholder="0.00"
                      className="mt-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier">Supplier</Label>
                    <Input
                      id="supplier"
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      placeholder="ABC Supplies Co."
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="min_stock_level">Minimum Stock Level</Label>
                    <Input
                      id="min_stock_level"
                      type="number"
                      value={formData.min_stock_level}
                      onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                      placeholder="10"
                      className="mt-2"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="location">Storage Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Warehouse A, Shelf 3"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about this item..."
                    className="mt-2"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3">
                  <Button type="submit" disabled={loading} className="gap-2">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create Item
                      </>
                    )}
                  </Button>
                  <Link href={`/${companySlug}/admin/inventory`}>
                    <Button type="button" variant="outline">Cancel</Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
