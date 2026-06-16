import React from "react";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

export default function Example() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Hello from Mockup Sandbox!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            This is an example mockup component. You can create your own components
            in the <code>src/components/mockups</code> directory and preview them
            here.
          </p>
          <Button className="w-full">Click Me</Button>
        </CardContent>
      </Card>
    </div>
  );
}
