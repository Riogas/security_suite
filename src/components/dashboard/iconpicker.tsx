"use client";
import * as React from "react";
import { iconMap } from "./iconMap"; // <-- usa tu archivo pegado en el mensaje
import { ChevronsUpDown, X as XIcon } from "lucide-react";

// shadcn/ui
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Tipos derivados del iconMap
export type IconName = keyof typeof iconMap;
export type IconValue = IconName | null | undefined;

// Helper para obtener el componente React del ícono por nombre
export function getIconByName(name: IconName) {
  return iconMap[name];
}

// Utilidad simple para componer clases
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export interface IconPickerProps {
  value?: IconValue;
  onChange?: (value: IconName | null) => void;
  placeholder?: string;
  emptyLabel?: string; // texto cuando no hay resultados
  clearable?: boolean; // permite borrar la selección
  disabled?: boolean;
  /** Opcional: restringe la lista a estos nombres */
  include?: IconName[];
  /** Opcional: excluye estos nombres de la lista */
  exclude?: IconName[];
  className?: string;
}

/**
 * IconPicker: Combo/Suggest con buscador + vista previa de íconos lucide.
 * Requiere shadcn/ui (Button, Popover, Command) y lucide-react.
 */
export default function IconPicker({
  value,
  onChange,
  placeholder = "Elegí un icono…",
  emptyLabel = "Sin resultados",
  clearable = true,
  disabled,
  include,
  exclude,
  className,
}: IconPickerProps) {
  const [open, setOpen] = React.useState(false);

  // Construye lista de opciones a partir de iconMap, con filtros opcionales
  const options = React.useMemo(() => {
    let entries = Object.entries(iconMap) as [
      IconName,
      React.ComponentType<any>,
    ][];
    if (include && include.length) {
      const inc = new Set(include);
      entries = entries.filter(([k]) => inc.has(k));
    }
    if (exclude && exclude.length) {
      const exc = new Set(exclude);
      entries = entries.filter(([k]) => !exc.has(k));
    }
    // Orden alfabético por nombre
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }, [include, exclude]);

  const currentLabel = value ?? undefined;
  const CurrentIcon = value ? iconMap[value as IconName] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-64 justify-between", className)}
          disabled={disabled}
        >
          <span className="flex items-center gap-2 truncate">
            {CurrentIcon ? (
              <CurrentIcon className="h-4 w-4 shrink-0" aria-hidden />
            ) : null}
            <span
              className={cn(
                "truncate",
                !CurrentIcon && "text-muted-foreground",
              )}
            >
              {currentLabel ?? placeholder}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <div className="flex items-center gap-1 p-2">
            <CommandInput
              placeholder="Buscar icono por nombre…"
              className="h-9"
            />
            {clearable && value ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange?.(null)}
                aria-label="Limpiar"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup heading="Iconos">
              {options.map(([name, Icon]) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => {
                    onChange?.(name);
                    setOpen(false);
                  }}
                >
                  <span className="mr-2 grid h-6 w-6 place-items-center rounded-sm border bg-muted/40">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="truncate">{name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Ejemplo de uso
// ---------------------------------
// import IconPicker, { IconName } from "./IconPicker";
//
// export default function Demo() {
//   const [icon, setIcon] = React.useState<IconName | null>("home");
//   const Selected = icon ? iconMap[icon] : null;
//   return (
//     <div className="flex flex-col gap-4 p-6">
//       <IconPicker value={icon} onChange={setIcon} />
//       <div className="flex items-center gap-2 text-sm text-muted-foreground">
//         <span>Seleccionado:</span>
//         {Selected ? <Selected className="h-5 w-5" /> : <em>Ninguno</em>}
//         <code className="rounded bg-muted px-2 py-1">{String(icon)}</code>
//       </div>
//     </div>
//   );
// }
