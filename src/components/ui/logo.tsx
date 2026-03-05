import { cn } from "@/lib/utils"

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
    collapsed?: boolean
}

export function Logo({ collapsed, className, ...props }: LogoProps) {
    if (collapsed) {
        return (
            <div
                className={cn("flex items-center justify-center font-black italic tracking-tighter text-3xl", className)}
                {...props}
            >
                <span className="text-foreground drop-shadow-sm">S</span>
                <span className="text-primary drop-shadow-sm">7</span>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col select-none", className)} {...props}>
            <div className="flex items-center font-black italic tracking-tighter text-3xl leading-none">
                <span className="text-foreground">SEC</span>
                <span className="text-primary text-4xl -mx-0.5 drop-shadow-md">7</span>
                <span className="text-foreground">OR</span>
            </div>
            <div className="flex items-center justify-between mt-1 px-0.5">
                <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase leading-none">
                    Fitness
                </span>
            </div>
        </div>
    )
}
