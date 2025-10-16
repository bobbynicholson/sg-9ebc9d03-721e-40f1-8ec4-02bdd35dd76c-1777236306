
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const KitchenStock: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Kitchen Stock</h1>
        <p className="text-muted-foreground mt-1">Monitor ingredient stock levels</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Stock Levels</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Kitchen stock management features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>View current ingredient stock levels</li>
            <li>Request additional ingredients</li>
            <li>Track ingredient usage per order</li>
            <li>Report stock discrepancies</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default KitchenStock;
