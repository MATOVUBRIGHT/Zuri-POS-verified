/**
 * Report Components Styling Constants
 * Provides consistent styling across all report pages
 */

export const reportCardClasses = {
  base: "bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg",
  header: "bg-gradient-to-r from-primary/10 to-accent/10 dark:from-primary/5 dark:to-accent/5",
  hover: "hover:shadow-md hover:border-primary/30 transition-all duration-200",
};

export const metricCardClasses = {
  critical: "border-destructive/50 bg-gradient-to-br from-destructive/10 to-destructive/5",
  warning: "border-warning/50 bg-gradient-to-br from-warning/10 to-warning/5",
  success: "border-success/50 bg-gradient-to-br from-success/10 to-success/5",
  info: "border-primary/50 bg-gradient-to-br from-primary/10 to-primary/5",
};

export const iconClasses = {
  destructive: "text-destructive opacity-70",
  warning: "text-warning opacity-70",
  success: "text-success opacity-70",
  info: "text-primary opacity-70",
};

export const badgeVariants = {
  critical: {
    className: "bg-destructive/20 text-destructive border-destructive/30",
  },
  warning: {
    className: "bg-warning/20 text-warning border-warning/30",
  },
  success: {
    className: "bg-success/20 text-success border-success/30",
  },
  info: {
    className: "bg-primary/20 text-primary border-primary/30",
  },
};

export const tableClasses = {
  header: "bg-muted/50 border-b border-muted font-semibold text-sm",
  row: "border-b border-muted/30 hover:bg-muted/30 transition-colors",
  cell: "px-4 py-3 text-sm",
};

export const chartClasses = {
  container: "h-80 w-full",
  gradient: "absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none",
};
