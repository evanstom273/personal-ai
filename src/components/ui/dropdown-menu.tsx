import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export function DropdownMenu(
	props: ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
	return <DropdownMenuPrimitive.Root {...props} />
}

export function DropdownMenuTrigger({
	className,
	children,
	hideChevron = false,
	...props
}: ComponentProps<typeof DropdownMenuPrimitive.Trigger> & {
	hideChevron?: boolean
}) {
	return (
		<DropdownMenuPrimitive.Trigger
			className={cn(
				'inline-flex items-center gap-2 surface-panel rounded-md px-3 py-2 text-sm hover:bg-accent',
				className,
			)}
			{...props}
		>
			{children}
			{hideChevron ? null : <ChevronDown className="h-4 w-4 opacity-60" />}
		</DropdownMenuPrimitive.Trigger>
	)
}

export function DropdownMenuContent({
	className,
	collisionPadding = 8,
	...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				className={cn(
					'surface-popover z-50 min-w-[14rem] overflow-hidden rounded-md p-1 text-popover-foreground shadow-lg',
					className,
				)}
				sideOffset={6}
				collisionPadding={collisionPadding}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	)
}

export function DropdownMenuLabel({
	className,
	...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
	return (
		<DropdownMenuPrimitive.Label
			className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
			{...props}
		/>
	)
}

export function DropdownMenuItem({
	className,
	...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
	return (
		<DropdownMenuPrimitive.Item
			className={cn(
				'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
				className,
			)}
			{...props}
		/>
	)
}

export function DropdownMenuSeparator() {
	return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />
}
