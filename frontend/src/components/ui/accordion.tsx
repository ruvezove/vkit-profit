import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;
function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) { return <AccordionPrimitive.Item className={cn("border-b border-border", className)} {...props} />; }
function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return <AccordionPrimitive.Header className="flex"><AccordionPrimitive.Trigger className={cn("font-label flex flex-1 items-center justify-between py-5 text-left text-base font-medium transition hover:text-primary [&[data-state=open]>svg]:rotate-180", className)} {...props}>{children}<ChevronDown className="size-4 shrink-0 transition-transform duration-slow" /></AccordionPrimitive.Trigger></AccordionPrimitive.Header>;
}
function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return <AccordionPrimitive.Content className="overflow-hidden text-sm text-muted-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}><div className={cn("pb-5 leading-relaxed", className)}>{children}</div></AccordionPrimitive.Content>;
}
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

