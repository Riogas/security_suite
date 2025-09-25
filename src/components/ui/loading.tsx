"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface LoadingProps {
  variant?: "default" | "minimal" | "dots" | "pulse" | "spinner";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  text?: string;
}

export const Loading: React.FC<LoadingProps> = ({
  variant = "default",
  size = "md",
  className,
  text = "Cargando...",
}) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-lg",
  };

  const containerSizeClasses = {
    sm: "gap-2",
    md: "gap-3",
    lg: "gap-4",
    xl: "gap-5",
  };

  if (variant === "minimal") {
    return (
      <div className={cn("flex items-center justify-center", containerSizeClasses[size], className)}>
        <div
          className={cn(
            "animate-spin rounded-full border-2 border-muted border-t-primary",
            sizeClasses[size]
          )}
        />
        {text && (
          <span className={cn("text-muted-foreground animate-pulse", textSizeClasses[size])}>
            {text}
          </span>
        )}
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className={cn("flex flex-col items-center justify-center", containerSizeClasses[size], className)}>
        <div className="flex space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "bg-primary rounded-full animate-bounce",
                size === "sm" ? "w-2 h-2" : size === "md" ? "w-3 h-3" : size === "lg" ? "w-4 h-4" : "w-5 h-5"
              )}
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: "0.6s",
              }}
            />
          ))}
        </div>
        {text && (
          <span className={cn("text-muted-foreground mt-2", textSizeClasses[size])}>
            {text}
          </span>
        )}
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div className={cn("flex flex-col items-center justify-center", containerSizeClasses[size], className)}>
        <div
          className={cn(
            "bg-primary rounded-full animate-ping",
            sizeClasses[size]
          )}
        />
        {text && (
          <span className={cn("text-muted-foreground mt-2 animate-pulse", textSizeClasses[size])}>
            {text}
          </span>
        )}
      </div>
    );
  }

  if (variant === "spinner") {
    return (
      <div className={cn("flex flex-col items-center justify-center", containerSizeClasses[size], className)}>
        <div className={cn("relative", sizeClasses[size])}>
          <div className="absolute inset-0 rounded-full border-2 border-muted animate-ping opacity-75" />
          <div className="relative rounded-full border-2 border-muted border-t-primary animate-spin" 
               style={{ width: "100%", height: "100%" }} />
        </div>
        {text && (
          <span className={cn("text-muted-foreground mt-2", textSizeClasses[size])}>
            {text}
          </span>
        )}
      </div>
    );
  }

  // Default variant - sophisticated multi-ring spinner with enhanced animations
  return (
    <div className={cn("flex flex-col items-center justify-center", containerSizeClasses[size], className)}>
      <div className={cn("relative", sizeClasses[size])}>
        {/* Outer ring - primary color */}
        <div 
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
          style={{ animationDuration: "0.8s" }}
        />
        {/* Middle ring - accent color, counter-rotating */}
        <div 
          className="absolute inset-1 rounded-full border-3 border-transparent border-r-accent animate-spin"
          style={{ animationDuration: "1.2s", animationDirection: "reverse" }}
        />
        {/* Inner ring - muted color */}
        <div 
          className="absolute inset-2 rounded-full border-2 border-transparent border-b-muted-foreground animate-spin"
          style={{ animationDuration: "1.6s" }}
        />
        {/* Pulsing center dot */}
        <div 
          className="absolute top-1/2 left-1/2 w-3 h-3 bg-primary rounded-full transform -translate-x-1/2 -translate-y-1/2 animate-ping"
          style={{ animationDuration: "2s" }}
        />
        {/* Static center dot */}
        <div 
          className="absolute top-1/2 left-1/2 w-2 h-2 bg-primary/80 rounded-full transform -translate-x-1/2 -translate-y-1/2"
        />
      </div>
      {text && (
        <div className={cn("mt-4 animate-pulse", textSizeClasses[size])}>
          <span className="text-muted-foreground font-medium">{text}</span>
          <span className="inline-block ml-1 animate-bounce">...</span>
        </div>
      )}
    </div>
  );
};

// Fullscreen loading overlay
interface LoadingOverlayProps {
  isVisible: boolean;
  variant?: "default" | "minimal" | "dots" | "pulse" | "spinner";
  text?: string;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  variant = "default",
  text = "Cargando...",
  className,
}) => {
  if (!isVisible) return null;

  return (
    <div className={cn(
      "fixed inset-0 z-50",
      "bg-background/95 backdrop-blur-md",
      "flex items-center justify-center",
      "transition-all duration-300 ease-in-out",
      "animate-in fade-in-0",
      className
    )}>
      {/* Subtle animated background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.1)_1px,transparent_0)] [background-size:20px_20px] animate-pulse opacity-30" />
      
      {/* Main loading card with enhanced styling */}
      <div className={cn(
        "relative bg-card/95 backdrop-blur-sm",
        "border border-border/50 rounded-xl p-8",
        "shadow-2xl shadow-primary/10",
        "animate-in zoom-in-95 slide-in-from-bottom-2",
        "duration-300 ease-out"
      )}>
        {/* Subtle glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 rounded-xl blur-sm" />
        
        <div className="relative">
          <Loading variant={variant} size="lg" text={text} />
        </div>
      </div>
    </div>
  );
};

// Page transition loading
export const PageLoading: React.FC<{ text?: string }> = ({ text = "Cargando página..." }) => {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loading variant="default" size="xl" text={text} />
    </div>
  );
};

// Button loading state
interface ButtonLoadingProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
}

export const ButtonLoading: React.FC<ButtonLoadingProps> = ({
  isLoading,
  children,
  className,
}) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {isLoading && <Loading variant="minimal" size="sm" text="" />}
      {children}
    </div>
  );
};