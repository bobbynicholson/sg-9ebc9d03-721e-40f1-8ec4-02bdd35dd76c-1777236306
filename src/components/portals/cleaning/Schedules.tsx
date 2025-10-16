
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const CleaningSchedules: React.FC<PortalComponentProps> = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Cleaning Schedules</h1>
        <p className="text-muted-foreground mt-1">View and manage cleaning schedules</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Schedule Overview</span>
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Cleaning schedule features will be available here soon:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-sm text-muted-foreground">
            <li>View cleaning schedules by date</li>
            <li>Track equipment return times</li>
            <li>Manage team assignments</li>
            <li>Monitor cleaning completion rates</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default CleaningSchedules;
