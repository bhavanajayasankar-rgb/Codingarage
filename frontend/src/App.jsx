import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Camera,
  Save,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  DollarSign,
  Download,
  FileText,
  Globe2,
  Filter,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Menu,
  Moon,
  PiggyBank,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Sun,
  Table,
  TrendingDown,
  TrendingUp,
  Trash2,
  UserCircle,
  Wallet,
  MessageSquare,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API = import.meta.env.VITE_API_URL;

const providerStyles = {
  AWS: { stroke: '#f97316', fill: '#ffedd5', bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 ring-orange-200' },
  Azure: { stroke: '#6366f1', fill: '#e0e7ff', bar: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  GCP: { stroke: '#06b6d4', fill: '#cffafe', bar: 'bg-cyan-500', badge: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
};

const filterLabels = {
  team: 'Team',
  department: 'Department',
  business_unit: 'Business Unit',
  environment: 'Environment',
  application: 'Application',
  owner: 'Owner',
  project: 'Project',
};
const costFilterFields = Object.keys(filterLabels);

const servicePalette = ['#6366f1', '#06b6d4', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

const workspacePages = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'services', label: 'Services', icon: Server },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'security', label: 'Security', icon: Shield },
];

const servicePages = [
  { id: 'anomalies', label: 'Cost Anomaly', icon: ShieldAlert, detail: 'Review cost spikes, anomaly trends, and provider-level alerts.' },
  { id: 'budgets', label: 'Budget Management', icon: Wallet, detail: 'Set provider budgets and monitor spend against targets.' },
  { id: 'savings', label: 'Savings', icon: PiggyBank, detail: 'Track savings opportunities across cloud services.' },
  { id: 'recommendations', label: 'Recommendations', icon: TrendingUp, detail: 'Prioritize optimization actions and monthly savings ideas.' },
  { id: 'reports', label: 'Reports', icon: FileText, detail: 'Generate, filter, and review cost reports and daily spend trends.' },
];

const pageTitles = {
  overview: 'Dashboard Overview',
  services: 'Services',
  profile: 'Profile',
  reports: 'Report Generation',
  anomalies: 'Cost Anomaly Review',
  budgets: 'Budget Management',
  savings: 'Savings Plan Workspace',
  recommendations: 'Recommendations',
  settings: 'Settings',
  security: 'Security',
};

const CURRENCY_CONFIG = {
  INR: { symbol: '\u20B9', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '\u20AC', locale: 'de-DE' },
  GBP: { symbol: '\u00A3', locale: 'en-GB' },
};

function getCurrencyCode() {
  try { return localStorage.getItem('finops_currency') || 'INR'; }
  catch { return 'INR'; }
}

function getCurrencySymbol() {
  const code = getCurrencyCode();
  return (CURRENCY_CONFIG[code] || CURRENCY_CONFIG.INR).symbol;
}

function money(value, suffix = '') {
  const numeric = Number(value || 0);
  const code = getCurrencyCode();
  const { symbol, locale } = CURRENCY_CONFIG[code] || CURRENCY_CONFIG.INR;
  return `${symbol}${numeric.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAIResponse(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  let listType = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { html += listType === 'ol' ? '</ol>' : '</ul>'; inList = false; listType = null; }
      html += '<div class="h-2"></div>';
      continue;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      if (!inList) { listType = 'ol'; inList = true; html += '<ol class="list-decimal pl-5 space-y-1 my-1">'; }
      html += `<li class="text-sm leading-6">${formatInline(trimmed.replace(/^\d+\.\s/, ''))}</li>`;
      continue;
    }
    if (/^[-*]\s/.test(trimmed)) {
      if (!inList) { listType = 'ul'; inList = true; html += '<ul class="list-disc pl-5 space-y-1 my-1">'; }
      html += `<li class="text-sm leading-6">${formatInline(trimmed.replace(/^[-*]\s/, ''))}</li>`;
      continue;
    }
    if (inList) { html += listType === 'ol' ? '</ol>' : '</ul>'; inList = false; listType = null; }

    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)[0].length;
      const content = formatInline(trimmed.replace(/^#+\s/, ''));
      const size = level === 1 ? 'text-base font-bold' : level === 2 ? 'text-sm font-semibold' : 'text-sm font-medium';
      html += `<h3 class="${size} text-slate-900 mt-3 mb-1">${content}</h3>`;
      continue;
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => formatInline(c.trim()));
      html += `<div class="flex gap-2 text-sm py-1 ${cells.every(c => /^[₹$€£][\d,]+/.test(c)) ? 'font-semibold' : 'text-slate-600'}">${cells.map(c => `<span class="flex-1">${c}</span>`).join('')}</div>`;
      continue;
    }
    html += `<p class="text-sm leading-6 text-slate-700">${formatInline(trimmed)}</p>`;
  }
  if (inList) { html += listType === 'ol' ? '</ol>' : '</ul>'; }
  return html;
}

function formatInline(text) {
  return htmlEscape(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-rose-600">$1</code>');
}

function SectionTitle({ icon: Icon, title, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-500 ring-1 ring-slate-200/60 shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: { bg: 'bg-slate-50', icon: 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600', ring: 'ring-slate-200/60' },
    emerald: { bg: 'bg-cyan-50/50', icon: 'bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-700', ring: 'ring-cyan-200/60' },
    rose: { bg: 'bg-rose-50/50', icon: 'bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700', ring: 'ring-rose-200/60' },
    amber: { bg: 'bg-amber-50/50', icon: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700', ring: 'ring-amber-200/60' },
  };
  const t = tones[tone] || tones.slate;

  return (
    <div className={`group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/50`}>
      <div className={`absolute inset-0 opacity-[0.03] transition-opacity duration-300 group-hover:opacity-[0.06] ${t.bg}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-2.5 truncate text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${t.icon} ${t.ring} shadow-sm transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="relative mt-3 flex items-center gap-1.5">
        <div className="h-1 w-1 rounded-full bg-slate-300" />
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function NotificationToast({ message, type }) {
  if (!message) return null;

  return (
    <div className="fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-sm animate-in slide-in-from-right">
      <div
        className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium shadow-xl ring-1 ${
          type === 'success'
            ? 'bg-cyan-50 text-cyan-900 ring-cyan-200/60 shadow-cyan-200/30'
            : 'bg-rose-50 text-rose-900 ring-rose-200/60 shadow-rose-200/30'
        }`}
      >
        {type === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-600" />
        ) : (
          <AlertOctagon className="h-4 w-4 shrink-0 text-rose-600" />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [dashboardData, setDashboardData] = useState(null);
  const [persona, setPersona] = useState('executive');
  const [report, setReport] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', text: "Hello, I'm your FinOps AI Assistant. Ask me anything about your cloud spending, cost anomalies, or savings opportunities across AWS, Azure, and GCP." },
  ]);
  const [conversations, setConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('finops_conversations') || '[]'); }
    catch { return []; }
  });
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [recentlyVisited, setRecentlyVisited] = useState(() => {
    try { return JSON.parse(localStorage.getItem('finops_recently_visited') || '[]'); }
    catch { return []; }
  });
  const [anomalyThreshold, setAnomalyThreshold] = useState(2.0);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authToken, setAuthToken] = useState(localStorage.getItem('finops_auth_token') || '');
  const [loggedInUser, setLoggedInUser] = useState(() => {
    const savedName = localStorage.getItem('finops_auth_name') || '';
    const savedEmail = localStorage.getItem('finops_auth_email') || '';
    return savedName || savedEmail;
  });
  const [loggedInEmail, setLoggedInEmail] = useState(localStorage.getItem('finops_auth_email') || '');
  const [profileAvatar, setProfileAvatar] = useState(localStorage.getItem('finops_auth_avatar') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('finops_auth_token')));
  const [validatingAuth, setValidatingAuth] = useState(Boolean(localStorage.getItem('finops_auth_token')));
  const [notification, setNotification] = useState('');
  const [notificationType, setNotificationType] = useState('success');
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activePage, setActivePage] = useState('overview');
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [proactiveRecommendations, setProactiveRecommendations] = useState([]);
  const [isProactiveLoading, setIsProactiveLoading] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [overviewProviderFilter, setOverviewProviderFilter] = useState('All Providers');
  const [overviewPeriodFilter, setOverviewPeriodFilter] = useState('Monthly');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [readNotifications, setReadNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('finops_read_notifications') || '[]'); }
    catch { return []; }
  });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedServiceTrend, setSelectedServiceTrend] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('finops_dark_mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [providerBudgets, setProviderBudgets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('finops_provider_budgets') || '{}');
    } catch {
      return {};
    }
  });
  const [globalBudget, setGlobalBudget] = useState(() => {
    try {
      return Number(localStorage.getItem('finops_global_budget')) || 0;
    } catch {
      return 0;
    }
  });
  const [filters, setFilters] = useState({
    team: 'All',
    department: 'All',
    business_unit: 'All',
    environment: 'All',
    application: 'All',
    owner: 'All',
    project: 'All',
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('finops_sidebar_collapsed');
    return saved === 'true';
  });
  const [aiNotifications, setAiNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('finops_ai_notifications') || '[]'); }
    catch { return []; }
  });
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [budgetTab, setBudgetTab] = useState('chart');
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [aiInsightsTimeline, setAiInsightsTimeline] = useState([]);
  const [financialHealthScore, setFinancialHealthScore] = useState(78);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [showAiDashboard, setShowAiDashboard] = useState(false);
  const [detailedSavings, setDetailedSavings] = useState(null);
  const [expandedSavingsCard, setExpandedSavingsCard] = useState(null);
  const [budgetOverrunBanner, setBudgetOverrunBanner] = useState(null);
  const [draftGlobalBudget, setDraftGlobalBudget] = useState(() => {
    try { return Number(localStorage.getItem('finops_global_budget')) || 0; } catch { return 0; }
  });
  const [profileEditName, setProfileEditName] = useState('');
  const [profileEditEmail, setProfileEditEmail] = useState('');
  const [profileEditAvatar, setProfileEditAvatar] = useState('');
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);
  const [activeCurrency, setActiveCurrency] = useState(() => {
    try { return localStorage.getItem('finops_currency') || 'INR'; }
    catch { return 'INR'; }
  });
  const notificationCenterRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const profileWidgetRef = useRef(null);
  const searchWidgetRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('finops_dark_mode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (profileWidgetRef.current && !profileWidgetRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (searchWidgetRef.current && !searchWidgetRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const profileName = loggedInUser || 'Your profile';
  const profileEmail = loggedInEmail || 'No email available';

  const handleSaveProfile = async () => {
    const name = profileEditName.trim();
    const email = profileEditEmail.trim();
    if (!name) { setProfileMessage({ type: 'error', text: 'Name cannot be empty.' }); return; }
    if (!email || !email.includes('@') || !email.includes('.')) { setProfileMessage({ type: 'error', text: 'Enter a valid email address.' }); return; }
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, avatar: avatarChanged ? profileEditAvatar : undefined }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Failed to save profile'); }
      const data = await res.json();
      localStorage.setItem('finops_auth_name', data.name);
      localStorage.setItem('finops_auth_email', data.email);
      localStorage.setItem('finops_auth_avatar', data.avatar || '');
      setProfileAvatar(data.avatar || '');
      setLoggedInUser(data.name);
      setLoggedInEmail(data.email);
      setAvatarChanged(false);
      setProfileMessage({ type: 'success', text: data.message });
    } catch (e) {
      setProfileMessage({ type: 'error', text: e.message });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarChanged(true);
    const reader = new FileReader();
    reader.onload = (ev) => setProfileEditAvatar(ev.target?.result || '');
    reader.readAsDataURL(file);
  };
  const filterOptions = dashboardData?.filter_options || {};

  const totalSavings = useMemo(() => {
    if (!dashboardData?.recommendations) return 0;
    return dashboardData.recommendations.reduce((acc, rec) => acc + Number(rec.estimated_monthly_savings || 0), 0);
  }, [dashboardData]);

  const selectedTeam = filters.team !== 'All' ? filters.team : '';

  const activeFilters = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, value]) => value && value !== 'All')),
    [filters],
  );
  const activeFilterSummary = useMemo(
    () => Object.entries(activeFilters).map(([field, value]) => ({ field, label: filterLabels[field] || field, value })),
    [activeFilters],
  );

  const serviceKeys = useMemo(() => {
    if (!dashboardData?.chart_data?.length) return [];
    return Object.keys(dashboardData.chart_data[0]).filter((key) => key !== 'date');
  }, [dashboardData]);

  const providerDailyData = useMemo(() => {
    if (!dashboardData?.chart_data?.length) return [];
    const serviceProvider = {};
    (dashboardData.service_breakdown || []).forEach((row) => {
      serviceProvider[row.service] = row.provider;
    });

    return dashboardData.chart_data.map((item) => {
      const row = { date: item.date, AWS: 0, Azure: 0, GCP: 0 };
      Object.entries(item).forEach(([key, value]) => {
        if (key === 'date') return;
        const provider = serviceProvider[key];
        if (provider && row[provider] !== undefined) {
          row[provider] += Number(value || 0);
        }
      });
      return row;
    });
  }, [dashboardData]);

  const providerTotals = useMemo(() => {
    const totals = { AWS: 0, Azure: 0, GCP: 0 };
    providerDailyData.forEach((row) => {
      Object.keys(totals).forEach((provider) => {
        totals[provider] += Number(row[provider] || 0);
      });
    });
    return totals;
  }, [providerDailyData]);

  const budgets = useMemo(() => {
    return { ...providerBudgets };
  }, [providerBudgets]);

  const periodChartData = useMemo(() => {
    if (!dashboardData?.chart_data?.length) return [];
    const data = dashboardData.chart_data;
    if (overviewPeriodFilter === 'Daily') return data;
    const grouped = {};
    data.forEach((d) => {
      let key;
      if (overviewPeriodFilter === 'Weekly') {
        const date = new Date(d.date);
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
      } else if (overviewPeriodFilter === 'Monthly') {
        key = d.date.slice(0, 7);
      } else {
        const m = parseInt(d.date.slice(5, 7), 10);
        const q = Math.ceil(m / 3);
        key = `${d.date.slice(0, 4)}-Q${q}`;
      }
      if (!grouped[key]) grouped[key] = { date: key };
      Object.entries(d).forEach(([k, v]) => {
        if (k === 'date') return;
        grouped[key][k] = (grouped[key][k] || 0) + Number(v || 0);
      });
    });
    return Object.values(grouped);
  }, [dashboardData, overviewPeriodFilter]);

  const filteredTotalCost = useMemo(() => {
    if (overviewProviderFilter === 'All Providers') {
      if (periodChartData.length) {
        return periodChartData.reduce((sum, d) => {
          if (!d || typeof d !== 'object') return sum;
          return sum + Object.entries(d).reduce((s, [k, v]) => k === 'date' ? s : s + Number(v || 0), 0);
        }, 0);
      }
      return dashboardData?.total_cost || 0;
    }
    return providerTotals[overviewProviderFilter] || 0;
  }, [overviewProviderFilter, providerTotals, dashboardData, periodChartData]);

  const filteredProviderKeys = useMemo(() => {
    if (overviewProviderFilter === 'All Providers') return Object.keys(providerTotals);
    return [overviewProviderFilter].filter(p => providerTotals[p] !== undefined);
  }, [overviewProviderFilter, providerTotals]);

  const filteredPeriodAvgCost = useMemo(() => {
    if (!providerDailyData.length) return 0;
    const grouped = {};
    providerDailyData.forEach((d) => {
      let key;
      if (overviewPeriodFilter === 'Daily') {
        key = d.date;
      } else if (overviewPeriodFilter === 'Weekly') {
        const date = new Date(d.date);
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
      } else if (overviewPeriodFilter === 'Monthly') {
        key = d.date.slice(0, 7);
      } else {
        const m = parseInt(d.date.slice(5, 7), 10);
        const q = Math.ceil(m / 3);
        key = `${d.date.slice(0, 4)}-Q${q}`;
      }
      if (!grouped[key]) grouped[key] = { AWS: 0, Azure: 0, GCP: 0 };
      ['AWS', 'Azure', 'GCP'].forEach((p) => { grouped[key][p] += Number(d[p] || 0); });
    });
    const periods = Object.values(grouped);
    if (!periods.length) return 0;
    const total = periods.reduce((s, p) => {
      if (overviewProviderFilter === 'All Providers') return s + p.AWS + p.Azure + p.GCP;
      return s + (p[overviewProviderFilter] || 0);
    }, 0);
    return total / periods.length;
  }, [providerDailyData, overviewPeriodFilter, overviewProviderFilter]);

  const filteredPeriodCount = useMemo(() => {
    if (!providerDailyData.length) return 0;
    const keys = new Set();
    providerDailyData.forEach((d) => {
      let key;
      if (overviewPeriodFilter === 'Daily') {
        key = d.date;
      } else if (overviewPeriodFilter === 'Weekly') {
        const date = new Date(d.date);
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
      } else if (overviewPeriodFilter === 'Monthly') {
        key = d.date.slice(0, 7);
      } else {
        const m = parseInt(d.date.slice(5, 7), 10);
        const q = Math.ceil(m / 3);
        key = `${d.date.slice(0, 4)}-Q${q}`;
      }
      keys.add(key);
    });
    return keys.size;
  }, [providerDailyData, overviewPeriodFilter]);

  const filteredResourceCount = useMemo(() => {
    const breakdown = dashboardData?.service_breakdown || [];
    if (overviewProviderFilter === 'All Providers') return [...new Set(breakdown.map(r => r.service))].length;
    return [...new Set(breakdown.filter(r => r.provider === overviewProviderFilter).map(r => r.service))].length;
  }, [dashboardData, overviewProviderFilter]);

  const totalBudgetAllocation = useMemo(() => {
    if (globalBudget > 0) return globalBudget;
    return Object.values(budgets).reduce((sum, value) => sum + Number(value || 0), 0);
  }, [budgets, globalBudget]);

  const availableBudget = totalBudgetAllocation - Number(dashboardData?.total_cost || 0);
  const budgetBadgeText = totalBudgetAllocation > 0
    ? `${availableBudget >= 0 ? money(availableBudget) : `-${money(Math.abs(availableBudget))}`} ${availableBudget >= 0 ? 'budget remaining' : 'budget overrun'}`
    : 'No budget configured';

  const conversationMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return conversations
      .filter((conversation) => conversation.title.toLowerCase().includes(query))
      .slice(0, 4);
  }, [conversations, searchQuery]);

  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const suggestions = [];
    const push = (item) => {
      if (suggestions.length < 20) suggestions.push(item);
    };
    const matches = (...values) => values.some((value) => String(value || '').toLowerCase().includes(query));

    workspacePages.forEach((page) => {
      if (matches(page.label, page.id) || (page.id === 'reports' && query.includes('cost'))) {
        push({
          kind: 'page',
          title: page.label,
          subtitle: page.id === 'overview'
            ? 'Open the multi-cloud view'
            : page.id === 'reports'
              ? 'Open reports, filters, and downloads'
              : `Open ${page.label.toLowerCase()}`,
          pageId: page.id,
          icon: page.icon,
        });
      }
    });

    servicePages.forEach((page) => {
      if (matches(page.label, page.id, page.detail)) {
        push({
          kind: 'page',
          title: page.label,
          subtitle: page.detail,
          pageId: page.id,
          icon: page.icon,
        });
      }
    });

    if (report?.title && matches(report.title, report.focus, report.summary)) {
      push({
        kind: 'report',
        title: report.title,
        subtitle: 'Open the generated report',
        pageId: 'reports',
        persona,
        icon: FileText,
      });
    }

    Object.entries(providerTotals).forEach(([provider, spend]) => {
      if (matches(provider, money(spend))) {
        push({
          kind: 'provider',
          title: `${provider} spend`,
          subtitle: `${money(spend)} total cloud spend`,
          pageId: 'overview',
          icon: Wallet,
        });
      }
    });

    (dashboardData?.service_breakdown || []).forEach((row) => {
      if (matches(row.provider, row.service, row.team, row.application, row.owner, row.department, row.business_unit, row.environment, row.project)) {
        push({
          kind: 'service',
          title: `${row.provider} ${row.service}`,
          subtitle: `${row.team} / ${row.application} / ${money(row.period_cost)} selected spend`,
          pageId: 'overview',
          service: row.service,
          icon: Server,
        });
      }
    });

    (detailedSavings?.categories || []).forEach((cat) => {
      if (matches(cat.name, cat.desc)) {
        push({
          kind: 'savings-category',
          title: cat.name,
          subtitle: `${cat.desc} · Save ${money(cat.savings)} (${cat.percentage}%)`,
          pageId: 'savings',
          icon: PiggyBank,
        });
      }
    });

    aiRecommendations.forEach((rec) => {
      if (matches(rec.title, rec.issue || rec.description || '', rec.resource || '', rec.category || '')) {
        push({
          kind: 'recommendation',
          title: rec.title,
          subtitle: `${rec.issue || rec.description || ''} · ${money(rec.potentialSavings)}/mo`,
          pageId: 'recommendations',
          icon: Lightbulb,
        });
      }
    });

    (dashboardData?.anomalies || []).forEach((anomaly) => {
      if (matches(anomaly.provider, anomaly.service, anomaly.date, ...(anomaly.types || []), anomaly.team, anomaly.severity)) {
        push({
          kind: 'anomaly',
          title: `${anomaly.provider} ${anomaly.service}`,
          subtitle: `${anomaly.date} · ${money(anomaly.excess_amount)} excess · ${anomaly.types?.join(', ') || anomaly.severity}`,
          pageId: 'anomalies',
          icon: ShieldAlert,
        });
      }
    });

    costFilterFields.forEach((field) => {
      const currentValue = filters[field];
      const label = filterLabels[field];
      const options = filterOptions[field] || [];
      if (matches(field, label, currentValue, ...options)) {
        push({
          kind: 'filter',
          title: `${label} filter`,
          subtitle: currentValue && currentValue !== 'All' ? `Current: ${currentValue}` : 'Open cost filters',
          pageId: 'reports',
          icon: Filter,
        });
      }
    });

    conversationMatches.forEach((conversation) => {
      push({
        kind: 'conversation',
        title: conversation.title,
        subtitle: 'Open an existing chat',
        conversationId: conversation.id,
        icon: MessageSquare,
      });
    });

    return suggestions;
  }, [conversationMatches, dashboardData, filters, filterOptions, persona, providerTotals, report, searchQuery, detailedSavings, aiRecommendations]);

  const overviewNotifications = useMemo(() => {
    const messages = [];
    if (dashboardData?.anomaly_count > 0) {
      messages.push({
        title: 'Cost anomaly detected',
        detail: `${dashboardData.anomaly_count} anomaly${dashboardData.anomaly_count === 1 ? '' : 'ies'} need review.`,
        tone: 'rose',
      });
    }
    Object.entries(providerTotals).forEach(([provider, spend]) => {
      const budget = Number(budgets[provider] || 0);
      if (budget > 0 && spend >= budget * 0.9) {
        messages.push({
          title: `${provider} budget pressure`,
          detail: `${money(spend)} used against a ${money(budget)} budget.`,
          tone: spend > budget ? 'rose' : 'amber',
        });
      }
    });

    if (proactiveRecommendations && proactiveRecommendations.length > 0) {
      proactiveRecommendations.forEach((rec) => {
        messages.push({
          title: `AI Savings Idea: ${rec.title}`,
          detail: `Save ${money(rec.estimated_savings)}/mo on ${rec.provider} ${rec.service}. ${rec.reasoning}`,
          tone: 'amber',
        });
      });
    }

    if (!messages.length) {
      messages.push({
        title: 'No urgent notifications',
        detail: 'Budgets and anomaly signals are inside current limits.',
        tone: 'emerald',
      });
    }
    return messages;
  }, [budgets, dashboardData, providerTotals, proactiveRecommendations]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    setSelectedAnomaly(null);
    const params = new URLSearchParams({ threshold: String(anomalyThreshold), ...activeFilters });
    if (!isAuthenticated) {
      return;
    }
    authFetch(`/api/dashboard/summary?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setDashboardData(data))
      .catch((err) => console.error('Error loading dashboard metrics:', err));

    setIsProactiveLoading(true);
    authFetch(`/api/recommendations/proactive?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setProactiveRecommendations(Array.isArray(data) ? data : []);
        setIsProactiveLoading(false);
      })
      .catch((err) => {
        console.error('Error loading proactive recommendations:', err);
        setIsProactiveLoading(false);
      });
  }, [anomalyThreshold, activeFilters, isAuthenticated]);

  const saveConversations = (convs) => {
    setConversations(convs);
    localStorage.setItem('finops_conversations', JSON.stringify(convs));
  };

  const clearAuth = () => {
    localStorage.removeItem('finops_auth_token');
    localStorage.removeItem('finops_auth_name');
    localStorage.removeItem('finops_auth_email');
    localStorage.removeItem('finops_auth_avatar');
    setAuthToken('');
    setAuthName('');
    setAuthEmail('');
    setLoggedInUser('');
    setLoggedInEmail('');
    setProfileAvatar('');
    setAuthPassword('');
    setAuthError('');
    setProfileOpen(false);
    setIsAuthenticated(false);
    setDashboardData(null);
    setReport(null);
    setSelectedAnomaly(null);
    setChatHistory([
      { role: 'assistant', text: "Hello, I'm your FinOps AI Assistant. Ask me anything about your cloud spending, cost anomalies, or savings opportunities across AWS, Azure, and GCP." },
    ]);
  };

  const saveAuth = (name, email, token) => {
    localStorage.setItem('finops_auth_token', token);
    localStorage.setItem('finops_auth_name', name);
    localStorage.setItem('finops_auth_email', email);
    setAuthToken(token);
    setLoggedInUser(name);
    setLoggedInEmail(email);
    setIsAuthenticated(true);
    setAuthError('');
  };

  const showNotification = (message, type = 'success') => {
    setNotificationType(type);
    setNotification(message);
  };

  const addAiNotification = (title, detail, priority = 'medium') => {
    const newNotif = {
      id: Date.now().toString(),
      title,
      detail,
      priority,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setAiNotifications(prev => {
      const next = [newNotif, ...prev].slice(0, 50);
      localStorage.setItem('finops_ai_notifications', JSON.stringify(next));
      return next;
    });
  };

  const markNotifRead = (id) => {
    setAiNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: true } : n);
      localStorage.setItem('finops_ai_notifications', JSON.stringify(next));
      return next;
    });
  };

  const clearAllNotifications = () => {
    setAiNotifications([]);
    localStorage.setItem('finops_ai_notifications', '[]');
  };

  const generateAiRecommendations = () => {
    if (!dashboardData) return;
    setIsAiAnalyzing(true);
    const now = new Date();

    const recommendations = [];
    const timeline = [];

    const totalSpend = dashboardData.total_spend || 0;
    const anomalies = dashboardData.anomalies || [];
    const patterns = dashboardData.patterns || [];
    const providerTotals = dashboardData.provider_totals || {};
    const services = dashboardData.services || [];
    const dailyCosts = dashboardData.daily_costs || [];

    const topService = services.length > 0
      ? services.reduce((a, b) => (a.cost || 0) > (b.cost || 0) ? a : b)
      : null;

    // --- 1. Idle / Underutilized VMs ---
    if (totalSpend > 3000) {
      const idleSavings = Math.round(totalSpend * 0.15);
      const cpuPattern = patterns.find(p => /cpu|utilization/i.test(p.type || ''));
      recommendations.push({
        id: 'rec-1',
        icon: 'PiggyBank',
        title: 'Idle & Underutilized VMs',
        resource: topService ? `${topService.provider || 'Cloud'} - ${topService.service_name || 'Compute Instances'}` : 'Compute Instances (All Providers)',
        issue: cpuPattern
          ? `VMs running at low utilization over the analysis period`
          : `${Math.round(totalSpend / 500)} instances with CPU usage below 15% for 30+ days`,
        potentialSavings: idleSavings,
        priority: 'high',
        category: 'optimization',
        steps: [
          'Identify VMs with average CPU < 15% over the last 30 days',
          'Downsize to appropriate instance families (e.g., t3a.nano for burstable workloads)',
          'Set up auto-scaling to match demand',
          'Schedule start/stop for non-production instances during off-hours',
          'Review and terminate orphaned instances',
        ],
        impact: `Eliminating idle compute reduces monthly cloud bill by ${money(idleSavings)} while maintaining performance headroom`,
        confidence: Math.min(95, 75 + Math.round(totalSpend / 5000)),
        action: 'Review compute utilization and downsize idle instances',
        timestamp: now.toISOString(),
      });
      timeline.push({
        id: 'tl-1', date: now.toISOString(), type: 'optimization',
        title: 'Idle VM Detection', detail: `Potential savings of ${money(idleSavings)}/month from underutilized compute`,
        priority: 'high',
      });
    }

    // --- 2. Oversized VMs ---
    if (totalSpend > 8000) {
      const oversizedSavings = Math.round(totalSpend * 0.08);
      recommendations.push({
        id: 'rec-2',
        icon: 'TrendingUp',
        title: 'Oversized Virtual Machines',
        resource: topService ? `${topService.provider || 'Cloud'} - ${topService.service_name || 'General Purpose VMs'}` : 'EC2 / VM Instances',
        issue: 'Multiple instances provisioned at sizes exceeding workload requirements (e.g., m5.xlarge where m5.large suffices)',
        potentialSavings: oversizedSavings,
        priority: 'high',
        category: 'optimization',
        steps: [
          'Run Azure Advisor / AWS Trusted Advisor right-sizing recommendations',
          'Analyze peak CPU, memory, and network utilization over 14-day window',
          'Right-size to next smaller instance family matching workload profile',
          'Apply 1-year or 3-year savings plans on the downsized configurations',
          'Monitor for 2 weeks post-migration to validate no performance regression',
        ],
        impact: `Downsizing over-provisioned VMs reduces monthly cost by ${money(oversizedSavings)} with zero performance impact for most workloads`,
        confidence: 88,
        action: 'Right-size over-provisioned VMs based on utilization metrics',
        timestamp: now.toISOString(),
      });
      timeline.push({
        id: 'tl-2', date: now.toISOString(), type: 'optimization',
        title: 'Oversized VM Detection', detail: `Right-sizing oversized VMs could save ${money(oversizedSavings)}/month`,
        priority: 'high',
      });
    }

    // --- 3. Unattached Disks ---
    const diskPattern = patterns.find(p => /disk|storage|ebs/i.test(p.service || ''));
    if (diskPattern || totalSpend > 2000) {
      const diskSavings = Math.round((diskPattern?.savings_potential || totalSpend) * 0.05);
      recommendations.push({
        id: 'rec-3',
        icon: 'Trash2',
        title: 'Unattached Disks & Storage Volumes',
        resource: 'Block Storage (EBS / Managed Disks)',
        issue: 'Orphaned storage volumes not attached to any instance but still incurring monthly costs',
        potentialSavings: diskSavings,
        priority: 'medium',
        category: 'waste',
        steps: [
          'List all unattached EBS volumes / Azure managed disks',
          'Verify no critical data exists (snapshot before deletion)',
          'Delete unattached volumes or attach to active instances',
          'Set up lifecycle policies to auto-delete unattached disks after N days',
          'Enable cost allocation tags to track storage ownership',
        ],
        impact: `Eliminating orphaned storage eliminates ${money(diskSavings)}/month in wasted spend on unused capacity`,
        confidence: 92,
        action: 'Identify and remove unattached storage volumes',
        timestamp: now.toISOString(),
      });
      timeline.push({
        id: 'tl-3', date: now.toISOString(), type: 'waste',
        title: 'Unattached Disk Detection', detail: `${money(diskSavings)}/month recoverable from orphaned storage`,
        priority: 'medium',
      });
    }

    // --- 4. Unused Public IPs ---
    recommendations.push({
      id: 'rec-4',
      icon: 'DollarSign',
      title: 'Unused Public IP Addresses',
      resource: 'Public IP Resources (AWS EIP / Azure Public IP / GCP External IP)',
      issue: 'Static public IPs allocated but not associated to any active resource, incurring hourly charges',
      potentialSavings: Math.round(Math.max(totalSpend * 0.02, 300)),
      priority: 'medium',
      category: 'waste',
      steps: [
        'Audit all elastic / static public IPs across accounts',
        'Release IPs not associated to running instances or load balancers',
        'Convert unassociated IPs to ephemeral where possible',
        'Set governance policy to notify on unused IP allocation',
        'Review monthly for idle IPs as part of cost review cadence',
      ],
      impact: `Freeing unused public IPs recovers wasted reservation costs and simplifies network management`,
      confidence: 85,
      action: 'Release unassociated public IP addresses',
      timestamp: now.toISOString(),
    });
    timeline.push({
      id: 'tl-4', date: now.toISOString(), type: 'waste',
      title: 'Unused Public IP Audit', detail: `${money(Math.round(Math.max(totalSpend * 0.02, 300)))}/month in idle IP charges`,
      priority: 'medium',
    });

    // --- 5. Low-Utilization Resources (pattern-based) ---
    if (patterns.length > 0) {
      const lowUtilPatterns = patterns.filter(p => /low|idle|waste|under/i.test(p.type || p.service || ''));
      const lowUtilSavings = lowUtilPatterns.reduce((s, p) => s + (p.savings_potential || 0), 0);
      if (lowUtilPatterns.length > 0 || totalSpend > 5000) {
        const savings = lowUtilSavings || Math.round(totalSpend * 0.06);
        recommendations.push({
          id: 'rec-5',
          icon: 'Activity',
          title: 'Low-Utilization Resources',
          resource: `${lowUtilPatterns.length} resource pattern${lowUtilPatterns.length !== 1 ? 's' : ''} identified`,
          issue: 'Services running well below capacity thresholds, wasting compute and storage allocation',
          potentialSavings: savings,
          priority: 'medium',
          category: 'optimization',
          steps: [
            'Review each low-utilization pattern for consolidation opportunities',
            'Use rightsizing recommendations from cloud provider tools',
            'Consolidate workloads onto fewer, efficiently-sized resources',
            'Implement auto-scaling for variable workloads',
            'Schedule non-production resources to stop during off-business hours',
          ],
          impact: `Optimizing ${lowUtilPatterns.length} low-utilization resource${lowUtilPatterns.length !== 1 ? 's' : ''} reduces monthly waste by ${money(savings)}`,
          confidence: 80,
          action: 'Optimize low-utilization resources across all providers',
          timestamp: now.toISOString(),
        });
        timeline.push({
          id: 'tl-5', date: now.toISOString(), type: 'optimization',
          title: 'Low-Utilization Resource Review',
          detail: `${lowUtilPatterns.length} underutilized resource${lowUtilPatterns.length !== 1 ? 's' : ''} found`,
          priority: 'medium',
        });
      }
    }

    // --- 6. Expensive Storage Tiers ---
    recommendations.push({
      id: 'rec-6',
      icon: 'Trash2',
      title: 'Expensive Storage Tier Optimization',
      resource: 'Object / Block Storage Services (S3 / Blob / Cloud Storage)',
      issue: 'Data stored in hot/standard tiers that has not been accessed for 30+ days — could be moved to cooler, cheaper tiers',
      potentialSavings: Math.round(Math.max(totalSpend * 0.04, 500)),
      priority: 'medium',
      category: 'savings',
      steps: [
        'Analyze storage access patterns using storage analytics tools',
        'Move infrequently accessed data (>30 days no read) to cool/archive tiers',
        'Implement automated lifecycle policies for tier transitions',
        'Enable compression and deduplication where supported',
        'Review snapshot retention and delete expired backups',
      ],
      impact: `Moving cold data to cheaper storage tiers reduces monthly storage costs by up to 60% on affected volumes`,
      confidence: 82,
      action: 'Move cold data to lower-cost storage tiers',
      timestamp: now.toISOString(),
    });
    timeline.push({
      id: 'tl-6', date: now.toISOString(), type: 'savings',
      title: 'Storage Tier Optimization', detail: `${money(Math.round(Math.max(totalSpend * 0.04, 500)))}/month potential from tiering`,
      priority: 'medium',
    });

    // --- 7. Missing Reservations / Savings Plans ---
    const anyProviderSpend = Object.keys(providerTotals).filter(k => providerTotals[k] > 0);
    if (anyProviderSpend.length > 0) {
      const topProviderName = anyProviderSpend.sort((a, b) => (providerTotals[b] || 0) - (providerTotals[a] || 0))[0];
      const topSpend = providerTotals[topProviderName] || 0;
      const rsvSavings = Math.round(topSpend * 0.32);
      if (topSpend > 3000) {
        recommendations.push({
          id: 'rec-7',
          icon: 'DollarSign',
          title: `Missing ${topProviderName} Reserved Capacity`,
          resource: `${topProviderName} - Core Compute Services`,
          issue: `On-demand pricing for ${topProviderName} compute — no reserved instances or savings plans active, missing 32% discount`,
          potentialSavings: rsvSavings,
          priority: 'high',
          category: 'savings',
          steps: [
            `Analyze ${topProviderName} consistent compute usage over the last 30 days`,
            'Purchase 1-year or 3-term reserved instances / savings plans for baseline workloads',
            'Cover 80% of baseline usage with reservations, leave 20% for spot/flexible',
            `Set up AWS Cost Explorer / Azure Cost Management reservation recommendations`,
            'Review and modify reservations quarterly to match changing demand',
          ],
          impact: `Committing to reserved capacity locks in a 32% discount, saving ${money(rsvSavings)}/month on ${topProviderName} compute`,
          confidence: 90,
          action: 'Purchase reserved instances or savings plans for consistent workloads',
          timestamp: now.toISOString(),
        });
        timeline.push({
          id: 'tl-7', date: now.toISOString(), type: 'savings',
          title: `${topProviderName} Savings Plan Opportunity`,
          detail: `32% discount available — save ${money(rsvSavings)}/month with reservations`,
          priority: 'high',
        });
      }
    }

    // --- 8. Resource Cost Anomalies ---
    const anomalyCount = anomalies.length;
    if (anomalyCount > 0) {
      const anomalySavings = Math.round(anomalyCount * 1200);
      const topAnomaly = anomalies[0];
      recommendations.push({
        id: 'rec-8',
        icon: 'AlertTriangle',
        title: 'Resource Cost Anomalies',
        resource: topAnomaly ? `${topAnomaly.provider || 'Cloud'} - ${topAnomaly.service || 'Unknown Service'}` : 'Multiple Services',
        issue: anomalyCount + ' unusual spending pattern' + (anomalyCount > 1 ? 's' : '') + ' detected' + (topAnomaly ? ', with the largest on ' + (topAnomaly.date || 'recent dates') : ''),
        potentialSavings: anomalySavings,
        priority: anomalyCount > 3 ? 'high' : anomalyCount > 1 ? 'medium' : 'low',
        category: 'anomaly',
        steps: [
          'Investigate each flagged anomaly for root cause',
          'Check for recent deployments, scaling events, or pricing changes',
          'Set up budget alerts and anomaly detection thresholds',
          'Create automated remediation workflows (e.g., stop runaway instances)',
          'Tag resources by cost center for faster anomaly attribution',
        ],
        impact: `Investigating and resolving ${anomalyCount} anomal${anomalyCount > 1 ? 'ies' : 'y'} prevents recurring unexpected charges and stabilizes monthly billing`,
        confidence: Math.max(70, 95 - anomalyCount * 3),
        action: 'Investigate flagged anomalies and set up automated alerts',
        timestamp: now.toISOString(),
      });
      timeline.push({
        id: 'tl-8', date: now.toISOString(), type: 'anomaly',
        title: `${anomalyCount} Cost Anomal${anomalyCount > 1 ? 'ies' : 'y'}`,
        detail: 'Unusual spend detected' + (topAnomaly ? ' on ' + (topAnomaly.provider || '') + ' ' + (topAnomaly.service || '') : ''),
        priority: anomalyCount > 3 ? 'high' : 'medium',
      });
    }

    // --- 9. Sudden Cost Spikes ---
    if (dailyCosts.length > 3) {
      const costs = dailyCosts.map(d => Number(d.cost || d.total_cost || 0));
      const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
      const maxCost = Math.max(...costs);
      const spikeRatio = avgCost > 0 ? maxCost / avgCost : 1;
      if (spikeRatio > 1.5 && maxCost > 1000) {
        const spikeSavings = Math.round((maxCost - avgCost) * 0.5);
        recommendations.push({
          id: 'rec-9',
          icon: 'TrendingUp',
          title: 'Sudden Cost Spikes Detected',
          resource: 'Daily Cost Trends',
          issue: `Daily spend spiked to ${money(maxCost)} — ${Math.round((spikeRatio - 1) * 100)}% above the ${money(Math.round(avgCost))} daily average`,
          potentialSavings: spikeSavings,
          priority: 'high',
          category: 'anomaly',
          steps: [
            'Identify the specific date and services driving the spike',
            'Cross-reference with deployment events, scaling activities, or pricing changes',
            'Implement real-time cost anomaly alerts via webhook or email',
            'Set daily budget thresholds with automatic notifications',
            'Create a cost incident response runbook for future spikes',
          ],
          impact: `Identifying the root cause of cost spikes prevents recurrence — recoverable waste estimated at ${money(spikeSavings)}`,
          confidence: 75,
          action: 'Analyze cost spike root cause and set preventive alerts',
          timestamp: now.toISOString(),
        });
        timeline.push({
          id: 'tl-9', date: now.toISOString(), type: 'anomaly',
          title: 'Cost Spike Alert', detail: `Daily spend ${Math.round((spikeRatio - 1) * 100)}% above average detected`,
          priority: 'high',
        });
      }
    }

    // --- 10. Resource Optimization (across providers) ---
    const totalProviderKeys = Object.keys(providerTotals).filter(k => providerTotals[k] > 0);
    if (totalProviderKeys.length > 0) {
      const optSavings = Math.round(totalSpend * 0.1);
      recommendations.push({
        id: 'rec-10',
        icon: 'Activity',
        title: 'Cross-Provider Resource Optimization',
        resource: `${totalProviderKeys.join(', ')} — All Services`,
        issue: `Combined spend of ${money(totalSpend)} across ${totalProviderKeys.length} provider${totalProviderKeys.length > 1 ? 's' : ''} with optimization opportunities in compute, storage, and networking`,
        potentialSavings: optSavings,
        priority: 'medium',
        category: 'optimization',
        steps: [
          'Consolidate multi-cloud visibility into a single FinOps dashboard',
          'Identify workloads that can be moved to spot/preemptible instances',
          'Negotiate enterprise discounts based on total cloud commitment',
          'Implement tagging strategy for cost allocation and chargeback',
          'Schedule weekly cost review meetings to track optimization progress',
        ],
        impact: `A systematic optimization program across all cloud providers delivers ${money(optSavings)}/month in recurring savings`,
        confidence: 78,
        action: 'Implement cross-provider cost optimization strategy',
        timestamp: now.toISOString(),
      });
      timeline.push({
        id: 'tl-10', date: now.toISOString(), type: 'optimization',
        title: 'Cross-Provider Optimization Opportunity',
        detail: `${money(optSavings)}/month in potential savings from a unified cloud cost strategy`,
        priority: 'medium',
      });
    }

    // Budget check
    const totalBudget = Object.values(providerBudgets).reduce((s, v) => s + Number(v), 0) || globalBudget;
    if (totalBudget > 0 && totalSpend > totalBudget * 0.85) {
      const overrunRisk = totalSpend > totalBudget ? 'overrun' : 'approaching limit';
      recommendations.push({
        id: 'rec-budget',
        icon: 'TrendingUp',
        title: overrunRisk === 'overrun' ? 'Budget Overrun' : 'Budget Limit Approaching',
        resource: 'Overall Cloud Budget',
        issue: `Spending at ${Math.round(totalSpend / totalBudget * 100)}% of total budget — ${overrunRisk === 'overrun' ? 'currently exceeding' : 'approaching'} the ${money(totalBudget)} limit`,
        potentialSavings: Math.round((totalSpend - totalBudget) * 0.5),
        priority: 'high',
        category: 'budget',
        steps: [
          `Immediately review top ${Math.min(5, totalProviderKeys.length)} cost-driving services`,
          'Set granular budget alerts at 80%, 90%, and 100% thresholds',
          'Implement automated shutdown policies for non-critical resources',
          'Align budget to actual usage patterns and re-forecast for next period',
          'Escalate to engineering leads for each cost center',
        ],
        impact: `Staying within budget prevents overspend and ensures predictable cloud costs — action needed now to avoid ${money(Math.round((totalSpend - totalBudget) * 0.5))} excess charges`,
        confidence: 95,
        action: overrunRisk === 'overrun' ? 'Review and adjust budget allocations' : 'Set spending alerts before hitting limits',
        timestamp: now.toISOString(),
      });
      timeline.push({
        id: 'tl-budget', date: now.toISOString(), type: 'budget',
        title: overrunRisk === 'overrun' ? 'Budget Overrun Detected' : 'Budget Limit Approaching',
        detail: `Spending at ${Math.round(totalSpend / totalBudget * 100)}% of allocated budget`,
        priority: 'high',
      });
    }

    const avgMonthlySavings = recommendations.reduce((s, r) => s + r.potentialSavings, 0);
    const baselineSpend = totalSpend || 10000;
    const anomalyFactorVal = Math.min(anomalyCount * 5, 30);
    const budgetFactorVal = totalBudget > 0 && totalSpend > totalBudget ? 15 : 0;
    const wasteFactorVal = Math.min(Math.round(avgMonthlySavings / baselineSpend * 20), 20);
    const newScore = Math.max(35, Math.min(98, 78 + wasteFactorVal - anomalyFactorVal - budgetFactorVal));
    setFinancialHealthScore(newScore);

    recommendations.forEach(rec => {
      addAiNotification(rec.title, rec.issue, rec.priority);
    });

    setAiRecommendations(recommendations);
    setAiInsightsTimeline(timeline);
    setDetailedSavings(computeDetailedSavings(dashboardData));
    setIsAiAnalyzing(false);
  };

  const computeDetailedSavings = (data) => {
    if (!data || !data.service_breakdown) return null;
    const breakdown = data.service_breakdown || [];
    const totalCost = data.total_cost || 0;
    const recommendations = data.recommendations || [];

    const computeKeywords = ['EC2', 'VM', 'Compute', 'Lambda', 'Functions', 'ECS', 'EKS', 'AKS', 'GKE', 'App Service', 'Cloud Run', 'Container'];
    const storageKeywords = ['S3', 'Blob', 'Cloud Storage', 'EBS', 'Disk', 'Storage', 'Backup', 'Archive', 'Glacier'];
    const networkKeywords = ['NAT', 'VPN', 'Load Balancer', 'ELB', 'ALB', 'Traffic', 'CloudFront', 'CDN', 'Direct Connect', 'ExpressRoute', 'Networking', 'IP', 'DNS'];

    let computeCost = 0, storageCost = 0, networkCost = 0, otherCost = 0;
    breakdown.forEach(item => {
      const svc = item.service || '';
      const cost = item.monthly_cost || item.daily_cost * 30 || 0;
      if (computeKeywords.some(k => svc.includes(k))) computeCost += cost;
      else if (storageKeywords.some(k => svc.includes(k))) storageCost += cost;
      else if (networkKeywords.some(k => svc.includes(k))) networkCost += cost;
      else otherCost += cost;
    });

    if (computeCost === 0 && storageCost === 0 && networkCost === 0 && otherCost === 0) {
      computeCost = totalCost * 0.45;
      storageCost = totalCost * 0.25;
      networkCost = totalCost * 0.10;
      otherCost = totalCost * 0.20;
    }

    const reservationSavings = recommendations.reduce((s, r) => s + (r.estimated_monthly_savings || 0), 0);
    const lowUtilBreakdown = breakdown.filter(b => (b.avg_daily_usage || 50) < 30);
    const idleFrac = lowUtilBreakdown.length / Math.max(breakdown.length, 1);

    const idleCost = Math.round(computeCost * (0.15 + idleFrac * 0.1));
    const categories = [
      {
        id: 'idle-resources', name: 'Idle Resources',
        desc: 'Resources running with zero or negligible workload',
        icon: 'Clock',
        currentCost: idleCost,
        optimizedCost: 0,
        savings: idleCost,
        percentage: Math.round((0.15 + idleFrac * 0.1) * 100),
        steps: [
          'Identify all resources with <5% CPU/memory utilization over the past 14 days',
          'Stop or terminate idle instances after verifying no critical workloads depend on them',
          'Set up auto-scheduled start/stop for non-production environments',
          'Use rightsizing recommendations from cloud provider tools',
          'Implement automated policies to detect and alert on new idle resources',
        ],
        impact: 'Eliminating idle resources eliminates 100% of their cost without impacting actual workloads, delivering immediate savings.',
      },
      {
        id: 'underutilized-vms', name: 'Underutilized Virtual Machines',
        desc: 'VMs consistently using less than 20% of allocated capacity',
        icon: 'Server',
        currentCost: Math.round(computeCost * 0.40),
        optimizedCost: Math.round(computeCost * 0.25),
        savings: Math.round(computeCost * 0.15),
        percentage: 15,
        steps: [
          'Analyze CPU, memory, and network utilization patterns over 30 days for each VM',
          'Downsize VMs to the next appropriate instance tier based on peak utilization',
          'Consider burstable instance families (e.g., AWS T-series, Azure B-series) for variable workloads',
          'Move consistent low-utilization workloads to shared infrastructure or serverless',
          'Use reserved instances for right-sized VMs to maximize additional savings',
        ],
        impact: 'Right-sizing VMs typically reduces compute cost by 15-30% while maintaining equivalent application performance.',
      },
      {
        id: 'unattached-disks', name: 'Unattached Managed Disks',
        desc: 'Storage disks not attached to any running instance',
        icon: 'HardDrive',
        currentCost: Math.round(storageCost * 0.35),
        optimizedCost: Math.round(storageCost * 0.27),
        savings: Math.round(storageCost * 0.08),
        percentage: 8,
        steps: [
          'List all managed disks without an active VM association across all regions',
          'Verify disk contents for any critical data that must be retained',
          'Delete unattached disks with no important data',
          'Snapshot important disks before deletion as a backup, then delete the disk',
          'Set up lifecycle policies to automatically delete unattached disks older than 30 days',
        ],
        impact: 'Unattached disks incur storage costs without providing any value — reclaiming them recovers 100% of their cost.',
      },
      {
        id: 'unused-ips', name: 'Unused Public IPs',
        desc: 'Allocated public IP addresses with no active association',
        icon: 'Globe',
        currentCost: Math.round(networkCost * 0.45),
        optimizedCost: Math.round(networkCost * 0.40),
        savings: Math.round(networkCost * 0.05),
        percentage: 5,
        steps: [
          'Audit all allocated public IPs and identify those not associated with any resource',
          'Check for IPs attached to stopped/terminated resources that were never released',
          'Release unassociated IPs to stop billing immediately',
          'Use Elastic IP / Reserved IP management tools to prevent future waste',
          'Implement tagging and monitoring for public IP allocation',
        ],
        impact: 'Unused public IPs are a pure waste — releasing them has zero downside and immediate billing impact.',
      },
      {
        id: 'storage-optimization', name: 'Storage Optimization',
        desc: 'Move cold data to lower-cost tiers and delete stale snapshots',
        icon: 'Database',
        currentCost: Math.round(storageCost * 0.50),
        optimizedCost: Math.round(storageCost * 0.38),
        savings: Math.round(storageCost * 0.12),
        percentage: 12,
        steps: [
          'Classify storage by access frequency — hot, warm, cold, and archive tiers',
          'Move data not accessed in 30+ days to lower-cost storage tiers (S3 Infrequent Access, Azure Cool Blob, etc.)',
          'Delete stale EBS snapshots, especially those older than 90 days',
          'Implement object lifecycle policies to auto-migrate data to cheaper tiers over time',
          'Use storage analytics tools to identify duplicate and redundant data',
        ],
        impact: 'Storage tier optimization typically reduces storage costs by 30-50% for cold data while maintaining full accessibility.',
      },
      {
        id: 'reservation-opportunities', name: 'Reservation Opportunities',
        desc: 'Commit to reserved pricing for steady-state workloads',
        icon: 'Calendar',
        currentCost: Math.round(computeCost * 0.35),
        optimizedCost: Math.round(computeCost * 0.24),
        savings: Math.round(reservationSavings || computeCost * 0.11),
        percentage: Math.round(reservationSavings && totalCost > 0 ? reservationSavings / totalCost * 100 : 11),
        steps: [
          'Identify steady-state workloads that run 24/7 with predictable resource usage',
          'Analyze 1-year vs 3-year commitment trade-offs based on workload stability',
          'Use reserved instance recommendations from AWS Cost Explorer, Azure Advisor, or GCP Recommender',
          'Consider convertible reserved instances for flexibility if workload may change',
          'Apply reservations to the largest, most stable resources first for maximum savings',
        ],
        impact: 'Reserved instances can reduce compute costs 30-50% compared to on-demand pricing with minimal operational change.',
      },
    ];

    const totalSavings = categories.reduce((s, c) => s + c.savings, 0);
    const highestImpact = categories.reduce((best, c) => c.savings > best.savings ? c : best, categories[0]);

    return {
      categories,
      summary: {
        totalPotentialSavings: Math.round(totalSavings * 12),
        monthlySavings: totalSavings,
        highestImpactRecommendation: highestImpact.name,
        highestImpactSavings: highestImpact.savings,
        breakdown: categories.map(c => ({
          name: c.name,
          savings: c.savings,
          pct: totalSavings > 0 ? Math.round(c.savings / totalSavings * 100) : 0,
        })),
      },
    };
  };

  const totalUnreadNotifications = useMemo(() => {
    return aiNotifications.filter(n => !n.read).length;
  }, [aiNotifications]);

  const unreadPriorityCounts = useMemo(() => {
    const unread = aiNotifications.filter(n => !n.read);
    return {
      high: unread.filter(n => n.priority === 'high').length,
      medium: unread.filter(n => n.priority === 'medium').length,
      low: unread.filter(n => n.priority === 'low').length,
    };
  }, [aiNotifications]);

  useEffect(() => {
    if (activePage === 'savings' && dashboardData && isAuthenticated) {
      setDetailedSavings(computeDetailedSavings(dashboardData));
    }
  }, [activePage, dashboardData]);

  useEffect(() => {
    if (activePage === 'profile') {
      setProfileEditName(profileName);
      setProfileEditEmail(loggedInEmail || '');
      setProfileEditAvatar(profileAvatar);
      setAvatarChanged(false);
      setProfileMessage(null);
    }
  }, [activePage]);

  useEffect(() => {
    sidebarCollapsed
      ? localStorage.setItem('finops_sidebar_collapsed', 'true')
      : localStorage.setItem('finops_sidebar_collapsed', 'false');
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('finops_currency', activeCurrency);
  }, [activeCurrency]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let totalSpend = providerTotals ? Object.values(providerTotals).reduce((a, b) => a + b, 0) : 0;
    if (totalSpend === 0 && dashboardData?.total_cost) totalSpend = Number(dashboardData.total_cost);
    const alreadyNotified = new Set(
      JSON.parse(localStorage.getItem('finops_budget_overrun_notified') || '[]')
    );
    const smsSent = new Set(
      JSON.parse(localStorage.getItem('finops_budget_sms_notified') || '[]')
    );
    const newOverruns = [];
    const smsToSend = [];
    const smsToRemove = [];

    Object.entries(providerTotals).forEach(([provider, spend]) => {
      const budget = Number(providerBudgets[provider] || 0);
      const smsKey = `sms:provider:${provider}`;
      if (budget > 0 && spend <= budget && smsSent.has(smsKey)) {
        smsToRemove.push(smsKey);
      }
      if (budget > 0 && spend > budget) {
        const key = `provider:${provider}:${Math.floor(spend / budget * 100)}`;
        if (!alreadyNotified.has(key)) {
          newOverruns.push(key);
          const msg = `${provider} spending of ${money(spend)} exceeds the ${money(budget)} budget by ${money(spend - budget)}.`;
          addAiNotification(`${provider} Budget Overrun`, msg, 'high');
          setBudgetOverrunBanner(`⚠ ${provider} Budget Overrun — ${msg}`);
          showNotification(`⚠ ${provider} Budget Overrun`, 'error');
        }
        if (!smsSent.has(smsKey)) {
          smsToSend.push({ current_cost: spend, budget, smsKey });
        }
      }
    });

    const globalBudgetVal = Number(globalBudget || 0);
    const globalSmsKey = 'sms:global';
    if (globalBudgetVal > 0 && totalSpend <= globalBudgetVal && smsSent.has(globalSmsKey)) {
      smsToRemove.push(globalSmsKey);
    }
    if (globalBudgetVal > 0 && totalSpend > globalBudgetVal) {
      const key = `global:${Math.floor(totalSpend / globalBudgetVal * 100)}`;
      if (!alreadyNotified.has(key)) {
        newOverruns.push(key);
        const msg = `Total spending of ${money(totalSpend)} exceeds the global budget of ${money(globalBudgetVal)} by ${money(totalSpend - globalBudgetVal)}.`;
        addAiNotification('Global Budget Overrun', msg, 'high');
        setBudgetOverrunBanner(`⚠ Global Budget Overrun — ${msg}`);
        showNotification(`⚠ Global Budget Overrun`, 'error');
      }
      const smsKey = 'sms:global';
      if (!smsSent.has(smsKey)) {
        smsToSend.push({ current_cost: totalSpend, budget: globalBudgetVal, smsKey });
      }
    }

    if (newOverruns.length > 0) {
      localStorage.setItem(
        'finops_budget_overrun_notified',
        JSON.stringify([...alreadyNotified, ...newOverruns])
      );
    }

    smsToRemove.forEach((k) => smsSent.delete(k));

    if (smsToRemove.length > 0 || smsToSend.length > 0) {
      localStorage.setItem('finops_budget_sms_notified', JSON.stringify([...smsSent]));
    }

    smsToSend.forEach(({ current_cost, budget, smsKey }) => {
      smsSent.add(smsKey);
      localStorage.setItem('finops_budget_sms_notified', JSON.stringify([...smsSent]));
      authFetch('/api/budgets/send-sms-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_cost, budget }),
      }).catch(() => {});
    });
  }, [dashboardData, providerTotals, globalBudget, providerBudgets]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (notificationCenterRef.current && !notificationCenterRef.current.contains(event.target)) {
        setShowNotificationCenter(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showNotificationCenter]);

  useEffect(() => {
    if (!notification) return;
    const timeout = setTimeout(() => setNotification(''), 3200);
    return () => clearTimeout(timeout);
  }, [notification]);

  const authFetch = async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
    const response = await fetch(`${API}${path}`, { ...options, headers });
    if (response.status === 401) {
      clearAuth();
      showNotification('Session expired. Please login again.', 'error');
      throw new Error('Session expired. Please login again.');
    }
    return response;
  };

  useEffect(() => {
    if (!authToken) {
      setValidatingAuth(false);
      return;
    }

    setValidatingAuth(true);
    authFetch('/api/auth/validate')
      .then((res) => res.json())
      .then((data) => {
        if (data.email) {
          const displayName = data.name || data.email;
          localStorage.setItem('finops_auth_name', displayName);
          localStorage.setItem('finops_auth_email', data.email);
          if (data.avatar) {
            localStorage.setItem('finops_auth_avatar', data.avatar);
            setProfileAvatar(data.avatar);
          }
          setLoggedInUser(displayName);
          setLoggedInEmail(data.email);
          setIsAuthenticated(true);
        } else {
          clearAuth();
        }
      })
      .catch(() => clearAuth())
      .finally(() => setValidatingAuth(false));
  }, [authToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoadingReport(true);
    const params = new URLSearchParams({ persona });
    Object.entries(activeFilters).forEach(([field, value]) => {
      if (value && value !== 'All') {
        params.set(field, value);
      }
    });
    authFetch(`/api/reports/persona?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setReport(data);
        setLoadingReport(false);
      })
      .catch(() => setLoadingReport(false));
  }, [persona, activeFilters, isAuthenticated]);

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const updateProviderBudget = (provider, value) => {
    const numeric = Math.max(Number(value || 0), 0);
    setProviderBudgets((prev) => {
      const next = { ...prev, [provider]: numeric };
      localStorage.setItem('finops_provider_budgets', JSON.stringify(next));
      return next;
    });
  };

  const notifKey = (notif) => `${notif.title}::${notif.detail}`;

  const markNotificationRead = (notif) => {
    const key = notifKey(notif);
    setReadNotifications((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      localStorage.setItem('finops_read_notifications', JSON.stringify(next));
      return next;
    });
  };

  const markAllNotificationsRead = () => {
    const keys = overviewNotifications.filter(n => n.tone !== 'emerald').map(notifKey);
    setReadNotifications((prev) => {
      const next = [...new Set([...prev, ...keys])];
      localStorage.setItem('finops_read_notifications', JSON.stringify(next));
      return next;
    });
  };

  const unreadNotifications = useMemo(
    () => overviewNotifications.filter((n) => !readNotifications.includes(notifKey(n))),
    [overviewNotifications, readNotifications]
  );

  const prevNotifiedAlerts = useRef(new Set());
  useEffect(() => {
    if (!isAuthenticated || !dashboardData) return;
    const activeAlertKeys = new Set();
    unreadNotifications.forEach((notif) => {
      if (notif.tone !== 'emerald') {
        const key = `${notif.title}-${notif.detail}`;
        activeAlertKeys.add(key);
        if (!prevNotifiedAlerts.current.has(key)) {
          showNotification(
            `${notif.title}: ${notif.detail}`,
            notif.tone === 'rose' ? 'error' : 'success'
          );
        }
      }
    });
    prevNotifiedAlerts.current = activeAlertKeys;
  }, [unreadNotifications, isAuthenticated, dashboardData]);

  const handleSelectAnomaly = (anomaly) => {
    setLoadingTrend(true);
    const provider = encodeURIComponent(anomaly.provider);
    const service = encodeURIComponent(anomaly.service);
    const date = anomaly.date;

    authFetch(`/api/anomalies/trend?provider=${provider}&service=${service}&date=${date}`)
      .then((res) => {
        if (!res.ok) throw new Error('Could not find trend context.');
        return res.json();
      })
      .then((trendData) => {
        setSelectedAnomaly({ ...anomaly, trend: trendData });
        setLoadingTrend(false);
      })
      .catch((err) => {
        console.error('Error loading trend data:', err);
        setLoadingTrend(false);
      });
  };

  const handleNewChat = () => {
    if (chatHistory.length > 1) {
      const newConv = {
        id: Date.now().toString(),
        title: chatHistory[1]?.text?.slice(0, 60) || 'New conversation',
        timestamp: Date.now(),
        messages: chatHistory,
        sessionId,
      };
      const updated = [newConv, ...conversations].slice(0, 50);
      saveConversations(updated);
    }
    setChatHistory([
      { role: 'assistant', text: "Hello, I'm your FinOps AI Assistant. Ask me anything about your cloud spending, cost anomalies, or savings opportunities across AWS, Azure, and GCP." },
    ]);
    setSessionId(null);
    setActiveConversationId(null);
  };

  const handleDeleteConversation = (id, e) => {
    e.stopPropagation();
    const updated = conversations.filter(c => c.id !== id);
    saveConversations(updated);
    if (activeConversationId === id) {
      handleNewChat();
    }
  };

  const handleSelectConversation = (conv) => {
    setActiveConversationId(conv.id);
    setChatHistory(conv.messages);
    setSessionId(conv.sessionId || null);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput;
    setChatHistory((prev) => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await authFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, session_id: sessionId, filters: activeFilters, budgets }),
      });
      const data = await response.json();
      if (data.session_id && !sessionId) setSessionId(data.session_id);
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.response,
          reportPdfUrl: data.report_pdf_url,
          reportPersona: data.report_persona,
          reportFilename: data.report_filename,
        },
      ]);
    } catch (err) {
      setChatHistory((prev) => [...prev, { role: 'assistant', text: err.message || 'Network error. Is backend API running?' }]);
    } finally {
      setIsChatLoading(false);
    }
  };



  const handleDownloadBlob = async (format, teamOverride = selectedTeam) => {
    setIsDownloadingPdf(true);
    try {
      const params = new URLSearchParams({ persona });
      Object.entries(activeFilters).forEach(([field, value]) => {
        if (value && value !== 'All') {
          params.set(field, value);
        }
      });
      if (teamOverride) params.set('team', teamOverride);

      const endpoint = format === 'pdf' ? '/api/reports/persona/pdf'
        : format === 'ppt' ? '/api/reports/persona/ppt'
        : '/api/reports/persona/xlsx';
      const mediaTypes = {
        pdf: 'application/pdf',
        ppt: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const extensions = { pdf: 'pdf', ppt: 'pptx', xlsx: 'xlsx' };

      const res = await authFetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`${format} endpoint error:`, res.status, errText);
        showNotification(`${format.toUpperCase()} generation failed (${res.status}).`, 'error');
        return;
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes(mediaTypes[format])) {
        const errText = await res.text();
        console.error(`Expected ${format} but got:`, contentType, errText);
        showNotification(`Server did not return a ${format.toUpperCase()}. Check backend logs.`, 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const teamSlug = teamOverride ? `_${teamOverride.toLowerCase().replace(/\s+/g, '_')}` : '';
      a.download = `${persona}${teamSlug}_report.${extensions[format]}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error(`${format} download failed:`, err);
      showNotification(`${format.toUpperCase()} download failed. Check authentication and backend.`, 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleReportDownload = (format) => {
    setShowDownloadModal(false);
    handleDownloadBlob(format);
  };

  const handleSearchSelect = (item) => {
    if (item.pageId) {
      setActivePage(item.pageId);
    }
    if (item.kind === 'service' && item.service) {
      setSelectedServiceTrend(item.service);
    }
    if (item.kind === 'report' && item.persona) {
      setPersona(item.persona);
    }
    if (item.kind === 'conversation' && item.conversationId) {
      const conversation = conversations.find((entry) => entry.id === item.conversationId);
      if (conversation) {
        handleSelectConversation(conversation);
        setIsChatOpen(true);
      }
    }
    setSearchOpen(false);
    setSearchQuery('');
  };

  const reportSchedule = useMemo(() => {
    const schedules = {
      finance: { label: 'Daily', interval: 86400000 },
      engineering: { label: 'Weekly', interval: 604800000 },
      executive: { label: 'Monthly', interval: 2592000000 },
    };
    return schedules[persona] || schedules.executive;
  }, [persona]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    const email = authEmail.trim().toLowerCase();
    const payload = authMode === 'signup'
      ? { name: authName.trim(), email, password: authPassword }
      : { email, password: authPassword };

    if (authMode === 'signup' && !payload.name) {
      setAuthError('Name is required.');
      return;
    }
    if (!email || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setAuthError('Enter a valid email address.');
      return;
    }

    try {
      const response = await fetch(`${API}/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        setAuthError(error.detail || 'Authentication failed.');
        return;
      }

      const data = await response.json();
      saveAuth(data.name || data.email, data.email, data.auth_token);
      setAuthName('');
      setAuthEmail('');
      setAuthPassword('');
      setSessionId(null);
      showNotification(authMode === 'login' ? 'Logged in successfully.' : 'Account created successfully.');
    } catch {
      showNotification('Unable to connect to the backend.', 'error');
      setAuthError('Unable to connect to the backend.');
    }
  };

  const handleLogout = () => {
    clearAuth();
    showNotification('Logged out successfully.', 'success');
  };

  if (!isAuthenticated) {
    if (validatingAuth) {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-700">
          <NotificationToast message={notification} type={notificationType} />
          <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-6 py-4 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-700">Validating session...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8 text-slate-900">
        <NotificationToast message={notification} type={notificationType} />
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4">
              <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto h-14 w-14">
                <circle cx="28" cy="28" r="27" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.3" />
                <circle cx="28" cy="28" r="22" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.15" />
                <path d="M16 35C12.5 35 10.5 32.2 10.5 29C10.5 25.8 12.5 23.8 15.5 23.3C16.2 19.5 19 16.5 23 16.5C25 16.5 26.8 17.3 28.2 18.7C29.2 17.7 30.5 17.2 32 17.2C35.5 17.2 38.5 20 38.5 23.5C38.5 23.8 38.5 24 38.3 24.3C41.3 24.8 43.5 27.3 43.5 30C43.5 33.2 41 35.5 38 35.5H16Z" fill="white" fillOpacity="0.95" />
                <rect x="18" y="32" width="4.5" height="4.5" rx="1" fill="#10b981" fillOpacity="0.9" />
                <rect x="24" y="29" width="4.5" height="7.5" rx="1" fill="#10b981" fillOpacity="0.9" />
                <rect x="30" y="26" width="4.5" height="10.5" rx="1" fill="#10b981" fillOpacity="0.9" />
                <circle cx="41" cy="15" r="2.5" fill="#34d399" />
                <circle cx="41" cy="15" r="5" stroke="#34d399" strokeWidth="0.7" strokeOpacity="0.4" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">FinOps Intelligence</h1>
            <p className="mt-2 text-sm text-slate-500">Multi-cloud Dashboard</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              {['login', 'signup'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setAuthMode(mode);
                    setAuthName('');
                    setAuthEmail('');
                    setAuthPassword('');
                    setAuthError('');
                  }}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    authMode === mode ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'login' ? 'Login' : 'Sign up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Name</label>
                  <input
                    value={authName}
                    onChange={(e) => {
                      setAuthName(e.target.value);
                      if (authError) setAuthError('');
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => {
                    setAuthEmail(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              {authError && <p className="text-sm text-rose-600">{authError}</p>}
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98]"
              >
                {authMode === 'login' ? 'Login' : 'Create account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-700">
        <NotificationToast message={notification} type={notificationType} />
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-8 py-6 shadow-xl shadow-slate-200/50">
          <div className="relative">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <div className="absolute inset-0 h-8 w-8 animate-ping rounded-full bg-indigo-400/20" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-900">Loading FinOps workspace</p>
            <p className="mt-1 text-xs text-slate-400">Aggregating multi-cloud data...</p>
          </div>
        </div>
      </div>
    );
  }

  const sidebarNavItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'services', label: 'Services', icon: Server },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  const handleSidebarNav = (id) => {
    setActivePage(id);
    setSelectedAnomaly(null);
    setRecentlyVisited((prev) => {
      const next = [{ id, label: sidebarNavItems.find(n => n.id === id)?.label || id, timestamp: Date.now() }, ...prev.filter((r) => r.id !== id)].slice(0, 5);
      localStorage.setItem('finops_recently_visited', JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex">

      {/* PERMANENT LEFT SIDEBAR */}
      <aside className={`flex flex-col bg-white border-r border-slate-200 shadow-sm transition-all duration-300 z-40 ${sidebarCollapsed ? 'w-16' : 'w-60'}`}>
        {/* Logo area */}
        <div className={`flex items-center border-b border-slate-100 ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} h-14 shrink-0`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative h-8 w-8 shrink-0">
                <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
                  <circle cx="18" cy="18" r="17" stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.3" />
                  <circle cx="18" cy="18" r="14" stroke="#6366f1" strokeWidth="0.5" strokeOpacity="0.15" />
                  <path d="M10 22.5C7.5 22.5 6 20.8 6 19C6 17 7.5 15.8 9.5 15.5C10 13 12 11 15 11C16.5 11 17.8 11.6 18.8 12.5C19.5 11.8 20.4 11.5 21.5 11.5C24 11.5 26 13.5 26 16C26 16.2 26 16.3 25.9 16.5C28 16.8 29.5 18.5 29.5 20.5C29.5 22.8 27.8 24.5 25.5 24.5H10Z" fill="#6366f1" fillOpacity="0.15" />
                  <rect x="12" y="21" width="2.5" height="2.5" rx="0.5" fill="#6366f1" fillOpacity="0.5" />
                  <rect x="15.5" y="19" width="2.5" height="4.5" rx="0.5" fill="#6366f1" fillOpacity="0.5" />
                  <rect x="19" y="17.5" width="2.5" height="6" rx="0.5" fill="#6366f1" fillOpacity="0.5" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold tracking-tight text-slate-900 truncate">FinOps</h1>
                <p className="text-[10px] font-medium text-indigo-500 tracking-wider">Intelligence</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(v => !v)}
            className={`grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all ${sidebarCollapsed ? 'h-8 w-8 mx-auto' : 'ml-auto h-7 w-7'}`}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Profile widget */}
        <div className={`relative ${sidebarCollapsed ? 'px-2 py-3' : 'p-3'}`}>
          <button
            type="button"
            onClick={() => setProfileOpen(v => !v)}
            className={`flex w-full items-center gap-3 rounded-xl transition-all duration-200 hover:bg-slate-50 ${sidebarCollapsed ? 'justify-center p-2' : 'p-2.5'}`}
            title={sidebarCollapsed ? 'Profile' : undefined}
          >
            {profileAvatar ? (
              <img src={profileAvatar} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover ring-2 ring-slate-100 shadow-md shadow-indigo-200/50" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-bold shadow-md shadow-indigo-200/50">
                {(profileName || 'U')[0].toUpperCase()}
              </span>
            )}
            {!sidebarCollapsed && (
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-slate-900">{profileName}</span>
                <span className="block truncate text-[11px] text-slate-400">{profileEmail}</span>
              </span>
            )}
          </button>

          {profileOpen && (
            <div className={`absolute left-0 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 ${sidebarCollapsed ? 'bottom-full mb-2 left-12' : 'top-full mt-1'}`}>
              <div className="border-b border-slate-100 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Profile</p>
                <div className="mt-3 flex items-center gap-3">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-slate-100" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-bold shadow-sm">
                      {(profileName || 'U')[0].toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{profileName}</p>
                    <p className="truncate text-xs text-slate-500">{profileEmail}</p>
                  </div>
                </div>
              </div>
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => { setActivePage('profile'); setProfileOpen(false); }}
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  My Profile
                </button>
                <button
                  type="button"
                  onClick={() => { setActivePage('settings'); setProfileOpen(false); }}
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Account Settings
                </button>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); handleLogout(); }}
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          <div className={`${sidebarCollapsed ? 'text-center' : 'px-1'} py-2`}>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{sidebarCollapsed ? '' : 'Menu'}</span>
          </div>
          <div className="space-y-0.5">
            {sidebarNavItems.map(({ id, label, icon: Icon }) => {
              const isActive = activePage === id || (id === 'services' && servicePages.some((page) => page.id === activePage));
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSidebarNav(id)}
                  className={`group flex w-full items-center gap-3 rounded-lg text-left text-sm font-medium transition-all duration-200 ${
                    sidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title={sidebarCollapsed ? label : undefined}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition-all duration-200 ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600'
                  }`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="truncate">{label}</span>
                      {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Bottom section: Logout */}
        <div className={`border-t border-slate-100 ${sidebarCollapsed ? 'px-2 py-3' : 'p-3'}`}>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className={`group flex w-full items-center gap-3 rounded-lg text-left text-sm font-medium transition-all duration-200 ${
              sidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'
            } text-rose-600 hover:bg-rose-50`}
            title="Logout"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-500 group-hover:bg-rose-100">
              <span className="text-sm font-bold">⏻</span>
            </span>
            {!sidebarCollapsed && <span className="truncate">Logout</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">

      <NotificationToast message={notification} type={notificationType} />

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-14 items-center gap-3 px-4 sm:px-5">

          <div ref={searchWidgetRef} className="relative flex flex-1 items-center justify-center px-0">
            <label className="relative w-full max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search resources, services, and FinOps docs"
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition-all focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            {searchOpen && !searchQuery.trim() && (
              <div className="absolute left-0 top-full z-50 mt-2 w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-6 text-center shadow-xl">
                <Search className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">Start typing to search...</p>
              </div>
            )}

            {searchOpen && searchQuery.trim() && searchSuggestions.length > 0 && (
              <div className="absolute left-0 top-full z-50 mt-2 w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="max-h-[350px] overflow-y-auto p-1.5">
                  {searchSuggestions.map((item, index) => {
                    const Icon = item.icon || Search;
                    return (
                      <button
                        key={`${item.kind}-${item.title}-${index}`}
                        type="button"
                        onClick={() => handleSearchSelect(item)}
                        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.subtitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {searchOpen && searchQuery.trim() && searchSuggestions.length === 0 && (
              <div className="absolute left-0 top-full z-50 mt-2 w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-5 text-center shadow-xl">
                <p className="text-sm font-semibold text-slate-900">No results found</p>
                <div className="mt-3 text-xs text-slate-500">
                  <p>Suggestions:</p>
                  <ul className="mt-1.5 space-y-1">
                    <li>&bull; Check spelling</li>
                    <li>&bull; Try broader keywords</li>
                    <li>&bull; Search reports, costs, budgets, resources</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 lg:flex">
              <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
              <label htmlFor="threshold" className="text-xs font-medium text-slate-500">
                Threshold
              </label>
              <input
                id="threshold"
                type="number"
                step="0.5"
                min="1.0"
                value={anomalyThreshold}
                onChange={(e) => setAnomalyThreshold(parseFloat(e.target.value))}
                className="h-6 w-14 rounded-md border border-slate-200 bg-white px-2 text-center text-xs font-semibold text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

              <div className="hidden items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-indigo-600 xl:flex">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">API connected</span>
            </div>

            <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 xl:flex">
              <Wallet className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">{budgetBadgeText}</span>
            </div>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white">
                    {unreadNotifications.length}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <span className="text-xs font-semibold text-slate-900">Notifications</span>
                    <div className="flex items-center gap-2">
                      {unreadNotifications.filter(n => n.tone !== 'emerald').length > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition"
                        >
                          Mark all read
                        </button>
                      )}
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {unreadNotifications.filter(n => n.tone !== 'emerald').length} Active
                      </span>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {unreadNotifications.length === 0 ? (
                      <div className="py-6 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-cyan-300" />
                        <p className="mt-2 text-xs font-medium text-slate-500">All caught up!</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">No unread notifications.</p>
                      </div>
                    ) : (
                      unreadNotifications.map((notif, index) => {
                        const colors = {
                          rose: 'bg-rose-50 border-rose-100 text-rose-900 hover:bg-rose-100/50',
                          amber: 'bg-amber-50 border-amber-100 text-amber-900 hover:bg-amber-100/50',
                          emerald: 'bg-cyan-50 border-cyan-100 text-cyan-900 hover:bg-cyan-100/50',
                        }[notif.tone] || 'bg-slate-50 border-slate-100 text-slate-900';

                        const handleNotifClick = () => {
                          markNotificationRead(notif);
                          setIsNotifOpen(false);
                          if (notif.title.toLowerCase().includes('anomaly')) {
                            setActivePage('anomalies');
                          } else if (notif.title.toLowerCase().includes('budget')) {
                            setActivePage('budgets');
                          } else if (notif.title.toLowerCase().includes('savings idea') || notif.title.toLowerCase().includes('ai savings')) {
                            setActivePage('recommendations');
                          }
                        };

                        return (
                          <button
                            key={index}
                            onClick={handleNotifClick}
                            className={`mx-1 my-1 block rounded-lg border p-3 text-left text-xs leading-4 transition ${colors}`}
                          >
                            <div className="flex items-center gap-1.5 font-semibold">
                              {notif.tone === 'rose' && <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
                              {notif.tone === 'amber' && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                              {notif.tone === 'emerald' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-cyan-600" />}
                              {notif.title}
                            </div>
                            <div className="mt-1 opacity-90">{notif.detail}</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6`}>
        {/* Page content */}
        <div className="min-w-0 space-y-6">
          {/* SERVICES PAGE - Feature Hub */}
          {activePage === 'services' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">Services Hub</h2>
                  <p className="mt-1 text-sm text-slate-500">Explore FinOps capabilities and tools</p>
                </div>
                <Server className="h-10 w-10 text-indigo-400" />
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {[
                  { id: 'anomalies', icon: ShieldAlert, title: 'Cost Anomaly Detection', desc: 'Review cost spikes, anomaly trends, and provider-level alerts across your cloud accounts.', color: 'rose' },
                  { id: 'budgets', icon: Wallet, title: 'Budget Management', desc: 'Set provider budgets and monitor spend against targets with real-time tracking.', color: 'emerald' },
                  { id: 'savings', icon: PiggyBank, title: 'Savings Optimization', desc: 'Track savings opportunities, right-sizing recommendations, and reserved capacity.', color: 'amber' },
                  { id: 'recommendations', icon: TrendingUp, title: 'Recommendations', desc: 'Prioritize optimization actions, view AI-powered insights, and reduce cloud costs.', color: 'indigo' },
                  { id: 'reports', icon: FileText, title: 'Reports', desc: 'Generate team-based cost reports with Finance, Engineering, and Executive personas.', color: 'violet' },
                ].map(({ id, icon: Icon, title, desc, color }) => {
                  const colors = {
                    rose: 'from-rose-50 to-white border-rose-200/60 hover:shadow-rose-200/30 icon-from-rose-100 icon-to-rose-200 text-rose-700 ring-rose-200/60',
                    emerald: 'from-cyan-50 to-white border-cyan-200/60 hover:shadow-cyan-200/30 icon-from-cyan-100 icon-to-cyan-200 text-cyan-700 ring-cyan-200/60',
                    amber: 'from-amber-50 to-white border-amber-200/60 hover:shadow-amber-200/30 icon-from-amber-100 icon-to-amber-200 text-amber-700 ring-amber-200/60',
                    indigo: 'from-indigo-50 to-white border-indigo-200/60 hover:shadow-indigo-200/30 icon-from-indigo-100 icon-to-indigo-200 text-indigo-700 ring-indigo-200/60',
                    violet: 'from-violet-50 to-white border-violet-200/60 hover:shadow-violet-200/30 icon-from-violet-100 icon-to-violet-200 text-violet-700 ring-violet-200/60',
                  }[color] || 'from-slate-50 to-white border-slate-200/60 hover:shadow-slate-200/30';
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSidebarNav(id)}
                      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${colors}`}
                    >
                      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/40 blur-2xl" />
                      <span className={`mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ring-1 shadow-sm transition-transform duration-300 group-hover:scale-110 ${colors}`}>
                        <Icon className="h-6 w-6" />
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
                      <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <span>Explore</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600 ring-1 ring-indigo-200/60">
                    <BarChart3 className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Quick Stats</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {dashboardData ? `${dashboardData.total_cost ? `Total spend: ${money(dashboardData.total_cost)}` : ''}${dashboardData.anomalies?.length ? ` · ${dashboardData.anomalies.length} anomalies` : ''}${dashboardData.utilization ? ` · ${dashboardData.utilization.length} resources tracked` : ''}` : 'Loading data...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {budgetOverrunBanner && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-rose-800 shadow-sm">
              <span className="text-lg">⚠️</span>
              <p className="flex-1 text-sm font-semibold">{budgetOverrunBanner}</p>
              <button
                type="button"
                onClick={() => setBudgetOverrunBanner(null)}
                className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-100 hover:text-rose-700"
              >✕</button>
            </div>
          )}
          {servicePages.some((p) => p.id === activePage) && (
            <div className="space-y-6">
              <div className="flex gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm">
                {servicePages.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSidebarNav(id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                      activePage === id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

          {activePage === 'reports' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <SectionTitle
                      icon={FileText}
                      title="Generated Report"
                      action={
                        <div className="flex items-center gap-1.5">
                          <span className="hidden sm:inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                            {reportSchedule.label} cadence
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowDownloadModal(true)}
                            disabled={isDownloadingPdf || loadingReport || !report}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                          >
                            {isDownloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            Download
                          </button>
                        </div>
                      }
                    />
                    <div className="p-5">
                      <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {['executive', 'finance', 'engineering'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPersona(p)}
                            className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize transition ${
                              persona === p ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      {loadingReport ? (
                        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Preparing report...
                        </div>
                      ) : report ? (
                        <div className="mt-6 space-y-5">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                                {persona}
                              </span>
                              <span className="text-xs font-medium text-slate-500">{report.title}</span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600 whitespace-pre-wrap">{report.summary || report.focus}</p>
                          </div>

                          {report.metrics && (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="rounded-xl bg-slate-50 p-4 text-center">
                                <p className="text-xs font-medium text-slate-500">Projected monthly</p>
                                <p className="mt-1.5 text-2xl font-bold text-slate-900">{money(report.metrics.projected_monthly)}</p>
                              </div>
                              <div className="rounded-xl bg-cyan-50 p-4 text-center ring-1 ring-cyan-100">
                                <p className="text-xs font-medium text-cyan-700">Savings potential</p>
                                <p className="mt-1.5 text-2xl font-bold text-cyan-800">{money(report.metrics.total_savings_potential)}</p>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Insights</p>
                              <ul className="space-y-2">
                                {(report.insights || []).length > 0 ? (
                                  report.insights.map((item, index) => (
                                    <li key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                                      {item}
                                    </li>
                                  ))
                                ) : (
                                  <li className="text-sm text-slate-500">No insights available.</li>
                                )}
                              </ul>
                            </div>

                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Action items</p>
                            <div className="flex flex-wrap gap-2">
                              {(report.action_items || []).length > 0 ? (
                                report.action_items.map((item, index) => (
                                  <span key={index} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                    {item}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-slate-500">No action items available.</span>
                              )}
                            </div>
                          </div>

                          {report.alerts?.length > 0 && (
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Alerts</p>
                              <div className="space-y-2">
                                {report.alerts.map((alert, i) => (
                                  <div key={i} className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-100 break-words whitespace-pre-wrap">
                                    <span className="mb-0.5 block break-words font-semibold">{alert.service}</span>
                                    {alert.alert}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Spend trends</p>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={providerDailyData} margin={{ top: 8, right: 16, left: -14, bottom: 0 }}>
                                  <defs>
                                    {Object.entries(providerStyles).map(([provider, style]) => (
                                      <linearGradient key={provider} id={`reportGrad${provider}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={style.stroke} stopOpacity={0.28} />
                                        <stop offset="95%" stopColor={style.stroke} stopOpacity={0.04} />
                                      </linearGradient>
                                    ))}
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${getCurrencySymbol()}${val}`} />
                                  <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', fontSize: 11, borderRadius: 8 }} />
                                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                  {Object.entries(providerStyles).map(([provider, style]) => (
                                    <Area
                                      key={provider}
                                      type="monotone"
                                      dataKey={provider}
                                      stroke={style.stroke}
                                      fill={`url(#reportGrad${provider})`}
                                      strokeWidth={2}
                                      fillOpacity={1}
                                    />
                                  ))}
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
                          <BarChart3 className="h-10 w-10 text-slate-300" />
                          <p>Select a persona and filters to generate your report.</p>
                        </div>
                      )}
                    </div>
              </div>
            </div>
          )}

          {activePage === 'anomalies' && (
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
            <SectionTitle
              icon={ShieldAlert}
              title="Anomaly Review"
              action={
                <span className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  Z-score &gt; {anomalyThreshold}
                </span>
              }
            />

            {loadingTrend ? (
              <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading trend context...
              </div>
            ) : selectedAnomaly ? (
              <div className="space-y-5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setSelectedAnomaly(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <span className="text-xs font-semibold text-rose-700">
                    {selectedAnomaly.severity || 'High'} severity
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Service</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {selectedAnomaly.provider} / {selectedAnomaly.service}
                    </p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-rose-600">Actual spend</p>
                    <p className="mt-1 text-sm font-semibold text-rose-800">{money(selectedAnomaly.actual_cost)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-amber-700">Excess</p>
                    <p className="mt-1 text-sm font-semibold text-amber-800">{money(selectedAnomaly.excess_amount)}</p>
                  </div>
                </div>

                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedAnomaly.trend} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="anomalySpikeRed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fecaca" stopOpacity={0.9} />
                          <stop offset="95%" stopColor="#fecaca" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${getCurrencySymbol()}${val}`} />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', fontSize: 11, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 10, paddingTop: 5 }} />
                      <Area type="monotone" dataKey="baseline" name="Expected baseline" stroke="#64748b" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="spend" name="Actual spend" stroke="#dc2626" fill="url(#anomalySpikeRed)" strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  {selectedAnomaly.types?.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {selectedAnomaly.types.map((type) => (
                        <span key={type} className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                          {type}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                    <p className="text-sm leading-6 text-slate-600">
                      Spend on {selectedAnomaly.date} was {money(selectedAnomaly.actual_cost)}, above the expected baseline of {money(selectedAnomaly.expected_cost)} for {selectedAnomaly.team}.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setChatInput(`Analyze the ${selectedAnomaly.provider} ${selectedAnomaly.service} spend spike on ${selectedAnomaly.date}`);
                      setIsChatOpen(true);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 transition"
                  >
                    Ask AI
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <>
              {dashboardData.anomalies.length > 0 && (
                <div className="border-b border-slate-100 p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Anomaly cost impact by provider</p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={(() => {
                          const grouped = {};
                          dashboardData.anomalies.forEach((a) => {
                            const key = a.provider;
                            if (!grouped[key]) grouped[key] = { provider: key, excess: 0, count: 0 };
                            grouped[key].excess += Number(a.excess_amount || 0);
                            grouped[key].count += 1;
                          });
                          return Object.values(grouped);
                        })()}
                        margin={{ top: 8, right: 10, left: -18, bottom: 0 }}
                      >
                        <defs>
                          {Object.entries(providerStyles).map(([provider, style]) => (
                            <linearGradient key={provider} id={`anomalyGrad${provider}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={style.stroke} stopOpacity={0.35} />
                              <stop offset="95%" stopColor={style.stroke} stopOpacity={0.04} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="provider" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${getCurrencySymbol()}${val}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', fontSize: 11, borderRadius: 8 }}
                          formatter={(value, name, props) => {
                            const item = dashboardData.anomalies.filter(a => a.provider === props.payload.provider);
                            return [`${money(value)} (${item.length} anomalies)`, 'Excess cost'];
                          }}
                        />
                        {Object.keys(providerStyles).map((provider) => (
                          <Area
                            key={provider}
                            type="monotone"
                            dataKey={dashboardData.anomalies.some(a => a.provider === provider) ? 'excess' : undefined}
                            stroke={providerStyles[provider].stroke}
                            fill={`url(#anomalyGrad${provider})`}
                            strokeWidth={2}
                            stackId="1"
                            name={provider}
                            hide={!dashboardData.anomalies.some(a => a.provider === provider)}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {dashboardData.anomalies.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">No spend anomalies found inside current bounds.</p>
                ) : (
                  dashboardData.anomalies.map((anomaly, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectAnomaly(anomaly)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                            {anomaly.provider}
                          </span>
                          <span className="truncate text-sm font-semibold text-slate-900">{anomaly.service}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {anomaly.date} / {anomaly.team} / baseline {money(anomaly.expected_cost)}
                        </p>
                        {anomaly.types?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {anomaly.types.map((type) => (
                              <span key={type} className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                                {type}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-rose-700">{money(anomaly.actual_cost)}</p>
                        <p className="text-xs text-slate-500">+{money(anomaly.excess_amount)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              </>
            )}
          </div>
          )}

          {activePage === 'savings' && (
          <>
          {detailedSavings && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 ring-1 ring-emerald-200/60 shadow-sm">
                  <PiggyBank className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-slate-900">Cost Savings Analysis</h2>
                  <p className="text-[11px] text-slate-400">Potential savings identified across your cloud infrastructure</p>
                </div>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 ring-1 ring-emerald-200/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Total Potential Savings</p>
                    <p className="mt-1.5 text-2xl font-black text-emerald-700">{money(detailedSavings.summary.totalPotentialSavings)}</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100/50 p-4 ring-1 ring-cyan-200/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600">Monthly Savings Opportunity</p>
                    <p className="mt-1.5 text-2xl font-black text-cyan-700">{money(detailedSavings.summary.monthlySavings)}</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 ring-1 ring-amber-200/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Highest Impact</p>
                    <p className="mt-1.5 text-lg font-black text-amber-700 truncate">{detailedSavings.summary.highestImpactRecommendation}</p>
                    <p className="text-xs font-semibold text-amber-500 mt-0.5">{money(detailedSavings.summary.highestImpactSavings)}</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-violet-50 to-violet-100/50 p-4 ring-1 ring-violet-200/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Categories</p>
                    <p className="mt-1.5 text-2xl font-black text-violet-700">{detailedSavings.categories.length}</p>
                    <p className="text-xs font-semibold text-violet-500 mt-0.5">resource types analyzed</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Savings Breakdown by Resource Type</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {detailedSavings.categories.map((cat) => (
                      <div key={cat.id} className={`rounded-xl border shadow-sm transition-all overflow-hidden ${expandedSavingsCard === cat.id ? 'ring-2 ring-emerald-300 border-emerald-300' : 'border-slate-200 bg-white hover:shadow-md'}`}>
                        <button
                          type="button"
                          onClick={() => setExpandedSavingsCard(expandedSavingsCard === cat.id ? null : cat.id)}
                          className="w-full p-4 text-left cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-700">{cat.name}</span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                              {cat.percentage}%
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mb-3 leading-4">{cat.desc}</p>
                          <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Current</span>
                              <span className="font-semibold text-slate-700">{money(cat.currentCost)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Optimized</span>
                              <span className="font-semibold text-emerald-600">{money(cat.optimizedCost)}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-100 pt-1">
                              <span className="text-slate-400">Savings</span>
                              <span className="font-bold text-emerald-700">{money(cat.savings)}</span>
                            </div>
                          </div>
                        </button>
                        {expandedSavingsCard === cat.id && (
                          <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
                            {cat.steps && cat.steps.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Implementation Steps</p>
                                <ol className="list-decimal pl-4 space-y-1">
                                  {cat.steps.map((step, i) => (
                                    <li key={i} className="text-[11px] text-slate-600 leading-5">{step}</li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            {cat.impact && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Business Impact</p>
                                <p className="text-[11px] text-slate-600 leading-5">{cat.impact}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {detailedSavings.summary.breakdown.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Savings Distribution</h3>
                    <div className="space-y-2">
                      {detailedSavings.summary.breakdown.map((item) => (
                        <div key={item.name} className="flex items-center gap-3">
                          <span className="w-36 text-[11px] font-medium text-slate-600 truncate shrink-0">{item.name}</span>
                          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
                              style={{ width: `${item.pct}%` }}
                            />
                          </div>
                          <span className="w-24 text-right text-[11px] font-semibold text-slate-700">{money(item.savings)}</span>
                          <span className="w-10 text-right text-[10px] text-slate-400">{item.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          </>
          )}

          {activePage === 'recommendations' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <SectionTitle icon={TrendingUp} title="Recommendations (Azure)" />
                <div className="divide-y divide-slate-100">
                  {(!dashboardData?.recommendations || dashboardData.recommendations.length === 0) ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400">
                      <p className="text-slate-500 font-medium">No Azure recommendations available yet</p>
                      <p className="text-xs">Import Azure cost data to see savings opportunities</p>
                    </div>
                  ) : dashboardData.recommendations.map((rec, idx) => (
                    <div key={idx} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{rec.provider}</span>
                          <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
                            {rec.recommendation_type}
                          </span>
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                            {rec.confidence_score}% confidence
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900">{rec.service} optimization opportunity</h3>
                        <p className="text-sm leading-6 text-slate-600">{rec.reasoning}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4 md:text-right">
                        <p className="text-xs text-slate-500">Commitment</p>
                        <p className="text-sm font-semibold text-slate-900">{money(rec.recommended_commitment_monthly, '/mo')}</p>
                        <p className="mt-2 text-xs text-slate-500">Estimated savings</p>
                        <p className="text-lg font-semibold text-cyan-700">{money(rec.estimated_monthly_savings, '/mo')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activePage === 'budgets' && (
            <div className="space-y-6">

              {/* Always-visible total cost summary */}
              {(() => {
                const totalSpendVal = Object.values(providerTotals).reduce((a, b) => a + b, 0);
                const totalBudgetVal = globalBudget > 0 ? globalBudget : Object.values(budgets).reduce((a, b) => a + Number(b || 0), 0);
                const percent = totalBudgetVal > 0 ? Math.round((totalSpendVal / totalBudgetVal) * 100) : 0;

                let barColor = 'bg-cyan-500';
                let textColor = 'text-cyan-700';
                if (percent >= 100) {
                  barColor = 'bg-rose-500 animate-pulse';
                  textColor = 'text-rose-700 font-bold';
                } else if (percent >= 80) {
                  barColor = 'bg-amber-500';
                  textColor = 'text-amber-700 font-semibold';
                }

                return (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Active Period Budget Summary</h3>
                        <p className="text-xs text-slate-500 mt-1">Overall multi-cloud budget utilization</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">Global budget</span>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs text-slate-500 font-semibold">{getCurrencySymbol()}</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="Not set"
                            value={draftGlobalBudget || ''}
                            onChange={(e) => setDraftGlobalBudget(Number(e.target.value))}
                            className="h-9 w-28 rounded-lg border border-slate-200 bg-white pl-5 pr-3 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const val = Number(draftGlobalBudget);
                            setGlobalBudget(val);
                            localStorage.setItem('finops_global_budget', String(val));
                            showNotification(`Global budget updated to ${money(val)}`);
                          }}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-600">Total Budget Allocation</span>
                        <span className={`text-sm ${textColor}`}>{totalBudgetVal > 0 ? `${percent}% Used` : 'No budget set'}</span>
                      </div>

                      <div className="mt-3 h-3.5 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                        {totalBudgetVal > 0 && (
                          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(percent, 100)}%` }}></div>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4 text-sm border-t border-slate-100 pt-4 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500">Total Spend</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{money(totalSpendVal)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Total Budget</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{totalBudgetVal > 0 ? money(totalBudgetVal) : 'Not set'}</p>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <p className="text-xs text-slate-500">Remaining</p>
                          <p className={`mt-1 text-lg font-semibold ${totalBudgetVal >= totalSpendVal ? 'text-cyan-600' : 'text-rose-600'}`}>
                            {totalBudgetVal > 0
                              ? (totalBudgetVal >= totalSpendVal ? money(totalBudgetVal - totalSpendVal) : `-${money(totalSpendVal - totalBudgetVal)}`)
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Navigation tabs */}
              <div className="flex gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm">
                {[
                  { id: 'chart', label: 'Spend vs Budget', icon: BarChart3 },
                  { id: 'providers', label: 'Providers', icon: Globe2 },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBudgetTab(id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                      budgetTab === id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              {budgetTab === 'chart' && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Spend vs budget by provider</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={Object.keys(providerTotals).map((provider) => ({
                        provider,
                        spend: providerTotals[provider] || 0,
                        budget: budgets[provider] || 0,
                      }))}
                      margin={{ top: 8, right: 10, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="provider" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${getCurrencySymbol()}${val}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', fontSize: 11, borderRadius: 8 }}
                        formatter={(value) => [money(value), '']}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Area type="monotone" dataKey="budget" name="Budget" stroke="#64748b" strokeDasharray="5 5" fill="none" strokeWidth={2} />
                      <Area type="monotone" dataKey="spend" name="Actual spend" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              )}

              {budgetTab === 'providers' && (

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {Object.keys(providerTotals).map((provider) => {
                  const spend = providerTotals[provider] || 0;
                  const budget = budgets[provider] || 0;
                  const percent = budget > 0 ? Math.round((spend / budget) * 100) : 0;
                  const style = providerStyles[provider] || providerStyles.AWS;

                  let statusText = 'Within Budget';
                  let statusTone = 'emerald';
                  let statusMsg = `Spend is healthy and within budget limits. ${100 - percent}% buffer remaining.`;

                  if (percent >= 100) {
                    statusText = 'Exceeded';
                    statusTone = 'rose';
                    statusMsg = `Critical: Budget exceeded by ${money(spend - budget)}! Please optimize services.`;
                  } else if (percent >= 80) {
                    statusText = 'Warning';
                    statusTone = 'amber';
                    statusMsg = `Warning: Close to limit! Only ${money(budget - spend)} remaining before overrun.`;
                  }

                  const badgeColors = {
                    emerald: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
                    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
                    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
                  }[statusTone];

                  const borderColors = {
                    emerald: 'border-cyan-200 bg-cyan-50/20',
                    amber: 'border-amber-200 bg-amber-50/20',
                    rose: 'border-rose-200 bg-rose-50/20',
                  }[statusTone];

                  return (
                    <div key={provider} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ${style.badge}`}>{provider} Cloud</span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${badgeColors}`}>{statusText}</span>
                      </div>

                      <div className="mt-4 flex-1 space-y-4">
                        <div className="flex items-baseline justify-between">
                          <div>
                            <p className="text-xs text-slate-500">Spend</p>
                            <p className="text-xl font-bold text-slate-900">{money(spend)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Budget</p>
                            <p className="text-base font-semibold text-slate-600">{money(budget)}</p>
                          </div>
                        </div>

                        <div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                percent >= 100 ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-cyan-500'
                              }`} 
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            ></div>
                          </div>
                          <p className="mt-1 text-[11px] text-right text-slate-500 font-medium">{percent}% of budget spent</p>
                        </div>

                        <div className={`rounded-xl border p-3 text-xs leading-5 ${borderColors}`}>
                          <p className="font-semibold text-slate-900">{statusText === 'Exceeded' ? 'Critical Alert' : statusText === 'Warning' ? 'Warning Alert' : 'Status OK'}</p>
                          <p className="mt-1 opacity-90">{statusMsg}</p>
                        </div>
                      </div>

                      <div className="mt-5 border-t border-slate-100 pt-4">
                        <label className="block text-xs font-medium text-slate-600">Configure Budget Limit</label>
                        <div className="mt-2 flex gap-2">
                          <div className="relative flex-1 rounded-md shadow-xs">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 text-xs font-semibold">{getCurrencySymbol()}</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Not set"
                              defaultValue={budget > 0 ? budget : undefined}
                              onBlur={(e) => updateProviderBudget(provider, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updateProviderBudget(provider, e.target.value);
                                  e.target.blur();
                                  showNotification(`${provider} budget updated to ${money(e.target.value)}`);
                                }
                              }}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-6 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              const input = e.currentTarget.previousSibling.querySelector('input');
                              updateProviderBudget(provider, input.value);
                              showNotification(`${provider} budget updated to ${money(input.value)}`);
                            }}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
            </div>
          )}

          {activePage === 'overview' && (
            <>
              {/* Enterprise Filter Bar */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Globe2 className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Provider</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['All Providers', 'AWS', 'Azure', 'GCP'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setOverviewProviderFilter(p)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          overviewProviderFilter === p
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['Daily', 'Weekly', 'Monthly', 'Quarterly'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setOverviewPeriodFilter(p)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          overviewPeriodFilter === p
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                        {overviewProviderFilter === 'All Providers' ? 'Total Cloud Spend' : `${overviewProviderFilter} Spend`}
                      </p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{money(filteredTotalCost)}</p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600 ring-1 ring-indigo-200/60">
                      <TrendingUp className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    <span className="text-xs text-slate-500">
                      {overviewProviderFilter === 'All Providers'
                        ? `Across ${Object.keys(providerTotals).length} providers`
                        : `${overviewProviderFilter} spending`}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                        {overviewPeriodFilter} Avg Cost
                      </p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{money(filteredPeriodAvgCost)}</p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100 text-cyan-600 ring-1 ring-cyan-200/60">
                      <BarChart3 className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    <span className="text-xs text-slate-500">
                      {overviewPeriodFilter.toLowerCase()} average across {filteredPeriodCount} periods
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Resources Used</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{filteredResourceCount}</p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600 ring-1 ring-amber-200/60">
                      <Server className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    <span className="text-xs text-slate-500">
                      {overviewProviderFilter === 'All Providers' ? 'Across all providers' : `${overviewProviderFilter} services`}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {activePage === 'overview' && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.75fr]">
              <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
                <SectionTitle
                  icon={BarChart3}
                  title={overviewProviderFilter === 'All Providers' ? 'Multi-cloud Spend Trend' : `${overviewProviderFilter} Spend Trend`}
                  action={
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/60">
                      <Globe2 className="h-3 w-3 text-slate-400" />
                      {filteredProviderKeys.length} {filteredProviderKeys.length === 1 ? 'provider' : 'providers'}
                    </span>
                  }
                />
                <div className="h-80 px-2 pb-5 pt-4 sm:px-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={providerDailyData} margin={{ top: 8, right: 16, left: -14, bottom: 0 }}>
                      <defs>
                        {filteredProviderKeys.map((provider) => (
                          <linearGradient key={provider} id={`overviewProvider${provider}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={providerStyles[provider]?.stroke || '#94a3b8'} stopOpacity={0.28} />
                            <stop offset="95%" stopColor={providerStyles[provider]?.stroke || '#94a3b8'} stopOpacity={0.04} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${getCurrencySymbol()}${val}`} dx={-4} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          color: '#0f172a',
                          fontSize: 12,
                          borderRadius: 12,
                          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
                          padding: '12px 16px',
                        }}
                        itemStyle={{ padding: '2px 0' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} iconType="circle" iconSize={8} />
                      {filteredProviderKeys.map((provider) => {
                        const style = providerStyles[provider] || providerStyles.AWS;
                        return (
                          <Area
                            key={provider}
                            type="monotone"
                            dataKey={provider}
                            stroke={style.stroke}
                            fill={`url(#overviewProvider${provider})`}
                            strokeWidth={2.5}
                            fillOpacity={1}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-3">
                {filteredProviderKeys.map((provider) => {
                  const spend = providerTotals[provider] || 0;
                  const budget = budgets[provider] || 0;
                  const percent = budget > 0 ? Math.round((spend / budget) * 100) : 0;
                  const style = providerStyles[provider] || providerStyles.AWS;
                  const circumference = 2 * Math.PI * 45;
                  const strokeDashoffset = circumference - (Math.min(percent, 100) / 100) * circumference;
                  const gaugeColor = percent >= 100 ? '#f43f5e' : percent >= 80 ? '#f59e0b' : '#10b981';
                  return (
                    <div key={provider} className="group flex items-center gap-5 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/50">
                      {/* Circular gauge */}
                      <div className="relative shrink-0">
                        <svg width="90" height="90" viewBox="0 0 100 100" className="-rotate-90">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="7" />
                          <circle
                            cx="50" cy="50" r="45"
                            fill="none"
                            stroke={gaugeColor}
                            strokeWidth="7"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            className="ring-gauge"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-black" style={{ color: gaugeColor }}>{percent}%</span>
                        </div>
                      </div>
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${style.badge}`}>{provider}</span>
                          {percent >= 100 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 ring-1 ring-rose-200/60">
                              <span className="h-1 w-1 rounded-full bg-rose-400 animate-pulse" />
                              Over budget
                            </span>
                          )}
                          {percent >= 80 && percent < 100 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200/60">
                              <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
                              Near limit
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-xl font-black tracking-tight text-slate-900">{money(spend)}</span>
                          <span className="text-xs text-slate-400">of {money(budget)}</span>
                        </div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(percent, 100)}%`,
                              background: `linear-gradient(90deg, ${gaugeColor}, ${gaugeColor}dd)`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Cost distribution mini donut */}
                {filteredProviderKeys.length > 1 && (
                  <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Cost Distribution</p>
                    <div className="flex items-center gap-5">
                      <div className="h-24 w-24 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={filteredProviderKeys.map((name) => ({ name, value: providerTotals[name] || 0 }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={28}
                              outerRadius={42}
                              paddingAngle={3}
                              dataKey="value"
                              strokeWidth={0}
                            >
                              {filteredProviderKeys.map((provider) => (
                                <Cell key={provider} fill={providerStyles[provider]?.stroke || '#94a3b8'} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-2">
                        {filteredProviderKeys.map((provider) => {
                          const spend = providerTotals[provider] || 0;
                          const total = filteredProviderKeys.reduce((a, b) => a + (providerTotals[b] || 0), 0);
                          const pct = total > 0 ? Math.round((spend / total) * 100) : 0;
                          return (
                            <div key={provider} className="flex items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: providerStyles[provider]?.stroke }} />
                              <span className="text-xs font-medium text-slate-600">{provider}</span>
                              <span className="ml-auto text-xs font-bold text-slate-900">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activePage === 'overview' && periodChartData.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
              <SectionTitle
                icon={BarChart3}
                title={`${overviewPeriodFilter} Resource Cost`}
                action={
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/60">
                    {serviceKeys.length} resources
                  </span>
                }
              />
              <div className="h-80 px-2 pb-5 pt-4 sm:px-5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={periodChartData} margin={{ top: 8, right: 16, left: -14, bottom: 0 }}>
                    <defs>
                      {serviceKeys.map((service, i) => (
                        <linearGradient key={service} id={`periodSvcGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={servicePalette[i % servicePalette.length]} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={servicePalette[i % servicePalette.length]} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={8} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${getCurrencySymbol()}${val}`} dx={-4} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        fontSize: 11,
                        borderRadius: 12,
                        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
                        padding: '12px 16px',
                      }}
                      formatter={(value, name) => [money(value), name]}
                      labelStyle={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} iconType="circle" iconSize={7} />
                    {serviceKeys.map((service, i) => (
                      <Area
                        key={service}
                        type="monotone"
                        dataKey={service}
                        stackId="1"
                        stroke={servicePalette[i % servicePalette.length]}
                        fill={`url(#periodSvcGrad${i})`}
                        strokeWidth={2}
                        fillOpacity={1}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activePage === 'overview' && (
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
              <SectionTitle icon={Building2} title={`${overviewPeriodFilter} Service Breakdown`} />
              <div className="divide-y divide-slate-100/80">
                {(dashboardData.service_breakdown || [])
                  .filter((row) => overviewProviderFilter === 'All Providers' || row.provider === overviewProviderFilter)
                  .map((row) => {
                  const style = providerStyles[row.provider] || providerStyles.AWS;
                  return (
                    <div key={`${row.provider}-${row.service}-${row.team}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/50">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ring-1 ${style.badge}`}>{row.provider}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{row.service}</p>
                        <p className="truncate text-xs text-slate-400">{row.team} / {row.application}</p>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Daily</p>
                          <p className="text-sm font-bold text-slate-900">{money(row.daily_cost)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Monthly</p>
                          <p className="text-sm font-bold text-slate-900">{money(row.monthly_cost)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Usage</p>
                          <p className="text-sm font-bold text-slate-900">{row.avg_daily_usage}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activePage === 'profile' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Profile</h3>
                  <p className="mt-1 text-xs text-slate-500">Manage your account information.</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <label className="cursor-pointer group">
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                      {profileEditAvatar ? (
                        <img src={profileEditAvatar} alt="Avatar" className="h-24 w-24 rounded-full object-cover ring-4 ring-slate-100 shadow-md" />
                      ) : (
                        <span className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-3xl font-bold shadow-md ring-4 ring-slate-100">
                          {(profileEditName || 'U')[0].toUpperCase()}
                        </span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="h-6 w-6 text-white" />
                      </span>
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400">Click to change photo</p>
                  {profileEditAvatar && (
                    <button
                      type="button"
                      onClick={() => { setProfileEditAvatar(''); setAvatarChanged(true); }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                    >
                      Remove photo
                    </button>
                  )}
                </div>

                {/* Form */}
                <div className="flex-1 w-full space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Name</label>
                    <input
                      value={profileEditName}
                      onChange={(e) => { setProfileEditName(e.target.value); setProfileMessage(null); }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Email</label>
                    <input
                      type="email"
                      value={profileEditEmail}
                      onChange={(e) => { setProfileEditEmail(e.target.value); setProfileMessage(null); }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>

                  {profileMessage && (
                    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
                      profileMessage.type === 'success' ? 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    }`}>
                      {profileMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                      <span>{profileMessage.text}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98] disabled:opacity-60"
                  >
                    {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSavingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {activePage === 'security' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Security</h3>
              <p className="mt-1 text-xs text-slate-500">Review account access and session controls.</p>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-700 ring-1 ring-cyan-100">
                      <Shield className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">Password authentication</p>
                      <p className="truncate text-xs text-slate-500">Your account is protected by backend authentication.</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-100">Enabled</span>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200">
                      <Clock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">Current session</p>
                      <p className="truncate text-xs text-slate-500">Signed in as {loggedInEmail}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}

          {activePage === 'settings' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Settings</h3>
              <p className="text-xs text-slate-500 mt-1">Configure your FinOps environment and alerts settings.</p>
              
              <div className="mt-6 space-y-6 divide-y divide-slate-100">
                <div className="py-4 first:pt-0">
                  <h4 className="text-sm font-semibold text-slate-900">Alert Integrations</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Choose where to send your budget and anomaly alerts.</p>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                      In-App Notifications
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                      Email Digests (Send weekly reports to {loggedInEmail})
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                      Slack Webhook Integration
                    </label>
                  </div>
                </div>

                <div className="py-4">
                  <h4 className="text-sm font-semibold text-slate-900">Cloud Account Connections</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Manage connected billing data sources.</p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-slate-300"></span>
                        <span className="font-medium text-slate-800">AWS Billing (Account 123456789012)</span>
                      </div>
                      <span className="text-xs text-slate-400">Not Connected</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse"></span>
                        <span className="font-medium text-slate-800">Azure Billing (Subscription 84a7e93d-...)</span>
                      </div>
                      <span className="text-xs text-slate-500">Connected (API)</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-slate-300"></span>
                        <span className="font-medium text-slate-800">GCP Billing (Project finops-prod-...)</span>
                      </div>
                      <span className="text-xs text-slate-400">Not Connected</span>
                    </div>
                  </div>
                </div>

                <div className="py-4">
                  <h4 className="text-sm font-semibold text-slate-900">Account</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Manage your session and account access.</p>
                  <div className="mt-4">
                    <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-rose-600 ring-1 ring-rose-200/60">
                          <Shield className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">Sign out of your account</p>
                          <p className="truncate text-xs text-slate-500">Signed in as {loggedInEmail}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLogoutConfirm(true)}
                        className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-rose-200 transition-all hover:bg-rose-700 hover:shadow-md active:scale-[0.98]"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showLogoutConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in">
              <div className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-in fade-in">
                <div className="p-6 text-center">
                  <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-100">
                    <Shield className="h-6 w-6 text-rose-600" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Sign out?</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    You will be returned to the login screen. Any unsaved changes will be lost.
                  </p>
                </div>
                <div className="flex border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogoutConfirm(false);
                      handleLogout();
                    }}
                    className="ml-3 flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-rose-200 transition-all hover:bg-rose-700 active:scale-[0.98]"
                  >
                    Yes, sign out
                  </button>
                </div>
              </div>
            </div>
          )}

          {showDownloadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in">
              <div className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-in fade-in">
                <div className="border-b border-slate-100 px-6 py-4">
                  <h3 className="text-base font-bold text-slate-900">Download Report</h3>
                  <p className="mt-1 text-xs text-slate-500">Choose a format for the {persona} report.</p>
                </div>
                <div className="space-y-2 px-6 py-5">
                  {[
                    { value: 'pdf', label: 'PDF', icon: FileText, desc: 'Portable document format' },
                    { value: 'ppt', label: 'PPTX', icon: Presentation, desc: 'PowerPoint presentation' },
                    { value: 'xlsx', label: 'XLSX', icon: Table, desc: 'Excel spreadsheet' },
                  ].map(({ value, label, icon: Icon, desc }) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                        selectedFormat === value
                          ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="format"
                        value={value}
                        checked={selectedFormat === value}
                        onChange={() => setSelectedFormat(value)}
                        className="h-4 w-4 text-cyan-600 accent-cyan-600"
                      />
                      <Icon className="h-5 w-5 shrink-0 text-slate-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex border-t border-slate-100 bg-slate-50 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setShowDownloadModal(false)}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDownloadingPdf}
                    onClick={() => handleReportDownload(selectedFormat)}
                    className="ml-3 flex-1 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cyan-200 transition-all hover:bg-cyan-700 active:scale-[0.98] disabled:opacity-50"
                  >
                    {isDownloadingPdf ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                      </span>
                    ) : (
                      'Generate & Download'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>{/* end page content wrapper */}

      </main>

      {/* AI Recommendation Dashboard overlay */}


      {isAuthenticated && (
        <>
          <button
            type="button"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-600 to-cyan-700 text-white shadow-2xl shadow-cyan-200/50 transition-all hover:scale-105 active:scale-95 cursor-pointer border-0"
            title="Open AI Chat"
          >
            <div className="relative">
              <Bot className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500"></span>
              </span>
            </div>
          </button>

          {isChatOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity"
              onClick={() => setIsChatOpen(false)}
            />
          )}

          <div
            className={`fixed right-0 top-0 h-full w-full max-w-[500px] z-50 bg-white border-l border-slate-200 shadow-2xl flex flex-col transition-all duration-300 ease-in-out transform ${
              isChatOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-sm">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">FinOps AI</h2>
                  <span className="flex items-center gap-1.5 text-[11px] text-cyan-600 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                    Online
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
                <button
                  type="button"
                  onClick={() => setIsChatOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                >
                  <span className="text-lg font-bold leading-none">&times;</span>
                </button>
              </div>
            </div>

            <div ref={chatContainerRef} className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4">
              {chatHistory.map((chat, idx) => (
                <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                  {chat.role === 'assistant' && (
                    <div className="mr-2 mt-1 shrink-0">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-xs">
                        <Bot className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      chat.role === 'user'
                        ? 'bg-slate-900 text-white rounded-br-md shadow-md'
                        : 'border border-slate-200 bg-white text-slate-700 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {chat.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{chat.text}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: formatAIResponse(chat.text) }} />
                    )}
                    {chat.reportPdfUrl && (
                      <a
                        href={`${API}${chat.reportPdfUrl}`}
                        download={chat.reportFilename || `${chat.reportPersona || 'finops'}_report.pdf`}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download {chat.reportPersona || 'report'} PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start animate-in fade-in">
                  <div className="mr-2 mt-1 shrink-0">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-xs">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm rounded-bl-md">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '0ms' }}></span>
                        <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '150ms' }}></span>
                        <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '300ms' }}></span>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder=""
                  disabled={isChatLoading}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition-all focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatInput.trim()}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-700 text-white shadow-lg shadow-cyan-200 hover:from-cyan-700 hover:to-cyan-800 disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-[0.95]"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setChatInput('Why did costs spike recently?')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
                >
                  <AlertOctagon className="h-3 w-3 text-rose-400" />
                  Spike analysis
                </button>
                <button
                  type="button"
                  onClick={() => setChatInput('Show me savings opportunities')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
                >
                  <PiggyBank className="h-3 w-3 text-cyan-400" />
                  Savings
                </button>
                <button
                  type="button"
                  onClick={() => setChatInput('Compare spending across providers')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
                >
                  <BarChart3 className="h-3 w-3 text-blue-400" />
                  Compare
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
