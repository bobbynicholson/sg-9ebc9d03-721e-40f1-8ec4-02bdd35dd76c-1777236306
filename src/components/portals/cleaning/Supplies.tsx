
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const CleaningSupplies: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Cleaning Supplies</h1>
        <p className="text-muted-foreground mt-1">Manage cleaning supplies inventory</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Supply Inventory</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Cleaning supplies management features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>Track cleaning supply stock levels</li>
            <li>Reorder supplies when running low</li>
            <li>Monitor supply usage and costs</li>
            <li>Manage supply requisitions</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default CleaningSupplies;
