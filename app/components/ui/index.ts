/**
 * BAVINI UI Components
 *
 * Re-exports all UI components for convenient imports.
 * Custom BAVINI Design System with Tailwind CSS.
 *
 * @example
 * import { Button, Input, Select } from '~/components/ui';
 */

// Form Components
export { Input, type InputProps } from './Input';
export { Label } from './Label';
export { Textarea, type TextareaProps } from './Textarea';
export { Checkbox } from './Checkbox';
export { Switch } from './Switch';
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './Select';

// Button Components
export { Button, ButtonGroup, IconButtonNew, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';

// Dialog Components
export {
  Dialog,
  DialogButton,
  DialogClose,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  dialogBackdropVariants,
  dialogVariants,
} from './Dialog';
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './AlertDialog';

// Dropdown & Menu Components
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './DropdownMenu';
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './Popover';

// Navigation Components
export { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

// Feedback Components
export { SimpleTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './Tooltip';
export { Spinner } from './Spinner';
export { Skeleton } from './Skeleton';

// Layout Components
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';
export { Separator } from './Separator';
export { PanelHeader, type PanelHeaderProps } from './PanelHeader';
export { PanelHeaderButton, type PanelHeaderButtonProps } from './PanelHeaderButton';

// Display Components
export { Badge, badgeVariants, type BadgeProps } from './Badge';
export { Slider, type SliderOptions } from './Slider';
export { ThemeSwitch } from './ThemeSwitch';

// Utility Components
export { ErrorBoundary } from './ErrorBoundary';
export { SkipLink } from './SkipLink';

// 3D/Animation Components
export { default as ColorBends } from './ColorBends.lazy';
