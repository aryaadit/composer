"use client";

import { motion } from "motion/react";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  href?: string;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}

export default function Button({
  children,
  variant = "primary",
  onClick,
  href,
  className = "",
  disabled = false,
  type = "button",
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-full font-sans font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-burgundy/50 disabled:opacity-50 disabled:pointer-events-none";

  const variants = {
    primary:
      "bg-burgundy text-cream px-8 py-3.5 text-base hover:bg-burgundy-light",
    secondary:
      "bg-transparent text-burgundy border border-burgundy px-8 py-3.5 text-base hover:bg-burgundy hover:text-cream",
  };

  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <motion.a
        href={href}
        className={classes}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      type={type}
      onClick={onClick}
      className={classes}
      disabled={disabled}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.button>
  );
}
