
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const ShoppingOrders: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Shopping Orders</h1>
        <p className="text-muted-foreground mt-1">Manage ingredient orders and purchases</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Purchase Orders</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Shopping order management features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>View and create purchase orders</li>
            <li>Track order status and delivery</li>
            <li>Supplier order history</li>
            <li>Budget tracking and alerts</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShoppingOrders;
