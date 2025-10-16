import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const KitchenPrepList: React.FC<PortalComponentProps> = (props) => {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Kitchen Prep List</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This is the placeholder for the Kitchen Prep List page.</p>
          <pre className="mt-4 bg-slate-100 p-2 rounded">{JSON.stringify(props, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default KitchenPrepList;