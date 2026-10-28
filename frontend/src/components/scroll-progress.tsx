import { motion, useScroll, useSpring, useReducedMotion } from "motion/react";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduceMotion = useReducedMotion();
  const scaleX = useSpring(scrollYProgress, { stiffness: 90, damping: 24, restDelta: 0.001 });
  return <motion.div aria-hidden="true" className="fixed inset-x-0 top-0 z-progress h-1 origin-left bg-primary" style={{ scaleX: reduceMotion ? scrollYProgress : scaleX }} />;
}

