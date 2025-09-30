"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { es } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      locale={es}
      className={cn("p-3", className)}
      styles={{
        caption: { position: "relative" }, // para posicionar las flechas
      }}
      classNames={{
        // estructura general
        months: "flex flex-col space-y-4",
        month: "space-y-4",

        // caption centrado + flechas a los lados
        caption: "pt-1 pb-3 px-1",
        caption_label: "block w-full text-sm font-medium text-center",
        nav: "absolute inset-x-1 top-1 flex items-center justify-between",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),

        // tabla nativa (NADA de flex/grid aquí)
        table: "w-full border-collapse",
        head_row: "mb-1",
        head_cell: "text-muted-foreground font-normal text-[0.8rem] h-8 text-center align-middle",

        row: "",

        // el td NO debe tener display/anchos de botón
        cell:
          "p-0 text-center align-middle relative " +
          "[&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 " +
          "[&:has([aria-selected].day-range-end)]:rounded-r-md " +
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",

        // aquí sí: el BUTTON del día (rdp-day_button en el DOM)
        day: "", // <- dejar vacío para que el td quede “table-cell”
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 mx-auto font-normal aria-selected:opacity-100"
        ),

        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",

        ...classNames,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
