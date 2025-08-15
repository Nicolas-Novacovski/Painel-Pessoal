// --- Core Types ---
export type Role = 'admin' | 'partner' | 'parent' | 'visitor';
export type View = 'dashboard' | 'restaurants' | 'expenses' | 'recipes' | 'reminders' | 'wellness' | 'lists' | 'applications' | 'admin' | 'ai-recommender';

// This is the primary user object for the currently logged-in user.
export interface UserProfile {
  email: string;
  name: string;
  picture: string;
  role: Role;
  couple_id: string | null;
  allowed_views: View[] | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

// This is a legacy type used in `created_by` fields in older tables.
// It's kept for compatibility. New tables should use email or a user ID.
export type User = 'Nicolas' | 'Ana Beatriz Diva Linda' | 'Visitante' | 'Umara' | 'Renato';


// --- Restaurants ---
export type RestaurantCategory = 'Café' | 'Jantar' | 'Lanche' | 'Bar' | 'Outro';

export interface Review {
  user: User;
  rating: number; // 1-5
  comment: string;
}

export interface Location {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Memory {
    id: string; 
    created_by_user: User;
    image_url: string; // Now a data URL
    caption: string;
    created_at: string; // ISO string
    type: 'image' | 'video';
}

export interface Restaurant {
  id: string;
  name: string;
  category: RestaurantCategory;
  cuisine: string | null;
  locations: Location[];
  image: string | null; // Now a data URL
  wants_to_go: User[];
  reviews: Review[];
  addedBy: User;
  inTourOqfc: boolean | null;
  price_range: number | null;
  google_rating: number | null;
  google_rating_count: number | null;
  google_rating_source_uri: string | null;
  google_rating_source_title: string | null;
  memories: Memory[];
  menu_url: string | null;
  created_at: string;
  vibe: string | null;
  weekly_promotions: string | null;
}

// --- New: Curated Restaurant Lists (Admin only) ---
export interface CuratedList {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  restaurant_ids: string[];
  icon: string | null;
}


// --- Recipes ---
export type RecipeCategory = 'Doce' | 'Salgado';

export interface Ingredient {
    id: string;
    name:string;
    quantity: string;
    is_heading?: boolean;
}

export interface NutritionalAnalysis {
    calories: number | null;
    protein: string | null;
    carbs: string | null;
    fat: string | null;
    sugar: string | null;
    sodium: string | null;
    summary: string | null;
}

export interface Recipe {
    id: string;
    name: string;
    category: RecipeCategory;
    prep_time_minutes: number | null;
    image_url: string | null; // URL from Supabase Storage
    source_url: string | null;
    ingredients: Ingredient[];
    instructions: string;
    added_by: User;
}

// --- Expenses ---
export type PaymentSource = 'Conta Pessoal' | 'Cartão';

export interface Expense {
    id: string;
    description: string;
    amount: number;
    due_date: string | null; // YYYY-MM-DD
    payment_source: PaymentSource;
    is_paid: boolean;
}

export interface RecurringExpense {
    id: string;
    description: string;
    amount: number;
    payment_source: PaymentSource;
    day_of_month: number;
    start_date: string; // YYYY-MM-DD
    end_date: string | null; // YYYY-MM-DD
    last_generated_date: string | null; // YYYY-MM-DD
    is_active: boolean;
    google_calendar_event_id: string | null; // ID for the Google Calendar event
}

export interface BarChartData {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
        backgroundColor: string[];
    }[];
}

export interface AIChartData {
    barChart: BarChartData;
}

export interface AIAnalysis {
    summary: string;
    top_categories: { category: string; amount: number; percentage: number }[];
    atypical_expenses: { description: string; amount: number }[];
    saving_tip: string;
    charts?: AIChartData;
}

export interface MonthlyClosing {
    id: string;
    month_year: string; // "YYYY-MM"
    income_nicolas: number;
    income_ana: number;
    shared_goal: number | null; // Kept for compatibility, can be deprecated
    notes: string | null;
    goal_allocations: Record<string, number> | null;
    analysis: AIAnalysis | null;
}

export interface Goal {
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    created_by: User;
    created_at: string;
    is_archived: boolean;
}


// --- Reminders ---
export type ReminderColor = 'yellow' | 'pink' | 'blue' | 'green';

export interface Subtask {
    id: string;
    text: string;
    is_done: boolean;
}

export interface Reminder {
    id:string;
    title: string;
    content: string | null;
    due_date: string | null; // YYYY-MM-DD
    color: ReminderColor;
    is_done: boolean;
    created_by: User;
    assigned_to: User[];
    subtasks: Subtask[] | null;
    created_at: string;
}

// --- Wellness ---
export interface Habit {
    id: string;
    name: string;
    icon: string | null;
    users: User[];
    created_at: string;
}

export interface HabitEntry {
    id: string;
    habit_id: string;
    user_id: User;
    entry_date: string; // YYYY-MM-DD
    created_at: string;
}

export interface MoodEntry {
    id: string;
    user_id: User;
    mood: number; // 1 to 5
    entry_date: string; // YYYY-MM-DD
    created_at: string;
}

// --- Date Planner ---
export type DatePlanStatus = 'pending' | 'confirmed' | 'rejected';

export type ParticipantStatus = {
    [key in User]?: 'pending' | 'accepted' | 'rejected' | 'rescheduled';
}

export interface DatePlan {
    id: string;
    created_at: string;
    restaurant_id: string;
    restaurant_name: string;
    restaurant_image_url: string | null;
    created_by: User;
    proposed_datetime: string; // ISO string
    status: DatePlanStatus;
    participants_status: ParticipantStatus;
}

// --- New: Lists ---
export type ListType = 'wishlist' | 'links' | 'todos';

export interface ListItem {
    id: string;
    created_at: string;
    title: string;
    description: string | null;
    url: string | null;
    image_url: string | null;
    list_type: ListType;
    user_email: string;
    is_done: boolean;
}

// --- New: Job Applications ---
export type ApplicationStatus = 'Applied' | 'Interviewing' | 'Offer' | 'Rejected' | 'Follow-up';

export interface JobApplication {
    id: string;
    created_at: string;
    company_name: string;
    role_name: string;
    status: ApplicationStatus;
    notes: string | null;
    image_url: string | null; // URL for the screenshot
    user_email: string;
}

// --- New: AI Recommender ---
export interface AIRecommendation {
    restaurant_name: string;
    category: string;
    reason: string;
    price_range: number; // 1-4
    delivery: boolean;
    dine_in: boolean;
    address: string;
    rating: number | null;
    image_url: string | null;
    maps_url: string | null;
}

export interface AIRecommenderHistoryItem {
    cravings: string;
    exclusions: string;
}


// --- Google Sign-In (GSI) ---
export interface GoogleTokenClient {
    requestAccessToken: () => void;
}

interface GoogleAccounts {
    oauth2: {
        initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: any) => void;
        }) => GoogleTokenClient;
        revoke: (token: string, done: () => void) => void;
    };
}

declare global {
    interface Window {
        google?: {
            accounts: GoogleAccounts;
        };
    }
}