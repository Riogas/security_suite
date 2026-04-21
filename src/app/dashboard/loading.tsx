"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Orbit } from "lucide-react";

export default function Loading() {
  return (
    <AnimatePresence>
      <motion.div
        key="loader"
        className="flex min-h-screen items-center justify-center bg-[#0f172a] text-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="flex items-center justify-center rounded-full bg-[#1e293b] p-6 shadow-lg"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          >
            <Orbit className="h-16 w-16 text-[#60a5fa]" strokeWidth={1.5} />
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
