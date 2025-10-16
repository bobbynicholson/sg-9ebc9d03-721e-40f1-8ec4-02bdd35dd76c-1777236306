
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const KitchenPrepList: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Prep Lists</h1>
        <p className="text-muted-foreground mt-1">View daily preparation tasks</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Daily Prep Tasks</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Prep list management features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>View today's prep requirements</li>
            <li>Check off completed prep tasks</li>
            <li>View upcoming event prep needs</li>
            <li>Track prep efficiency and timing</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default KitchenPrepList;
