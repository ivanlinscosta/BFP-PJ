import type {
  Account,
  Company,
  CompanyProduct,
  Conversation,
  CRMInteraction,
  DigitalEvent,
  FunnelEvent,
  MediaCampaign,
  MediaTouchpoint,
  Product,
} from '@bfp/domain';
import { apiRequest } from '@/services/apiClient';

export interface CustomerListItem extends Company {
  productsCount: number;
  lastActivityAt: string | null;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: {
    sizes: string[];
    segments: string[];
    states: string[];
    statuses: string[];
    products: string[];
  };
}

export interface CustomerFilters {
  q?: string;
  size?: string;
  segment?: string;
  state?: string;
  status?: string;
  product?: string;
  page: number;
  pageSize: number;
}

export interface JourneyMilestone {
  id: string;
  occurredAt: string;
  kind:
    | 'media'
    | 'site'
    | 'lead'
    | 'opening'
    | 'account'
    | 'onboarding'
    | 'transaction'
    | 'product'
    | 'crm'
    | 'activation';
  title: string;
  category: string;
  source: string;
}

export interface Customer360 {
  company: Company;
  partners: Array<{ id: string; role: string; ownershipPercentage: number }>;
  accounts: Account[];
  products: Array<{ companyProduct: CompanyProduct; product: Product | null }>;
  campaigns: MediaCampaign[];
  touchpoints: MediaTouchpoint[];
  funnel: FunnelEvent[];
  crm: CRMInteraction[];
  conversations: Conversation[];
  digitalEvents: DigitalEvent[];
  journey: JourneyMilestone[];
  fullstory?: {
    status: 'ok' | 'error' | 'not_configured';
    sessions: Array<{ sessionId: string; createdAt: string; url: string }>;
  };
  summary: {
    acquisitionChannel: string;
    accountOpenedAt: string | null;
    onboardingStatus: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';
    onboardingDays: number | null;
    activatedD30: boolean;
    activeProducts: number;
    lastInteractionAt: string | null;
  };
}

export async function listCustomers(filters: CustomerFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return apiRequest<CustomerListResponse>(`/customers?${params.toString()}`);
}

export async function getCustomer360(companyId: string) {
  return (
    await apiRequest<{ customer: Customer360 }>(`/customers/${encodeURIComponent(companyId)}`)
  ).customer;
}

/** Stronger presentation mask on top of the already masked synthetic CNPJ. */
export function maskCnpj(cnpj: string) {
  const digits = cnpj.replace(/\D/g, '');
  return `${digits.slice(2, 4)}.***.***/****-${digits.slice(6, 8)}`;
}
