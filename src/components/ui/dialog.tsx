import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root {...props} />
}

export function DialogTrigger(
	props: ComponentProps<typeof DialogPrimitive.Trigger>,
) {
	return <DialogPrimitive.Trigger {...props} />
}

export function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
	return <DialogPrimitive.Portal {...props} />
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close {...props} />
}

export function DialogOverlay({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			className={cn(
				'fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
				className,
			)}
			{...props}
		/>
	)
}

export function DialogContent({
	className,
	closeClassName,
	children,
	...props
}: ComponentProps<typeof DialogPrimitive.Content> & { closeClassName?: string }) {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Content
				className={cn(
					'surface-popover fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 text-popover-foreground shadow-lg',
					className,
				)}
				{...props}
			>
				{children}
				<DialogPrimitive.Close
					className={cn(
						'absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-none',
						closeClassName,
					)}
				>
					<X className="h-4 w-4" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			</DialogPrimitive.Content>
		</DialogPortal>
	)
}

export function DialogHeader({
	className,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			className={cn('flex flex-col gap-2 pr-8 text-left', className)}
			{...props}
		/>
	)
}

export function DialogTitle({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn('text-lg font-semibold', className)}
			{...props}
		/>
	)
}

export function DialogDescription({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			className={cn('text-sm text-muted-foreground', className)}
			{...props}
		/>
	)
}

export function DialogFooter({
	className,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
			{...props}
		/>
	)
}
