"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleCardProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string; // Nueva propiedad para aceptar className
}

export function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  className,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={className}>
      <CardHeader
        onClick={() => setIsOpen((prev) => !prev)}
        className="cursor-pointer flex items-center justify-between"
      >
        <CardTitle className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5 animate-pulse" />
          )}
          {title}
          {!isOpen && (
            <span className="ml-2 px-2 py-1 text-sm font-semibold bg-blue-500 text-white rounded-full flex items-center gap-1">
              <span className="text-lg">👈</span>
              Amplíe para ver más información
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <div
        className={`transition-all duration-300 overflow-hidden ${isOpen ? "max-h-screen" : "max-h-0"}`}
      >
        <CardContent className="pt-0">{children}</CardContent>
      </div>
    </Card>
  );
}
