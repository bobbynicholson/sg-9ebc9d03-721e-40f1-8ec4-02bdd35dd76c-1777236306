
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Camera, 
  Upload, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  TrendingDown
} from "lucide-react";
import { ScannedReceipt, ReceiptItem } from "@/types";

interface ReceiptScannerProps {
  onReceiptProcessed: (receipt: ScannedReceipt) => void;
}

export function ReceiptScanner({ onReceiptProcessed }: ReceiptScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedReceipt, setScannedReceipt] = useState<ScannedReceipt | null>(null);

  const simulateScan = () => {
    setIsScanning(true);
    
    setTimeout(() => {
      const mockReceipt: ScannedReceipt = {
        id: `REC${Date.now()}`,
        supplierId: "SUP006",
        supplierName: "Farm Fresh Produce",
        items: [
          { name: "Tomatoes", quantity: 15, unit: "kg", price: 22.99, supplier: "Farm Fresh Produce", category: "vegetables" },
          { name: "Onions", quantity: 20, unit: "kg", price: 12.99, supplier: "Farm Fresh Produce", category: "vegetables" },
          { name: "Lettuce", quantity: 12, unit: "heads", price: 8.99, supplier: "Farm Fresh Produce", category: "vegetables" },
          { name: "Carrots", quantity: 10, unit: "kg", price: 14.99, supplier: "Farm Fresh Produce", category: "vegetables" }
        ],
        totalAmount: 344.85,
        receiptDate: new Date().toISOString().split("T")[0],
        scannedAt: new Date().toISOString(),
        status: "pending"
      };
      
      setScannedReceipt(mockReceipt);
      setIsScanning(false);
    }, 2000);
  };

  const handleApprove = () => {
    if (scannedReceipt) {
      const approved = { ...scannedReceipt, status: "processed" as const };
      onReceiptProcessed(approved);
      
      scannedReceipt.items.forEach(item => {
        const stored = localStorage.getItem("inventory") || "[]";
        const inventory = JSON.parse(stored);
        const existingItem = inventory.find((i: any) => 
          i.name.toLowerCase() === item.name.toLowerCase()
        );
        
        if (existingItem) {
          existingItem.currentStock += item.quantity;
          existingItem.lastRestocked = new Date().toISOString().split("T")[0];
        }
        
        localStorage.setItem("inventory", JSON.stringify(inventory));
      });
      
      setScannedReceipt(null);
    }
  };

  const handleReject = () => {
    if (scannedReceipt) {
      const rejected = { ...scannedReceipt, status: "rejected" as const };
      onReceiptProcessed(rejected);
      setScannedReceipt(null);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Receipt Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!scannedReceipt && !isScanning && (
          <div className="space-y-4">
            <div className="p-8 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
              <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <p className="text-slate-600 mb-4">Scan or upload your receipt</p>
              <Button 
                onClick={simulateScan}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                <Camera className="w-4 h-4 mr-2" />
                Scan Receipt
              </Button>
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">OCR Technology</p>
                <p className="text-xs text-blue-700 mt-1">
                  Automatically reads item names, quantities, prices, and supplier info from checkout slips
                </p>
              </div>
            </div>
          </div>
        )}

        {isScanning && (
          <div className="p-12 text-center">
            <Loader2 className="w-12 h-12 mx-auto text-blue-600 animate-spin mb-4" />
            <p className="text-slate-600 font-medium">Scanning receipt...</p>
            <p className="text-sm text-slate-500 mt-2">Reading items and prices</p>
          </div>
        )}

        {scannedReceipt && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-900">Receipt Scanned Successfully</p>
                  <p className="text-sm text-green-700">{scannedReceipt.supplierName}</p>
                </div>
              </div>
              <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                Pending Review
              </Badge>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">Scanned Items</h4>
              {scannedReceipt.items.map((item, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-600">
                      {item.quantity} {item.unit} @ R{item.price.toFixed(2)} per {item.unit}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">
                    R{(item.quantity * item.price).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-100 rounded-lg">
              <span className="font-semibold text-slate-900">Total Amount</span>
              <span className="text-xl font-bold text-slate-900">
                R{scannedReceipt.totalAmount.toFixed(2)}
              </span>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleApprove}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve & Add to Stock
              </Button>
              <Button 
                onClick={handleReject}
                variant="outline"
                className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
              >
                Reject
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
