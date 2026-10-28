import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

export function AnimatedIcon({ icon: Icon }: { icon: LucideIcon }) {
  const reduceMotion = useReducedMotion();
  return <motion.span className="inline-flex" whileHover={reduceMotion ? undefined : { rotate: -8, scale: 1.08 }} transition={{ duration: 0.2 }}><Icon className="size-5" aria-hidden="true" /></motion.span>;
}

