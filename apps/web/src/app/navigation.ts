import {
  BookOpen,
  Building2,
  ChartNoAxesColumn,
  Compass,
  Layers,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Uppercase rendering as in the reference ("EXPLORAR"). */
  emphasis?: boolean;
}

/** Primary navigation; every entry maps to an implemented route. */
export const PRIMARY_NAVIGATION: NavigationItem[] = [
  { path: '/explorar', label: 'Explorar', icon: Compass, emphasis: true },
  { path: '/inteligencia', label: 'Inteligência PJ', icon: Sparkles },
  { path: '/analises', label: 'Minhas análises', icon: ChartNoAxesColumn },
  { path: '/dashboards', label: 'Dashboards', icon: Layers },
  { path: '/audiencias', label: 'Audiências', icon: Users },
  { path: '/clientes', label: 'Clientes PJ', icon: Building2 },
  { path: '/catalogo', label: 'Catálogo', icon: BookOpen },
  { path: '/governanca', label: 'Governança', icon: ShieldCheck },
];

export const SECONDARY_NAVIGATION: NavigationItem[] = [
  { path: '/admin', label: 'Administração', icon: UserCog },
];
