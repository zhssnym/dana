// Every icon comes from here, animated on hover via `@animateicons/react/lucide`; nothing
// imports `lucide-react` directly. `<IconMotion enabled={false}>` renders plain Lucide in a
// region, so a remount under a tooltip cannot flash.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type Ref,
  type SVGProps,
} from "react"
import * as Anim from "@animateicons/react/lucide"
import * as Lu from "lucide-react"

import { cn } from "../components/ui/utils.js"

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number | string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}

// Kept so call sites and props need not change.
export type LucideIcon = ComponentType<IconProps>

const IconMotionContext = createContext(true)

export function IconMotion({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  return (
    <IconMotionContext.Provider value={enabled}>
      {children}
    </IconMotionContext.Provider>
  )
}

// The animated components want a pixel number, so read it back off the `size-*` class.
function pixelSize(className: string | undefined, fallback = 16) {
  if (!className) return fallback

  const arbitrary = /(?:^|\s)!?size-\[(\d+(?:\.\d+)?)(px|rem)\]/.exec(className)
  if (arbitrary?.[1]) {
    return Number(arbitrary[1]) * (arbitrary[2] === "rem" ? 16 : 1)
  }

  const scale = /(?:^|\s)!?size-(\d+(?:\.\d+)?)(?:\s|$)/.exec(className)
  if (scale?.[1]) return Number(scale[1]) * 4

  return fallback
}

// `isAnimated` is only a gate. With a ref attached the component stops animating on its
// own hover and waits for `startAnimation`, so the ref is required.
type AnimHandle = { startAnimation: () => void; stopAnimation: () => void }
type AnimComponent = ComponentType<{
  ref?: Ref<AnimHandle>
  className?: string
  size?: number
  style?: CSSProperties
}>

// Hovering the enclosing control plays the icon: a 14px glyph is too small a target.
const HOVER_SCOPE = [
  "button",
  "a",
  "[role='menuitem']",
  "[role='menuitemradio']",
  "[role='menuitemcheckbox']",
  "[role='option']",
  "label",
  "[data-slot='sidebar-menu-item']",
  "li",
].join(", ")

// Many of these icons animate in from nothing, so the resting layer is the plain Lucide
// drawing. Stroke width is 2 here to match the animated components, or the glyph would
// thicken on hover.
function AnimatedIcon({
  Component,
  Static,
  className,
  style,
  size,
  ...rest
}: IconProps & { Component: AnimComponent; Static: LucideIcon }) {
  const handle = useRef<AnimHandle | null>(null)
  const host = useRef<HTMLSpanElement | null>(null)

  // Both layers stay mounted and exactly one is visible. Mounting on hover missed the enter
  // event, and painting both doubled the glyph.
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const scope = parent.closest(HOVER_SCOPE) ?? parent
    const enter = () => {
      setPlaying(true)
      handle.current?.startAnimation()
    }
    const leave = () => {
      setPlaying(false)
      handle.current?.stopAnimation()
    }
    scope.addEventListener("mouseenter", enter)
    scope.addEventListener("mouseleave", leave)
    // Keyboard focus plays it too.
    scope.addEventListener("focusin", enter)
    scope.addEventListener("focusout", leave)
    return () => {
      scope.removeEventListener("mouseenter", enter)
      scope.removeEventListener("mouseleave", leave)
      scope.removeEventListener("focusin", enter)
      scope.removeEventListener("focusout", leave)
    }
  }, [])

  return (
    <span
      ref={host}
      // Default to 16px: shadcn's `[&_svg:not([class*='size-'])]` rule cannot reach our span, so
      // unsized icons fell back to 24px.
      className={cn(
        "relative inline-flex shrink-0",
        !/(?:^|\s)(?:size|[hw])-/.test(className ?? "") && "size-4",
        className,
      )}
      style={style}
    >
      {/* Hidden, not unmounted, while the animation plays, so the geometry never reflows. */}
      <Static
        className={cn("size-full", playing && "invisible")}
        strokeWidth={2}
        aria-hidden="true"
      />
      {/* The overlay's positioning lives on this span because some animated components drop
         `className`; the descendant size rule covers components with their own wrapper. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 [&_svg]:!size-full",
          !playing && "invisible",
        )}
      >
        <Component
          ref={handle}
          size={typeof size === "number" ? size : pixelSize(className)}
          {...(rest as Record<string, unknown>)}
        />
      </span>
    </span>
  )
}

// `Animated` may be null: an icon with no exact animated twin is drawn plain rather than
// morphing into a different picture under the pointer.
function icon(Static: LucideIcon, Animated: AnimComponent | null): LucideIcon {
  function DanaIcon({
    strokeWidth,
    absoluteStrokeWidth,
    ...rest
  }: IconProps) {
    const motion = useContext(IconMotionContext) && Animated !== null

    // Static all the way down: plain Lucide with its stroke width, so nothing can flash on a remount.
    if (!motion) {
      return (
        <Static
          strokeWidth={strokeWidth}
          absoluteStrokeWidth={absoluteStrokeWidth}
          {...rest}
          // The same default size as the animated path, so motion on and off agree.
          className={cn(
            !/(?:^|\s)(?:size|[hw])-/.test(rest.className ?? "") && "size-4",
            rest.className,
          )}
        />
      )
    }

    return <AnimatedIcon Component={Animated} Static={Static} {...rest} />
  }

  return DanaIcon
}

export const AlignLeft = icon(Lu.AlignLeft, Anim.AlignLeftIcon)
export const Ban = icon(Lu.Ban, null)
export const Bell = icon(Lu.Bell, Anim.BellIcon)
export const ArrowLeft = icon(Lu.ArrowLeft, Anim.ArrowLeftIcon)
export const ArrowRight = icon(Lu.ArrowRight, Anim.ArrowRightIcon)
// "No due date": the other value of the `CalendarDays` axis.
export const CalendarX = icon(Lu.CalendarX, Anim.CalendarXIcon)
export const Download = icon(Lu.Download, Anim.DownloadIcon)
export const CalendarDays = icon(Lu.CalendarDays, Anim.CalendarDaysIcon)
export const Check = icon(Lu.Check, Anim.CheckIcon)
export const CheckCircle2 = icon(Lu.CircleCheckBig, Anim.CircleCheckBigIcon)
export const ChevronDown = icon(Lu.ChevronDown, Anim.ChevronDownIcon)
export const ChevronLeft = icon(Lu.ChevronLeft, Anim.ChevronLeftIcon)
export const ChevronRight = icon(Lu.ChevronRight, Anim.ChevronRightIcon)
export const CircleAlert = icon(Lu.CircleAlert, null)
export const Copy = icon(Lu.Copy, Anim.CopyIcon)
// The animated `ImageIcon` draws a different picture, so this one is plain.
export const ImagePlus = icon(Lu.ImagePlus, null)
export const OpenInNewTab = icon(Lu.SquareArrowOutUpRight, null)
export const Workflow = icon(Lu.Workflow, null)
// The Diagram block; `Workflow` already means a workflow file.
export const Network = icon(Lu.Network, null)
export const EyeOff = icon(Lu.EyeOff, Anim.EyeOffIcon)
export const FileText = icon(Lu.FileText, Anim.FileTextIcon)
export const Video = icon(Lu.Video, Anim.VideoIcon)
export const Folder = icon(Lu.Folder, Anim.FolderIcon)
export const FolderInput = icon(Lu.FolderInput, null)
export const FolderPlus = icon(Lu.FolderPlus, Anim.FolderPlusIcon)
export const Folders = icon(Lu.Folders, null)
export const GripVertical = icon(Lu.GripVertical, null)
export const History = icon(Lu.History, Anim.HistoryIcon)
export const Image = icon(Lu.Image, Anim.ImageIcon)
export const Import = icon(Lu.Import, null)
// Lucide's tray drawing.
export const Inbox = icon(Lu.Inbox, Anim.InboxIcon)
export const Layers3 = icon(Lu.Layers3, Anim.LayersIcon)
export const Link2 = icon(Lu.Link, Anim.LinkIcon)
export const LockKeyhole = icon(Lu.LockKeyhole, null)
export const ListChecks = icon(Lu.ListChecks, Anim.ListChecksIcon)
export const Filter = icon(Lu.Filter, Anim.FilterIcon)
export const ListTodo = icon(Lu.ListTodo, null)
export const LogOut = icon(Lu.LogOut, Anim.LogOutIcon)
export const Maximize2 = icon(Lu.Maximize2, null)
export const MoreHorizontal = icon(Lu.MoreHorizontal, Anim.EllipsisIcon)
export const PanelLeft = icon(Lu.PanelLeft, null)
export const Paperclip = icon(Lu.Paperclip, Anim.PaperclipIcon)
export const Pencil = icon(Lu.Pencil, Anim.PencilIcon)
export const Pin = icon(Lu.Pin, Anim.PinIcon)
export const Plus = icon(Lu.Plus, Anim.PlusIcon)
export const RefreshCw = icon(Lu.RefreshCw, Anim.RefreshCwIcon)
export const Repeat2 = icon(Lu.Repeat2, Anim.Repeat2Icon)
export const RotateCcw = icon(Lu.RotateCcw, null)
export const Search = icon(Lu.Search, Anim.SearchIcon)
export const Settings = icon(Lu.Settings, Anim.SettingsIcon)
export const Group = icon(Lu.Group, null)
export const Star = icon(Lu.Star, Anim.StarIcon)
export const SunMedium = icon(Lu.SunMedium, Anim.SunMediumIcon)
export const Trash2 = icon(Lu.Trash2, Anim.Trash2Icon)
// Thread status marks: neither is square, so a thread never reads as a task checkbox.
export const MessageCircle = icon(Lu.MessageCircle, null)
// Discussion's entry point: two bubbles, so it never reads as the Team control.
export const MessagesSquare = icon(Lu.MessagesSquare, null)
export function ResolvedMark({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4", className)}>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="m8 12.5 2.75 2.75L16 10" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
// The icon picker's random-colour cell.
export const Shuffle = icon(Lu.Shuffle, Anim.ShuffleIcon)
// Desk's mark. No animated twin, so it stays still.
export const LampDesk = icon(Lu.LampDesk, null)
export const UserRound = icon(Lu.UserRound, Anim.UserRoundIcon)
// Assignments' mark; `UsersRound` stays a group of people.
export const UserRoundCheck = icon(Lu.UserRoundCheck, Anim.UserRoundCheckIcon)
export const UsersRound = icon(Lu.UsersRound, Anim.UsersRoundIcon)
export const X = icon(Lu.X, Anim.XIcon)

export const MessageSquare = icon(Lu.MessageSquare, Anim.MessageSquareIcon)
export const Reply = icon(Lu.Reply, Anim.ReplyIcon)

export const List = icon(Lu.List, Anim.ListIcon)
export const GitCommitVertical = icon(Lu.GitCommitVertical, null)
export const SquareKanban = icon(Lu.SquareKanban, null)

export const ArrowDown = icon(Lu.ArrowDown, Anim.ArrowDownIcon)
export const ArrowUp = icon(Lu.ArrowUp, Anim.ArrowUpIcon)
export const ArrowUpRight = icon(Lu.ArrowUpRight, Anim.ArrowUpRightIcon)
export const Fullscreen = icon(Lu.Fullscreen, null)
export const Heading1 = icon(Lu.Heading1, Anim.Heading1Icon)
export const LoaderCircle = icon(Lu.LoaderCircle, Anim.LoaderCircleIcon)
export const PanelRight = icon(Lu.PanelRight, null)
// The slash menu's block kinds, drawn still as menus are.
export const Heading2 = icon(Lu.Heading2, null)
export const Heading3 = icon(Lu.Heading3, null)
export const ListOrdered = icon(Lu.ListOrdered, null)
export const ListCollapse = icon(Lu.ListCollapse, null)
export const Minus = icon(Lu.Minus, null)
export const Type = icon(Lu.Type, null)

// Icons a person can put on a folder; none is used by Dana's own chrome, so a mark is never
// mistaken for a control. `page/icon-manifest.ts` is the manifest.

export const Banknote = icon(Lu.Banknote, Anim.BanknoteIcon)
export const Bike = icon(Lu.Bike, Anim.BikeIcon)
export const BookOpen = icon(Lu.BookOpen, Anim.BookOpenIcon)
export const Camera = icon(Lu.Camera, Anim.CameraIcon)
export const Car = icon(Lu.Car, Anim.CarIcon)
export const Cat = icon(Lu.Cat, Anim.CatIcon)
export const Cloud = icon(Lu.Cloud, Anim.CloudIcon)
export const Code = icon(Lu.Code, Anim.CodeIcon)
export const Coffee = icon(Lu.Coffee, Anim.CoffeeIcon)
export const Compass = icon(Lu.Compass, Anim.CompassIcon)
export const Dog = icon(Lu.Dog, Anim.DogIcon)
export const Drum = icon(Lu.Drum, Anim.DrumIcon)
export const Fish = icon(Lu.Fish, Anim.FishIcon)
export const Flame = icon(Lu.Flame, Anim.FlameIcon)
export const Footprints = icon(Lu.Footprints, Anim.FootprintsIcon)
export const Gamepad = icon(Lu.Gamepad2, Anim.GamepadIcon)
export const Gift = icon(Lu.Gift, Anim.GiftIcon)
export const Globe = icon(Lu.Globe, Anim.GlobeIcon)
export const Guitar = icon(Lu.Guitar, Anim.GuitarIcon)
export const Headphones = icon(Lu.Headphones, Anim.HeadphonesIcon)
export const Heart = icon(Lu.Heart, Anim.HeartIcon)
export const House = icon(Lu.House, Anim.HouseIcon)
export const Key = icon(Lu.Key, Anim.KeyIcon)
export const Laptop = icon(Lu.Laptop, Anim.LaptopIcon)
export const Lightbulb = icon(Lu.Lightbulb, Anim.LightbulbIcon)
export const MapIcon = icon(Lu.Map, Anim.MapIcon)
export const MapPin = icon(Lu.MapPin, Anim.MapPinIcon)
export const Moon = icon(Lu.Moon, Anim.MoonIcon)
// `Sun`, not Today's `SunMedium`, so the theme control does not borrow the page's glyph.
export const Sun = icon(Lu.Sun, Anim.SunIcon)
export const Mountain = icon(Lu.Mountain, Anim.MountainIcon)
export const Music = icon(Lu.Music, Anim.MusicIcon)
export const Piano = icon(Lu.Piano, Anim.PianoIcon)
export const Coins = icon(Lu.Coins, Anim.CoinsIcon)
export const Rocket = icon(Lu.Rocket, Anim.RocketIcon)
export const ShoppingBag = icon(Lu.ShoppingBag, Anim.ShoppingBagIcon)
export const ShoppingCart = icon(Lu.ShoppingCart, Anim.ShoppingCartIcon)
export const Swords = icon(Lu.Swords, Anim.SwordsIcon)
export const Tent = icon(Lu.Tent, Anim.TentIcon)
export const Umbrella = icon(Lu.Umbrella, Anim.UmbrellaIcon)
export const Utensils = icon(Lu.Utensils, Anim.UtensilsIcon)
export const Wallet = icon(Lu.Wallet, Anim.WalletIcon)
export const Zap = icon(Lu.Zap, Anim.ZapIcon)

// More folder icons: objects and subjects only, never acts, and in sevens so the picker's
// seven columns fill whole rows.
export const Activity = icon(Lu.Activity, Anim.ActivityIcon)
export const AlarmClock = icon(Lu.AlarmClock, Anim.AlarmClockIcon)
export const Atom = icon(Lu.Atom, Anim.AtomIcon)
export const AudioWaveform = icon(Lu.AudioWaveform, Anim.AudioWaveformIcon)
export const Barcode = icon(Lu.Barcode, Anim.BarcodeIcon)
export const BicepsFlexed = icon(Lu.BicepsFlexed, Anim.BicepsFlexedIcon)
export const Blocks = icon(Lu.Blocks, Anim.BlocksIcon)
export const Box = icon(Lu.Box, Anim.BoxIcon)
export const Brain = icon(Lu.Brain, Anim.BrainIcon)
export const Calculator = icon(Lu.Calculator, Anim.CalculatorIcon)
export const Clipboard = icon(Lu.Clipboard, Anim.ClipboardIcon)
export const CloudRain = icon(Lu.CloudRain, Anim.CloudRainIcon)
export const CloudSnow = icon(Lu.CloudSnow, Anim.CloudSnowIcon)
export const CloudSun = icon(Lu.CloudSun, Anim.CloudSunIcon)
export const Cpu = icon(Lu.Cpu, Anim.CpuIcon)
export const CreditCard = icon(Lu.CreditCard, Anim.CreditCardIcon)
export const Disc3 = icon(Lu.Disc3, Anim.Disc3Icon)
export const Droplets = icon(Lu.Droplets, Anim.DropletsIcon)
export const Flag = icon(Lu.Flag, Anim.FlagIcon)
export const HardDrive = icon(Lu.HardDrive, Anim.HardDriveIcon)
export const Hourglass = icon(Lu.Hourglass, Anim.HourglassIcon)
export const Keyboard = icon(Lu.Keyboard, Anim.KeyboardIcon)
export const Lock = icon(Lu.Lock, Anim.LockIcon)
export const Mailbox = icon(Lu.Mailbox, Anim.MailboxIcon)
export const Milestone = icon(Lu.Milestone, Anim.MilestoneIcon)
export const Navigation = icon(Lu.Navigation, Anim.NavigationIcon)
export const Package = icon(Lu.Package, Anim.PackageIcon)
export const PiggyBank = icon(Lu.PiggyBank, Anim.PiggyBankIcon)
export const Plug = icon(Lu.Plug, Anim.PlugIcon)
export const Printer = icon(Lu.Printer, Anim.PrinterIcon)
export const QrCode = icon(Lu.QrCode, Anim.QrCodeIcon)
export const Quote = icon(Lu.Quote, Anim.QuoteIcon)
export const Rabbit = icon(Lu.Rabbit, Anim.RabbitIcon)
export const Radio = icon(Lu.Radio, Anim.RadioIcon)
export const Rainbow = icon(Lu.Rainbow, Anim.RainbowIcon)
export const Receipt = icon(Lu.Receipt, Anim.ReceiptIcon)
export const Route = icon(Lu.Route, Anim.RouteIcon)
export const Router = icon(Lu.Router, Anim.RouterIcon)
export const Server = icon(Lu.Server, Anim.ServerIcon)
export const ShoppingBasket = icon(Lu.ShoppingBasket, Anim.ShoppingBasketIcon)
export const Signpost = icon(Lu.Signpost, Anim.SignpostIcon)
export const Smartphone = icon(Lu.Smartphone, Anim.SmartphoneIcon)
export const SmilePlus = icon(Lu.SmilePlus, null)
export const Snowflake = icon(Lu.Snowflake, Anim.SnowflakeIcon)
export const Sparkles = icon(Lu.Sparkles, Anim.SparklesIcon)
export const Speaker = icon(Lu.Speaker, Anim.SpeakerIcon)
export const Store = icon(Lu.Store, Anim.StoreIcon)
export const Sunrise = icon(Lu.Sunrise, Anim.SunriseIcon)
export const Tablet = icon(Lu.Tablet, Anim.TabletIcon)
export const Table2 = icon(Lu.Table2, null)
export const Tag = icon(Lu.Tag, Anim.TagIcon)
export const Telescope = icon(Lu.Telescope, Anim.TelescopeIcon)
export const Terminal = icon(Lu.Terminal, Anim.TerminalIcon)
export const Thermometer = icon(Lu.Thermometer, Anim.ThermometerIcon)
export const Ticket = icon(Lu.Ticket, Anim.TicketIcon)
export const Timer = icon(Lu.Timer, Anim.TimerIcon)
export const Tornado = icon(Lu.Tornado, Anim.TornadoIcon)
export const Truck = icon(Lu.Truck, Anim.TruckIcon)
export const Tv = icon(Lu.Tv, Anim.TvIcon)
export const Usb = icon(Lu.Usb, Anim.UsbIcon)
export const Watch = icon(Lu.Watch, Anim.WatchIcon)
export const Webcam = icon(Lu.Webcam, Anim.WebcamIcon)
export const Wifi = icon(Lu.Wifi, Anim.WifiIcon)
export const Wind = icon(Lu.Wind, Anim.WindIcon)

// The icon keys the server validates and stores. Never drop or respell a key: every folder
// wearing it would lose its mark.
export const FOLDER_ICON_KEYS = [
  /* General */
  'folder', 'lamp-desk', 'house', 'heart', 'gift', 'flag', 'sparkles',
  /* Work */
  'laptop', 'code', 'terminal', 'keyboard', 'printer', 'calculator',
  'clipboard',
  /* Ideas and study */
  'book-open', 'lightbulb', 'brain', 'telescope', 'atom', 'quote', 'rocket',
  /* Money */
  'coins', 'wallet', 'banknote', 'credit-card', 'piggy-bank', 'receipt', 'tag',
  /* Shopping */
  'shopping-cart', 'shopping-bag', 'shopping-basket', 'store', 'package',
  'box', 'barcode',
  /* Home */
  'key', 'lock', 'plug', 'utensils', 'coffee', 'umbrella', 'mailbox',
  /* Travel */
  'map', 'map-pin', 'compass', 'tent', 'mountain', 'globe', 'route',
  /* Getting around */
  'car', 'bike', 'truck', 'footprints', 'navigation', 'signpost', 'ticket',
  /* Weather */
  'cloud', 'cloud-rain', 'cloud-snow', 'cloud-sun', 'moon', 'sunrise',
  'rainbow',
  /* Nature */
  'flame', 'zap', 'snowflake', 'wind', 'droplets', 'tornado', 'thermometer',
  /* Music */
  'music', 'guitar', 'piano', 'drum', 'headphones', 'radio', 'audio-waveform',
  /* Time and effort */
  'hourglass', 'timer', 'alarm-clock', 'watch', 'activity', 'biceps-flexed',
  'milestone',
  /* Media */
  'camera', 'tv', 'smartphone', 'tablet', 'webcam', 'disc', 'speaker',
  /* Tech */
  'cpu', 'server', 'hard-drive', 'router', 'wifi', 'usb', 'qr-code',
  /* Animals and play */
  'cat', 'dog', 'fish', 'rabbit', 'gamepad', 'swords', 'blocks',
] as const

// `*Icon` aliases the shadcn primitives import, so none imports `lucide-react` directly.
export const CheckIcon = Check
export const ChevronDownIcon = ChevronDown
export const ChevronRightIcon = ChevronRight
export const PanelLeftIcon = PanelLeft
export const XIcon = X
