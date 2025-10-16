
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const ShoppingSuppliers: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Supplier Management</h1>
        <p className="text-muted-foreground mt-1">Manage your supplier relationships</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Supplier Directory</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Supplier management features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Supplier contact information</li>
            <li>Price comparisons and negotiations</li>
            <li>Delivery schedules and terms</li>
            <li>Performance ratings and reviews</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShoppingSuppliers;
