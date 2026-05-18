"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface InputAutocompleteOption {
  value: string;
  label: string;
}

interface InputAutocompleteProps {
  options: InputAutocompleteOption[];
  value: string;
  /** Disparado en cada keystroke o al elegir una sugerencia. */
  onChange: (value: string) => void;
  /** Disparado SOLO cuando el usuario elige una sugerencia (útil para auto-pair). */
  onSelectSuggestion?: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Si true, muestra el dropdown apenas hay foco aunque el usuario no haya tipeado. Default true. */
  openOnFocus?: boolean;
  /** Cantidad maxima de sugerencias visibles en el dropdown. Default 50. */
  maxSuggestions?: number;
}

export function InputAutocomplete({
  options,
  value,
  onChange,
  onSelectSuggestion,
  placeholder,
  emptyText = "Sin sugerencias",
  className,
  disabled = false,
  id,
  openOnFocus = true,
  maxSuggestions = 50,
}: InputAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Cerrar al click afuera
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, maxSuggestions);
    return options
      .filter((opt) => opt.label.toLowerCase().includes(q))
      .slice(0, maxSuggestions);
  }, [options, value, maxSuggestions]);

  // Reset highlight cuando cambia el filtrado
  React.useEffect(() => {
    setHighlight(-1);
  }, [filtered.length]);

  const selectOption = (val: string) => {
    onChange(val);
    onSelectSuggestion?.(val);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (open && highlight >= 0 && highlight < filtered.length) {
        e.preventDefault();
        selectOption(filtered[highlight].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <Input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (openOnFocus) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="pr-8"
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
          if (disabled) return;
          setOpen((o) => !o);
          inputRef.current?.focus();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Abrir sugerencias"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground italic">
                {value.trim()
                  ? `Sin coincidencias. Se usará "${value.trim()}" como nuevo.`
                  : emptyText}
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlight = idx === highlight;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectOption(opt.value);
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                      isHighlight ? "bg-accent text-accent-foreground" : "",
                      isSelected ? "font-medium" : "",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
