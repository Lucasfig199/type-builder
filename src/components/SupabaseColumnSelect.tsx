import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
};

export function SupabaseColumnSelect({ value, options, onChange, className }: Props) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "nodrag h-8 px-2 text-xs bg-background/40 border-border/60 hover:bg-background/60",
          className,
        )}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}