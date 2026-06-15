import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";
import { type ReactNode } from "react";

/**
 * Shared scroll-reveal primitives for the marketing site, encoding the
 * emil-design-eng motion philosophy:
 *
 *   - Custom ease-out curve (the built-in CSS easings are too weak).
 *   - Enter animations only (ease-out feels responsive). Reveals fire once
 *     so scrolling back up doesn't re-trigger them.
 *   - Never animate from scale(0) / from nothing -- a small translate +
 *     opacity reads as "settling into place", not "appearing from the void".
 *   - prefers-reduced-motion: keep the opacity fade (it aids comprehension),
 *     drop the movement.
 *
 * Keep these for marketing/explanatory surfaces. Do NOT sprinkle them across
 * the dashboard -- frequently-seen UI should be crisp and still.
 */

// Strong ease-out -- matches --ease-out in globals.css.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Reveal whole sections / single elements as they scroll into view.
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Stagger entrance by this many seconds. */
  delay?: number;
  /** Travel distance in px before settling. */
  y?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: reduce ? 0.3 : 0.55,
        ease: EASE_OUT,
        delay: reduce ? 0 : delay,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// Container that cascades its <StaggerItem> children into view. Keep grids,
// lists, and card rows feeling alive without everything popping at once.
export function Stagger({
  children,
  className,
  delayChildren = 0,
  gap = 0.06,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  /** Seconds between each child (30-80ms is the sweet spot). */
  gap?: number;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : gap,
            delayChildren: reduce ? 0 : delayChildren,
          },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

const itemVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
};

// Child of <Stagger>. Inherits the cascade timing from its parent.
export function StaggerItem({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={reduce ? itemVariantsReduced : itemVariants}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
