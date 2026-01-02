import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export function TelegramsButton({ operationId }: { operationId: string }) {
  const navigate = useNavigate();

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => navigate(`/op/${operationId}/telegrams`)}
    >
      <MessageCircle className="h-4 w-4" />
      TELEGRANS
    </Button>
  );
}