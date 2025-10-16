
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const KitchenMenu: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Menu Management</h1>
        <p className="text-muted-foreground mt-1">View and manage menu items and recipes</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Menu Items</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Menu management features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>View available menu items and recipes</li>
            <li>Access ingredient lists and quantities</li>
            <li>Track menu item popularity</li>
            <li>Manage seasonal menu changes</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default KitchenMenu;
