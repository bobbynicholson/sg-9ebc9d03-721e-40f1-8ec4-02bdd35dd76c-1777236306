
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const CleaningTasks: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Cleaning Tasks</h1>
        <p className="text-muted-foreground mt-1">Manage equipment cleaning operations</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Task Management</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Cleaning task management features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>View pending cleaning tasks</li>
            <li>Mark equipment as cleaned and ready</li>
            <li>Track cleaning times and efficiency</li>
            <li>Report damaged or broken items</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default CleaningTasks;
