import { Compass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl p-4 lg:p-6">
      <Card className="mt-10">
        <EmptyState
          icon={Compass}
          title="Nothing here"
          description="That page doesn't exist, or the application was deleted."
          action={
            <Button asChild variant="primary">
              <Link href="/">Back to the dashboard</Link>
            </Button>
          }
        />
      </Card>
    </div>
  );
}
