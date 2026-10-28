import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("rounded-3xl border border-border bg-card text-card-foreground shadow-soft", className)} {...props} />; }
function CardHeader({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("grid gap-2 p-6", className)} {...props} />; }
function CardTitle({ className, ...props }: React.ComponentProps<"h3">) { return <h3 className={cn("text-h4 font-semibold", className)} {...props} />; }
function CardDescription({ className, ...props }: React.ComponentProps<"p">) { return <p className={cn("text-sm text-muted-foreground", className)} {...props} />; }
function CardContent({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("p-6 pt-0", className)} {...props} />; }

export { Card, CardHeader, CardTitle, CardDescription, CardContent };

