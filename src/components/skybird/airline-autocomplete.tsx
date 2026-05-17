import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchAirlines, type Airline } from "@/lib/airlines";

export function AirlineAutocomplete({
  value, onChange, placeholder = "e.g. SV  or  Saudia",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Airline[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSuggestions(searchAirlines(value));
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(a: Airline) {
    onChange(`${a.name} (${a.code})`);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        maxLength={80}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {suggestions.map((a) => (
            <button
              key={a.code}
              type="button"
              onClick={() => pick(a)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-3"
            >
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{a.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
