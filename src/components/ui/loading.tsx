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
      <div
        className={cn(
          "flex items-center justify-center",
          containerSizeClasses[size],
          className,
        )}
      >
        <div
          className={cn(
            "animate-spin rounded-full border-2 border-muted border-t-primary",
            sizeClasses[size],
          )}
        />
        {text && (
          <span
            className={cn(
              "text-muted-foreground animate-pulse",
              textSizeClasses[size],
            )}
          >
            {text}
          </span>
        )}
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center",
          containerSizeClasses[size],
          className,
        )}
      >
        <div className="flex space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "bg-primary rounded-full animate-bounce",
                size === "sm"
                  ? "w-2 h-2"
                  : size === "md"
                    ? "w-3 h-3"
                    : size === "lg"
                      ? "w-4 h-4"
                      : "w-5 h-5",
              )}
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: "0.6s",
              }}
            />
          ))}
        </div>
        {text && (
          <span
            className={cn("text-muted-foreground mt-2", textSizeClasses[size])}
          >
            {text}
          </span>
        )}
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center",
          containerSizeClasses[size],
          className,
        )}
      >
        <div
          className={cn(
            "bg-primary rounded-full animate-ping",
            sizeClasses[size],
          )}
        />
        {text && (
          <span
            className={cn(
              "text-muted-foreground mt-2 animate-pulse",
              textSizeClasses[size],
            )}
          >
            {text}
          </span>
        )}
      </div>
    );
  }

  if (variant === "spinner") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center",
          containerSizeClasses[size],
          className,
        )}
      >
        <div className={cn("relative", sizeClasses[size])}>
          <div className="absolute inset-0 rounded-full border-2 border-muted animate-ping opacity-75" />
          <div
            className="relative rounded-full border-2 border-muted border-t-primary animate-spin"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        {text && (
          <span
            className={cn("text-muted-foreground mt-2", textSizeClasses[size])}
          >
            {text}
          </span>
        )}
      </div>
    );
  }

  // Default variant - Professional cybersecurity themed loading animation
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        containerSizeClasses[size],
        className,
      )}
    >
      <div className={cn("relative", sizeClasses[size])}>
        {/* Outer security shield perimeter */}
        <div className="absolute inset-0 opacity-90">
          <svg viewBox="0 0 64 64" className="w-full h-full animate-pulse">
            <defs>
              <linearGradient
                id="shieldGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  className="stop-color-primary"
                  stopOpacity="0.8"
                />
                <stop
                  offset="100%"
                  className="stop-color-accent"
                  stopOpacity="0.4"
                />
              </linearGradient>
            </defs>
            <path
              d="M32 4 L50 14 L50 28 C50 40 32 58 32 58 C32 58 14 40 14 28 L14 14 Z"
              fill="url(#shieldGrad)"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-primary animate-pulse"
            />
          </svg>
        </div>

        {/* Rotating lock mechanism */}
        <div
          className="absolute inset-0 flex items-center justify-center animate-spin"
          style={{ animationDuration: "3s" }}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary">
            <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.8" />
            <path
              d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
        </div>

        {/* Binary code streams */}
        <div className="absolute inset-0 overflow-hidden rounded-full opacity-30">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="absolute text-xs text-primary font-mono animate-pulse"
              style={{
                top: `${20 + i * 15}%`,
                left: `${10 + i * 20}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: "2s",
              }}
            >
              {i % 2 === 0 ? "101" : "010"}
            </div>
          ))}
        </div>

        {/* Scanning line effect */}
        <div
          className="absolute inset-2 border border-accent/50 rounded-full animate-ping"
          style={{ animationDuration: "2.5s" }}
        />

        {/* Central security indicator */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
        </div>
      </div>

      {text && (
        <div className={cn("mt-4 text-center", textSizeClasses[size])}>
          <div className="flex items-center justify-center gap-2 text-muted-foreground font-medium">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-primary animate-pulse"
            >
              <path
                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                fill="currentColor"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <span>{text}</span>
            <span className="inline-flex">
              {[...Array(3)].map((_, i) => (
                <span
                  key={i}
                  className="animate-bounce mx-0.5"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    animationDuration: "1s",
                  }}
                >
                  •
                </span>
              ))}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground/70 font-mono">
            🔒 Sistema Seguro
          </div>
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
    <div
      className={cn(
        "fixed inset-0 z-50",
        "bg-gradient-to-br from-background/98 via-background/95 to-background/98",
        "backdrop-blur-lg",
        "flex items-center justify-center",
        "transition-all duration-500 ease-in-out",
        "animate-in fade-in-0",
        className,
      )}
    >
      {/* Advanced cybersecurity pattern background */}
      <div className="absolute inset-0 opacity-5">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Floating security elements */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-float opacity-20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          >
            {i % 3 === 0 ? (
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary/30">
                <path
                  d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                  fill="currentColor"
                />
              </svg>
            ) : i % 3 === 1 ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent/30">
                <rect
                  x="3"
                  y="11"
                  width="18"
                  height="10"
                  rx="2"
                  ry="2"
                  fill="currentColor"
                />
                <circle cx="12" cy="16" r="1" fill="white" />
                <path
                  d="M7 11V7a5 5 0 0 1 10 0v4"
                  stroke="white"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            ) : (
              <div className="w-2 h-2 bg-primary/40 rounded-full animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {/* Scanning lines effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-scan-vertical" />
        <div className="absolute top-0 left-0 h-full w-0.5 bg-gradient-to-b from-transparent via-accent/30 to-transparent animate-scan-horizontal" />
      </div>

      {/* Main loading card with cybersecurity styling */}
      <div
        className={cn(
          "relative bg-card/90 backdrop-blur-xl border border-primary/20",
          "rounded-2xl p-10 shadow-2xl",
          "shadow-primary/20",
          "animate-in zoom-in-95 slide-in-from-bottom-4",
          "duration-500 ease-out",
          "before:absolute before:inset-0 before:rounded-2xl",
          "before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-accent/5",
          "before:animate-pulse",
        )}
      >
        {/* Animated border glow */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-accent to-primary rounded-2xl opacity-20 blur-sm animate-pulse" />

        {/* Corner security indicators */}
        <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-primary/40 animate-pulse" />
        <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-primary/40 animate-pulse" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-primary/40 animate-pulse" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-primary/40 animate-pulse" />

        <div className="relative z-10">
          <Loading variant={variant} size="xl" text={text} />
        </div>
      </div>

      {/* Custom keyframe animations styles */}
      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-10px) rotate(180deg);
          }
        }
        @keyframes scan-vertical {
          0% {
            top: -2px;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
        @keyframes scan-horizontal {
          0% {
            left: -2px;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            left: 100%;
            opacity: 0;
          }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        .animate-scan-vertical {
          animation: scan-vertical 3s ease-in-out infinite;
          animation-delay: 0.5s;
        }
        .animate-scan-horizontal {
          animation: scan-horizontal 4s ease-in-out infinite;
          animation-delay: 1.5s;
        }
      `}</style>
    </div>
  );
};

// Page transition loading
export const PageLoading: React.FC<{ text?: string }> = ({
  text = "Cargando página...",
}) => {
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
